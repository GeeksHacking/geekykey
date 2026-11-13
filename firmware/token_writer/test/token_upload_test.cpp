#include <cstdio>
#include <cstring>
#include <initializer_list>
#include <regex>
#include "../token_address.h"
#include "../token_upload.h"
static int failures = 0;
#define CHECK(c) do { if (!(c)) { std::printf("FAIL line %d: %s\n", __LINE__, #c); ++failures; } } while (0)

static void batchesKeepEveryWriteInOrder() {
  TokenUploadQueue queue;
  UploadBatch batch;
  CHECK(queue.batch(batch) == 0);
  for (unsigned i = 0; i < 51; ++i)
    CHECK(queue.enqueue("04E45150324189", i == 50 ? 'V' : 'E', i * 10) == i + 1);
  CHECK(queue.waiting() == 51);
  CHECK(queue.batch(batch) == 50);
  CHECK(batch.entries[0].id == 1);
  CHECK(batch.entries[49].id == 50);
  CHECK(batch.entries[49].writtenAt == 490);
  queue.complete(batch, 200);
  CHECK(queue.state(1) == UploadState::Sent);
  CHECK(queue.state(50) == UploadState::Sent);
  CHECK(queue.state(51) == UploadState::Waiting);
  CHECK(queue.batch(batch) == 1);
  CHECK(batch.entries[0].kind == 'V');
  queue.complete(batch, 200);
  CHECK(queue.waiting() == 0);
}
static void failuresRetainEntriesAndBackOff() {
  TokenUploadQueue queue;
  UploadBatch batch;
  UploadRetry retry;
  const auto id = queue.enqueue("04E45150324189", 'E', 0);
  queue.batch(batch);
  for (const int code : {429, 503, -1, 0, 500, 302}) {
    queue.complete(batch, code);
    CHECK(queue.state(id) == UploadState::Waiting);
    CHECK(queue.waiting() == 1);
  }
  CHECK(retry.failed(429, 100) == 5000);
  CHECK(!retry.ready(5099));
  CHECK(retry.ready(5100));
  CHECK(retry.failed(503, 5100) == 10000);
  CHECK(retry.failed(-1, 15100) == 20000);
  CHECK(retry.failed(0, 35100) == 40000);
  CHECK(retry.failed(500, 75100) == 60000);
  CHECK(retry.failed(503, 135100) == 60000);
  retry.succeeded();
  CHECK(retry.ready(135100));
  CHECK(retry.failed(401, 200000) == 60000);
  queue.complete(batch, 401);
  CHECK(queue.state(id) == UploadState::Waiting);
  retry.succeeded();
  CHECK(retry.failed(-1, UINT32_MAX - 1000) == 5000);
  CHECK(!retry.ready(3998));
  CHECK(retry.ready(3999));
  retry.succeeded();
  CHECK(retry.failed(-1, 4000) == 5000);
  queue.complete(batch, 400);
  CHECK(queue.waiting() == 0);
  CHECK(queue.state(id) == UploadState::Rejected);
  CHECK(queue.pasteNeeded() == 1);
}
static void fullQueueAndExpiredWritesNeedTheLog() {
  TokenUploadQueue queue;
  for (unsigned i = 0; i < 256; ++i) CHECK(queue.enqueue("04E45150324189", 'E', 10) != 0);
  CHECK(queue.enqueue("04E45150324189", 'V', 20) == 0);
  CHECK(queue.waiting() == 256);
  CHECK(queue.pasteNeeded() == 1);
  CHECK(queue.expire(UPLOAD_MAX_AGE_MS + 10) == 0);
  CHECK(queue.expire(UPLOAD_MAX_AGE_MS + 11) == 256);
  CHECK(queue.state(256) == UploadState::Rejected);
  CHECK(queue.pasteNeeded() == 257);
  CHECK(queue.waiting() == 0);
  CHECK(queue.enqueue("04E45150324189", 'V', UINT32_MAX - 100) != 0);
  CHECK(queue.expire(200) == 0);
  UploadBatch batch;
  queue.batch(batch);
  CHECK(batch.count == 1);
  CHECK(batch.entries[0].kind == 'V');
}
static void jsonAgesAreRecomputedAcrossWrap() {
  TokenUploadQueue queue;
  UploadBatch batch;
  queue.enqueue("04E45150324189", 'E', UINT32_MAX - 100);
  queue.enqueue("01020304", 'V', 100);
  queue.batch(batch);
  char body[UPLOAD_BODY_SIZE];
  CHECK(buildUploadBody(body, sizeof(body), batch, 200));
  CHECK(std::strcmp(body, "{\"tokens\":[{\"uid\":\"04E45150324189\",\"kind\":\"E\",\"written_ago_ms\":301},{\"uid\":\"01020304\",\"kind\":\"V\",\"written_ago_ms\":100}]}") == 0);
  CHECK(buildUploadBody(body, sizeof(body), batch, 1200));
  CHECK(std::strstr(body, "\"written_ago_ms\":1301") != nullptr);
  CHECK(std::strstr(body, "\"written_ago_ms\":1100") != nullptr);
  CHECK(!buildUploadBody(body, 8, batch, 1200));
  CHECK(!buildUploadBody(body, sizeof(body), batch, UPLOAD_MAX_AGE_MS + 101));
  queue.complete(batch, 200);
  queue.batch(batch);
  CHECK(!buildUploadBody(body, sizeof(body), batch, 1200));
  for (int i = 0; i < 50; ++i) queue.enqueue("0102030405060708090A", 'Z', 0);
  queue.batch(batch);
  CHECK(buildUploadBody(body, sizeof(body), batch, UPLOAD_MAX_AGE_MS));
  CHECK(std::strlen(body) < sizeof(body));
}
static void screensAndLogsShowTheUploadOutcome() {
  char text[192], backup[UID_KIND_LINE_LEN];
  formatReadyUpload(text, true, true, 0, 0);
  CHECK(std::strcmp(text, "All uploaded") == 0);
  formatReadyUpload(text, true, true, 3, 0);
  CHECK(std::strcmp(text, "3 to upload") == 0);
  formatReadyUpload(text, true, false, 3, 0);
  CHECK(std::strcmp(text, "No WiFi, 3 wait") == 0);
  formatReadyUpload(text, true, false, 256, 0);
  CHECK(std::strlen(text) <= 16);
  formatReadyUpload(text, false, false, 0, 0);
  CHECK(std::strcmp(text, "Uploads off") == 0);
  formatReadyUpload(text, true, true, 0, 2);
  CHECK(std::strcmp(text, "Check serial log") == 0);
  formatReadyUpload(text, true, true, 5, 2);
  CHECK(std::strstr(text, "paste") != nullptr);
  formatResultUpload(text, "OK kind E", UploadState::Waiting);
  CHECK(std::strcmp(text, "OK kind E   wait") == 0);
  formatResultUpload(text, "OK kind E", UploadState::Sent);
  CHECK(std::strcmp(text, "OK kind E   sent") == 0);
  formatResultUpload(text, "OK kind E", UploadState::NotQueued);
  CHECK(std::strcmp(text, "OK kind E   full") == 0);
  formatResultUpload(text, "OK kind E", UploadState::Off);
  CHECK(std::strcmp(text, "OK kind E    off") == 0);
  formatResultUpload(text, "FAIL KIND", UploadState::Rejected);
  CHECK(std::strcmp(text, "FAIL KIND    err") == 0);
  formatResultUpload(text, "FAIL READ CONFIG", UploadState::Waiting);
  CHECK(std::strcmp(text, "FAIL READ CONFIG") == 0);
  // A long FAIL reason takes turns with the token's upload state.
  formatResultUpload(text, "FAIL READ CONFIG", UploadState::Waiting, true);
  CHECK(std::strcmp(text, "Upload: wait") == 0);
  formatResultUpload(text, "FAIL NO RETAP", UploadState::Sent, true);
  CHECK(std::strcmp(text, "Upload: sent") == 0);
  formatResultUpload(text, "OK kind E", UploadState::Sent, true);
  CHECK(std::strcmp(text, "OK kind E   sent") == 0);
  const std::regex paste("^((?:[0-9A-F]{2}){4,10}),([A-Z])$");
  formatUidKindLine(backup, "04E45150324189", 'E');
  CHECK(std::regex_match(backup, paste));
  for (const char* reason : {"no WiFi", "key rejected (401)", "rate limited (429)", "claims unavailable (503)", "network error"}) {
    formatUploadFailure(text, sizeof(text), reason, 3, 10000);
    CHECK(!std::regex_match(text, paste));
  }
  CHECK(std::strcmp(text, "Upload failed (network error), 3 waiting, trying again in 10 s") == 0);
  formatUploaded(text, sizeof(text), "04E45150324189", 'E');
  CHECK(std::strcmp(text, "Uploaded 04E45150324189 kind E") == 0);
  CHECK(!std::regex_match(text, paste));
  formatUploadRejected(text, sizeof(text), "04E45150324189", 'E');
  CHECK(!std::regex_match(text, paste));
}
static void settingsKeepTheKeyOnApprovedConnections() {
  UploadServer server;
  CHECK(parseUploadServer("https://key-api.geekshacking.com/", server));
  CHECK(server.https && server.port == 443 && !server.local);
  CHECK(std::strcmp(server.host, "key-api.geekshacking.com") == 0);
  CHECK(parseUploadServer("http://laptop.local:8000", server));
  CHECK(!server.https && server.local && server.port == 8000);
  CHECK(parseUploadServer("https://laptop.local", server));
  for (const char* bad : {"http://key-api.geekshacking.com", "http://192.168.1.1", "http://local", "http://a.local.attacker.com", "ftp://a.local", "http://a.local@attacker.com", "http://a.local:0", "http://a.local:65536", "https://a.com/path", "https://a.com?secret", "https://a.com\r\n"})
    CHECK(!parseUploadServer(bad, server));
  const char* key = "gk_wri_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  CHECK(uploadSettingsReady("venue", "password", key));
  CHECK(!uploadSettingsReady("", "password", key));
  CHECK(!uploadSettingsReady("your-wifi-name", "password", key));
  CHECK(!uploadSettingsReady("venue", "", key));
  CHECK(!uploadSettingsReady("venue", "your-wifi-password", key));
  CHECK(!uploadSettingsReady("venue", "password", "gk_wri_PASTE_THE_KEY_HERE"));
  CHECK(!uploadSettingsReady("venue", "password", ""));
}
int main() {
  batchesKeepEveryWriteInOrder();
  failuresRetainEntriesAndBackOff();
  fullQueueAndExpiredWritesNeedTheLog();
  jsonAgesAreRecomputedAcrossWrap();
  screensAndLogsShowTheUploadOutcome();
  settingsKeepTheKeyOnApprovedConnections();
  if (failures) return 1;
  std::puts("All passed");
}
