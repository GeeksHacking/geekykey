// The socket's wire and retry rules, without the network or Arduino.
#include <cstdio>
#include <cstring>
#include <initializer_list>
#include "../station_socket.h"
static int failures = 0;

#define CHECK(condition)                                               \
  do {                                                                 \
    if (!(condition)) {                                                \
      std::printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition); \
      failures++;                                                      \
    }                                                                  \
  } while (0)

static void retriesGrowAndReset() {
  SocketRetry retry;
  const unsigned waits[] = {5000, 10000, 20000, 40000, 60000, 60000};
  for (unsigned wait : waits) CHECK(retry.failed(false) == wait);
  retry.opened();
  CHECK(retry.failed(false) == 5000);
  CHECK(retry.failed(true) == 60000);
  CHECK(retry.failed(false) == 60000);
  retry.opened();
  CHECK(retry.failed(false) == 5000);
}

static void clientFramesAreMasked() {
  uint8_t frame[256];
  const uint8_t mask[] = {0x37, 0xfa, 0x21, 0x3d};
  const uint8_t hello[] = {'H', 'e', 'l', 'l', 'o'};
  const uint8_t expected[] = {0x81, 0x85, 0x37, 0xfa, 0x21, 0x3d, 0x7f, 0x9f, 0x4d, 0x51, 0x58};
  CHECK(encodeSocketFrame(1, hello, 5, mask, frame, sizeof(frame)) == sizeof(expected));
  CHECK(memcmp(frame, expected, sizeof(expected)) == 0);
  const uint8_t close[] = {0x03, 0xe8};
  CHECK(encodeSocketFrame(8, close, 2, mask, frame, sizeof(frame)) == 8);
  CHECK(frame[0] == 0x88 && frame[1] == 0x82);
  CHECK((frame[6] ^ mask[0]) == 0x03 && (frame[7] ^ mask[1]) == 0xe8);
  uint8_t text[126] = {};
  CHECK(encodeSocketFrame(1, text, 126, mask, frame, sizeof(frame)) == 134);
  CHECK(frame[1] == 0xfe && frame[2] == 0 && frame[3] == 126);
  CHECK(encodeSocketFrame(1, text, 126, mask, frame, 12) == 0);
}

static void serverFramesArriveInPieces() {
  SocketDecoder decoder;
  const uint8_t hello[] = {0x81, 5, 'H', 'e', 'l', 'l', 'o'};
  for (size_t i = 0; i < sizeof(hello); i++)
    CHECK(decoder.feed(hello[i]) == (i + 1 == sizeof(hello) ? SOCKET_FRAME : SOCKET_MORE));
  CHECK(decoder.opcode == 1 && decoder.length == 5);
  CHECK(memcmp(decoder.payload, "Hello", 5) == 0);
  decoder.reset();
  CHECK(decoder.feed(0x89) == SOCKET_MORE);
  CHECK(decoder.feed(0) == SOCKET_FRAME);
  CHECK(decoder.opcode == 9);
  decoder.reset();
  CHECK(decoder.feed(0x8a) == SOCKET_MORE);
  CHECK(decoder.feed(0) == SOCKET_FRAME);
  CHECK(decoder.opcode == 10);
  decoder.reset();
  for (uint8_t b : {0x88, 2, 0x0f, 0xa0}) decoder.feed(b);
  CHECK(decoder.closeCode() == 4000);
  decoder.reset();
  const uint8_t header[] = {0x81, 126, 0, 126};
  for (uint8_t b : header) CHECK(decoder.feed(b) == SOCKET_MORE);
  for (int i = 0; i < 126; i++) CHECK(decoder.feed('x') == (i == 125 ? SOCKET_FRAME : SOCKET_MORE));
  CHECK(decoder.length == 126);
}

static void unsafeFramesAreClosed() {
  const uint8_t bad[][4] = {
    {0x81, 126, 8, 1}, // over 2 KB
    {0x81, 0x80, 0, 0}, // server frames must not be masked
    {0x09, 0, 0, 0}, // control frames are never fragmented
    {0x80, 0, 0, 0}, // continuation with no message
    {0xc1, 0, 0, 0}, // no extensions were negotiated
    {0x89, 126, 0, 126}, // control frames are at most 125 bytes
    {0x82, 0, 0, 0}, // binary messages are not part of this protocol
    {0x81, 127, 0, 0}, // a 64-bit length cannot be needed under our limit
    {0x88, 1, 0, 0}, // close cannot carry half a status code
    {0x81, 126, 0, 1}, // non-minimal length encoding
  };
  for (const auto &frame : bad) {
    SocketDecoder decoder;
    SocketDecode result = SOCKET_MORE;
    for (uint8_t b : frame) { result = decoder.feed(b); if (result == SOCKET_REJECT) break; }
    CHECK(result == SOCKET_REJECT);
    CHECK(decoder.error != nullptr);
  }
}

// RFC 6455 5.4: a client must take a message split over frames, with control
// frames between them.
static SocketDecode feedAll(SocketDecoder &decoder, std::initializer_list<uint8_t> bytes) {
  SocketDecode result = SOCKET_MORE;
  for (uint8_t b : bytes) {
    result = decoder.feed(b);
    if (result != SOCKET_MORE) break;
  }
  return result;
}

static void fragmentedMessagesAreJoined() {
  SocketDecoder decoder;
  CHECK(feedAll(decoder, {0x01, 3, '{', '"', 'a'}) == SOCKET_MORE);
  CHECK(feedAll(decoder, {0x89, 2, 'h', 'i'}) == SOCKET_FRAME);
  CHECK(decoder.opcode == 9 && decoder.length == 2 && memcmp(decoder.payload, "hi", 2) == 0);
  decoder.reset();
  CHECK(feedAll(decoder, {0x00, 2, '"', ':'}) == SOCKET_MORE);
  CHECK(feedAll(decoder, {0x80, 2, '1', '}'}) == SOCKET_FRAME);
  CHECK(decoder.opcode == 1 && decoder.length == 7);
  CHECK(memcmp(decoder.payload, "{\"a\":1}", 7) == 0);
  decoder.reset();
  CHECK(feedAll(decoder, {0x81, 2, 'o', 'k'}) == SOCKET_FRAME);
  CHECK(decoder.opcode == 1 && decoder.length == 2 && memcmp(decoder.payload, "ok", 2) == 0);

  // A character split across two frames is whole once they're joined.
  decoder.reset();
  CHECK(feedAll(decoder, {0x01, 2, 0xf0, 0x9f}) == SOCKET_MORE);
  CHECK(feedAll(decoder, {0x80, 2, 0x98, 0x80}) == SOCKET_FRAME);
  CHECK(decoder.length == 4);

  // A new message before the last one ended is a protocol error.
  SocketDecoder second;
  CHECK(feedAll(second, {0x01, 1, 'a'}) == SOCKET_MORE);
  CHECK(feedAll(second, {0x81, 1, 'b'}) == SOCKET_REJECT);

  // The 2 KB limit is on the whole message, not each frame.
  SocketDecoder large;
  CHECK(feedAll(large, {0x01, 126, 4, 0}) == SOCKET_MORE);
  for (int i = 0; i < 1024; i++) large.feed('a');
  CHECK(feedAll(large, {0x00, 126, 4, 0}) == SOCKET_MORE);
  for (int i = 0; i < 1024; i++) large.feed('a');
  CHECK(feedAll(large, {0x80, 1}) == SOCKET_REJECT);
  CHECK(large.rejectCode == 1009);
}

static void onlyTheExpectedUpgradeOpens() {
  const char *accept = "s3pPLMBiTxaGZRBOkWXoSzPPs+o="; // RFC 6455: key dGhlIHNhbXBsZSBub25jZQ==
  const char *good = "HTTP/1.1 101 Switching Protocols\r\n"
                     "uPgRaDe: WebSocket\r\nConnection: keep-alive, Upgrade\r\n"
                     "Sec-WebSocket-Accept: s3pPLMBiTxaGZRBOkWXoSzPPs+o=\r\n\r\n";
  CHECK(checkSocketUpgrade(good, accept) == 101);
  CHECK(checkSocketUpgrade(good, "wrong") == 0);
  CHECK(checkSocketUpgrade("HTTP/1.1 401 Unauthorized\r\n\r\n", accept) == 401);
  CHECK(checkSocketUpgrade("HTTP/1.1 302 Found\r\nLocation: https://elsewhere\r\n\r\n", accept) == 0);
  CHECK(checkSocketUpgrade("HTTP/1.1 101 OK\r\nSec-WebSocket-Accept: s3pPLMBiTxaGZRBOkWXoSzPPs+o=\r\n\r\n", accept) == 0);
  CHECK(checkSocketUpgrade("HTTP/1.1 101 OK\r\nUpgrade: websocket\r\nConnection: notupgrade\r\nSec-WebSocket-Accept: s3pPLMBiTxaGZRBOkWXoSzPPs+o=\r\n\r\n", accept) == 0);
  CHECK(checkSocketUpgrade("HTTP/1.1 101 OK\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: s3pPLMBiTxaGZRBOkWXoSzPPs+o=\r\n", accept) == 0);
}

static void textAndCloseFramesFollowRfc6455() {
  SocketDecoder decoder;
  const uint8_t unicode[] = {0x81, 4, 0xf0, 0x9f, 0x98, 0x80};
  for (uint8_t b : unicode) decoder.feed(b);
  CHECK(decoder.complete && !decoder.error);
  const uint8_t bad[][6] = {
    {0x81, 2, 0xc0, 0xaf, 0, 0}, // overlong UTF-8
    {0x81, 1, 0xff, 0, 0, 0},
    {0x81, 2, 0xe2, 0x82, 0, 0}, // truncated character
    {0x81, 3, 0xed, 0xa0, 0x80, 0}, // UTF-16 surrogate
    {0x81, 4, 0xf4, 0x90, 0x80, 0x80}, // above Unicode's last code point
    {0x88, 2, 0x03, 0xed, 0, 0}, // reserved close code 1005
    {0x88, 3, 0x03, 0xe8, 0xff, 0}, // close reason is UTF-8 too
  };
  for (const auto &frame : bad) {
    decoder.reset();
    SocketDecode result = SOCKET_MORE;
    for (uint8_t b : frame) { result = decoder.feed(b); if (result != SOCKET_MORE) break; }
    CHECK(result == SOCKET_REJECT);
  }
  decoder.reset();
  for (uint8_t b : {0x81, 126, 8, 0}) decoder.feed(b);
  for (size_t i = 0; i < 2048; i++) decoder.feed('a');
  CHECK(decoder.complete && !decoder.error && decoder.length == 2048);
}

int main() {
  textAndCloseFramesFollowRfc6455();
  retriesGrowAndReset();
  onlyTheExpectedUpgradeOpens();
  clientFramesAreMasked();
  serverFramesArriveInPieces();
  fragmentedMessagesAreJoined();
  unsafeFramesAreClosed();
  if (failures > 0) {
    std::printf("%d failed\n", failures);
    return 1;
  }
  std::printf("All passed\n");
}
