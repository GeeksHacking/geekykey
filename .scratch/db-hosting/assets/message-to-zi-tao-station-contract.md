# Message to Zi Tao: the station after the move to Cloudflare

Draft for Adam to edit and send, from "How do stations talk to the GeekyKey Service?", 28 Sep 2026. The root list comes from [Cloudflare's certificate authorities page](https://developers.cloudflare.com/ssl/reference/certificate-authorities/) and [Mozilla's root store as published by curl](https://curl.se/ca/cacert.pem), both checked 28 Sep 2026. `no_game` and the station key rules added the same day by "How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?". The once-a-minute resend and the disabled station added on 29 Sep by "How do we protect our public addresses without blocking the stations?". The reader check added the same day by "How do we notice trouble on event day, and who watches?". Section 6, on the saved-taps queue that went into the firmware on 29 Sep (commit `71c8ada`), added the same day by "Write the migration spec".

---

Hi Zi Tao, we've planned how the stations talk to the backend once it moves to Cloudflare. The good news: the requests and answers stay the same as today. What changes is the address, HTTPS, and what the station does with each answer. Most of this isn't urgent until the new service is deployed, but the screen and LED part can start now, and section 6 is worth doing soon.

**1. The address**

- In production, stations call `https://geekykey-api.geekshacking.com`. That hostname doesn't exist yet; Adam is asking Julian for it.
- Please make the server setting in `secrets.h` a full base URL, for example `SERVER_URL "https://geekykey-api.geekshacking.com"` or `SERVER_URL "http://A-Mac.local:8000"`. Use HTTPS when it starts with `https://`, and keep the mDNS lookup for `.local` names, so the same firmware works on a laptop and in production.
- **Only send the station key over plain `http://` to a `.local` address.** If the setting starts with `http://` and the host doesn't end in `.local`, show `Setup error` and send nothing: the key would cross the venue WiFi unencrypted before anything could redirect it to HTTPS.
- The paths stay `POST /api/v1/taps` and `POST /api/v1/stations/heartbeat`, with the station key in `Authorization: Bearer ...` as today.

**2. HTTPS**

- Use `NetworkClientSecure` (or `WiFiClientSecure`) with `setCACert`, passing **one string that holds 14 root certificates**. Cloudflare picks the certificate authority itself and changes certificates every few weeks, so we trust the roots of every authority it uses, not one certificate.
- The 14 roots, by the names used in Mozilla's list:
  - ISRG Root X1, ISRG Root X2
  - GTS Root R1, GTS Root R3, GTS Root R4
  - SSL.com TLS RSA Root CA 2022, SSL.com TLS ECC Root CA 2022, SSL.com Root Certification Authority RSA, SSL.com Root Certification Authority ECC, Certum Trusted Network CA
  - USERTrust RSA Certification Authority, USERTrust ECC Certification Authority, Sectigo Public Server Authentication Root E46, Sectigo Public Server Authentication Root R46
- To make the file, download `https://curl.se/ca/cacert.pem` and run this from the same folder. It writes `ca_roots.h` (about 19 KB):

  ```python
  import re
  names = ["ISRG Root X1", "ISRG Root X2", "GTS Root R1", "GTS Root R3", "GTS Root R4",
           "SSL.com TLS RSA Root CA 2022", "SSL.com TLS ECC Root CA 2022",
           "SSL.com Root Certification Authority RSA", "SSL.com Root Certification Authority ECC",
           "Certum Trusted Network CA", "USERTrust RSA Certification Authority",
           "USERTrust ECC Certification Authority",
           "Sectigo Public Server Authentication Root E46",
           "Sectigo Public Server Authentication Root R46"]
  blocks = dict(re.findall(r"\n\n([^\n]+)\n=+\n(-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----)",
                           open("cacert.pem").read(), re.S))
  with open("ca_roots.h", "w") as f:
      f.write("#pragma once\n// Roots for Cloudflare's CAs, from Mozilla's store (curl.se/ca/cacert.pem)\n")
      f.write('const char CA_ROOTS[] = R"PEM(\n' + "\n".join(f"# {n}\n{blocks[n]}" for n in names) + '\n)PEM";\n')
  ```

- **Leave redirects off**, as `HTTPClient` has them by default: don't call `setFollowRedirects`. A redirect would send the station key on to wherever it points.
- **Never print the station key on the serial port**, even in debug output.
- **Don't use `setInsecure()`**, even to get started. Anyone on the venue WiFi could then pretend to be our service and collect station keys.
- **Keep one connection open.** Make the secure client and `HTTPClient` global, and call `http.setReuse(true)`, so a tap doesn't pay a new HTTPS handshake (about a second on the ESP32) each time. Cloudflare closes an idle connection after 400 seconds, and the heartbeat below keeps it open.
- **You can test it today** against sites that already use these authorities: `https://geekshacking.com` (Google Trust Services) and `https://valid-isrgrootx1.letsencrypt.org` (Let's Encrypt). Both should connect with the roots set, and fail if you pass a string without them.

**3. Heartbeat and clock**

- Call `POST /api/v1/stations/heartbeat` at boot and every 60 seconds, with `{ "firmware_version": "...", "buffered_taps": N, "reader_ok": true }`. The organizers' screen shows a station as online if it was heard from in the last 120 seconds.
- **A request, if it's cheap: check the reader before each heartbeat.** Ask the RC522 for its version, as the boot check does with `PCD_DumpVersionToSerial()`. If it answers `0x00` or `0xFF`, or doesn't answer, send `"reader_ok": false` and show `Reader error` / `Tell organizer` until it answers again. Today a station with a dead or loose reader but working Wi-Fi still looks online to the organizers, so nobody knows to come over. `reader_ok` is optional: leave it out and nothing breaks. Trying `PCD_Init()` again before reporting `false` is your call.
- Use the heartbeat at boot instead of `/api/health`: it also proves the station key is right.
- Set the station's clock from the heartbeat's `server_time` every time. Then send `tapped_at` with each tap once the clock is set, and leave it out before the first successful heartbeat. We don't need NTP, which some venue WiFi blocks.

**4. What to do with each answer**

A `200` has one `status` per tap in `results`. Please show them like this. Each line is at most 16 characters, and you can change the wording:

| Status | Screen | LED |
|---|---|---|
| `accepted` | `Tap counted!` / `Check your phone` | blue |
| `cooldown` | `Already counted` / `Try again later` | amber |
| `unknown_token` | `Not claimed yet` / `Claim on phone` | red |
| `no_event` (new) | `Not in an event` / `Tell organizer` | red |
| `no_game` (new) | `Not in a game` / `Tell organizer` | red |
| `duplicate` | nothing; it only happens when a saved tap is resent | none |
| any status you don't recognise | `Tap received` | blue |
| no answer, or HTTP `503` or `429` | `Not recorded` / `Please tap again` | red |
| HTTP `401` | `Setup error` / `Tell organizer` | red |
| the reader stops answering (your own check, section 3) | `Reader error` / `Tell organizer` | red |

- **Show each result for about 2 seconds with its LED on, then go back to "Ready".** Please take out the 10-second COOLDOWN pause after every tap. It makes each person in a queue wait about 18 seconds, and we don't need it: a token held on the reader isn't read twice (after `PICC_HaltA` it stays asleep until it leaves the field), and a token lifted and tapped again comes back as `cooldown` from the server, so it can't earn twice.
- **Amber means only the server's `cooldown`:** the same person tapped the same station again within 5 minutes, so the tap was recorded but didn't count. In our docs "cooldown" always means that rule.
- `no_event` means an organizer hasn't linked this station to an event yet. The tap is thrown away.
- `no_game` means the station is linked to an event, but none of the event's games counts taps there yet, for example because it hasn't been given passport settings. The tap is recorded but earns nothing.
- The station never gets names or points, only these statuses.
- Ignore any field in the answer you don't recognise. Later games may add some.
- You can delete `readNtag213Text()`: the station only needs the UID.

**5. The saved taps**

- **Delete a saved tap as soon as any status comes back for it**, including `duplicate`, `unknown_token`, `no_event`, `no_game` and statuses you don't recognise.
- **Keep it and try again later** on no answer, a `5xx` (including `503`) or a `429`. Sending a tap twice is always safe: its `client_tap_id` makes the second one a `duplicate`.
- **Resend saved taps at most once a minute,** alongside the heartbeat, never in a loop. A new tap is still sent straight away, with the saved taps in the same request, because someone is waiting for the result. Twenty stations resending every second while the service is down would use up our free plan's requests for the whole day in under two hours.
- **On a `401`, keep the taps**, show the setup error and retry at the heartbeat's pace. Once the key is fixed, they still count. A station an admin has disabled also gets `401`, so this needs nothing extra; its taps count once it is enabled again.
- **On a `400`, drop that batch** and print it on the serial port. It means the request itself is broken, so sending it again would never work and would block everything saved after it.
- Send at most 500 taps per request. Smaller batches are fine.
- While a tap is saved but not sent, the screen can say `Tap saved` / `Will send later` instead of `Not recorded`.

**6. The saved-taps queue that went in on 29 Sep**

Thanks for the queue (commit `71c8ada`): it's what section 5 asks for. Four things in it need to change before the new service goes live, and the first matters most:

- **Any status means the tap is done.** `isValidTapStatus()` only knows today's four statuses, so `sendTap()` returns an empty string for anything else, and the tap stays at the head of the queue. The new service answers `no_event` for every tap at a station that isn't linked to an event yet. So the first tap at a new station would get stuck at the head, every later tap would wait behind it, and the station would stop sending altogether. Please remove the tap from the queue whatever status comes back, and use `isValidTapStatus()` only to pick the screen, showing `Tap received` for a status you don't know.
- **A `400` means drop the tap.** Today a `400` also returns an empty string, so a broken tap stays at the head for good. Drop it and print it on the serial port instead. A `401`, `429` or `5xx` should still keep it.
- **Retry once a minute.** After a failure, the queue retries after 2 seconds, doubling up to 60. Please wait a minute every time, and send alongside the heartbeat once the service has one.
- **Send the saved taps together.** The queue sends one tap per request, but one request can carry up to 500, and every request counts against the free plan's daily limit. Send the saved taps in one request, with a new tap joining the same request when someone taps.

Thanks! Ask Adam if anything here doesn't fit the hardware.
