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

  The backend is found by the laptop's name (SERVER_HOST, e.g. A-Mac.local)
  rather than its IP, because a phone hotspot hands out a new IP whenever it
  restarts.

  The backend contract for POST /api/v1/taps is in apps/API-AGREEMENT.md, section 6.1.
*/

#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include "secrets.h"
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

// "http://<ip>:<port>" once SERVER_HOST has been looked up; empty until then.
String serverBase = "";

// The library is not given RST_PIN: setup() drives it instead (see there).
MFRC522 rfid(SS_PIN, MFRC522::UNUSED_PIN);
Preferences prefs;
uint32_t nextTapId = 0;

String lastUid = "";
unsigned long lastResultEndedAt = 0;

#define QUEUE_CAPACITY 100
#define QUEUE_RETRY_INTERVAL_MS 60000UL
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
unsigned long nextQueueAttemptAt = 0;

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

  // Hold the RC522's reset pin HIGH ourselves. Given the pin, the library
  // leaves it a floating input whenever it happens to read HIGH, and the
  // reader can then drift into power-down: it answers 0xFF and never sees a
  // tag. A LOW pulse first gives it a clean hard reset on every boot.
  pinMode(RST_PIN, OUTPUT);
  digitalWrite(RST_PIN, LOW);
  delay(10);
  digitalWrite(RST_PIN, HIGH);
  delay(50);
  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, SS_PIN);
  rfid.PCD_Init();
  rfid.PCD_SetRegisterBitMask(mfrc522.RFCfgReg, (0x07 << 4));
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
  if (WiFi.status() == WL_CONNECTED && resolveServer()) checkBackend();

  Serial.println("Ready. Tap an NTAG213 tag...");
  showReady();
}

void loop() {
  flushQueue();

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
  QueuedTap tap = {clientTapId, uid, ""};
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

  HTTPClient http;
  if (!http.begin(serverBase + "/api/v1/taps")) {
    result.retryable = true;
    return;
  }
  // A backend that has left the network would otherwise hold up the tap for
  // 5 seconds before it is saved. Answers keep 5 seconds, because the backend
  // can take up to 4 finding the token's owner and handing the tap on.
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
    // or waking from sleep), so look SERVER_HOST up again next time.
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
  if (newTapId.length() == 0 && millis() < nextQueueAttemptAt) return result;

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
  nextQueueAttemptAt = millis() + QUEUE_RETRY_INTERVAL_MS;
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

void showReady() {
  showScreen("Ready", "Tap a tag");
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

// Turns SERVER_HOST into serverBase. A name ending in .local is looked up with
// mDNS, which asks the local network "who is A-Mac?" and gets the laptop's
// current IP back. A plain IP address is used as it is.
bool resolveServer() {
  String host = SERVER_HOST;
  IPAddress ip;
  if (host.endsWith(".local")) {
    host.remove(host.length() - 6);  // mDNS queries take the name without .local
    ip = MDNS.queryHost(host.c_str(), 3000);
    if (ip == IPAddress(0, 0, 0, 0)) {
      Serial.println("Could not find " + String(SERVER_HOST) + " on this network. Is the laptop on the same WiFi?");
      return false;
    }
  } else if (!ip.fromString(host)) {
    Serial.println("SERVER_HOST must be an IP address or a name ending in .local");
    return false;
  }
  serverBase = "http://" + ip.toString() + ":" + String(SERVER_PORT);
  Serial.println("Backend: " + String(SERVER_HOST) + " -> " + serverBase);
  return true;
}

// Boot self-test: confirms the backend is reachable before anyone taps.
void checkBackend() {
  HTTPClient http;
  http.begin(serverBase + "/api/health");
  http.setConnectTimeout(2000);
  http.setTimeout(5000);
  int code = http.GET();
  http.end();
  if (code == 200) {
    Serial.println("Backend reachable");
  } else if (code <= 0) {
    Serial.println("Backend NOT reachable: " + HTTPClient::errorToString(code));
  } else {
    Serial.println("Backend answered HTTP " + String(code));
  }
}
