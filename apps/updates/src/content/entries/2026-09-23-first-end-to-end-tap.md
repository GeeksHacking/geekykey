---
title: "The first end-to-end tap: a real reader talks to the backend"
date: 2026-09-23
window:
  from: 2026-09-23
  to: 2026-09-23
sprint: 1
authors: [adam]
summary: >-
  On 23 Sep the ESP32 station read a real tag and the backend recorded the tap over WiFi,
  with the verdict back on the reader in about 0.2 seconds. The station now identifies a
  token by its chip's built-in ID and finds the backend by name. The gap before any event:
  a tap is lost if the network drops, because the station has no buffer yet.
areas: [firmware, backend]
---

## What moved

This continues the last update. At that point the backend could record taps and the reader
prototype could read tags, but the two had not talked to each other yet.

### Firmware

The reader prototype (an ESP32-S3 with an RC522 NFC module) now reports each tap to the
backend, and on 23 Sep it did so for real: tags tapped on the reader were recorded by the
backend over a phone hotspot, with the verdict back on the reader in about 0.2 seconds.

- Each tap goes out with the tag's hardware ID, the station's own key, and a tap number.
  The backend uses the number to spot a tap that was sent twice. The station keeps it in
  flash, so a restart does not make new taps look like repeats.
- The reader shows the backend's verdict for every tap: accepted, too soon after the last
  one, an unknown tag, or a repeat.
- At start-up the station checks that it can talk to its NFC chip and reach the backend,
  and prints both, so a wiring or network fault shows up before anyone taps.
- The station finds the laptop running the backend by its network name instead of a fixed
  address (see Decisions).
- The WiFi password and the station key live in a file that git ignores. A template in the
  repo shows what goes in it.
- Every tap so far comes back as an unknown tag, which is expected: no tag is linked to a
  participant yet, because token pairing is still to be built.

### Backend

- A station that sends a garbled or cut-off request is now told the request was bad (`400`)
  instead of getting a server error (`500`). The firmware is meant to retry on server
  errors, so a cut-off request would otherwise have been retried forever.

## Decisions

**A token is identified by its chip's built-in ID, not by text written onto it.** The
prototype read a text record stored on the tag. The station now sends the tag's hardware
ID (its UID) and only logs the text. Why: the UID is set at the factory and cannot be
edited, while the text on an unlocked NTAG213 can be rewritten by anyone with a free phone
app, so one participant could copy another's token. It also means tags need no setup before
the event, and the reader has the UID the moment it sees a tag. The UID is not unforgeable:
special blank tags can copy one, but that takes deliberate effort. This was already in the
API agreement, and the agreement wins over the code, so the firmware changed and the
agreement did not. Rejected: the stored text, which would need every tag written and locked
before the event and would still not stop copying.

**The station finds the backend by name, not by a fixed address.** Why: for now the backend
runs on a laptop joined to a phone hotspot, and the hotspot gives the laptop a new address
whenever it restarts. That broke the connection during testing on 23 Sep, and seven taps
were lost before the cause was found. With the laptop's network name (mDNS), the station
looks the address up itself, at start-up and again after any failed tap. Rejected: a fixed
address, which is what broke, and reserving an address for the laptop, which phone hotspots
do not offer. This only matters while the backend runs on a laptop; once deployed it has a
real domain name.

## Blockers and asks

- **The station loses a tap if the network drops.** A tap that cannot reach the backend is
  printed as failed and is gone; there is no buffer yet. The API agreement already says what
  the station should do (keep the tap in flash and resend it), and the clock needs syncing
  first so resent taps carry the time they happened. Until then, a WiFi blip at an event
  loses taps.
- **The station only works on a local network so far.** It talks plain HTTP to a laptop
  found by its network name. A deployed backend needs HTTPS and a real domain, and the
  firmware will need to change for both.

## What we learned

- **Adam:** on the ESP32, "connection refused" does not mean the server refused. Its HTTP
  library reports any failed connection that way, so the error pointed at the backend when
  the real problem was that the laptop's address had changed. Checking which devices were
  actually on the hotspot found it.
- **Adam:** the Arduino IDE on an Apple Silicon Mac needs Rosetta. One of its build tools
  only runs on Intel Macs, and without Rosetta every sketch fails to compile with "bad CPU
  type in executable".

## Next window

The goals in the last update still stand. One addition:

- **Zi Tao:** keep failed taps in flash and resend them, after syncing the clock.
