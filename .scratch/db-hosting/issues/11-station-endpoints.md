# How do stations talk to the GeekyKey Service?

Type: grilling
Status: resolved
Blocked by: 12, 13
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

Reframed on 27 Sep, when the map was redrawn. It was "How do stations reach the backend at this event, and move to the NFC Key service later?".

Stations call the GeekyKey Service at a fixed address, and the GeekyKey Service decides which Event Service each station's taps go to ("How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?"). That is how Julian's "don't tie stations to one fixed address" is met. Held with Zi Tao, who owns the firmware:

- **The address.** `api.geekykey.geekshacking.com`, a path on `geekykey.geekshacking.com`, or something else?
- **What a station sends.** Julian's diagram shows the token's ID and the station ID. Today a station sends the hardware UID, with its station key proving which station it is. How does a station prove its identity now?
- **What stays from today's contract.** Deduplication by `client_tap_id`, late batch uploads, `tapped_at`.
- **HTTPS on the ESP32.** It must trust a bundle of certificate authorities, not pin one root ("Which hostnames, and which OAuth redirect URLs?").
- **What the station shows** when a token is unclaimed, or the tap fails further along.

**Settled by "Which parts of today's backend belong to the GeekyKey Service, and which to the Event Service?" (28 Sep):** the GeekyKey Service checks the station key, treats a wildly wrong `tapped_at` as missing, accepts late batches, and answers `unknown_token` itself for a token nobody has claimed. `accepted`, `cooldown` and `duplicate` are the Event Service's verdict, relayed. Heartbeats and last seen belong to the GeekyKey Service.

**Settled by "What is a token's ID, and what URL is written on each token?" (28 Sep):** a token's ID is its hardware UID, so the station keeps sending the UID it reads today. Reading the text written on the token (`readNtag213Text`) is no longer needed: tokens now carry the address `https://geekykey.geekshacking.com/t/<UID>`, which only phones use.

## Answer

Resolved 28 Sep 2026 by grilling with Adam. Zi Tao, who owns the firmware, was not in the session; [the message to Zi Tao](../assets/message-to-zi-tao-station-contract.md) carries the answer to him.

**Decided**

- **Stations have an address of their own: `https://api.geekykey.geekshacking.com`,** a custom domain on the GeekyKey Service Worker. `geekykey.` is for people (the token page), `api.` is for devices. A path on `geekykey.geekshacking.com` was rejected: "Which screens belong to which service, and how does each know who is logged in?" may put a screens Worker in front of that hostname, and stations would then depend on its deploys, which "How is the frontend set up, and how does the browser reach the backend?" ruled out. Its own hostname also lets zone rules, such as rate limits, target station traffic alone, and it can move without touching the addresses on tokens. Adam asks Julian for it. The firmware's server setting becomes a full base URL, so the same firmware still reaches `http://A-Mac.local:8000` in development.
- **The station key alone proves which station is calling,** as today. The GeekyKey Service works out the station ID from the key, and that is the station ID in Julian's diagram. Sending the ID as well, signed requests and client certificates were rejected: over HTTPS nobody on the venue WiFi can read the key, so they add firmware work for nothing.
- **A station's key can be replaced, keeping its ID.** The API agreement says "to rotate, create a new station", but after the split a new station ID orphans the Event Service's passport settings and every participant's stamp there, because both are keyed by station ID.
- **Everything a station sees stays as it is, apart from the address and HTTPS:** the paths `POST /api/v1/taps` and `POST /api/v1/stations/heartbeat`, the request (`client_tap_id`, `uid`, optional `tapped_at`), the response (`station_id`, and `results` with one status per tap in request order), the 1 to 500 batch cap, and the `tapped_at` rule (more than 5 minutes ahead or 7 days behind counts as missing). The station cannot tell which service answered: the GeekyKey Service answers `unknown_token` and `no_event` itself, and passes back `accepted`, `cooldown` and `duplicate` from the Event Service unchanged.
- **Firmware ignores what it does not know.** It skips response fields it does not know, and treats a status it does not know as "recorded": it removes the tap from its buffer and shows "Tap received". Games can then add to the response, and other teams' Event Services can return new verdicts, without reflashing every station.
- **When the Event Service cannot answer** (down, slow, or failing), or later the Portal, the whole request fails with `503` and error code `event_service_unavailable`. The station keeps every tap in it and sends them again later, which is safe because every Event Service drops replays. A per-tap "retry later" status was rejected as more firmware logic for a rare case.
- **A station that feeds no event** answers each tap with a new status, `no_event`, which is not stored. The station drops the tap and says it is not in use. The station's link is checked before the token, so `no_event` wins over `unknown_token`. Keeping the taps until the station is linked was rejected: organizers' test taps would earn stamps, and taps could land in whatever event the station joins next. The cost: if an organizer forgets to link a station, taps there are lost until someone notices the screen and participants tap again.
- **A station moved while it still holds saved taps cannot leak them into its new event.** The GeekyKey Service remembers when each station's current link started and answers `no_event` for any tap whose `tapped_at` is earlier. Taps without a time cannot be checked, but those only come from a station that has not had a clock since it booted. As a warning too, the organizers' station list shows each station's saved taps, from the heartbeat's `buffered_taps`.
- **Errors that come without per-tap statuses:**
  - `401` (key missing or wrong): keep the taps, show a setup error, and retry at the heartbeat's pace. Once the key is fixed they still count. Flashing new firmware keeps them, since saved data sits in a separate part of flash.
  - `429` (a future rate limit) and any `5xx`: keep the taps and retry later.
  - `400` (the request itself is malformed): drop that batch and log it on the serial port. Sending it again can never work, one bad tap would block every tap saved after it, and a `400` from a station always means a firmware bug.
- **HTTPS: the station trusts a fixed list of root certificates,** passed to `setCACert` as one string. It holds the 14 roots in Mozilla's store for the four CAs Cloudflare issues from, about 19 KB (listed under Facts). Mozilla's whole bundle (`setCACertBundle`) was rejected as awkward from the Arduino IDE, and `setInsecure()` because anyone on the venue WiFi could pose as the service and collect station keys. The cost: if Cloudflare adds a CA, stations need new firmware.
- **The station keeps one HTTPS connection open and reuses it,** so a tap does not pay a TLS handshake of about a second each time. Cloudflare closes an idle connection after 400 seconds, so the heartbeat keeps it open.
- **The heartbeat goes to the GeekyKey Service every 60 seconds.** A station counts as online when its last request of any kind was within 120 seconds. The station sets its clock from the heartbeat's `server_time` each time, which works wherever taps work, while NTP may be blocked on venue WiFi; the clock only needs to be right to within seconds. The boot self-test calls the heartbeat instead of `/api/health`, because the heartbeat also proves the key.
- **What the station shows**, written into the API agreement as the suggested mapping, with each line at most 16 characters. Zi Tao can change the wording:

  | Outcome | Screen | LED |
  |---|---|---|
  | `accepted` | `Tap counted!` / `Check your phone` | blue |
  | `cooldown` | `Already counted` / `Try again later` | amber |
  | `unknown_token` | `Not claimed yet` / `Claim on phone` | red |
  | `no_event` | `Not in an event` / `Tell organizer` | red |
  | `duplicate` | nothing (only on resends) | none |
  | a status it does not know | `Tap received` | blue |
  | no answer, `503` or `429` | `Not recorded` / `Please tap again` | red |
  | `401` | `Setup error` / `Tell organizer` | red |

  The station never shows names or points. Once the offline buffer exists, "no answer" becomes `Tap saved` / `Will send later`.
- **No pause after a tap.** Each result shows for about 2 seconds with its LED lit steadily, then the station is ready again. Zi Tao's commit of 28 Sep shows "COOLDOWN" with the amber LED for 10 seconds after every tap, whatever its status, and reads no tokens meanwhile, which makes a queue wait about 18 seconds a person. The pause is not needed: a token held on the reader is not read twice, because the firmware puts it to sleep (`PICC_HaltA`) until it leaves the field, and a token lifted and tapped again is judged `cooldown` by the server, so it cannot earn twice. Amber means only that. In our docs, "cooldown" is the passport's rule, never a station's pause.

**What follows without a further decision**

- The station no longer reads the text written on a token (`readNtag213Text`), as "What is a token's ID, and what URL is written on each token?" found.
- `unknown_token` and `no_event` are stored nowhere; the GeekyKey Service writes them to its Workers logs. The API agreement's `tap_status` table changes to match.
- The heartbeat's `firmware_version` stays, so organizers can see which stations still run old firmware.
- Replacing a station's key means putting the new key in `secrets.h` and flashing the station.

**Facts** (checked 28 Sep 2026)

- The station's ESP32 core, 3.3.11, reads every certificate in the string given to `setCACert` (`mbedtls_x509_crt_parse` in `NetworkClientSecure/src/ssl_client.cpp`). Its README says Mozilla's bundle through `setCACertBundle` must be embedded by hand in the Arduino IDE, or loaded into about 64 KB of RAM.
- Cloudflare issues certificates from Let's Encrypt, Google Trust Services and SSL.com, and backup certificates from Sectigo as well. On the free plan, Universal certificates are ECDSA only; RSA needs a paid plan ([Certificate authorities](https://developers.cloudflare.com/ssl/reference/certificate-authorities/), updated 16 Apr 2026).
- `geekshacking.com` serves an ECDSA P-256 certificate from Google Trust Services WE1, then GTS Root R4, cross-signed by GlobalSign Root CA. That GlobalSign root is no longer in Mozilla's store, so the station must trust GTS Root R4 itself.
- The 14 roots, all in [Mozilla's store as published by curl](https://curl.se/ca/cacert.pem) (dated 25 Sep 2026), with their size as text: ISRG Root X1 and X2 (Let's Encrypt); GTS Root R1, R3 and R4 (Google Trust Services); SSL.com TLS RSA Root CA 2022, SSL.com TLS ECC Root CA 2022, SSL.com Root Certification Authority RSA and ECC, and Certum Trusted Network CA, which cross-signs SSL.com; USERTrust RSA and ECC Certification Authority, and Sectigo Public Server Authentication Root E46 and R46 (Sectigo). 19,177 bytes together. GTS Root R2 and GlobalSign Root CA are no longer in the store.
- Let's Encrypt's next roots, ISRG Root YE and YR, are cross-signed by X2 and X1 ([Let's Encrypt certificates](https://letsencrypt.org/certificates/)), so the list keeps working when they arrive.
- Cloudflare closes an idle HTTP/1.1 or HTTP/2 connection from a client after 400 seconds ([Connection limits](https://developers.cloudflare.com/fundamentals/reference/connection-limits/)).
- The Workers free plan allows 100,000 requests a day and 50 outside requests per incoming request; the paid plan allows 10,000 per request, and more if configured ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)). Hyperdrive counts every statement, cached or not, against the free plan's 100,000 a day ([Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/)).
- 20 stations sending a heartbeat every 60 seconds for 10 hours make 12,000 requests and about 24,000 queries, a key lookup and a last-seen write each.
- TiDB Starter's free allowance is 50 million Request Units a month per instance. Once it is used up, TiDB refuses new connections until the month resets or the limit is raised ([TiDB Cloud plans](https://docs.pingcap.com/tidbcloud/select-cluster-tier/)).

**Glossary**

`CONTEXT.md`: **Station** feeds at most one event at a time; **Station key** can be replaced, keeping it the same station; **Tap** at a station that feeds no event is turned away, like one by an unclaimed token.

**Assets**

- [Message to Zi Tao](../assets/message-to-zi-tao-station-contract.md): what changes in the station firmware, with the root list and the screen table. Adam edits and sends it.

**Passed on**

- Where each station's link and its start time are stored, how the station's `503` is triggered, and the GeekyKey Service giving up on the Event Service before the station gives up on it (the station waits 5 seconds today): "How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?".
- Replacing a station's key, and showing each station's saved taps on the organizers' station list: "Which screens belong to which service, and how does each know who is logged in?".
- The custom domain `api.geekykey.geekshacking.com` on the GeekyKey Service Worker, and the plan: passport polling already needs the paid plan, and the free plan's 50 outside requests per request would also limit Portal lookups: "How do deploys and secrets work?".
- The API agreement's changes (the production base URL for stations, `no_event`, `503 event_service_unavailable`, the error rules, the "ignore what you don't know" rule, the screen table, `unknown_token` no longer stored, replacing a key), the firmware steps for Zi Tao, and asking Julian for the hostname: "Write the migration spec".
- A lookup for many tokens in one call, since a 500-tap flush can hold more tokens than the free plan's 50 outside requests: "What we need from the Portal's tag APIs", still fog on the map.
- TiDB's monthly allowance, and what a day of heartbeats costs in Request Units, read off TiDB's console after the first deploy: "Monitoring during the event", still fog on the map.
- Zone rules can target `api.geekykey.geekshacking.com` alone, and a `429` makes stations retry rather than lose taps: "Protecting our public services", still fog on the map.

## Renamed (28 Sep 2026)

`api.geekykey.geekshacking.com` is now **`geekykey-api.geekshacking.com`**, wherever it appears above. Qing Guan, who runs the zone, advised one level of subdomain because of Cloudflare's certificate limits; see "How do deploys and secrets work?".
