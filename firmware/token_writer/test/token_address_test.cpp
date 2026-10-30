// Tests for token_address.h, run on the laptop rather than the token writer:
//
//   c++ -std=c++17 -Wall -Wextra -o /tmp/token_address_test firmware/token_writer/test/token_address_test.cpp && /tmp/token_address_test
//
// The Arduino builder compiles only a sketch's own folder and its src/, so
// this file never goes onto the writer.

#include <cstdio>
#include <cstring>

#include "../token_address.h"

static int failures = 0;

#define CHECK(condition)                                               \
  do {                                                                 \
    if (!(condition)) {                                                \
      std::printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition); \
      failures++;                                                      \
    }                                                                  \
  } while (0)

// The bytes a token of kind E carries on pages 04h-11h, worked out by hand
// from the NDEF layout: https://key.geekshacking.com/t/<UID>?k=E, with 14
// zeros where the chip's mirror puts the UID.
static void addressCarriesTheKind() {
  static const uint8_t expected[56] = {
    0x01, 0x03, 0xA0, 0x0C, 0x34,  // lock control TLV, as delivered
    0x03, 0x2E,                    // NDEF message, 46 bytes
    0xD1, 0x01, 0x2A, 0x55,        // one record, type "U", payload 42 bytes
    0x04,                          // "https://"
    'k', 'e', 'y', '.', 'g', 'e', 'e', 'k', 's', 'h', 'a', 'c',
    'k', 'i', 'n', 'g', '.', 'c', 'o', 'm', '/', 't', '/',
    '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0',
    '?', 'k', '=', 'E',
    0xFE,                          // end
    0x00, 0x00,                    // the rest of page 11h
  };
  uint8_t got[TOKEN_AREA_LEN];
  buildTokenAddress(got, 'E');
  CHECK(TOKEN_AREA_LEN == 56);
  CHECK(std::memcmp(got, expected, sizeof(expected)) == 0);
}

// The chip's UID mirror starts at byte 35, which is byte 3 of page 0Ch.
static void mirrorStartsOnPage0C() {
  CHECK(UID_MIRROR_PAGE == 0x0C);
  CHECK(UID_MIRROR_BYTE == 3);
}

static void anotherKindChangesOnlyItsLetter() {
  uint8_t e[TOKEN_AREA_LEN], v[TOKEN_AREA_LEN];
  buildTokenAddress(e, 'E');
  buildTokenAddress(v, 'V');
  CHECK(v[52] == 'V');  // byte 52: after 35 + 14 UID characters and "?k="
  e[52] = 'V';
  CHECK(std::memcmp(e, v, TOKEN_AREA_LEN) == 0);
}

static void kindCommandSetsTheKind() {
  char kind = 0;
  CHECK(readKindCommand("kind E", &kind) == KIND_SET);
  CHECK(kind == 'E');
}

// Serial monitors end a line with \r\n or \n, and people type lower case.
static void kindCommandToleratesLineEndsAndCase() {
  char kind = 0;
  CHECK(readKindCommand("kind v\r", &kind) == KIND_SET);
  CHECK(kind == 'V');
  kind = 0;
  CHECK(readKindCommand("  kind   H  ", &kind) == KIND_SET);
  CHECK(kind == 'H');
}

// Anything but one letter is refused, and the kind already set stays.
static void kindCommandRefusesAnythingButOneLetter() {
  char kind = 'E';
  CHECK(readKindCommand("kind", &kind) == KIND_NOT_A_LETTER);
  CHECK(readKindCommand("kind EV", &kind) == KIND_NOT_A_LETTER);
  CHECK(readKindCommand("kind 1", &kind) == KIND_NOT_A_LETTER);
  CHECK(readKindCommand("kind ?", &kind) == KIND_NOT_A_LETTER);
  CHECK(readKindCommand("kind E V", &kind) == KIND_NOT_A_LETTER);
  CHECK(kind == 'E');
}

static void otherLinesAreNotKindCommands() {
  char kind = 'E';
  CHECK(readKindCommand("", &kind) == NOT_KIND_COMMAND);
  CHECK(readKindCommand("help", &kind) == NOT_KIND_COMMAND);
  CHECK(readKindCommand("kindE", &kind) == NOT_KIND_COMMAND);
  CHECK(kind == 'E');
}

// BAC-113 loads these lines into the server's list of kinds.
static void logLineIsUidCommaKind() {
  char line[UID_KIND_LINE_LEN];
  formatUidKindLine(line, "04E45150324189", 'E');
  CHECK(std::strcmp(line, "04E45150324189,E") == 0);
}

int main() {
  addressCarriesTheKind();
  mirrorStartsOnPage0C();
  anotherKindChangesOnlyItsLetter();
  kindCommandSetsTheKind();
  kindCommandToleratesLineEndsAndCase();
  kindCommandRefusesAnythingButOneLetter();
  otherLinesAreNotKindCommands();
  logLineIsUidCommaKind();
  if (failures == 0) std::printf("All passed\n");
  return failures == 0 ? 0 : 1;
}
