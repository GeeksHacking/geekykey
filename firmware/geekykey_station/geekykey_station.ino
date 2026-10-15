/*
  ESP32-S3 + RC522 -> read an NTAG213 -> POST the tap to the GeekyKey backend

  Wiring:
    RC522 3.3V  -> ESP32-S3 3V3
    RC522 GND   -> ESP32-S3 GND
    RC522 RST   -> GPIO9
    RC522 SCK   -> GPIO12
    RC522 MISO  -> GPIO13
    RC522 MOSI  -> GPIO11
    RC522 SDA   -> GPIO10   (this is the chip-select / SS pin)
    RC522 IRQ   -> not connected

  Libraries needed (Library Manager):
    "MFRC522"
    "ArduinoJson" (version 7)

  Setup: copy secrets.example.h to secrets.h in this folder and fill it in.
  secrets.h is gitignored, so credentials never reach the repo.

  The server is a full base URL in secrets.h (SERVER_URL), such as
  "https://event-api.geekshacking.com" in production or
  "http://A-Mac.local:8000" on a laptop. An https:// URL is called as written,
  with the server's certificate checked against the 14 root certificates in
  ca_roots.h: the station key must never cross the venue WiFi in plain text,
  so plain http:// is only ever sent to a .local host, whose IP is looked up
  with mDNS because a phone hotspot hands out a new one on every restart.

  The backend contract for POST /api/v1/taps is in apps/API-AGREEMENT.md, section 6.1,
  and for POST /api/v1/stations/heartbeat in section 6.2.

  The heartbeat goes at boot and every 60 seconds, with any saved taps sent
  just before it. Its answer's server_time sets the station's clock, and taps
  carry tapped_at once the clock is set. There is no NTP: some venue WiFi
  blocks it.
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
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

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
#define NO_LED -1

// Sent with each heartbeat and shown to organizers on the station board.
// Change it whenever a new build goes onto the stations.
#define FIRMWARE_VERSION "2026-10-15"

// How often the station sends a heartbeat, with any saved taps just before it.
#define HEARTBEAT_INTERVAL_MS 60000UL

// How long a tap's result stays on the screen, with its LED on.
#define RESULT_SHOW_MS 2000UL

// How long boot waits for WiFi before carrying on without it. The ESP32 keeps
// trying in the background, and taps are saved until it connects.
#define WIFI_BOOT_WAIT_MS 20000UL

// A token that slips off the reader and back while its result shows is read
// again straight after, and the server would only answer `cooldown`. So the
// same token is skipped for this long once its result has gone. This is not
// the cooldown: only the server decides whether a tap counts.
#define SAME_TOKEN_IGNORE_MS 3000UL

LiquidCrystal_I2C lcd(0x27, 16, 2);

const char* ssid = WIFI_SSID;
const char* password = WIFI_PASSWORD;
const char* stationKey = STATION_KEY;

// SERVER_URL split into its parts at boot (parseServerUrl). An https:// URL
// keeps its host as written: the ESP32's DNS resolves it and the certificate is
// checked against the hostname in it.
bool urlIsHttps = false;      // SERVER_URL starts with "https://"
bool urlHostIsLocal = false;  // the host ends in ".local", so mDNS looks up its IP
String urlHost = "";          // the host, without any port
uint16_t urlPort = 443;       // from SERVER_URL, or the scheme's default

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
// never printed on the serial port.
WiFiClient plainClient;
NetworkClientSecure secureClient;
HTTPClient http;

// The library is not given RST_PIN: setup() drives it instead (see there).
MFRC522 rfid(SS_PIN, MFRC522::UNUSED_PIN);
Preferences prefs;
uint32_t nextTapId = 0;

String lastUid = "";
unsigned long lastResultEndedAt = 0;

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
  Wire.begin(I2C_SDA, I2C_SCL);
  lcd.init();
  lcd.backlight();

  // Read the server setting before anything else. A URL the station may not
  // use is a setup error: it shows on the screen and nothing is ever sent, so
  // the station key cannot cross the venue WiFi in plain text.
  if (!parseServerUrl()) {
    showScreen("SETUP ERROR", "Check secrets.h");
    Serial.println("Setup error: SERVER_URL in secrets.h is not usable. Sending nothing.");
    while (true) delay(1000);
  }

  // The station drives the RC522's reset pin itself (initReader says why).
  pinMode(RST_PIN, OUTPUT);
  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, SS_PIN);
  initReader();
  // Asks the RC522 for its chip version. 0x00 or 0xFF means the ESP32 cannot
  // talk to the reader over SPI: check the wiring and 3.3V power first.
  rfid.PCD_DumpVersionToSerial();

  // client_tap_id must be unique per station forever, so the counter lives in
  // flash. If it reset on reboot, every tap after a restart would be a
  // `duplicate` and silently discarded by the backend.
  prefs.begin("geekykey", false);
  nextTapId = prefs.getUInt("tap_id", 0);
  loadQueueState();

  // The station runs on mains power, so keep the radio awake: WiFi's power
  // saving adds 100-300 ms to every answer from the backend.
  WiFi.setSleep(false);
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  showScreen("Connecting", "to WiFi...");
  const unsigned long wifiStartedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStartedAt < WIFI_BOOT_WAIT_MS) {
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

  // The first heartbeat replaces a health check, since it also proves the
  // station key, and sets the clock before anyone taps.
  if (heartbeatTick() == 401) showResult("SETUP ERROR", "Tell organizer", LED_PIN_RED);

  Serial.println("Ready. Tap an NTAG213 tag...");
  showReady();
}

void loop() {
  if ((long)(millis() - nextHeartbeatAt) >= 0) heartbeatTick();

  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    delay(50);
    return;
  }

  // The backend identifies a tag by its hardware UID, which is available as
  // soon as PICC_ReadCardSerial succeeds. Nothing else on the tag is read.
  String uid = uidToHex(rfid.uid);
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  Serial.println("UID: " + uid);

  if (uid == lastUid && millis() - lastResultEndedAt < SAME_TOKEN_IGNORE_MS) {
    Serial.println("Skipped: the same tag again straight after its result");
    return;
  }

  handleTap(uid);
  lastUid = uid;
  lastResultEndedAt = millis();
}

// Saves the tap, sends it with any saved taps, and shows the result.
void handleTap(const String &uid) {
  String clientTapId = takeClientTapId();
  // Saved with the tap, so a tap resent later keeps the time it was made.
  QueuedTap tap = {clientTapId, uid, clockSet ? isoNow() : ""};
  if (!enqueueTap(tap)) {
    if (queueCount >= QUEUE_CAPACITY) {
      showResult("QUEUE FULL", "Storage full", LED_PIN_RED);
    } else {
      showResult("STORAGE ERROR", "Check station", LED_PIN_RED);
    }
    return;
  }

  QueueAttempt attempt = flushQueue(clientTapId);
  if (attempt.newTapStatus.length() > 0) {
    showTapStatus(attempt.newTapStatus);
  } else if (attempt.newTapDropped) {
    showResult("DROPPED", "Bad tap request", LED_PIN_RED);
  } else if (attempt.httpCode == 401) {
    showResult("SETUP ERROR", "Tell organizer", LED_PIN_RED);
  } else {
    // The tap is saved and will be sent again, so this is not an error.
    showResult("QUEUED", "Will send later", NO_LED);
  }
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
  const int code = http.POST(body);
  const String response = code > 0 ? http.getString() : "";
  http.end();
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
    showResult("ACCEPTED", "Points added", LED_PIN_BLUE);
  } else if (status == "cooldown") {
    showResult("COOLDOWN", "Try again later", LED_PIN_YELLOW);
  } else if (status == "unknown_token") {
    showResult("UNKNOWN TAG", "Pair this token", LED_PIN_RED);
  } else if (status == "no_event") {
    showResult("NO EVENT", "Tell organizer", LED_PIN_RED);
  } else if (status == "no_game") {
    showResult("NO GAME", "Tell organizer", LED_PIN_RED);
  } else if (status == "duplicate") {
    showResult("DUPLICATE", "Already recorded", NO_LED);
  } else {
    showResult("TAP RECEIVED", "Check your phone", LED_PIN_BLUE);
  }
}

// Shows a result for about 2 seconds with its LED on, then goes back to Ready.
void showResult(const char *line1, const char *line2, int ledPin) {
  showScreen(line1, line2);
  if (ledPin != NO_LED) digitalWrite(ledPin, HIGH);
  delay(RESULT_SHOW_MS);
  if (ledPin != NO_LED) digitalWrite(ledPin, LOW);
  showReady();
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

// Splits SERVER_URL into its parts and decides whether the station may send at
// all. Returns false for a URL the station must not use, which parks it on a
// setup error: the setting is only usable as https://, or as plain http:// to a
// host ending in .local. Anything else would send the station key across the
// venue WiFi in plain text, before anything could redirect it to HTTPS.
bool parseServerUrl() {
  String rest = SERVER_URL;
  if (rest.startsWith("https://")) {
    urlIsHttps = true;
    urlPort = 443;
    rest.remove(0, 8);
  } else if (rest.startsWith("http://")) {
    urlIsHttps = false;
    urlPort = 80;
    rest.remove(0, 7);
  } else {
    Serial.println("SERVER_URL must start with https:// or http://");
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
      urlPort = (uint16_t)port;
    } else {
      Serial.println("SERVER_URL's port is not a number, using " + String(urlPort));
    }
  }
  urlHost = rest;
  if (urlHost.length() == 0) {
    Serial.println("SERVER_URL has no host");
    return false;
  }
  urlHostIsLocal = urlHost.endsWith(".local");
  if (!urlIsHttps && !urlHostIsLocal) {
    Serial.println("SERVER_URL is plain http:// to a host that isn't .local");
    return false;
  }
  return true;
}

// Builds serverBase, the base URL every request goes to. A host ending in
// .local is looked up with mDNS, which asks the local network "who is A-Mac?"
// and gets the laptop's current IP back, because a phone hotspot hands out a
// new one whenever it restarts. Any other host is https and is used as written:
// the ESP32's DNS resolves it and the certificate is checked against the
// hostname in the URL.
bool resolveServer() {
  if (!urlHostIsLocal) {
    serverBase = String(urlIsHttps ? "https://" : "http://") + urlHost + ":" + String(urlPort);
    return true;
  }
  String name = urlHost;
  name.remove(name.length() - 6);  // mDNS queries take the name without .local
  IPAddress ip = MDNS.queryHost(name.c_str(), 3000);
  if (ip == IPAddress(0, 0, 0, 0)) {
    Serial.println("Could not find " + urlHost + " on this network. Is the laptop on the same WiFi?");
    return false;
  }
  String resolved = String(urlIsHttps ? "https://" : "http://") + ip.toString() + ":" + String(urlPort);
  if (serverBase.length() > 0 && resolved != serverBase) {
    // The laptop has a new IP. The kept-open connection points at the old one
    // and, with reuse on, HTTPClient would send to it again, so close it.
    if (plainClient.connected()) plainClient.stop();
  }
  serverBase = resolved;
  Serial.println("Backend: " + urlHost + " -> " + serverBase);
  return true;
}

// Points the shared HTTPClient at a path on the server. The scheme picks the
// client: TLS over the roots in ca_roots.h for https://, the plain client for a
// .local host. begin() only parses the URL and opens nothing: the connection
// made for a request is kept for the next one (see setReuse in setup()).
bool beginRequest(const String &path) {
  if (urlIsHttps) return http.begin(secureClient, serverBase + path);
  return http.begin(plainClient, serverBase + path);
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
// that was unplugged and plugged back in.
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

// Every 60 seconds and at boot: checks the reader, sends any saved taps, then
// sends the heartbeat, so buffered_taps counts what is still saved. Returns
// the heartbeat's HTTP code, or 0 when it wasn't sent.
int heartbeatTick() {
  nextHeartbeatAt = millis() + HEARTBEAT_INTERVAL_MS;
  checkReader();
  flushQueue();
  return sendHeartbeat();
}

// POST /api/v1/stations/heartbeat (the API agreement's 6.2). A 200 sets the
// clock from server_time. Any other answer changes nothing here: a 401 or a
// 503 also fails the taps, which are saved and sent again.
int sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return 0;
  if (serverBase.length() == 0 && !resolveServer()) return 0;

  JsonDocument request;
  request["firmware_version"] = FIRMWARE_VERSION;
  request["buffered_taps"] = queueCount;
  request["reader_ok"] = readerOk;
  String body;
  if (serializeJson(request, body) == 0) return 0;

  if (!beginRequest("/api/v1/stations/heartbeat")) return 0;
  // As for a tap: until checkpoint 4 the server answers once it has passed
  // the heartbeat on, which takes up to 4 seconds.
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
