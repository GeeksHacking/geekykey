/*
  The socket's retry and wire rules (API agreement 6.3), apart from Arduino
  so test/station_socket_test.cpp can check them without a network.
*/
#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>

struct SocketRetry {
  uint32_t nextWait = 5000;
  void opened() { nextWait = 5000; }
  uint32_t failed(bool wrongKey) {
    if (wrongKey) nextWait = 60000;
    const uint32_t wait = nextWait;
    nextWait = nextWait < 30000 ? nextWait * 2 : 60000;
    return wait;
  }
};

constexpr size_t SOCKET_FRAME_MAX = 2048;

// Every client frame has its own random mask. Tests supply a fixed one so
// the bytes can be compared with RFC 6455's Hello example.
inline size_t encodeSocketFrame(uint8_t opcode, const uint8_t *payload, size_t length,
                                const uint8_t mask[4], uint8_t *out, size_t capacity) {
  if (length > SOCKET_FRAME_MAX || (opcode >= 8 && length > 125)) return 0;
  const size_t header = length < 126 ? 6 : 8;
  if (capacity < header + length) return 0;
  out[0] = 0x80 | opcode;
  out[1] = 0x80 | (length < 126 ? length : 126);
  if (length >= 126) { out[2] = length >> 8; out[3] = length & 0xff; }
  memcpy(out + header - 4, mask, 4);
  for (size_t i = 0; i < length; i++) out[header + i] = payload[i] ^ mask[i % 4];
  return header + length;
}

// RFC 6455 requires UTF-8 for text and close reasons, even when the JSON
// validator would otherwise ignore a field or an unknown message type.
inline bool socketUtf8(const uint8_t *text, size_t length) {
  size_t i = 0;
  while (i < length) {
    uint32_t code = text[i++];
    if (code < 0x80) continue;
    size_t rest;
    uint32_t minimum;
    if (code >= 0xc2 && code <= 0xdf) { rest = 1; minimum = 0x80; code &= 0x1f; }
    else if (code >= 0xe0 && code <= 0xef) { rest = 2; minimum = 0x800; code &= 0x0f; }
    else if (code >= 0xf0 && code <= 0xf4) { rest = 3; minimum = 0x10000; code &= 0x07; }
    else return false;
    if (length - i < rest) return false;
    while (rest--) {
      const uint8_t b = text[i++];
      if ((b & 0xc0) != 0x80) return false;
      code = (code << 6) | (b & 0x3f);
    }
    if (code < minimum || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return false;
  }
  return true;
}

enum SocketDecode { SOCKET_MORE, SOCKET_FRAME, SOCKET_REJECT };

// A bounded incremental reader. A text message may come split over frames,
// with pings, pongs or a close between them (RFC 6455 5.4), and is handed on
// once it is whole. The 2 KB limit is on the whole message. Binary messages
// aren't part of the station protocol, and no extensions are requested, so
// RSV bits must be zero.
struct SocketDecoder {
  uint8_t message[SOCKET_FRAME_MAX + 1] = {};  // a text message, joined from its frames
  uint8_t control[126] = {};  // a control frame, kept apart so it can't break a message
  const uint8_t *payload = message;  // what the finished frame or message carried
  uint8_t opcode = 0;  // 1 for a whole text message, or a control frame's 8, 9 or 10
  size_t length = 0;
  uint16_t rejectCode = 1002;
  const char *error = nullptr;
  size_t position = 0;  // bytes of the current frame read so far
  bool complete = false;

  // The frame being read.
  uint8_t frameOpcode = 0;
  bool final = false;
  bool extended = false;
  size_t frameLength = 0;
  size_t received = 0;
  // A text message whose last frame hasn't come yet.
  bool joining = false;
  size_t joined = 0;

  // Called after each finished frame. A message half joined survives a
  // control frame between its parts; a rejected socket starts again.
  void reset() {
    if (error || !joining) {
      joining = false;
      joined = 0;
    }
    startFrame();
    opcode = 0; length = 0; payload = message;
    error = nullptr; rejectCode = 1002; complete = false;
  }
  void startFrame() {
    position = 0; received = 0; frameLength = 0; frameOpcode = 0; final = false; extended = false;
  }
  SocketDecode reject(const char *why, uint16_t code = 1002) {
    error = why; rejectCode = code; return SOCKET_REJECT;
  }
  uint16_t closeCode() const {
    return length >= 2 ? (uint16_t(payload[0]) << 8) | payload[1] : 1005;
  }
  SocketDecode feed(uint8_t b) {
    if (error) return SOCKET_REJECT;
    if (complete) return SOCKET_FRAME;
    if (position == 0) {
      if (b & 0x70) return reject("RSV bits set");
      final = b & 0x80;
      frameOpcode = b & 0x0f;
      if (frameOpcode >= 8) {
        if (frameOpcode > 10) return reject("unsupported opcode");
        if (!final) return reject("fragmented control frame");
      } else if (frameOpcode == 0) {
        if (!joining) return reject("continuation with no message");
      } else if (frameOpcode == 1) {
        if (joining) return reject("new message before the last one ended");
      } else {
        return reject("unsupported opcode");
      }
    } else if (position == 1) {
      if (b & 0x80) return reject("masked server frame");
      frameLength = b;
      if (frameLength == 127) return reject("message over 2 KB", 1009);
      if (frameOpcode >= 8 && frameLength > 125) return reject("long control frame");
      extended = frameLength == 126;
      if (extended) frameLength = 0;
    } else if (extended && position == 2) {
      frameLength = size_t(b) << 8;
    } else if (extended && position == 3) {
      frameLength |= b;
      if (frameLength < 126) return reject("non-minimal frame length");
    } else if (frameOpcode >= 8) {
      control[received++] = b;
    } else {
      message[joined + received++] = b;
    }
    position++;
    const size_t header = extended ? 4 : 2;
    // Checked before any payload byte is stored.
    if (position == header && frameOpcode < 8 && joined + frameLength > SOCKET_FRAME_MAX)
      return reject("message over 2 KB", 1009);
    if (position >= header && received == frameLength) return finishFrame();
    return SOCKET_MORE;
  }
  SocketDecode finishFrame() {
    if (frameOpcode >= 8) {
      payload = control;
      length = frameLength;
      if (frameOpcode == 8 && length == 1) return reject("short close code");
      if (frameOpcode == 8 && length >= 2) {
        const uint16_t code = closeCode();
        const bool standard = code >= 1000 && code <= 1014 && code != 1004 && code != 1005 && code != 1006;
        if (!standard && (code < 3000 || code > 4999)) return reject("invalid close code");
        if (!socketUtf8(control + 2, length - 2)) return reject("invalid close reason UTF-8", 1007);
      }
      control[length] = 0;
      opcode = frameOpcode;
      complete = true;
      return SOCKET_FRAME;
    }
    joined += frameLength;
    if (!final) {
      joining = true;
      startFrame();
      return SOCKET_MORE;
    }
    joining = false;
    // Checked once whole: a character may be split between two frames.
    if (!socketUtf8(message, joined)) return reject("invalid text UTF-8", 1007);
    message[joined] = 0;
    payload = message;
    length = joined;
    opcode = 1;
    complete = true;
    return SOCKET_FRAME;
  }
};

inline bool socketEqual(const char *text, size_t length, const char *expected, bool ignoreCase) {
  if (length != strlen(expected)) return false;
  for (size_t i = 0; i < length; i++) {
    char a = text[i], b = expected[i];
    if (ignoreCase) {
      if (a >= 'A' && a <= 'Z') a += 'a' - 'A';
      if (b >= 'A' && b <= 'Z') b += 'a' - 'A';
    }
    if (a != b) return false;
  }
  return true;
}

inline bool socketHasToken(const char *text, size_t length, const char *token) {
  const char *end = text + length;
  while (text < end) {
    const char *next = text;
    while (next < end && *next != ',') next++;
    const char *last = next;
    while (text < last && (*text == ' ' || *text == '\t')) text++;
    while (last > text && (last[-1] == ' ' || last[-1] == '\t')) last--;
    if (socketEqual(text, last - text, token, true)) return true;
    text = next < end ? next + 1 : end;
  }
  return false;
}

// SHA-1 and base64 belong to the platform. The caller supplies the expected
// accept computed from its nonce; the laptop checks the RFC's known value.
// No other response, including a redirect, is followed.
inline int checkSocketUpgrade(const char *response, const char *expectedAccept) {
  const char *lineEnd = strstr(response, "\r\n");
  if (!lineEnd || strncmp(response, "HTTP/1.1 ", 9) != 0 || lineEnd - response < 12) return 0;
  if (lineEnd - response > 12 && response[12] != ' ') return 0;
  if (strncmp(response + 9, "401", 3) == 0) return 401;
  if (strncmp(response + 9, "101", 3) != 0) return 0;
  bool upgrade = false, connection = false, accept = false;
  const char *line = lineEnd + 2;
  while ((lineEnd = strstr(line, "\r\n"))) {
    if (lineEnd == line) return upgrade && connection && accept ? 101 : 0;
    const char *colon = (const char *)memchr(line, ':', lineEnd - line);
    if (!colon) return 0;
    const char *value = colon + 1;
    while (value < lineEnd && (*value == ' ' || *value == '\t')) value++;
    const char *end = lineEnd;
    while (end > value && (end[-1] == ' ' || end[-1] == '\t')) end--;
    if (socketEqual(line, colon - line, "Upgrade", true))
      upgrade = socketHasToken(value, end - value, "websocket");
    if (socketEqual(line, colon - line, "Connection", true))
      connection = socketHasToken(value, end - value, "upgrade");
    if (socketEqual(line, colon - line, "Sec-WebSocket-Accept", true)) {
      if (accept || !socketEqual(value, end - value, expectedAccept, false)) return 0;
      accept = true;
    }
    // The client offers neither extensions nor a subprotocol.
    if (socketEqual(line, colon - line, "Sec-WebSocket-Extensions", true) ||
        socketEqual(line, colon - line, "Sec-WebSocket-Protocol", true)) return 0;
    line = lineEnd + 2;
  }
  return 0;
}
