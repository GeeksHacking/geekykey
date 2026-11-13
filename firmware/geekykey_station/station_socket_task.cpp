#include "station_socket_task.h"
#include "station_socket.h"
#include "station_message.h"
#include <ArduinoJson.h>
#include <ESPmDNS.h>
#include <NetworkClientSecure.h>
#include <WiFi.h>
#include <atomic>
#include <esp_system.h>
#include <mbedtls/base64.h>
#include <mbedtls/sha1.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>

namespace {
struct SocketSettings {
  String host;
  String key;
  uint16_t port = 443;
  bool https = true;
  bool local = false;
  const char *roots = nullptr;
} config;
std::atomic<bool> clockReady{false};
std::atomic<bool> wifiReady{false};
std::atomic<bool> paused{false};
std::atomic<int> socketStatus{0};
QueueHandle_t messages = nullptr;

bool ready() { return clockReady.load() && wifiReady.load() && !paused.load(); }

// The limits apply before copying any JSON text to the screen. JsonString's
// size keeps embedded NULs visible to the pure validator too.
size_t messageLines(JsonVariantConst from, MessageLine out[2]) {
  if (!from.is<JsonArrayConst>()) return 0;
  JsonArrayConst array = from.as<JsonArrayConst>();
  if (array.size() > 2) return array.size();
  for (size_t i = 0; i < array.size(); i++) {
    if (!array[i].is<const char *>()) { out[i] = {nullptr, 0}; continue; }
    JsonString text = array[i].as<JsonString>();
    out[i] = {text.c_str(), text.size()};
  }
  return array.size();
}

void readMessage(const uint8_t *text, size_t length, uint32_t arrivedAt) {
  if (length == 4 && memcmp(text, "pong", 4) == 0) return;
  if (!messageHasOneJsonObject((const char *)text, length)) {
    Serial.println("Socket message ignored: expected one whole JSON object");
    return;
  }
  JsonDocument json;
  const DeserializationError parsed = deserializeJson(json, text, length, DeserializationOption::NestingLimit(6));
  if (parsed || !json.is<JsonObject>()) {
    Serial.println("Socket message ignored: expected a JSON object");
    return;
  }
  JsonObjectConst object = json.as<JsonObjectConst>();
  if (!object["type"].is<const char *>()) {
    Serial.println("Socket message ignored: type is not text");
    return;
  }
  if (object["type"].as<JsonString>() != "station_message") return;
  MessageFields fields;
  fields.lineCount = messageLines(object["lines"], fields.lines);
  // Presence, rather than nullness, matters: an optional field sent as null
  // still breaks the message's rules.
  fields.beepIsBool = object["beep"].isUnbound() || object["beep"].is<bool>();
  fields.hasCountdown = !object["countdown"].isUnbound();
  if (fields.hasCountdown) {
    if (!object["countdown"].is<JsonObjectConst>()) {
      Serial.println("Socket message ignored: countdown is not an object");
      return;
    }
    JsonObjectConst count = object["countdown"].as<JsonObjectConst>();
    fields.secondsIsInteger = count["seconds"].is<long>();
    fields.seconds = count["seconds"].as<long>();
    fields.countdownLineCount = messageLines(count["lines"], fields.countdownLines);
    fields.endingCount = messageLines(count["ending"], fields.ending);
  }
  const char *error = validateStationMessage(fields);
  if (error) {
    // Log the reason, never the payload: an invalid frame could echo a key.
    Serial.println(String("Socket message ignored: ") + error);
    return;
  }
  StationMessage message;
  message.arrivedAt = arrivedAt;
  message.beep = object["beep"].as<bool>();
  for (size_t i = 0; i < fields.lineCount; i++) copyLine(message.lines[i], fields.lines[i].text);
  if (fields.hasCountdown) {
    for (size_t i = 0; i < fields.countdownLineCount; i++) {
      strncpy(message.countdown.lines[i], fields.countdownLines[i].text, COUNTDOWN_LINE_MAX);
      message.countdown.lines[i][COUNTDOWN_LINE_MAX] = '\0';
    }
    for (size_t i = 0; i < fields.endingCount; i++) copyLine(message.countdown.ending[i], fields.ending[i].text);
    startCountdown(message.countdown, fields.seconds, arrivedAt);
  }
  xQueueOverwrite(messages, &message);
}

bool writeAll(Client &client, const uint8_t *bytes, size_t length) {
  const uint32_t startedAt = millis();
  size_t sent = 0;
  while (sent < length && ready() && client.connected() && uint32_t(millis() - startedAt) < 5000) {
    const size_t count = client.write(bytes + sent, length - sent);
    if (count == 0) return false;
    sent += count;
    if (sent < length) vTaskDelay(pdMS_TO_TICKS(10));
  }
  return sent == length;
}

bool sendFrame(Client &client, uint8_t opcode, const uint8_t *payload, size_t length) {
  // This task only sends ping text and control frames, all under 126 bytes.
  uint8_t frame[131];
  uint8_t mask[4];
  esp_fill_random(mask, sizeof(mask));
  const size_t size = encodeSocketFrame(opcode, payload, length, mask, frame, sizeof(frame));
  return size && writeAll(client, frame, size);
}

void sendClose(Client &client, uint16_t code) {
  const uint8_t payload[] = {uint8_t(code >> 8), uint8_t(code)};
  sendFrame(client, 8, payload, sizeof(payload));
}

// Generate a new nonce for every attempt. mbedTLS ships with the ESP32 core;
// no extra library is needed. The accept is SHA-1(nonce + RFC 6455's GUID).
bool socketNonce(char key[25], char accept[29]) {
  uint8_t random[16], hash[20];
  esp_fill_random(random, sizeof(random));
  size_t written = 0;
  if (mbedtls_base64_encode((unsigned char *)key, 25, &written, random, sizeof(random)) != 0) return false;
  key[written] = '\0';
  const String source = String(key) + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
  if (mbedtls_sha1((const unsigned char *)source.c_str(), source.length(), hash) != 0) return false;
  if (mbedtls_base64_encode((unsigned char *)accept, 29, &written, hash, sizeof(hash)) != 0) return false;
  accept[written] = '\0';
  return true;
}

int openSocket(Client &client) {
  char nonce[25], accept[29];
  if (!socketNonce(nonce, accept)) return 0;
  String request = "GET /api/v1/stations/socket HTTP/1.1\r\nHost: " + config.host + ":" + String(config.port) +
                   "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: " +
                   String(nonce) + "\r\nAuthorization: Bearer " + config.key + "\r\n\r\n";
  if (!writeAll(client, (const uint8_t *)request.c_str(), request.length())) return 0;
  char response[2049];
  size_t used = 0;
  const uint32_t startedAt = millis();
  while (ready() && client.connected() && uint32_t(millis() - startedAt) < 5000) {
    while (client.available() > 0) {
      const int next = client.read();
      if (next < 0) break;
      if (next == 0 || used == sizeof(response) - 1) return 0;
      response[used++] = (char)next;
      response[used] = '\0';
      if (used >= 4 && memcmp(response + used - 4, "\r\n\r\n", 4) == 0)
        return checkSocketUpgrade(response, accept);
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
  return 0;
}

void holdSocket(Client &client) {
  SocketDecoder decoder;
  uint32_t lastPingAt = millis();
  uint32_t frameStartedAt = 0;
  bool awaitingPong = false;
  while (ready() && client.connected()) {
    const uint32_t now = millis();
    if (awaitingPong && uint32_t(now - lastPingAt) >= 15000) {
      Serial.println("Socket: pong timed out");
      return;
    }
    if (!awaitingPong && uint32_t(now - lastPingAt) >= 30000) {
      if (!sendFrame(client, 1, (const uint8_t *)"ping", 4)) return;
      lastPingAt = millis();
      awaitingPong = true;
    }
    // Yield even if the peer keeps sending, so core 0 can still run WiFi.
    for (int bytes = 0; bytes < 512 && client.available() > 0; bytes++) {
      const int next = client.read();
      if (next < 0) break;
      if (decoder.position == 0) frameStartedAt = millis();
      const SocketDecode result = decoder.feed((uint8_t)next);
      if (result == SOCKET_REJECT) {
        Serial.println(String("Socket: closing, ") + decoder.error);
        sendClose(client, decoder.rejectCode);
        return;
      }
      if (result != SOCKET_FRAME) continue;
      if (decoder.opcode == 8) {
        Serial.println("Socket: closed, code " + String(decoder.closeCode()));
        if (decoder.length == 0) sendFrame(client, 8, nullptr, 0);
        else sendFrame(client, 8, decoder.payload, decoder.length);
        return;
      }
      if (decoder.opcode == 9 && !sendFrame(client, 10, decoder.payload, decoder.length)) return;
      if (decoder.opcode == 1) {
        if (decoder.length == 4 && memcmp(decoder.payload, "pong", 4) == 0) awaitingPong = false;
        else readMessage(decoder.payload, decoder.length, millis());
      }
      decoder.reset();
    }
    if (decoder.position > 0 && uint32_t(millis() - frameStartedAt) >= 5000) {
      Serial.println("Socket: incomplete frame timed out");
      sendClose(client, 1002);
      return;
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

void socketTask(void *) {
  // These clients belong to this task alone. A TLS handshake or a stalled
  // write can take seconds, and neither may ever run on the reader's loop.
  NetworkClientSecure secure;
  WiFiClient plain;
  secure.setCACert(config.roots);
  secure.setHandshakeTimeout(5);
  secure.setTimeout(2000);
  plain.setTimeout(2000);
  SocketRetry retry;
  uint32_t waitStartedAt = 0, waitMs = 0;
  bool stackPrinted = false;
  while (true) {
    if (!ready() || uint32_t(millis() - waitStartedAt) < waitMs) {
      vTaskDelay(pdMS_TO_TICKS(100));
      continue;
    }
    Client &client = config.https ? static_cast<Client &>(secure) : static_cast<Client &>(plain);
    int connected = 0;
    if (config.https) {
      // Keep the hostname for SNI and certificate checking, even for .local.
      connected = secure.connect(config.host.c_str(), config.port, 2000);
    } else if (config.local) {
      String name = config.host.substring(0, config.host.length() - 6);
      const IPAddress ip = MDNS.queryHost(name.c_str(), 2000);
      if (ip != IPAddress(0, 0, 0, 0) && ready()) connected = plain.connect(ip, config.port, 2000);
    }
    const int code = connected && ready() ? openSocket(client) : 0;
    if (code == 101 && ready()) {
      retry.opened();
      socketStatus.store(101);
      Serial.println("Socket: open, free heap " + String(ESP.getFreeHeap()) + " bytes");
      if (!stackPrinted) {
        Serial.println("Socket: stack still free " + String(uxTaskGetStackHighWaterMark(nullptr)) + " bytes");
        stackPrinted = true;
      }
      holdSocket(client);
    } else if (code == 401) {
      socketStatus.store(401);
      Serial.println("Socket: key rejected (401)");
    } else {
      Serial.println("Socket: could not open");
    }
    client.stop();
    waitMs = retry.failed(code == 401);
    waitStartedAt = millis();
    Serial.println("Socket: retry in " + String(waitMs / 1000) + " s");
  }
}
} // namespace

bool startStationSocket(const String &host, uint16_t port, bool https, bool local,
                        const String &key, const char *roots) {
  if (messages || (!https && !local)) return false;
  config.host = host; config.key = key; config.port = port;
  config.https = https; config.local = local; config.roots = roots;
  messages = xQueueCreate(1, sizeof(StationMessage));
  if (!messages) return false;
  // ESP-IDF counts task stack sizes in bytes, unlike upstream FreeRTOS.
  if (xTaskCreatePinnedToCore(socketTask, "station_socket", 16384, nullptr, 1, nullptr, 0) != pdPASS) {
    vQueueDelete(messages);
    messages = nullptr;
    return false;
  }
  return true;
}
void stationSocketClockSet() { clockReady.store(true); }
void stationSocketWifi(bool connected) { wifiReady.store(connected); }
void pauseStationSocket() { paused.store(true); }
bool takeSocketMessage(StationMessage &message) { return messages && xQueueReceive(messages, &message, 0) == pdTRUE; }
int takeSocketStatus() { return socketStatus.exchange(0); }
