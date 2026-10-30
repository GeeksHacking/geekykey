/*
  What the token writer puts on a token, apart from the sketch so it can be
  tested on a laptop (test/token_address_test.cpp). Nothing here touches a
  pin or the reader.
*/

#pragma once

#include <stddef.h>
#include <stdint.h>
#include <string.h>

constexpr uint8_t TOKEN_FIRST_PAGE = 0x04;
constexpr uint8_t TOKEN_LAST_PAGE  = 0x11;
constexpr size_t  TOKEN_AREA_LEN   = (TOKEN_LAST_PAGE - TOKEN_FIRST_PAGE + 1) * 4;   // 56 bytes

// bytes 0-11: lock control TLV (as delivered), NDEF TLV, record header, "https://"
static const uint8_t NDEF_HEAD[] = {
  0x01, 0x03, 0xA0, 0x0C, 0x34,   // lock control TLV, kept as delivered
  0x03, 0x2E,                     // NDEF message, 46 bytes
  0xD1, 0x01, 0x2A, 0x55,         // one record, type "U", payload 42 bytes
  0x04                            // "https://"
};
static const char URL_TAIL[] = "key.geekshacking.com/t/";   // 23 characters
constexpr size_t  UID_CHARS  = 14;
constexpr size_t  UID_MIRROR_OFFSET = sizeof(NDEF_HEAD) + (sizeof(URL_TAIL) - 1);   // 35
constexpr uint8_t UID_MIRROR_PAGE = TOKEN_FIRST_PAGE + UID_MIRROR_OFFSET / 4;      // 0Ch
constexpr uint8_t UID_MIRROR_BYTE = UID_MIRROR_OFFSET % 4;                         // 3
// After the UID: "?k=" and the token's kind, one letter (ADR 0006).
static const char KIND_QUERY[] = "?k=";
constexpr size_t  KIND_OFFSET  = UID_MIRROR_OFFSET + UID_CHARS + (sizeof(KIND_QUERY) - 1);   // 52
constexpr size_t  ADDRESS_END  = KIND_OFFSET + 1;                                           // 53, the FE

static_assert(sizeof(NDEF_HEAD) == 12, "head must be 12 bytes");
static_assert(sizeof(URL_TAIL) - 1 == 23, "URL tail must be 23 characters");
static_assert(0x2A == 1 + (sizeof(URL_TAIL) - 1) + UID_CHARS + (sizeof(KIND_QUERY) - 1) + 1,
              "record payload length");
static_assert(0x2E == 4 + 0x2A, "NDEF message length");
static_assert(UID_MIRROR_OFFSET == 35, "mirror starts at byte 3 of page 0Ch");
// The rest of page 11h stays 00, which also clears what an older address left behind.
static_assert(ADDRESS_END + 1 <= TOKEN_AREA_LEN, "FE must fit before page 12h");

// The address for a token of this kind, with 14 zeros where the chip's mirror
// puts the token's own UID each time it's read.
inline void buildTokenAddress(uint8_t out[TOKEN_AREA_LEN], char kind) {
  memset(out, 0, TOKEN_AREA_LEN);
  memcpy(out, NDEF_HEAD, sizeof(NDEF_HEAD));
  memcpy(out + sizeof(NDEF_HEAD), URL_TAIL, sizeof(URL_TAIL) - 1);
  memset(out + UID_MIRROR_OFFSET, '0', UID_CHARS);
  memcpy(out + UID_MIRROR_OFFSET + UID_CHARS, KIND_QUERY, sizeof(KIND_QUERY) - 1);
  out[KIND_OFFSET] = kind;
  out[ADDRESS_END] = 0xFE;   // end
}

inline bool isLineSpace(char c) { return c == ' ' || c == '\t' || c == '\r' || c == '\n'; }

enum KindCommand { KIND_SET, KIND_BAD, NOT_KIND_COMMAND };

// Reads one line typed on the serial port. "kind E" sets the kind to E: any
// letter, upper or lower case, kept as upper case. On anything else, *kind
// stays as it was.
inline KindCommand readKindCommand(const char* line, char* kind) {
  while (isLineSpace(*line)) line++;
  if (strncmp(line, "kind", 4) != 0) return NOT_KIND_COMMAND;
  line += 4;
  if (*line != '\0' && !isLineSpace(*line)) return NOT_KIND_COMMAND;   // "kindE"
  while (isLineSpace(*line)) line++;
  char letter = *line;
  if (letter >= 'a' && letter <= 'z') letter -= 'a' - 'A';
  if (letter < 'A' || letter > 'Z') return KIND_BAD;
  line++;
  while (isLineSpace(*line)) line++;
  if (*line != '\0') return KIND_BAD;
  *kind = letter;
  return KIND_SET;
}

constexpr size_t KIND_LOG_LEN = UID_CHARS + 3;   // UID, comma, kind, end

// The line printed for each token written: "<UID>,<kind>". Those lines are the
// list the server loads (BAC-113), so they keep this shape.
inline void formatKindLog(char out[KIND_LOG_LEN], const char* uid, char kind) {
  memcpy(out, uid, UID_CHARS);
  out[UID_CHARS] = ',';
  out[UID_CHARS + 1] = kind;
  out[UID_CHARS + 2] = '\0';
}
