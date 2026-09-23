// Template for secrets.h. Copy this file to secrets.h in the same folder and
// fill in real values. secrets.h is gitignored; this template is not, so never
// put real credentials here.

#pragma once

#define WIFI_SSID     "your-wifi-name"
#define WIFI_PASSWORD "your-wifi-password"

// The computer running the backend, by name so it survives IP changes.
//   Mac:     `scutil --get LocalHostName`, then add .local (e.g. "A-Mac.local")
//   Windows: `hostname`, then add .local
// A plain IP such as "10.82.204.187" also works if name lookup fails on a network.
#define SERVER_HOST   "your-laptop.local"
#define SERVER_PORT   8000

// Printed once by `deno task seed` in apps/backend. Only its hash is stored,
// so if it is lost, run the seed again for a new one.
#define STATION_KEY   "gk_sta_PASTE_THE_KEY_HERE"
