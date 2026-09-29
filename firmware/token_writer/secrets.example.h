// Copy to secrets.h (gitignored) and fill in. Keep a copy with Adam OUTSIDE the repo.
// Without this password the tokens can never be rewritten.
//
// Make one with:   openssl rand -hex 6
//   first 8 hex chars = password (4 bytes), last 4 hex chars = PACK (2 bytes)
// Don't use FF FF FF FF (factory value) or 00 00 00 00.
#pragma once
#include <stdint.h>

static const uint8_t NTAG_PASSWORD[4] = {0x00, 0x00, 0x00, 0x00};   // CHANGE ME
static const uint8_t NTAG_PACK[2]     = {0x00, 0x00};               // CHANGE ME
