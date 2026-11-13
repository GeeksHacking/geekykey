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

// Optional uploads. Leave WiFi or the writer key unset to write and log offline.
// These are the writer's own settings, never the station's setup-mode settings.
#define WIFI_SSID     "your-wifi-name"
#define WIFI_PASSWORD "your-wifi-password"

// Full base URL. HTTPS checks ca_roots.h. Plain HTTP is allowed only to a
// .local hostname resolved through mDNS, for development with a throwaway key.
#define SERVER_URL "https://key-api.geekshacking.com"

// Adam creates this key; the Worker keeps only its hash. Never use a station key.
#define WRITER_KEY "gk_wri_PASTE_THE_KEY_HERE"
