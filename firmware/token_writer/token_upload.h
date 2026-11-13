// Pin-free upload rules. The task adapter holds a mutex around queue access.
#pragma once
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

constexpr size_t UPLOAD_CAPACITY = 256;
constexpr size_t UPLOAD_BATCH_MAX = 50;
constexpr uint32_t UPLOAD_MAX_AGE_MS = 604800000;
enum class UploadState { Waiting, Sent, Rejected, NotQueued, Off };
struct UploadEntry {
  uint32_t id = 0;
  uint32_t writtenAt = 0;
  char uid[21] = {};
  char kind = 0;
};
struct UploadBatch {
  UploadEntry entries[UPLOAD_BATCH_MAX];
  size_t count = 0;
};

class TokenUploadQueue {
 public:
  uint32_t enqueue(const char* uid, char kind, uint32_t now) {
    if (count_ == UPLOAD_CAPACITY) { ++pasteNeeded_; return 0; }
    UploadEntry& entry = entries_[(head_ + count_) % UPLOAD_CAPACITY];
    entry.id = nextId_++;
    if (!nextId_) ++nextId_;
    entry.writtenAt = now;
    strncpy(entry.uid, uid, sizeof(entry.uid) - 1);
    entry.uid[sizeof(entry.uid) - 1] = '\0';
    entry.kind = kind;
    ++count_;
    return entry.id;
  }
  size_t waiting() const { return count_; }
  uint32_t pasteNeeded() const { return pasteNeeded_; }
  // Poll even when offline so an entry cannot live for a full millis() wrap.
  size_t expire(uint32_t now) {
    size_t expired = 0;
    while (count_ && uint32_t(now - entries_[head_].writtenAt) > UPLOAD_MAX_AGE_MS) {
      finishFront(UploadState::Rejected);
      ++expired;
    }
    return expired;
  }
  size_t batch(UploadBatch& out) const {
    out.count = count_ < UPLOAD_BATCH_MAX ? count_ : UPLOAD_BATCH_MAX;
    for (size_t i = 0; i < out.count; ++i) out.entries[i] = entries_[(head_ + i) % UPLOAD_CAPACITY];
    return out.count;
  }
  UploadState state(uint32_t id) const {
    for (size_t i = 0; i < count_; ++i)
      if (entries_[(head_ + i) % UPLOAD_CAPACITY].id == id) return UploadState::Waiting;
    for (const auto& result : results_)
      if (id && result.id == id) return result.state;
    return UploadState::NotQueued;
  }
  void complete(const UploadBatch& batch, int code) {
    if (code != 200 && code != 400) return;
    for (size_t i = 0; i < batch.count && count_; ++i) {
      if (entries_[head_].id != batch.entries[i].id) break;
      finishFront(code == 200 ? UploadState::Sent : UploadState::Rejected);
    }
  }
 private:
  void finishFront(UploadState state) {
    results_[resultNext_] = {entries_[head_].id, state};
    resultNext_ = (resultNext_ + 1) % UPLOAD_CAPACITY;
    if (state == UploadState::Rejected) ++pasteNeeded_;
    head_ = (head_ + 1) % UPLOAD_CAPACITY;
    --count_;
  }
  UploadEntry entries_[UPLOAD_CAPACITY];
  struct Result { uint32_t id = 0; UploadState state = UploadState::NotQueued; };
  Result results_[UPLOAD_CAPACITY];
  size_t head_ = 0, count_ = 0, resultNext_ = 0;
  uint32_t nextId_ = 1, pasteNeeded_ = 0;
};

class UploadRetry {
 public:
  bool ready(uint32_t now) const { return uint32_t(now - failedAt_) >= waitMs_; }
  uint32_t failed(int code, uint32_t now) {
    waitMs_ = code == 401 ? 60000 : nextMs_;
    nextMs_ = waitMs_ < 30000 ? waitMs_ * 2 : 60000;
    failedAt_ = now;
    return waitMs_;
  }
  void succeeded() { nextMs_ = 5000; waitMs_ = 0; }
 private:
  uint32_t failedAt_ = 0, waitMs_ = 0, nextMs_ = 5000;
};

// 50 entries with a 20-character UID and a nine-digit age, plus the wrapper.
constexpr size_t UPLOAD_BODY_SIZE = 4096;
inline bool buildUploadBody(char* out, size_t size, const UploadBatch& batch, uint32_t now) {
  if (!batch.count || batch.count > UPLOAD_BATCH_MAX || size < 13) return false;
  size_t used = 0;
  int n = snprintf(out, size, "{\"tokens\":[");
  used = size_t(n);
  for (size_t i = 0; i < batch.count; ++i) {
    const UploadEntry& entry = batch.entries[i];
    const uint32_t age = now - entry.writtenAt;
    if (age > UPLOAD_MAX_AGE_MS) return false;
    n = snprintf(out + used, size - used,
                 "%s{\"uid\":\"%s\",\"kind\":\"%c\",\"written_ago_ms\":%lu}",
                 i ? "," : "", entry.uid, entry.kind, (unsigned long)age);
    if (n < 0 || size_t(n) >= size - used) return false;
    used += size_t(n);
  }
  n = snprintf(out + used, size - used, "]}");
  return n >= 0 && size_t(n) < size - used;
}

inline void formatReadyUpload(char* out, bool enabled, bool wifi, size_t waiting, uint32_t pasteNeeded) {
  if (!enabled) snprintf(out, 17, "Uploads off");
  else if (pasteNeeded && waiting) snprintf(out, 17, "%u wait, paste!", unsigned(waiting));
  else if (pasteNeeded) snprintf(out, 17, "Check serial log");
  else if (!waiting) snprintf(out, 17, "All uploaded");
  else if (!wifi) snprintf(out, 17, waiting < 100 ? "No WiFi, %u wait" : "No WiFi %u wait", unsigned(waiting));
  else snprintf(out, 17, "%u to upload", unsigned(waiting));
}
inline const char* uploadSuffix(UploadState state) {
  switch (state) {
    case UploadState::Waiting: return "wait";
    case UploadState::Sent: return "sent";
    case UploadState::Rejected: return "err";
    case UploadState::Off: return "off";
    default: return "full";
  }
}
// Short results have room for a live suffix. A long FAIL reason stays whole and
// takes turns with the upload state: uploadTurn picks which one shows.
inline void formatResultUpload(char* out, const char* result, UploadState state, bool uploadTurn = false) {
  if (strlen(result) <= 11) snprintf(out, 17, "%-11s %4s", result, uploadSuffix(state));
  else if (uploadTurn) snprintf(out, 17, "Upload: %s", uploadSuffix(state));
  else snprintf(out, 17, "%s", result);
}
inline void formatUploaded(char* out, size_t size, const char* uid, char kind) {
  snprintf(out, size, "Uploaded %s kind %c", uid, kind);
}
inline void formatUploadRejected(char* out, size_t size, const char* uid, char kind) {
  snprintf(out, size, "Upload rejected %s kind %c; paste its log line in Token kinds", uid, kind);
}
inline void formatUploadFailure(char* out, size_t size, const char* reason, size_t waiting, uint32_t retryMs) {
  snprintf(out, size, "Upload failed (%s), %u waiting, trying again in %lu s",
           reason, unsigned(waiting), (unsigned long)(retryMs / 1000));
}

struct UploadServer {
  char host[254] = {};
  uint16_t port = 443;
  bool https = true;
  bool local = false;
};
inline bool parseUploadServer(const char* url, UploadServer& out) {
  UploadServer parsed;
  if (!strncmp(url, "https://", 8)) url += 8;
  else if (!strncmp(url, "http://", 7)) { url += 7; parsed.https = false; parsed.port = 80; }
  else return false;
  size_t hostLen = 0;
  while (url[hostLen] && url[hostLen] != ':' && url[hostLen] != '/') {
    char c = url[hostLen];
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
          (c >= '0' && c <= '9') || c == '-' || c == '.')) return false;
    if (hostLen == sizeof(parsed.host) - 1) return false;
    parsed.host[hostLen] = c >= 'A' && c <= 'Z' ? c + ('a' - 'A') : c;
    ++hostLen;
  }
  if (!hostLen || parsed.host[0] == '.' || parsed.host[hostLen - 1] == '.') return false;
  url += hostLen;
  if (*url == ':') {
    ++url;
    uint32_t port = 0;
    if (*url < '0' || *url > '9') return false;
    while (*url >= '0' && *url <= '9') {
      port = port * 10 + (*url++ - '0');
      if (port > 65535) return false;
    }
    if (!port) return false;
    parsed.port = uint16_t(port);
  }
  if (*url == '/') ++url;
  if (*url) return false; // No credentials, query, fragment or base path.
  parsed.local = hostLen > 6 && strcmp(parsed.host + hostLen - 6, ".local") == 0;
  if (!parsed.https && !parsed.local) return false;
  out = parsed;
  return true;
}
inline bool uploadSettingsReady(const char* ssid, const char* password, const char* key) {
  if (!*ssid || !*password || !strcmp(ssid, "your-wifi-name") || !strcmp(password, "your-wifi-password")) return false;
  if (strlen(key) != 71 || strncmp(key, "gk_wri_", 7)) return false;
  for (size_t i = 7; i < 71; ++i)
    if (!((key[i] >= '0' && key[i] <= '9') || (key[i] >= 'a' && key[i] <= 'f'))) return false;
  return true;
}
