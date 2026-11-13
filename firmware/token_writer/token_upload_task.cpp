#include "token_upload_task.h"
#include "token_address.h"
#include "secrets.h"
#include "ca_roots.h"
// An older secrets.h with only the NTAG password still writes offline.
#ifndef WIFI_SSID
#define WIFI_SSID ""
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD ""
#endif
#ifndef SERVER_URL
#define SERVER_URL ""
#endif
#ifndef WRITER_KEY
#define WRITER_KEY ""
#endif
#include <ESPmDNS.h>
#include <HTTPClient.h>
#include <NetworkClientSecure.h>
#include <WiFi.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <freertos/task.h>

namespace {
TokenUploadQueue uploads;
UploadServer server;
SemaphoreHandle_t queueMutex = nullptr, printMutex = nullptr;
bool enabled = false;
bool wifiReady = false; // Shared only under queueMutex.

void uploadTask(void*) {
  // These objects never leave core 0. Even joining WiFi stays off loop().
  NetworkClientSecure secure;
  WiFiClient plain;
  HTTPClient http;
  secure.setCACert(CA_ROOTS);
  secure.setHandshakeTimeout(5);
  secure.setTimeout(5000);
  plain.setTimeout(5000);
  http.setConnectTimeout(3000);
  http.setTimeout(5000);
  http.setReuse(true); // POST uses our already-connected client; end() follows each request.
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  WiFi.persistent(false); // Never save WiFi over the station's settings.
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  uint32_t lastJoin = millis();
  bool mdnsStarted = false;
  UploadRetry retry;
  UploadBatch batch;
  char body[UPLOAD_BODY_SIZE];
  char message[192];
  for (;;) {
    const bool wifi = WiFi.status() == WL_CONNECTED;
    xSemaphoreTake(queueMutex, portMAX_DELAY);
    // Read the time under the lock: a write queued just before it would
    // otherwise look 49 days old and expire at once.
    const uint32_t now = millis();
    wifiReady = wifi;
    const size_t expired = uploads.expire(now);
    uploads.batch(batch);
    xSemaphoreGive(queueMutex);
    if (expired) writerPrintLine(String("Upload queue expired ") + unsigned(expired) + " writes; paste their log lines in Token kinds");
    if (!wifi && uint32_t(now - lastJoin) >= 15000) {
      WiFi.reconnect();
      lastJoin = now;
    }
    if (!wifi && mdnsStarted) { MDNS.end(); mdnsStarted = false; }
    if (!batch.count || !retry.ready(now)) {
      vTaskDelay(pdMS_TO_TICKS(100));
      continue;
    }

    int code = 0;
    const char* reason = "no WiFi";
    if (wifi) {
      bool resolved = true;
      IPAddress localIp;
      if (server.local) {
        if (!mdnsStarted) mdnsStarted = MDNS.begin("geekykey-token-writer");
        const String name = String(server.host).substring(0, strlen(server.host) - 6);
        if (mdnsStarted) localIp = MDNS.queryHost(name.c_str(), 2000);
        resolved = mdnsStarted && localIp != IPAddress(0, 0, 0, 0);
      }
      reason = resolved ? "network error" : "mDNS lookup failed";
      if (resolved) {
        // Connect before measuring the ages: TLS/DNS can take seconds. HTTPS
        // always keeps the hostname for SNI and certificate validation.
        NetworkClient& client = server.https ? static_cast<NetworkClient&>(secure) : plain;
        const String host = server.https ? String(server.host) : localIp.toString();
        const String url = String(server.https ? "https://" : "http://") + host + ":" + server.port + "/api/v1/token-writer/tokens";
        const bool begun = http.begin(client, url);
        const bool connected = begun && (server.https ? secure.connect(server.host, server.port, 3000)
                                                     : plain.connect(localIp, server.port, 3000));
        if (connected) {
          http.addHeader("Authorization", String("Bearer ") + WRITER_KEY);
          http.addHeader("Content-Type", "application/json");
          // Rebuild for THIS attempt, after connection and mDNS resolution.
          if (buildUploadBody(body, sizeof(body), batch, millis()))
            code = http.POST(reinterpret_cast<uint8_t*>(body), strlen(body));
          else reason = "write too old"; // Next poll expires it; never send an invalid age.
        }
        http.end();
        plain.stop();
        secure.stop();
      }
    }
    xSemaphoreTake(queueMutex, portMAX_DELAY);
    uploads.complete(batch, code);
    const size_t waiting = uploads.waiting();
    xSemaphoreGive(queueMutex);
    if (code == 200 || code == 400) {
      retry.succeeded();
      if (code == 400) writerPrintLine("Upload batch rejected (400 validation_failed); use the log and report the firmware bug to Adam");
      for (size_t i = 0; i < batch.count; ++i) {
        const UploadEntry& entry = batch.entries[i];
        if (code == 200) formatUploaded(message, sizeof(message), entry.uid, entry.kind);
        else formatUploadRejected(message, sizeof(message), entry.uid, entry.kind);
        writerPrintLine(message);
      }
    } else {
      if (code == 401) reason = "key rejected (401); check key or Worker secret";
      else if (code == 429) reason = "rate limited (429)";
      else if (code == 503) reason = "claims unavailable (503)";
      else if (code > 0) reason = "unexpected HTTP status";
      const uint32_t waitMs = retry.failed(code, millis());
      formatUploadFailure(message, sizeof(message), reason, waiting, waitMs);
      writerPrintLine(message);
    }
    vTaskDelay(pdMS_TO_TICKS(100));
  }
}
} // namespace

void writerPrintLine(const String& line) {
  const String whole = line + '\n';
  if (printMutex) xSemaphoreTake(printMutex, portMAX_DELAY);
  Serial.write(reinterpret_cast<const uint8_t*>(whole.c_str()), whole.length());
  if (printMutex) xSemaphoreGive(printMutex);
}

void startTokenUploads() {
  printMutex = xSemaphoreCreateMutex();
  queueMutex = xSemaphoreCreateMutex();
  if (!printMutex || !queueMutex) {
    writerPrintLine("Uploads off: could not allocate upload locks; keep the serial log");
    return;
  }
  if (!uploadSettingsReady(WIFI_SSID, WIFI_PASSWORD, WRITER_KEY)) {
    writerPrintLine("Uploads off: set WiFi and WRITER_KEY in the writer's secrets.h; keep the serial log");
    return;
  }
  if (!parseUploadServer(SERVER_URL, server)) {
    writerPrintLine("Uploads off: SERVER_URL must be HTTPS or HTTP to a .local host, with no path; check secrets.h");
    return;
  }
  enabled = true;
  // ESP-IDF uses bytes for this stack size. TLS and the body stay on core 0.
  if (xTaskCreatePinnedToCore(uploadTask, "token_upload", 20480, nullptr, 1, nullptr, 0) != pdPASS) {
    enabled = false;
    writerPrintLine("Uploads off: could not start upload task; keep the serial log");
    return;
  }
  writerPrintLine("Uploads enabled; connecting to WiFi in the background");
}

uint32_t logWrittenToken(const char* uid, char kind) {
  char line[UID_KIND_LINE_LEN];
  formatUidKindLine(line, uid, kind);
  if (queueMutex) xSemaphoreTake(queueMutex, portMAX_DELAY);
  // The worker cannot see this entry before its backup line has been printed.
  const uint32_t writtenAt = millis();
  writerPrintLine(line);
  const uint32_t id = enabled ? uploads.enqueue(uid, kind, writtenAt) : 0;
  if (queueMutex) xSemaphoreGive(queueMutex);
  if (enabled && !id)
    writerPrintLine(String("Upload not queued (queue full): ") + uid + " kind " + kind + "; paste its log line in Token kinds");
  return id;
}

UploadSnapshot tokenUploadSnapshot(uint32_t id) {
  UploadSnapshot snapshot;
  if (queueMutex) xSemaphoreTake(queueMutex, portMAX_DELAY);
  snapshot.enabled = enabled;
  snapshot.wifi = wifiReady;
  snapshot.waiting = uploads.waiting();
  snapshot.pasteNeeded = uploads.pasteNeeded();
  snapshot.state = enabled ? uploads.state(id) : UploadState::Off;
  if (queueMutex) xSemaphoreGive(queueMutex);
  return snapshot;
}
