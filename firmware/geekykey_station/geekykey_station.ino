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

LiquidCrystal_I2C lcd(0x27, 16, 2);

const char* ssid = WIFI_SSID;
const char* password = WIFI_PASSWORD;
const char* stationKey = STATION_KEY;

// "http://<ip>:<port>" once SERVER_HOST has been looked up; empty until then.
String serverBase = "";

MFRC522 rfid(SS_PIN, RST_PIN);
Preferences prefs;
uint32_t nextTapId = 0;

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
  delay(1000);
  pinMode(LED_PIN_BLUE, OUTPUT);
  pinMode(LED_PIN_RED, OUTPUT);
  pinMode(LED_PIN_YELLOW, OUTPUT);
  Wire.begin(I2C_SDA, I2C_SCL);
  lcd.init();
  lcd.backlight();

  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, SS_PIN);
  rfid.PCD_Init();
  // Asks the RC522 for its chip version. 0x00 or 0xFF means the ESP32 cannot
  // talk to the reader over SPI: check the wiring and 3.3V power first.
  rfid.PCD_DumpVersionToSerial();

  // client_tap_id must be unique per station forever, so the counter lives in
  // flash. If it reset on reboot, every tap after a restart would be a
  // `duplicate` and silently discarded by the backend.
  prefs.begin("geekykey", false);
  nextTapId = prefs.getUInt("tap_id", 0);
  loadQueueState();

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  lcd.setCursor(0, 0);
  lcd.print("Connecting");
  lcd.setCursor(0, 1);
  lcd.print("to WiFi...");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  lcd.clear();
  Serial.println("\nConnected! IP: " + WiFi.localIP().toString());
  lcd.print("Connected!");
  delay(2000);
  lcd.clear();

  // mDNS must be running before this station can look up a .local name.
  if (!MDNS.begin("geekykey-station")) {
    Serial.println("mDNS failed to start");
    lcd.setCursor(0, 0);
    lcd.print("mDNS");
    lcd.setCursor(0, 1);
    lcd.print("failed to start");
    delay(2000);
    lcd.clear();
  }
  if (resolveServer()) checkBackend();

  Serial.println("Ready. Tap an NTAG213 tag...");
  lcd.setCursor(0, 0);
  lcd.print("Ready");
  lcd.setCursor(0, 1);
  lcd.print("Tap a tag");
  delay(2000);

}

void loop() {
  flushQueue();

  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    delay(50);
    return;
  }

  // The backend identifies a tag by its hardware UID, which is available as
  // soon as PICC_ReadCardSerial succeeds. The NDEF text is only logged.
  String uid = uidToHex(rfid.uid);
  String tagText = readNtag213Text();

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  Serial.println("UID: " + uid);

  if (tagText.length() > 0) Serial.println("Text: " + tagText);
  
  String clientTapId = takeClientTapId();
  QueuedTap tap = {clientTapId, uid, ""};
  if (!enqueueTap(tap)) {
    if (queueCount >= QUEUE_CAPACITY) {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("QUEUE FULL");
      lcd.setCursor(0, 1);
      lcd.print("Station storage full");
      delay(2000);
      blinkLEDRED();
    } else {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("STORAGE ERROR");
      lcd.setCursor(0, 1);
      lcd.print("Check station");
      delay(2000);
      blinkLEDRED();
    }
    return;
  }

  QueueAttempt attempt = flushQueue(clientTapId);
  if (attempt.newTapStatus.length() > 0) {
    showTapStatus(attempt.newTapStatus);
  } else if (attempt.newTapDropped) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("DROPPED");
    lcd.setCursor(0, 1);
    lcd.print("Bad tap request");
    delay(2000);
    blinkLEDRED();
  } else if (attempt.httpCode == 401) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("SETUP ERROR");
    lcd.setCursor(0, 1);
    lcd.print("Tell organizer");
    delay(2000);
    blinkLEDRED();
  } else {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("QUEUED");
    lcd.setCursor(0, 1);
    lcd.print("Will send later");
    delay(1000);
  }

  delay(250);
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
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + stationKey);
  const int code = http.POST(body);
  const String response = code > 0 ? http.getString() : "";
  http.end();
  result.httpCode = code;

  if (code == 400) {
    // A malformed request must not block every tap behind it.
    for (uint8_t i = 0; i < count; i++) {
      Serial.println("Dropping invalid tap " + batch[i].clientTapId + " uid=" + batch[i].uid);
      result.completed[i] = true;
      if (newTapId == batch[i].clientTapId) result.newTapDropped = true;
    }
    return;
  }
  if (code <= 0 || code == 401 || code == 429 || code >= 500 || code != 200) {
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
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("ACCEPTED");
    lcd.setCursor(0, 1);
    lcd.print("Points added");
    delay(2000);
    blinkLEDBLUE();
    blinkLEDBLUE();
  } else if (status == "cooldown") {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("COOLDOWN");
    lcd.setCursor(0, 1);
    lcd.print("Try again later");
    delay(2000);
    blinkLEDYELLOW();
  } else if (status == "unknown_token") {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("UNKNOWN TAG");
    lcd.setCursor(0, 1);
    lcd.print("Pair this token");
    delay(2000);
    blinkLEDRED();
    blinkLEDRED();
  } else if (status == "no_event") {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("NO EVENT");
    lcd.setCursor(0, 1);
    lcd.print("Tell organizer");
    delay(2000);
    blinkLEDRED();
  } else if (status == "no_game") {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("NO GAME");
    lcd.setCursor(0, 1);
    lcd.print("Tell organizer");
    delay(2000);
    blinkLEDRED();
  } else if (status == "duplicate") {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("DUPLICATE");
    lcd.setCursor(0, 1);
    lcd.print("Already recorded");
    delay(2000);
  } else {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("TAP RECEIVED");
    lcd.setCursor(0, 1);
    lcd.print("Check your phone");
    delay(2000);
    blinkLEDBLUE();
  }
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

void blinkLEDBLUE() {
  digitalWrite(LED_PIN_BLUE, HIGH);
  delay(500);
  digitalWrite(LED_PIN_BLUE, LOW);
  delay(500);
}

void blinkLEDRED() {
  digitalWrite(LED_PIN_RED, HIGH);
  delay(500);
  digitalWrite(LED_PIN_RED, LOW);
  delay(500);
}

void blinkLEDYELLOW() {
  digitalWrite(LED_PIN_YELLOW, HIGH);
  delay(500);
  digitalWrite(LED_PIN_YELLOW, LOW);
  delay(500);
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

// Reads user memory pages (starting at page 4) from an NTAG213 and returns
// the text payload of the first NDEF Text Record it finds.
String readNtag213Text() {
  byte fullBuffer[144];  // NTAG213 user memory is roughly 144 bytes
  int bytesRead = 0;
  byte page = 4;

  // MIFARE_Read pulls 16 bytes (4 pages) per call, same command works on Ultralight/NTAG
  while (page <= 39 && bytesRead < (int)sizeof(fullBuffer)) {
    byte buffer[18];
    byte size = sizeof(buffer);
    MFRC522::StatusCode status = rfid.MIFARE_Read(page, buffer, &size);
    if (status != MFRC522::STATUS_OK) break;

    int toCopy = min(16, (int)sizeof(fullBuffer) - bytesRead);
    memcpy(fullBuffer + bytesRead, buffer, toCopy);
    bytesRead += toCopy;
    page += 4;
  }

  return parseNdefText(fullBuffer, bytesRead);
}

// Walks the TLV structure to find an NDEF Message (type 0x03), then walks
// EVERY record inside that message (a tag can hold a URI record AND a Text
// record back to back) and returns only the payload of the Text record
// (type byte 0x54 = 'T'), skipping URI records (type byte 0x55 = 'U') or
// any other record type it encounters.
String parseNdefText(byte* data, int len) {
  int i = 0;
  while (i < len) {
    byte tlvType = data[i];

    if (tlvType == 0x00) {
      i++;
      continue;
    }                            // NULL TLV, skip
    if (tlvType == 0xFE) break;  // Terminator TLV, end of memory

    if (i + 1 >= len) break;
    int tlvLength = data[i + 1];
    int valueStart = i + 2;

    if (tlvType == 0x03 && valueStart < len) {  // NDEF Message TLV
      int p = valueStart;
      int messageEnd = valueStart + tlvLength;

      // Step through each record inside this one NDEF message
      while (p < messageEnd) {
        byte header = data[p];
        bool shortRecord = header & 0x10;  // SR flag: payload length is 1 byte, not 4
        bool idPresent = header & 0x08;    // IL flag: an ID field is present

        byte typeLength = data[p + 1];
        int offset = p + 2;

        long payloadLength;
        if (shortRecord) {
          payloadLength = data[offset];
          offset += 1;
        } else {
          payloadLength = ((long)data[offset] << 24) | ((long)data[offset + 1] << 16) | ((long)data[offset + 2] << 8) | data[offset + 3];
          offset += 4;
        }

        byte idLength = 0;
        if (idPresent) {
          idLength = data[offset];
          offset += 1;
        }

        byte typeField = data[offset];  // 'T' = 0x54 (Text), 'U' = 0x55 (URI)
        offset += typeLength;
        if (idPresent) offset += idLength;  // skip past the ID field, if any

        if (typeField == 0x54) {
          // Found the Text record -- extract it and stop, ignoring any
          // URI or other records elsewhere in the message.
          byte statusByte = data[offset];
          int langCodeLen = statusByte & 0x3F;  // low 6 bits = language code length
          int textStart = offset + 1 + langCodeLen;
          int textLen = payloadLength - 1 - langCodeLen;

          String text = "";
          for (int j = 0; j < textLen; j++) {
            text += (char)data[textStart + j];
          }
          return text;
        }

        // Not a Text record (e.g. it was a URI record) -- skip its payload
        // and move on to the next record in this same message.
        p = offset + payloadLength;
      }
    }

    i = valueStart + tlvLength;  // move to next TLV entry
  }
  return "";  // no Text record found anywhere on the tag
}
