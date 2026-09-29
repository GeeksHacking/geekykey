---
title: "TiDB, Cloudflare and a second service: the hosting plan takes shape"
date: 2026-09-27
window:
  from: 2026-09-24
  to: 2026-09-27
sprint: 1
authors: [adam]
summary: >-
  At the 24 Sep check-in the mentors asked us to use GeeksHacking's own infrastructure, so
  the backend moves to TiDB and Cloudflare Workers instead of Turso and one container. On
  27 Sep Julian and Qing Guan reshaped the plan: the Portal keeps track of who owns each
  token, and we now build two services, one that stations and tokens talk to and one for
  the showcase's games. The hosting plan is due 30 Sep, and Julian is waiting on it.
areas: [backend, frontend, firmware, research, admin]
asks:
  - who: Julian
    what: >-
      Register the three OAuth redirect URLs Adam is sending, set up
      geekykey.geekshacking.com, and tell us GeeksHacking's workers.dev subdomain and
      whether the portal accepts plain http for localhost.
  - who: Qing Guan
    what: >-
      The shape of the Portal's two token APIs: look up the user who owns a token, and
      claim a token for a user. Until they exist, GeekyKey keeps its own table.
---

## What moved

Against the last update's goals: `GET /api/v1/me` landed on 25 Sep. Token pairing did not
start, and on 27 Sep it changed shape (see Decisions): a token is now claimed through the
Portal. Ethan found his way into the codebase: his frontend changes landed on 24, 25 and
26 Sep, and his testing turned up five backend bugs. The materials list needed another
pass: an order of 100 NFC tokens could not be justified, so we cut it to 20 and
strengthened the justification. Zi Tao got the ESP32 connecting to the internet. Joshua
worked only on the report and on ideas, and the first draft of the report's component B
is almost finished.

### Research

Before building anything, Adam wrote down every question the move to TiDB and Cloudflare
raises, and has been settling them one at a time so the plan can be handed over by 30 Sep.
Settled so far:

- **TiDB fits the backend.** GeeksHacking's database is TiDB Cloud Starter, hosted in
  Singapore. A read-only check from Adam's laptop reached it with both kinds of driver, at
  about 10-12 ms per query once connected. Two things need care: TiDB ignores the schema's
  CHECK constraints by default, and its automatic IDs do not follow insert order.
- **Running the backend on Workers is a small port.** Only three Deno-specific calls tie
  it to Deno today. Database migrations become their own step, because a Worker cannot
  run them when it starts.
- **The web app becomes a Cloudflare Worker** that serves its files and passes `/api` and
  `/auth` on to the backend.
- **The game ideas from the 24 Sep meeting all fit** this setup. Live features would need
  one more Cloudflare component (a Durable Object).
- **The addresses.** The web app will live at `geekykey.geekshacking.com`, and the three
  OAuth redirect URLs for the portal login are ready to send to Julian.

### Backend

- `GET /api/v1/me` (25 Sep) returns a user's profile, tokens, points, stamps and last 50
  taps in one call: everything the dashboard and passport need.
- Five bugs Ethan found while testing taps are fixed (26 Sep). The main ones: a late
  offline tap is now checked against the taps around it, not only the newest one; a
  station whose clock never synced can no longer throw off the cooldown; and a retry that
  races its original counts once, not twice.
- The backend is clean under its linter and formatter, the pinned Node version moved up
  because some packages needed it, and every pull request now also runs those two checks
  and builds this site.

### Frontend

All of this is Ethan's work.

- **24 Sep:** the web app keeps showing the last good data when a refresh fails, and sends
  anyone whose session has ended back to the login page.
- **25 Sep:** it logs in, loads the dashboard and logs out against the live backend.
  Screens whose endpoints are not built yet stay on mock data.
- **26 Sep:** a crash shows an error page with a Try again button instead of a blank
  screen. Screens still on mock data are labelled "Demo data". The app checks that the
  dashboard's data matches the agreed shape, three browser tests click through the main
  paths, and the screens got easier to use by keyboard and on phones.

### Firmware

- The reader blinks blue when the backend answers a tap, and red when the tap could not be
  recorded (25 Sep).
- Zi Tao added a small two-line screen to the reader (25 Sep). It shows "PASSED, Tap
  recorded" or "FAILED, Tap not recorded" at the same moment as the light.

### The 24 Sep check-in

Beyond infrastructure (see Decisions), the check-in with Julian covered:

- **Tokens:** a clip that is easier to 3D-print, a design inspired by mechanical keyboard
  keys (Julian's suggestion), and registering an empty token with a phone or by scanning a
  QR code.
- **Games:** human interaction at the centre. Human bingo, puzzles, digital pets and
  trading went down well; throwing games did not. Personal details are shared only with
  people a participant has chosen.
- **Connectivity:** a fallback for when venue WiFi fails, such as 4G, battery power, or
  working offline and syncing later.

## Decisions

**Use TiDB, not Turso.** Why: the mentors asked us to stick to the infrastructure
GeeksHacking already runs (Firebase, Firestore, RDS and TiDB), with TiDB first. Rejected:
Turso, which our backend's database library was chosen for. It would have been one more
service for GeeksHacking to look after.

**The frontend and backend deploy separately on Cloudflare, with the backend on
Workers.** Why: the mentors said not to package both into one container. Julian chose
Workers on 25 Sep: GeeksHacking already uses them, pays for them, and runs
geekshacking.com on Cloudflare. Rejected: Google Cloud Run, which Adam had compared it
with. The Firebase project we were given is on the free plan, which cannot run Cloud Run
without adding billing.

**The browser only ever talks to one address.** The web app's Worker passes `/api` and
`/auth` on to the backend, so the login cookie simply works and the backend needs no
cross-origin (CORS) setup. Why: it is how local development already works, and it behaves
the same before and after our subdomain exists. Rejected: separate addresses for the app
and the API, which would need CORS, an extra request before many calls, and a separate
frontend build for each backend address.

**Keep polling for now; no live connections.** Why: the mentors want live connections only
if a core game mechanic needs them, and treat live interaction as an extra until its value
is shown. Rejected: building live sockets now.

**The Portal owns identity, and we build two services.** On 27 Sep Julian and Qing Guan
settled the shape. The GeeksHacking Portal knows who each user is and which tokens they
have claimed. The GeekyKey Service is what stations and tokens talk to: it asks the Portal
who owns a token, then passes the tap on to an Event Service, which runs one event's
games. We build the GeekyKey Service, and a sample Event Service for the capstone
showcase, starting with the passport. Until the Portal's token APIs exist, GeekyKey keeps
its own table, built so that switching later is cheap. Why: user details live in one
place, and a future event can add its own games without touching the Portal or the
stations. It also answers a question from 24 Sep: a token stays with its owner after the
event. Rejected: a separate long-lived database of tokens and owners (Julian's first
idea), which would have kept user details in two places, and pointing stations straight
at one event's backend, which would tie every station to that event.

**Entry, exit and food stations wait.** Why: the client said they are not a priority.
Rejected: building them for the showcase.

## Blockers and asks

- **The hosting plan is due 30 Sep with eight questions still open,** starting with how
  today's backend splits into the two services. Anything not settled by then goes to
  Julian marked provisional.
- **What identifies a token is open again.** The last update chose the chip's built-in ID.
  But in the new phone flow, tapping a token opens a link, and a phone that opens a link
  only sees the URL written on the token, not the chip's ID. Adam and Zi Tao will decide
  what the ID is and which URL goes on every token. Once tokens are handed out, that URL
  can never change.
- **Julian:** the redirect URLs, the subdomain and two questions (see the asks above).
- **Qing Guan:** the shape of the Portal's token APIs.

## What we learned

- **Adam:** Cloudflare's Bot Fight Mode can challenge devices like our reader, and on the
  free plan it cannot be switched off for one address. It is off for geekshacking.com, but
  it is the kind of setting that could stop every station on event day.
- **Adam:** a Cloudflare Worker only runs while it is answering a request, so it cannot
  update the database's structure when it starts. That becomes a separate step, run from
  CI or a laptop.
- **Adam:** TiDB hands out automatic IDs in blocks per server, so a higher ID does not mean
  a later row. Our code must not treat `taps.id` as "newer".
- **Adam:** a web app on Cloudflare answers a browser going to `/auth/login` with the app's
  own page, without running any code, unless that path is listed to run the Worker first.
  Login would have broken with no error.

## Next window

- **Adam:** finish the hosting plan by 30 Sep, starting with how today's backend splits
  into the GeekyKey Service and the Event Service. Then build the move in checkpoints.
- **Adam and Zi Tao:** decide what identifies a token, which URL is written on each one,
  and how stations talk to the GeekyKey Service.
- **Zi Tao:** write the web address onto every token with a small writer program, and
  start on the reader changes in the hosting plan: show each tap's result on the screen,
  take out the 10-second pause after every tap, then move to HTTPS.
- **Joshua:** tell us whether the A/B analysis needs token IDs, or taps by tokens nobody
  has claimed yet, since the new design keeps both out of the event's data.
- **Ethan:** review the changes to the API agreement, the first step of the move.
