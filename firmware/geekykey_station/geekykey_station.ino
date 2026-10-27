/*
  ESP32 + RC522 -> read an NTAG213 -> POST the tap to the GeekyKey backend

  One sketch for two boards: the ESP32-S3, and the classic ESP32 on a DOIT
  ESP32 DevKit V1. The board picked in the IDE chooses the pins below, so the
  same sketch builds for either with no edits.

  Wiring:                ESP32-S3    classic ESP32
    RC522 3.3V        -> 3V3         3V3
    RC522 GND         -> GND         GND
    RC522 RST         -> GPIO9       GPIO4
    RC522 SCK         -> GPIO12      GPIO18
    RC522 MISO        -> GPIO13      GPIO19
    RC522 MOSI        -> GPIO11      GPIO23
    RC522 SDA         -> GPIO10      GPIO5    (this is the chip-select / SS pin)
    RC522 IRQ         -> not connected
    LCD SDA           -> GPIO7       GPIO21
    LCD SCL           -> GPIO6       GPIO22
    Blue LED          -> GPIO4       GPIO25
    Red LED           -> GPIO5       GPIO26
    Amber LED         -> GPIO3       GPIO27   (LED_PIN_YELLOW below)
    Buzzer +          -> GPIO21      GPIO32   (an active buzzer: it sounds while the pin is HIGH)
    Buzzer -          -> GND         GND

  The classic ESP32 can't take the S3's pins: GPIO6 to 11 drive its flash chip,
  so I2C on 7 and 6 restarts it in a loop, the S3's LEDs on 4 and 5 would sit
  on its RST and SS, and GPIO3 is its UART's RX pin. Its buzzer is on GPIO32
  because the screen's SDA takes GPIO21.

  Libraries needed (Library Manager):
    "MFRC522"
    "ArduinoJson" (version 7)

  Setup: copy secrets.example.h to secrets.h in this folder and fill it in.
  secrets.h is gitignored, so credentials never reach the repo. Those values
  are only the first defaults: type "setup" and Enter on the USB serial port to
  give the station a new server address, station key or Wi-Fi network without a
  reflash. What the setup mode stores wins over secrets.h, even after a reflash,
  until its "reset" command forgets it. firmware/README.md has the commands.

  The server is a full base URL in secrets.h (SERVER_URL), such as
  "https://key-api.geekshacking.com" in production or
  "http://A-Mac.local:8000" on a laptop. An https:// URL is called as written,
  with the server's certificate checked against the 14 root certificates in
  ca_roots.h: the station key must never cross the venue WiFi in plain text,
  so plain http:// is only ever sent to a .local host, whose IP is looked up
  with mDNS because a phone hotspot hands out a new one on every restart.

  The backend contract for POST /api/v1/taps is in apps/API-AGREEMENT.md, section 6.1,
  and for POST /api/v1/stations/heartbeat in section 6.2.

  The heartbeat goes at boot and every 60 seconds, with any saved taps sent
  just before it, held back a few seconds while a tap is being answered. Its
  answer's server_time sets the station's clock, and taps carry tapped_at once
  the clock is set. There is no NTP: some venue WiFi blocks it.
*/

#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <HTTPClient.h>
#include <NetworkClientSecure.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <sys/time.h>
#include <time.h>
#include "secrets.h"
#include "ca_roots.h"
#include "tap_timing.h"
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// The pins for the board picked in the IDE (the wiring at the top).
#if CONFIG_IDF_TARGET_ESP32S3
#define SS_PIN 10
#define RST_PIN 9
#define SCK_PIN 12
#define MISO_PIN 13
#define MOSI_PIN 11
#define LED_PIN_BLUE 4
#define LED_PIN_RED 5
#define LED_PIN_YELLOW 3
#define I2C_SDA 7
#define I2C_SCL 6
#define BUZZER_PIN 21
#elif CONFIG_IDF_TARGET_ESP32
#define SS_PIN 5
#define RST_PIN 4
#define SCK_PIN 18
#define MISO_PIN 19
#define MOSI_PIN 23
#define LED_PIN_BLUE 25
#define LED_PIN_RED 26
#define LED_PIN_YELLOW 27
#define I2C_SDA 21
#define I2C_SCL 22
#define BUZZER_PIN 32
#else
#error "The station has pins for the ESP32-S3 and the classic ESP32 only. Pick one of those boards."
#endif
#define NO_LED -1

// Sent with each heartbeat and shown to organizers on the station board.
// Change it whenever a new build goes onto the stations.
#define FIRMWARE_VERSION "2026-10-27"

// How often the station sends a heartbeat, with any saved taps just before it.
#define HEARTBEAT_INTERVAL_MS 60000UL

// A heartbeat holds up the station for as long as its requests take, and a
// tag read meanwhile is lost. So a heartbeat that falls due waits while a
// result shows and for this long after one, when the next tap is likeliest.
// On 27 Oct 2026, with taps 3 to 7 s apart, 5 s held one back 29 s; a warm
// heartbeat takes about 40 ms, so a short gap is enough...
#define HEARTBEAT_QUIET_MS 2000UL
// ...but no longer than this past its time, so a busy station still sends one.
#define HEARTBEAT_MAX_DELAY_MS 30000UL

// How long a tap's result stays on the screen, with its LED on.
#define RESULT_SHOW_MS 2000UL

// The click the moment a tag is read, before the tap is saved and sent, so the
// person knows it was read while the server answers.
#define CLICK_MS 40UL

// How long boot waits for WiFi before carrying on without it. The ESP32 keeps
// trying in the background, and taps are saved until it connects. The setup
// mode's "wifi" command waits as long before saying it could not join.
#define WIFI_JOIN_WAIT_MS 20000UL

// The setup mode restarts the station after this long with nothing typed, so a
// station left in it by mistake goes back to taking taps.
#define SETUP_IDLE_MS 300000UL

// The longest line the serial port takes. A server address is the longest
// thing typed; anything past this is dropped.
#define SERIAL_LINE_MAX 200

LiquidCrystal_I2C lcd(0x27, 16, 2);

// The four settings, read at boot by loadSettings: what the setup mode stored,
// or else secrets.h. The Wi-Fi name and password are stored together, so one
// flag says where both came from. An empty password means an open network.
String serverUrl = "";
String stationKey = "";
String wifiSsid = "";
String wifiPassword = "";
bool serverFromSetup = false;
bool keyFromSetup = false;
bool wifiFromSetup = false;

// The setup mode's own namespace, apart from the taps', so "reset" can forget
// every setting at once without touching the saved taps or the tap counter.
Preferences settings;

// A server address split into its parts (parseServerUrl). An https:// URL
// keeps its host as written: the ESP32's DNS resolves it and the certificate is
// checked against the hostname in it.
struct ServerUrl {
  bool isHttps = false;      // starts with "https://"
  bool hostIsLocal = false;  // the host ends in ".local", so mDNS looks up its IP
  String host = "";          // the host, without any port
  uint16_t port = 443;       // from the address, or the scheme's default
};
ServerUrl server;

// The base URL every request is sent to. For a .local host it holds the
// looked-up IP, and is emptied again when a send fails, so it is looked up
// once more: the laptop may have a new IP after a hotspot restart.
String serverBase = "";

// One connection, kept open for every request: the clients and the HTTPClient
// are global, with reuse on, so a tap doesn't pay a new TLS handshake (about a
// second on the ESP32) each time. The secure client trusts the roots in
// ca_roots.h and nothing else: no setInsecure(), so anyone on the venue WiFi
// could pose as the server and station keys would be collected, and no
// setFollowRedirects, since a redirect would carry the station key to wherever
// it points. HTTPClient leaves redirects off by default. The station key is
// never printed on the serial port, beyond its last 4 characters.
WiFiClient plainClient;
NetworkClientSecure secureClient;
HTTPClient http;

// The library is not given RST_PIN: setup() drives it instead (see there).
MFRC522 rfid(SS_PIN, MFRC522::UNUSED_PIN);
Preferences prefs;
uint32_t nextTapId = 0;

// The last token sent, so the same token tapped again a moment later is
// answered from memory with no request (answerToken in tap_timing.h).
LastToken lastToken;

// A result, as showResult takes it. Every caller passes string literals, so
// the pointers stay good for as long as the station runs.
struct Result {
  const char *line1 = "";
  const char *line2 = "";
  int ledPin = NO_LED;
  int sound = SOUND_NONE;
};
// The last result shown, to show again when its token is tapped once more.
Result lastResult;

// The result on the screen, if any. showResult returns at once, and loop()
// plays the sound and ends the result (tickResult), so the reader is still read
// while a result shows.
bool resultShowing = false;
unsigned long resultShownAt = 0;
unsigned long resultEndedAt = 0;

#define QUEUE_CAPACITY 100
#define QUEUE_BATCH_MAX QUEUE_CAPACITY

struct QueuedTap {
  String clientTapId;
  String uid;
  String tappedAt;
};

struct QueueAttempt {
  bool completed[QUEUE_BATCH_MAX];
  String newTapStatus;
  bool newTapDropped = false;
  bool retryable = false;
  int httpCode = 0;
};

uint8_t queueHead = 0;
uint8_t queueCount = 0;

// When each step of the tap being handled happened, by millis(), so the serial
// port shows where a tap's wait goes (printTapTiming). readAt is 0 between
// taps, so a heartbeat's sending of saved taps leaves the rest alone.
struct TapTiming {
  unsigned long readAt = 0;
  unsigned long clickedAt = 0;
  unsigned long savedAt = 0;
  unsigned long sentAt = 0;
  unsigned long answeredAt = 0;
  bool reused = false;  // the request went over the kept-open connection
};
TapTiming tapTiming;

// Set once a heartbeat's answer has set the clock. Until then, taps are sent
// without tapped_at, and the server times them when they arrive.
bool clockSet = false;

// Whether the RC522 answered when last asked for its chip version. While it
// doesn't, the screen shows "Reader error" with the red LED on.
bool readerOk = true;

unsigned long nextHeartbeatAt = 0;

// The Arduino builder skips functions with default arguments when it writes
// prototypes, so flushQueue is declared here, before loop() calls it.
QueueAttempt flushQueue(const String &newTapId = "");

void setup() {
  Serial.begin(115200);
  // Plugged into a laptop with no Serial Monitor open, the USB port still
  // looks connected, so each print would wait up to 2 seconds for a reader
  // that never comes. Drop the output instead, as a plain charger does.
  // Only the USB port has this wait; the UART Serial has no such setting.
#if ARDUINO_USB_CDC_ON_BOOT
  Serial.setTxTimeoutMs(0);
#endif
  delay(1000);
  pinMode(LED_PIN_BLUE, OUTPUT);
  pinMode(LED_PIN_RED, OUTPUT);
  pinMode(LED_PIN_YELLOW, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  Wire.begin(I2C_SDA, I2C_SCL);
  lcd.init();
  lcd.backlight();

  // The settings and the saved taps are read first, so the setup mode can
  // change them even when the station stops below on a setup error.
  settings.begin("gk_settings", false);
  loadSettings();
  // client_tap_id must be unique per station forever, so the counter lives in
  // flash. If it reset on reboot, every tap after a restart would be a
  // `duplicate` and silently discarded by the backend.
  prefs.begin("geekykey", false);
  nextTapId = prefs.getUInt("tap_id", 0);
  loadQueueState();
  printSettings();

  // Every https request checks the server's certificate against these 14 roots
  // (Cloudflare's and Google's certificate authorities) and nothing else. An
  // empty string here would refuse every connection rather than fall back to
  // no checking, which is the right failure, but the roots are filled in.
  secureClient.setCACert(CA_ROOTS);
  // The handshake gets its own deadline: the default is 120 seconds, and a
  // server that accepts the TCP connection but stalls the handshake would
  // otherwise hold up every tap for those two minutes. It takes about one.
  secureClient.setHandshakeTimeout(5);
  http.setReuse(true);  // one connection, kept open across requests

  // A server address the station may not use is a setup error: it shows on the
  // screen and nothing is ever sent, so the station key cannot cross the venue
  // WiFi in plain text. The setup mode refuses such an address, so it can only
  // come from secrets.h, and the setup mode is still there to fix it.
  if (!parseServerUrl(serverUrl, server)) {
    showScreen("SETUP ERROR", "Check secrets.h");
    Serial.println("Setup error: the server address is not usable. Sending nothing.");
    Serial.println("Type setup and Enter to give the station another one.");
    while (true) {
      pollSerial();
      delay(50);
    }
  }

  // The station drives the RC522's reset pin itself (initReader says why).
  pinMode(RST_PIN, OUTPUT);
  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, SS_PIN);
  initReader();
  // Asks the RC522 for its chip version. 0x00 or 0xFF means the ESP32 cannot
  // talk to the reader over SPI: check the wiring and 3.3V power first.
  rfid.PCD_DumpVersionToSerial();

  // The station runs on mains power, so keep the radio awake: WiFi's power
  // saving adds 100-300 ms to every answer from the backend.
  WiFi.setSleep(false);
  beginWifi();
  Serial.print("Connecting to WiFi");
  showScreen("Connecting", "to WiFi...");
  const unsigned long wifiStartedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStartedAt < WIFI_JOIN_WAIT_MS) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nConnected! IP: " + WiFi.localIP().toString());
    showScreen("Connected!", "");
  } else {
    Serial.println("\nNo WiFi yet. Taps will be saved until it connects.");
    showScreen("No WiFi yet", "Saving taps");
  }
  delay(1000);

  // mDNS must be running before this station can look up a .local name.
  if (!MDNS.begin("geekykey-station")) {
    Serial.println("mDNS failed to start");
    showScreen("mDNS", "failed to start");
    delay(2000);
  }

  // The first heartbeat replaces a health check, since it also proves the
  // station key, and sets the clock before anyone taps.
  const int heartbeatCode = heartbeatTick();

  Serial.println("Ready. Tap an NTAG213 tag...");
  // The setup error is a result, which loop() ends by going to Ready.
  if (heartbeatCode == 401) {
    showResult("SETUP ERROR", "Tell organizer", LED_PIN_RED, SOUND_ERROR);
  } else {
    showReady();
  }
}

void loop() {
  pollSerial();
  tickResult();
  if (heartbeatMayStart()) heartbeatTick();

  String uid;
  unsigned long readAt = 0;
  if (!readTokenUid(uid, readAt)) {
    // While a result shows, come straight back to play its sound on time.
    // Asking the reader already takes about 25 ms when no tag is there.
    if (!resultShowing) delay(50);
    return;
  }

  Serial.println("UID: " + uid);

  switch (answerToken(lastToken, uid.c_str(), readAt, resultShowing)) {
    case KEEP_RESULT:
      // A token that slipped off and back and one tapped again on purpose look
      // the same here, so both get the click and the result stays as it is.
      Serial.println("Same token again while its result shows: a click, the result left as it is");
      clickDuringResult();
      return;
    case ALREADY_COUNTED:
      Serial.println("Same token again straight after: answered from memory, not sent");
      showResult("Already counted", "Try again later", LED_PIN_YELLOW, SOUND_COOLDOWN);
      return;
    case SHOW_LAST_RESULT:
      Serial.println("Same token again straight after: its last result again, not sent");
      showResult(lastResult.line1, lastResult.line2, lastResult.ledPin, lastResult.sound);
      return;
    case SEND_TAP:
      break;
  }

  // Answer at once: a different token ends the result showing, and the click
  // and the screen change come before the flash writes and the request.
  endResult();
  beep(CLICK_MS);
  showScreen("Sending...", "Hold on");
  tapTiming = TapTiming{};
  tapTiming.readAt = readAt;
  tapTiming.clickedAt = millis();
  const bool counted = handleTap(uid);
  rememberToken(lastToken, uid.c_str(), readAt, counted);
}

// Reads the UID of a token on the reader, twice. The backend identifies a
// token by its hardware UID alone, so nothing else on it is read. On 27 Oct
// 2026 a token leaving the reader read once as 04E40000000000, its first two
// bytes and then zeros, and was sent as a different token. So the station
// wakes the token and selects it again, and trusts the UID only when both
// reads agree. A read it doesn't trust leaves the token un-halted, so a token
// still on the reader is read afresh on the next pass. `readAt` is the first
// read's time, so the tap timing counts the second read too.
bool readTokenUid(String &uid, unsigned long &readAt) {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return false;
  readAt = millis();
  const String first = uidToHex(rfid.uid);
  rfid.PICC_HaltA();
  byte atqa[2];
  byte atqaSize = sizeof(atqa);
  const bool readAgain = rfid.PICC_WakeupA(atqa, &atqaSize) == MFRC522::STATUS_OK &&
                         rfid.PICC_Select(&rfid.uid) == MFRC522::STATUS_OK;
  const String second = readAgain ? uidToHex(rfid.uid) : String("");
  if (second != first) {
    Serial.println("Read " + first + " once but not again: ignored");
    return false;
  }
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  uid = first;
  return true;
}

// Saves the tap, sends it with any saved taps, and shows the result. Returns
// whether the server counted the tap: accepted, or cooldown for one before it.
bool handleTap(const String &uid) {
  String clientTapId = takeClientTapId();
  // Saved with the tap, so a tap resent later keeps the time it was made.
  QueuedTap tap = {clientTapId, uid, clockSet ? isoNow() : ""};
  if (!enqueueTap(tap)) {
    if (queueCount >= QUEUE_CAPACITY) {
      showResult("QUEUE FULL", "Storage full", LED_PIN_RED, SOUND_ERROR);
    } else {
      showResult("STORAGE ERROR", "Check station", LED_PIN_RED, SOUND_ERROR);
    }
    return false;
  }
  tapTiming.savedAt = millis();

  QueueAttempt attempt = flushQueue(clientTapId);
  if (attempt.newTapStatus.length() > 0) {
    showTapStatus(attempt.newTapStatus);
  } else if (attempt.newTapDropped) {
    showResult("DROPPED", "Bad tap request", LED_PIN_RED, SOUND_ERROR);
  } else if (attempt.httpCode == 401) {
    showResult("SETUP ERROR", "Tell organizer", LED_PIN_RED, SOUND_ERROR);
  } else {
    // The tap is saved and will be sent again, so this is not an error.
    showResult("QUEUED", "Will send later", NO_LED, SOUND_NONE);
  }
  return attempt.newTapStatus == "accepted" || attempt.newTapStatus == "cooldown";
}

String queueSlotKey(uint8_t slot) {
  return "q_" + String(slot);
}

String readStoredString(const char *key) {
  char value[512];
  value[0] = '\0';
  if (prefs.getString(key, value, sizeof(value)) == 0) return "";
  return String(value);
}

bool saveQueueState(uint8_t head, uint8_t count) {
  JsonDocument state;
  state["head"] = head;
  state["count"] = count;
  String payload;
  if (serializeJson(state, payload) == 0) return false;
  return prefs.putString("q_meta", payload) == payload.length();
}

void loadQueueState() {
  String payload = readStoredString("q_meta");
  if (payload.length() > 0) {
    JsonDocument state;
    if (!deserializeJson(state, payload)) {
      int head = state["head"].as<int>();
      int count = state["count"].as<int>();
      if (head >= 0 && head < QUEUE_CAPACITY && count >= 0 && count <= QUEUE_CAPACITY) {
        queueHead = (uint8_t)head;
        queueCount = (uint8_t)count;
        Serial.println("Restored " + String(queueCount) + " queued tap(s)");
        return;
      }
    }
  }
  queueHead = 0;
  queueCount = 0;
  saveQueueState(queueHead, queueCount);
}

bool storeQueuedTap(uint8_t slot, const QueuedTap &tap) {
  JsonDocument entry;
  entry["client_tap_id"] = tap.clientTapId;
  entry["uid"] = tap.uid;
  if (tap.tappedAt.length() > 0) entry["tapped_at"] = tap.tappedAt;
  String payload;
  if (serializeJson(entry, payload) == 0) return false;
  const String key = queueSlotKey(slot);
  return prefs.putString(key.c_str(), payload) == payload.length();
}

bool loadQueuedTap(uint8_t slot, QueuedTap &tap) {
  const String key = queueSlotKey(slot);
  String payload = readStoredString(key.c_str());
  if (payload.length() == 0) return false;
  JsonDocument entry;
  if (deserializeJson(entry, payload)) return false;
  const char *clientTapId = entry["client_tap_id"];
  const char *uid = entry["uid"];
  if (!clientTapId || !uid) return false;
  tap.clientTapId = clientTapId;
  tap.uid = uid;
  const char *tappedAt = entry["tapped_at"];
  tap.tappedAt = tappedAt ? tappedAt : "";
  return true;
}

bool enqueueTap(const QueuedTap &tap) {
  if (queueCount >= QUEUE_CAPACITY) return false;
  // queueHead is the oldest tap, so the next free slot is queueCount past it.
  const uint8_t slot = (queueHead + queueCount) % QUEUE_CAPACITY;
  if (!storeQueuedTap(slot, tap)) return false;
  const uint8_t nextCount = queueCount + 1;
  if (!saveQueueState(queueHead, nextCount)) return false;
  queueCount = nextCount;
  Serial.println(tap.clientTapId + " queued (" + String(queueCount) + ")");
  return true;
}

void removeQueuedHead() {
  if (queueCount == 0) return;
  const uint8_t removedSlot = queueHead;
  const uint8_t nextHead = (queueHead + 1) % QUEUE_CAPACITY;
  const uint8_t nextCount = queueCount - 1;
  if (!saveQueueState(nextHead, nextCount)) return;
  queueHead = nextHead;
  queueCount = nextCount;
  prefs.remove(queueSlotKey(removedSlot).c_str());
}

// Drops every saved tap: only the setup mode does, when the station moves to
// another event. The count goes to zero first, so a power cut part way through
// leaves stray entries that the next taps write over, never a count that
// points at taps already gone.
bool clearSavedTaps() {
  const uint8_t head = queueHead;
  const uint8_t count = queueCount;
  if (!saveQueueState(0, 0)) return false;
  queueHead = 0;
  queueCount = 0;
  for (uint8_t i = 0; i < count; i++) {
    prefs.remove(queueSlotKey((head + i) % QUEUE_CAPACITY).c_str());
  }
  return true;
}

void sendBatch(const QueuedTap *batch, uint8_t count, const String &newTapId,
               QueueAttempt &result) {
  result = QueueAttempt{};
  if (WiFi.status() != WL_CONNECTED) {
    result.retryable = true;
    return;
  }
  if (serverBase.length() == 0 && !resolveServer()) {
    result.retryable = true;
    return;
  }

  JsonDocument request;
  JsonArray taps = request["taps"].to<JsonArray>();
  for (uint8_t i = 0; i < count; i++) {
    JsonObject tap = taps.add<JsonObject>();
    tap["client_tap_id"] = batch[i].clientTapId;
    tap["uid"] = batch[i].uid;
    if (batch[i].tappedAt.length() > 0) tap["tapped_at"] = batch[i].tappedAt;
  }

  String body;
  if (serializeJson(request, body) == 0) {
    result.retryable = true;
    return;
  }

  // The shared HTTPClient, already pointed at the server's base URL, opens or
  // reuses the one connection for this request.
  if (!beginRequest("/api/v1/taps")) {
    result.retryable = true;
    return;
  }
  // A backend that has left the network would otherwise hold up the tap for
  // 5 seconds before it is saved. Answers keep 5 seconds, because the backend
  // can take up to 4 finding the token's owner and handing the tap on. The
  // connect timeout covers the TCP connect; the TLS handshake has its own,
  // set in setup().
  http.setConnectTimeout(2000);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + stationKey);
  if (tapTiming.readAt != 0) {
    tapTiming.reused = http.connected();
    tapTiming.sentAt = millis();
  }
  const int code = http.POST(body);
  const String response = code > 0 ? http.getString() : "";
  http.end();
  if (tapTiming.readAt != 0) tapTiming.answeredAt = millis();
  result.httpCode = code;

  if (code <= 0) {
    // The laptop may have a new IP since we looked it up (a hotspot restart,
    // or waking from sleep), so its .local name is looked up again next time.
    serverBase = "";
  }

  if (code == 400) {
    // A malformed request must not block every tap behind it.
    for (uint8_t i = 0; i < count; i++) {
      Serial.println("Dropping invalid tap " + batch[i].clientTapId + " uid=" + batch[i].uid);
      result.completed[i] = true;
      if (newTapId == batch[i].clientTapId) result.newTapDropped = true;
    }
    return;
  }
  // No answer, 401, 429, 5xx: keep the taps and try again later.
  if (code != 200) {
    result.retryable = true;
    return;
  }

  JsonDocument responseJson;
  if (deserializeJson(responseJson, response)) {
    result.retryable = true;
    return;
  }
  JsonArray results = responseJson["results"].as<JsonArray>();
  if (results.isNull()) {
    result.retryable = true;
    return;
  }

  for (JsonObject item : results) {
    const char *id = item["client_tap_id"];
    const char *statusText = item["status"];
    if (!id || !statusText) continue;
    for (uint8_t i = 0; i < count; i++) {
      if (batch[i].clientTapId != id) continue;
      // Any returned status is definitive, including statuses added in future.
      result.completed[i] = true;
      if (newTapId == batch[i].clientTapId) result.newTapStatus = statusText;
    }
  }
  return;
}

QueueAttempt flushQueue(const String &newTapId) {
  static QueuedTap batch[QUEUE_BATCH_MAX];
  QueueAttempt result{};
  if (WiFi.status() != WL_CONNECTED || queueCount == 0) {
    result.retryable = true;
    return result;
  }
  uint8_t count = 0;
  while (count < QUEUE_BATCH_MAX && count < queueCount) {
    QueuedTap tap;
    if (!loadQueuedTap((queueHead + count) % QUEUE_CAPACITY, tap)) {
      // Only the head can be removed, so send what we have and drop the bad
      // entry next time, once it has reached the head.
      if (count > 0) break;
      Serial.println("Discarding unreadable queue entry");
      removeQueuedHead();
      continue;
    }
    batch[count++] = tap;
  }
  // An empty batch is a 400 from the backend, so don't send one.
  if (count == 0) return result;

  Serial.println("Sending " + String(count) + " queued tap(s)");
  sendBatch(batch, count, newTapId, result);
  Serial.println("Backend answered HTTP " + String(result.httpCode));
  for (uint8_t i = 0; i < count && result.completed[i]; i++) removeQueuedHead();
  return result;
}

void showTapStatus(const String &status) {
  if (status == "accepted") {
    showResult("ACCEPTED", "Points added", LED_PIN_BLUE, SOUND_ACCEPTED);
  } else if (status == "cooldown") {
    showResult("COOLDOWN", "Try again later", LED_PIN_YELLOW, SOUND_COOLDOWN);
  } else if (status == "unknown_token") {
    showResult("UNKNOWN TAG", "Pair this token", LED_PIN_RED, SOUND_ERROR);
  } else if (status == "no_event") {
    showResult("NO EVENT", "Tell organizer", LED_PIN_RED, SOUND_ERROR);
  } else if (status == "no_game") {
    showResult("NO GAME", "Tell organizer", LED_PIN_RED, SOUND_ERROR);
  } else if (status == "duplicate") {
    showResult("DUPLICATE", "Already recorded", NO_LED, SOUND_NONE);
  } else {
    showResult("TAP RECEIVED", "Check your phone", LED_PIN_BLUE, SOUND_NONE);
  }
}

// Shows a result with its LED on and its sound starting, and returns at once.
// tickResult() plays the sound and goes back to Ready after RESULT_SHOW_MS. A
// result already showing ends first.
void showResult(const char *line1, const char *line2, int ledPin, int sound) {
  endResult();
  showScreen(line1, line2);
  if (ledPin != NO_LED) digitalWrite(ledPin, HIGH);
  printTapTiming();
  lastResult.line1 = line1;
  lastResult.line2 = line2;
  lastResult.ledPin = ledPin;
  lastResult.sound = sound;
  resultShowing = true;
  resultShownAt = millis();
  tickResult();
}

// Called from loop(): sets the buzzer for where the sound is, and goes back to
// Ready once the result has shown for RESULT_SHOW_MS.
void tickResult() {
  if (!resultShowing) return;
  const uint32_t elapsed = millis() - resultShownAt;
  if (elapsed >= RESULT_SHOW_MS) {
    endResult();
    showReady();
    return;
  }
  digitalWrite(BUZZER_PIN, soundIsOn(lastResult.sound, elapsed) ? HIGH : LOW);
}

// Turns off the result's LED and the buzzer, and leaves the screen as it is.
void endResult() {
  if (!resultShowing) return;
  digitalWrite(BUZZER_PIN, LOW);
  if (lastResult.ledPin != NO_LED) digitalWrite(lastResult.ledPin, LOW);
  resultShowing = false;
  resultEndedAt = millis();
}

// The click while a result shows, unless its sound is on already: a click
// then would only cut a gap into the beep.
void clickDuringResult() {
  if (soundIsOn(lastResult.sound, millis() - resultShownAt)) return;
  beep(CLICK_MS);
}

// Sounds the buzzer for `ms` and waits: only for the click, which is short.
void beep(unsigned long ms) {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(ms);
  digitalWrite(BUZZER_PIN, LOW);
}

// One line per tap, in milliseconds after its tag was read: when it clicked,
// was saved to flash, sent and answered, and when its result showed. "-" is a step that
// didn't happen, such as sending with no WiFi. Then forgets the tap, so a
// result with no tag behind it prints nothing.
void printTapTiming() {
  if (tapTiming.readAt == 0) return;
  const unsigned long shownAt = millis();
  const char *connection = tapTiming.reused ? "open connection" : "new connection";
  Serial.println("Tap timing (ms after read): click " + msAfterRead(tapTiming.clickedAt) + ", saved " +
                 msAfterRead(tapTiming.savedAt) + ", sent " + msAfterRead(tapTiming.sentAt) + " (" +
                 connection + "), answered " + msAfterRead(tapTiming.answeredAt) + ", shown " +
                 msAfterRead(shownAt));
  tapTiming = TapTiming{};
}

String msAfterRead(unsigned long at) {
  return at == 0 ? String("-") : String(at - tapTiming.readAt);
}

// Ready, unless the reader isn't answering: then the red LED stays on and the
// screen says so until it answers again.
void showReady() {
  digitalWrite(LED_PIN_RED, readerOk ? LOW : HIGH);
  if (readerOk) {
    showScreen("Ready", "Tap a tag");
  } else {
    showScreen("Reader error", "Tell organizer");
  }
}

// Each line fits 16 characters; anything longer is cut off.
void showScreen(const char *line1, const char *line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1);
  lcd.setCursor(0, 1);
  lcd.print(line2);
}

// Formats the hardware UID as uppercase hex with no separators, e.g. 04A1B2C3D4E5F6.
String uidToHex(const MFRC522::Uid& uid) {
  String hex = "";
  for (byte i = 0; i < uid.size; i++) {
    if (uid.uidByte[i] < 0x10) hex += "0";
    hex += String(uid.uidByte[i], HEX);
  }
  hex.toUpperCase();
  return hex;
}

// Hands out the next client_tap_id and saves the counter BEFORE the tap is
// sent. A crash after saving only skips a number, which is harmless. Saving
// after sending could reuse a number, and the backend would drop that tap.
String takeClientTapId() {
  uint32_t id = nextTapId++;
  prefs.putUInt("tap_id", nextTapId);
  return "tap-" + String(id);
}

// Splits a server address into its parts and decides whether the station may
// send to it at all. Returns false for an address the station must not use,
// with the reason on the serial port: the address is only usable as https://,
// or as plain http:// to a host ending in .local. Anything else would send the
// station key across the venue WiFi in plain text, before anything could
// redirect it to HTTPS. `out` is only filled in when the address is usable.
bool parseServerUrl(const String &url, ServerUrl &out) {
  ServerUrl parsed;
  String rest = url;
  if (rest.startsWith("https://")) {
    parsed.isHttps = true;
    parsed.port = 443;
    rest.remove(0, 8);
  } else if (rest.startsWith("http://")) {
    parsed.isHttps = false;
    parsed.port = 80;
    rest.remove(0, 7);
  } else {
    Serial.println("The server address must start with https:// or http://");
    return false;
  }
  // A base URL has no path; a trailing one is left out rather than sent.
  int slash = rest.indexOf('/');
  if (slash >= 0) rest.remove(slash);
  // Split off the port when the host holds exactly one colon. More than one
  // means an IPv6 literal, which is left as written with the default port.
  int colon = rest.indexOf(':');
  if (colon >= 0 && rest.indexOf(':', colon + 1) < 0) {
    const int port = rest.substring(colon + 1).toInt();
    rest.remove(colon);
    if (port > 0 && port < 65536) {
      parsed.port = (uint16_t)port;
    } else {
      Serial.println("The server address's port is not a number, using " + String(parsed.port));
    }
  }
  parsed.host = rest;
  if (parsed.host.length() == 0) {
    Serial.println("The server address has no host");
    return false;
  }
  parsed.hostIsLocal = parsed.host.endsWith(".local");
  if (!parsed.isHttps && !parsed.hostIsLocal) {
    Serial.println("The server address is plain http:// to a host that isn't .local");
    return false;
  }
  out = parsed;
  return true;
}

// Builds serverBase, the base URL every request goes to. A host ending in
// .local is looked up with mDNS, which asks the local network "who is A-Mac?"
// and gets the laptop's current IP back, because a phone hotspot hands out a
// new one whenever it restarts. Any other host is https and is used as written:
// the ESP32's DNS resolves it and the certificate is checked against the
// hostname in the URL. With no usable address (a setup error at boot), there
// is nothing to resolve.
bool resolveServer() {
  if (server.host.length() == 0) return false;
  if (!server.hostIsLocal) {
    serverBase = String(server.isHttps ? "https://" : "http://") + server.host + ":" + String(server.port);
    return true;
  }
  String name = server.host;
  name.remove(name.length() - 6);  // mDNS queries take the name without .local
  IPAddress ip = MDNS.queryHost(name.c_str(), 3000);
  if (ip == IPAddress(0, 0, 0, 0)) {
    Serial.println("Could not find " + server.host + " on this network. Is the laptop on the same WiFi?");
    return false;
  }
  String resolved = String(server.isHttps ? "https://" : "http://") + ip.toString() + ":" + String(server.port);
  if (serverBase.length() > 0 && resolved != serverBase) {
    // The laptop has a new IP. The kept-open connection points at the old one
    // and, with reuse on, HTTPClient would send to it again, so close it.
    if (plainClient.connected()) plainClient.stop();
  }
  serverBase = resolved;
  Serial.println("Backend: " + server.host + " -> " + serverBase);
  return true;
}

// Points the shared HTTPClient at a path on the server. The scheme picks the
// client: TLS over the roots in ca_roots.h for https://, the plain client for a
// .local host. begin() only parses the URL and opens nothing: the connection
// made for a request is kept for the next one (see setReuse in setup()).
bool beginRequest(const String &path) {
  if (server.isHttps) return http.begin(secureClient, serverBase + path);
  return http.begin(plainClient, serverBase + path);
}

// Closes the kept-open connection and forgets the looked-up address, so the
// next request starts afresh. With reuse on, HTTPClient would otherwise send
// to the old server or over the old network.
void dropConnection() {
  http.end();
  plainClient.stop();
  secureClient.stop();
  serverBase = "";
}

// Gives the RC522 a clean hard reset, then sets it up. The station holds
// RST_PIN HIGH itself: given the pin, the library leaves it a floating input
// whenever it happens to read HIGH, and the reader can then drift into
// power-down, answer 0xFF and never see a tag. The LOW pulse is the reset.
void initReader() {
  digitalWrite(RST_PIN, LOW);
  delay(10);
  digitalWrite(RST_PIN, HIGH);
  delay(50);
  rfid.PCD_Init();
  rfid.PCD_SetRegisterBitMask(MFRC522::RFCfgReg, (0x07 << 4));
}

// The RC522's chip version, or 0x00 or 0xFF when it isn't answering over SPI.
bool readerAnswers() {
  const byte version = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  return version != 0x00 && version != 0xFF;
}

// Asks the RC522 for its chip version, for the heartbeat's reader_ok. A reader
// that doesn't answer is reset once and asked again, which also sets up one
// that was unplugged and plugged back in. Pulling only its 3.3V wire may not
// show: on 15 Oct 2026 the chip kept answering, likely powered through the
// reset and chip-select lines the ESP32 holds HIGH. Pulling MISO showed it.
void checkReader() {
  bool ok = readerAnswers();
  if (!ok) {
    initReader();
    ok = readerAnswers();
  }
  if (ok == readerOk) return;
  readerOk = ok;
  Serial.println(readerOk ? "Reader answers again" : "Reader not answering");
  showReady();
}

// Whether a heartbeat may start now: it's due, no result shows, and the
// station has been quiet for HEARTBEAT_QUIET_MS, or the heartbeat is already
// HEARTBEAT_MAX_DELAY_MS late.
bool heartbeatMayStart() {
  const unsigned long now = millis();
  if ((long)(now - nextHeartbeatAt) < 0) return false;
  if (resultShowing) return false;
  if (now - resultEndedAt >= HEARTBEAT_QUIET_MS) return true;
  return now - nextHeartbeatAt >= HEARTBEAT_MAX_DELAY_MS;
}

// Every 60 seconds and at boot: checks the reader, sends any saved taps, then
// sends the heartbeat, so buffered_taps counts what is still saved. Returns
// the heartbeat's HTTP code, or 0 when it wasn't sent.
int heartbeatTick() {
  const unsigned long startedAt = millis();
  nextHeartbeatAt = startedAt + HEARTBEAT_INTERVAL_MS;
  checkReader();
  flushQueue();
  const unsigned long flushedAt = millis();
  const int code = sendHeartbeat();
  Serial.println("Heartbeat timing: " + String(millis() - startedAt) + " ms, saved taps " +
                 String(flushedAt - startedAt) + " ms of it");
  return code;
}

// POST /api/v1/stations/heartbeat (the API agreement's 6.2). A 200 sets the
// clock from server_time. Any other answer changes nothing here: a 401 or a
// 503 also fails the taps, which are saved and sent again.
int sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Heartbeat: not sent, no WiFi");
    return 0;
  }
  if (serverBase.length() == 0 && !resolveServer()) {
    Serial.println("Heartbeat: not sent, server not found");
    return 0;
  }

  JsonDocument request;
  request["firmware_version"] = FIRMWARE_VERSION;
  request["buffered_taps"] = queueCount;
  request["reader_ok"] = readerOk;
  String body;
  if (serializeJson(request, body) == 0) return 0;

  if (!beginRequest("/api/v1/stations/heartbeat")) return 0;
  // The same timeouts as a tap. Before checkpoint 4 the server answered only
  // once it had passed the heartbeat on, up to 4 seconds later. key-api.
  // answers without waiting (API agreement 6.2).
  http.setConnectTimeout(2000);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + stationKey);
  const int code = http.POST(body);
  // Read even when unused: on the kept-open connection, an unread body would
  // be taken as the next request's answer.
  const String response = code > 0 ? http.getString() : "";
  http.end();

  if (code <= 0) {
    // The laptop may have a new IP since we looked it up, as for a tap.
    serverBase = "";
    Serial.println("Heartbeat: no answer, " + HTTPClient::errorToString(code));
    return code;
  }
  if (code != 200) {
    Serial.println("Heartbeat: HTTP " + String(code));
    return code;
  }
  JsonDocument answer;
  if (deserializeJson(answer, response) || !setClockFrom(answer["server_time"].as<const char *>())) {
    Serial.println("Heartbeat: answer had no usable server_time");
    return code;
  }
  Serial.println("Heartbeat: clock set to " + isoNow());
  return code;
}

// Sets the clock from a time the server sent, such as
// "2026-10-15T01:23:45.678Z": always UTC, with milliseconds.
bool setClockFrom(const char *iso) {
  int year, month, day, hour, minute, second, millisecond;
  if (!iso || sscanf(iso, "%4d-%2d-%2dT%2d:%2d:%2d.%3dZ", &year, &month, &day, &hour, &minute,
                     &second, &millisecond) != 7) {
    return false;
  }
  struct timeval now;
  now.tv_sec = (time_t)(daysSinceEpoch(year, month, day) * 86400LL + hour * 3600 + minute * 60 + second);
  now.tv_usec = millisecond * 1000;
  if (settimeofday(&now, nullptr) != 0) return false;
  clockSet = true;
  return true;
}

// Days from 1970-01-01 to a date, by Howard Hinnant's days_from_civil, so no
// time zone setting can shift it.
int64_t daysSinceEpoch(int year, int month, int day) {
  year -= month <= 2;
  const int era = (year >= 0 ? year : year - 399) / 400;
  const int yearOfEra = year - era * 400;
  const int dayOfYear = (153 * (month > 2 ? month - 3 : month + 9) + 2) / 5 + day - 1;
  const int dayOfEra = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear;
  return (int64_t)era * 146097 + dayOfEra - 719468;
}

// The clock's time as the server writes it, such as "2026-10-15T01:23:45.678Z".
String isoNow() {
  struct timeval now;
  gettimeofday(&now, nullptr);
  struct tm utc;
  gmtime_r(&now.tv_sec, &utc);
  char text[32];
  snprintf(text, sizeof(text), "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ", utc.tm_year + 1900,
           utc.tm_mon + 1, utc.tm_mday, utc.tm_hour, utc.tm_min, utc.tm_sec,
           (int)(now.tv_usec / 1000));
  return String(text);
}

// The setup mode gives the station a new server address, station key or Wi-Fi
// network over the USB serial port, without a reflash. firmware/README.md says
// how to use it. Typing "setup" and Enter enters it at any time; that takes a
// cable and a terminal, so it can't happen by accident at a venue. Taps and
// heartbeats stop until the station restarts, on "exit" or after SETUP_IDLE_MS
// with nothing typed.
//
// A new key comes in one of two ways, because the station can't tell them
// apart. "key" is a replaced key for the same station: its saved taps stay and
// go out with the new key (API agreement 6.1 and 9.8). "move" is a key from
// another event, which makes this a new station there: its saved taps are sent
// with the old key first, and whatever is left is cleared, so taps from one
// event never reach another (CONTEXT.md, Setup mode).
//
// The setup page (firmware/setup_page/) types into this setup mode as a person
// would, and reads its answers by matching the lines printed here and at
// start-up, word for word. Reword one of those lines and the page's list in
// setup_page.html must change with it; its tests fail until it does.

// Reads the four settings: what the setup mode stored, or else secrets.h.
void loadSettings() {
  serverFromSetup = settings.isKey("server");
  serverUrl = serverFromSetup ? settings.getString("server") : String(SERVER_URL);
  keyFromSetup = settings.isKey("key");
  stationKey = keyFromSetup ? settings.getString("key") : String(STATION_KEY);
  wifiFromSetup = settings.isKey("wifi_ssid");
  wifiSsid = wifiFromSetup ? settings.getString("wifi_ssid") : String(WIFI_SSID);
  wifiPassword = wifiFromSetup ? settings.getString("wifi_pass") : String(WIFI_PASSWORD);
}

// Stores one setting, and says whether it was stored in full. An empty value,
// an open network's password, stores nothing to compare, so it counts as stored.
bool storeSetting(const char *key, const String &value) {
  return settings.putString(key, value) == value.length();
}

// The settings, and where each came from. The key shows only its last 4
// characters and the Wi-Fi password never shows, so a log or a screenshot of
// the terminal gives neither away.
void printSettings() {
  Serial.println("Server:     " + serverUrl + settingSource(serverFromSetup));
  Serial.println("Key:        " + maskedKey(stationKey) + settingSource(keyFromSetup));
  Serial.println("Wi-Fi:      " + wifiSsid + settingSource(wifiFromSetup));
  Serial.println(String("Password:   ") + (wifiPassword.length() > 0 ? "set" : "none, an open network") +
                 settingSource(wifiFromSetup));
  Serial.println("Saved taps: " + String(queueCount));
}

String settingSource(bool fromSetup) {
  return fromSetup ? "  (setup mode)" : "  (secrets.h)";
}

String maskedKey(const String &key) {
  if (!isStationKey(key)) return "not a station key";
  return "gk_sta_..." + key.substring(key.length() - 4);
}

// A station key starts with gk_sta_ and holds no spaces. Ours are 32 random
// bytes after the prefix, but another Event Service may write them otherwise.
bool isStationKey(const String &key) {
  return key.startsWith("gk_sta_") && key.length() >= 12 && key.indexOf(' ') < 0;
}

// Starts joining the Wi-Fi network in the settings. An empty password is an
// open network, which takes no password at all.
void beginWifi() {
  WiFi.begin(wifiSsid.c_str(), wifiPassword.length() > 0 ? wifiPassword.c_str() : nullptr);
}

// What has been typed on the serial port so far, towards the next line.
String serialLine = "";
bool serialLastWasCR = false;

// Collects what is typed on the serial port and returns true once a whole line
// is in `line`. A line ends at Enter, whichever of CR, LF or CR LF the terminal
// sends; a CR LF counts once, so an empty line (an open network's password)
// still comes through. Backspace works. With `echo` off nothing typed is
// printed back, for the key and the Wi-Fi password.
bool takeSerialLine(String &line, bool echo) {
  while (Serial.available() > 0) {
    const char c = Serial.read();
    if (c == '\n' && serialLastWasCR) {
      serialLastWasCR = false;
      continue;
    }
    serialLastWasCR = c == '\r';
    if (c == '\r' || c == '\n') {
      Serial.println();
      line = serialLine;
      serialLine = "";
      return true;
    }
    if (c == '\b' || c == 0x7F) {
      if (serialLine.length() > 0) {
        serialLine.remove(serialLine.length() - 1);
        if (echo) Serial.print("\b \b");
      }
      continue;
    }
    if (serialLine.length() < SERIAL_LINE_MAX) {
      serialLine += c;
      if (echo) Serial.print(c);
    }
  }
  return false;
}

// Called from loop() and while stopped on a setup error, so reading the serial
// port never holds up a tap. Only "setup" does anything.
void pollSerial() {
  String line;
  if (!takeSerialLine(line, true)) return;
  line.trim();
  line.toLowerCase();
  if (line == "setup") {
    runSetupMode();
  } else if (line.length() > 0) {
    Serial.println("Type setup and Enter to change the server, the station key or the Wi-Fi network.");
  }
}

// Waits for one line in the setup mode, and restarts the station if nothing
// comes for SETUP_IDLE_MS. Not trimmed: a Wi-Fi name or password may start or
// end with a space.
String readSetupLine(bool echo) {
  const unsigned long startedAt = millis();
  String line;
  while (!takeSerialLine(line, echo)) {
    if (millis() - startedAt >= SETUP_IDLE_MS) {
      Serial.println("\nNothing typed for 5 minutes. Restarting.");
      restartStation();
    }
    delay(10);
  }
  return line;
}

void restartStation() {
  showScreen("Restarting", "");
  Serial.flush();
  delay(200);
  ESP.restart();
}

void printSetupHelp() {
  Serial.println("Commands:");
  Serial.println("  show    the settings, and where each came from");
  Serial.println("  server  a new server address");
  Serial.println("  key     a replaced key for this same station; saved taps are kept");
  Serial.println("  move    a key from another event; saved taps are sent, then cleared");
  Serial.println("  wifi    a new Wi-Fi network name and password");
  Serial.println("  reset   forget the stored settings and go back to secrets.h");
  Serial.println("  exit    restart with the new settings");
}

// Never returns: the station restarts to leave it, so every setting takes
// effect through the same start-up as always.
void runSetupMode() {
  endResult();
  showScreen("Setup mode", "Use USB serial");
  digitalWrite(LED_PIN_BLUE, LOW);
  digitalWrite(LED_PIN_RED, LOW);
  digitalWrite(LED_PIN_YELLOW, LOW);
  Serial.println("\nSetup mode. Taps are paused until the station restarts.");
  printSettings();
  printSetupHelp();
  while (true) {
    Serial.print("> ");
    String command = readSetupLine(true);
    command.trim();
    command.toLowerCase();
    if (command.length() == 0) continue;
    if (command == "show") {
      printSettings();
    } else if (command == "server") {
      setServer();
    } else if (command == "key") {
      replaceKey();
    } else if (command == "move") {
      moveToEvent();
    } else if (command == "wifi") {
      setWifi();
    } else if (command == "reset") {
      resetSettings();
    } else if (command == "exit") {
      Serial.println("Restarting with these settings.");
      restartStation();
    } else if (command == "help") {
      printSetupHelp();
    } else {
      Serial.println("Unknown command. Type help for the list.");
    }
  }
}

void setServer() {
  Serial.print("New server address, such as https://key-api.geekshacking.com: ");
  String url = readSetupLine(true);
  url.trim();
  // The same check as at start-up, so an address the station may not use is
  // never stored.
  ServerUrl parsed;
  if (!parseServerUrl(url, parsed)) {
    Serial.println("Not changed.");
    return;
  }
  if (!storeSetting("server", url)) {
    Serial.println("Could not store it. Not changed.");
    return;
  }
  serverUrl = url;
  serverFromSetup = true;
  server = parsed;
  dropConnection();
  Serial.println("Server stored. The " + String(queueCount) + " saved tap(s) are kept.");
  reportHeartbeat();
}

// Asks for a station key without printing it. Returns "" for anything that
// isn't one, having said so.
String askForKey(const char *prompt) {
  Serial.print(prompt);
  String key = readSetupLine(false);
  key.trim();
  if (!isStationKey(key)) {
    Serial.println("That isn't a station key, which starts with gk_sta_. Not changed.");
    return "";
  }
  return key;
}

void replaceKey() {
  String key = askForKey("This station's new key (hidden as you type): ");
  if (key.length() == 0) return;
  if (!storeSetting("key", key)) {
    Serial.println("Could not store it. Not changed.");
    return;
  }
  stationKey = key;
  keyFromSetup = true;
  Serial.println("Key stored: " + maskedKey(stationKey) + ". The " + String(queueCount) +
                 " saved tap(s) are kept and go out with it.");
  reportHeartbeat();
}

void moveToEvent() {
  String key = askForKey("The other event's key for this station (hidden as you type): ");
  if (key.length() == 0) return;
  // The saved taps go, or are cleared, before the new key is stored: if the
  // power fails in between, the station still has its old key and no taps
  // from the old event can reach the new one.
  if (!sendOrClearSavedTaps()) return;
  if (!storeSetting("key", key)) {
    Serial.println("Could not store the key. It's still the old one.");
    return;
  }
  stationKey = key;
  keyFromSetup = true;
  Serial.println("Key stored: " + maskedKey(stationKey) + ". This is now a new station at the other event.");
  reportHeartbeat();
}

// Sends the saved taps with the current key. If any are left, says how many
// and why, and clears them only once "clear" is typed. Returns false when the
// person cancels, leaving the key and the taps as they were.
bool sendOrClearSavedTaps() {
  if (queueCount == 0) return true;
  Serial.println("Sending the " + String(queueCount) + " saved tap(s) with the old key...");
  const QueueAttempt attempt = flushQueue();
  if (queueCount == 0) {
    Serial.println("All saved taps sent.");
    return true;
  }
  String why;
  if (WiFi.status() != WL_CONNECTED) {
    why = "no Wi-Fi";
  } else if (attempt.httpCode == 401) {
    why = "the old key was rejected (401)";
  } else if (attempt.httpCode <= 0) {
    why = "no answer";
  } else {
    why = "HTTP " + String(attempt.httpCode);
  }
  Serial.println(String(queueCount) + " tap(s) still saved (" + why + ").");
  Serial.print("Type clear to drop them, anything else to cancel: ");
  String answer = readSetupLine(true);
  answer.trim();
  if (answer != "clear") {
    Serial.println("Cancelled. The key and the saved taps are unchanged.");
    return false;
  }
  if (!clearSavedTaps()) {
    Serial.println("Could not clear them. The key is unchanged.");
    return false;
  }
  Serial.println("Saved taps cleared.");
  return true;
}

void setWifi() {
  Serial.print("Wi-Fi name: ");
  String ssid = readSetupLine(true);
  if (ssid.length() == 0 || ssid.length() > 32) {
    Serial.println("A Wi-Fi name is 1 to 32 characters. Not changed.");
    return;
  }
  Serial.print("Wi-Fi password (hidden as you type; just Enter for an open network): ");
  String pass = readSetupLine(false);
  if (pass.length() > 0 && (pass.length() < 8 || pass.length() > 63)) {
    Serial.println("A Wi-Fi password is 8 to 63 characters, or none for an open network. Not changed.");
    return;
  }
  if (!storeSetting("wifi_ssid", ssid) || !storeSetting("wifi_pass", pass)) {
    Serial.println("Could not store it. Type wifi to try again.");
    return;
  }
  wifiSsid = ssid;
  wifiPassword = pass;
  wifiFromSetup = true;

  // Kept whether or not it joins: a station set up the night before can't
  // reach tomorrow's venue.
  Serial.println("Stored. Trying " + wifiSsid + " for up to 20 seconds...");
  dropConnection();
  WiFi.disconnect();
  delay(100);
  beginWifi();
  const unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < WIFI_JOIN_WAIT_MS) delay(500);
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Joined " + wifiSsid + ", IP " + WiFi.localIP().toString() + ".");
  } else {
    Serial.println("Could not join " + wifiSsid + ". It's kept, and the station tries it again after it restarts.");
  }
}

void resetSettings() {
  // Going back to a different key in secrets.h is a move to that key's event.
  if (stationKey != String(STATION_KEY)) {
    Serial.println("secrets.h has a different station key, so its saved taps are handled as for move.");
    if (!sendOrClearSavedTaps()) return;
  }
  settings.clear();
  loadSettings();
  Serial.println("Stored settings forgotten. secrets.h applies once the station restarts: type exit.");
  printSettings();
}

// After a new server or key: one heartbeat, to show the pair works before
// anyone walks away from the station.
void reportHeartbeat() {
  Serial.println("Checking with a heartbeat...");
  const int code = sendHeartbeat();
  if (code == 200) {
    Serial.println("OK: the server knows this station's key.");
  } else if (code == 401) {
    Serial.println("Key rejected (401): the server doesn't know this key, or the station is disabled.");
  } else if (code < 0) {
    Serial.println("No answer from the server.");
  } else if (code == 0) {
    // sendHeartbeat has said why it wasn't sent.
    Serial.println("Not checked now. The station checks it when it restarts.");
  } else {
    Serial.println("The server answered HTTP " + String(code) + ".");
  }
}
