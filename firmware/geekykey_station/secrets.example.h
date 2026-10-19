// Template for secrets.h. Copy this file to secrets.h in the same folder and
// fill in real values. secrets.h is gitignored; this template is not, so never
// put real credentials here.
//
// These are only the first defaults. The setup mode (firmware/README.md) can
// give the station a new Wi-Fi network, server address or key without a
// reflash, and what it stores wins over this file until its "reset" command.

#pragma once

#define WIFI_SSID     "your-wifi-name"
#define WIFI_PASSWORD "your-wifi-password"

// The server's full base URL. An https:// URL is called as written: the station
// checks the server's certificate against the 14 roots in ca_roots.h. A plain
// http:// URL is only sent to a host ending in .local, whose IP is looked up
// with mDNS, so the station key never crosses the venue WiFi unencrypted.
//   Production, until checkpoint 4: "https://event-api.geekshacking.com"
//   After checkpoint 4:               "https://key-api.geekshacking.com"
//   A laptop running the backend:     "http://your-laptop.local:8000"
#define SERVER_URL   "http://your-laptop.local:8000"

// Printed once by `mise run seed`. Only its hash is stored,
// so if it is lost, run the seed again for a new one.
#define STATION_KEY   "gk_sta_PASTE_THE_KEY_HERE"
