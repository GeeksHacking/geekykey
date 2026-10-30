---
title: "Two platforms: the Event Service on Cloud Run, the GeekyKey Service on Cloudflare"
date: 2026-10-20
window:
  from: 2026-09-28
  to: 2026-10-20
sprint: 3
authors: [adam]
summary: >-
  Cloudflare's Hyperdrive couldn't reach TiDB, so on 2 Oct the Event Service moved to Google
  Cloud Run next to the database, and the GeekyKey Service stayed on Cloudflare with no database
  of its own. Both are live: since 20 Oct every station sends its taps to key-api, which hands
  them to Cloud Run. The biggest blocker is a mock test: with school ending there are few
  events to test at, and a section of the report depends on one.
areas: [backend, frontend, firmware, hardware, research, tooling, admin]
asks:
  - who: Julian
    what: >-
      A budget alert on our Google Cloud project, sent to you and Adam (asked 8 Oct).
  - who: Julian
    what: >-
      A way for us to see the GeekyKey Service's logs and the account's Workers requests,
      either read-only access or someone who watches them on the day (asked 1 and 8 Oct).
  - who: Qing Guan
    what: >-
      An OIDC client for our Firebase project, so participants with a GeeksHacking account can
      log in with it at the showcase.
---

## What moved

This entry covers three weeks instead of two, because no entry was written for the window
that closed on 11 Oct.

Against the last update's goals: Adam finished the hosting plan on 29 Sep, a day early,
and the move it describes is now four checkpoints in (see Backend). The plan settled what
identifies a token (its chip's built-in ID) and how stations talk to the GeekyKey Service
on 28 Sep. Zi Tao wrote the first version of the token writer on 29 Sep. Joshua confirmed
that the A/B analysis needs neither token IDs nor taps by unclaimed tokens, so the export
keeps neither. Ethan approved version 0.4 of the API agreement on 10 Oct, and his screens
follow it. Joshua puts the report at about 65% done, and is going back through its sections
to cut repeated text.

### Research

- **The plan finished on time, then changed shape.** Version one, done on 29 Sep, had both
  services on Cloudflare reaching TiDB through Hyperdrive. On 2 Oct Hyperdrive couldn't
  sign in to TiDB Cloud, which asks every client to sign in a second time. After that
  day's meeting the plan was redrawn for two platforms (see Decisions) and the spec
  rewritten by 7 Oct.
- **The 8 Oct meeting with Julian and Qing Guan** settled the rest: Firebase for the
  showcase's login, our own Google Cloud project set up by hand from a runbook, a setup
  mode on the stations instead of reflashing, and a freeze before the showcase (no new
  backend features from 11 Nov, no merges after 16 Nov).

### Backend

The move is in eight checkpoints, and four are done.

- **Checkpoint 1 (30 Sep):** today's backend ran on Cloudflare's runtime against a local
  copy of TiDB, and Deno left the repo.
- **Checkpoint 2 (8 to 12 Oct):** the backend became a Node server on Google Cloud Run,
  with a staging copy beside production. Every merge to main migrates the database and
  deploys, with no key kept in GitHub. A test station's taps were stored on production at
  event-api.geekshacking.com on 12 Oct.
- **Checkpoint 3 (12 to 15 Oct):** inside the one server, the code split into the
  GeekyKey side, the Event side and a stand-in for the Portal's token API. They reach each
  other only through the requests they send now that they run apart. Taps reach the Event
  Service as users, never as tokens, and stations send a heartbeat that sets their clock.
- **Checkpoint 4 (16 to 20 Oct):** the GeekyKey Service runs on its own Cloudflare Worker
  at key-api.geekshacking.com, which Cloudflare builds from main. Every station moved to
  it, and the Event Service no longer answers a station at all.

Around those:

- A cold Event Service answers its first tap within about 2.6 seconds, inside the 4 seconds
  the GeekyKey Service allows (11 Oct).
- The first two days of real use took a few tens of thousands of TiDB's 50 million free
  Request Units a month (12 Oct).
- A batch of 500 taps used 18 ms of the Worker's CPU, over the free plan's 10 ms. A change
  merged on 19 Oct skips the slowest check for a valid batch, which brought a test copy's
  median batch down to 6 or 7 ms.
- Every pull request now starts both services in CI and sends a station's taps through
  them to the database (17 Oct).
- Google sign-in works against our Firebase project, and a Worker checks its login in
  about 1 ms of CPU (10 Oct).

### Frontend

There are now two sets of screens. The Event screens are the passport and the organizers'
screens, and talk to the Event Service. The GeekyKey screens are the page a phone opens
when it taps a token, and My tokens, and talk to the GeekyKey Service. Ethan built most of
both, ticket by ticket, each against demo data so it didn't wait on the backend.

**Ethan:**

- **29 and 30 Sep:** the screens were ready for version 0.2 of the agreement, with a plain
  message for each new error, and their calls grouped by the service each one goes to.
- **1 to 7 Oct:** pairing left the Event screens, since a token is now claimed on the
  GeekyKey screens. Organizers got the new station board, and add a station to the
  passport or change its settings. Taps show only the three answers the Event Service
  stores, and the tap log and export show each station's passport name. A failed status
  call shows "Status unknown", never "Offline", and screens that refresh keep their last
  data when the service says to slow down.
- **2 and 7 Oct:** the GeekyKey screens started as their own app, with their own API client
  on demo data. They sign in and out, and come back to the page you were on.
- **9 Oct:** a recheck of his first eleven tickets against version 0.3 found a real fault:
  the login page passed on any return address, including one on another site. He fixed it
  in both apps, with a test for each.
- **12 and 13 Oct:** both apps follow version 0.4: they ask for a user ID rather than a
  Portal one, and have a message for each login error. Seven dashes the design rules ban
  left the screens.
- **13 and 14 Oct:** the token page. It shows who owns a token and when it was claimed, you
  can claim an unclaimed one, and its owner (or a GeekyKey admin) can release it after
  confirming.
- **15 to 19 Oct:** the station board reads the Event Service's own stations, with a
  disabled one marked and listed last. Organizers add a station and see its key once, with
  a pointer to the station's setup mode, replace a station's key, and disable or enable a
  station.
- **19 and 20 Oct:** My tokens lists your tokens and releases one, and says so in the
  agreement's own words when the service fails or asks it to slow down.
- **20 Oct:** the Event screens moved to `apps/event-web`, the name the spec gives them.

**Adam:**

- **5 Oct:** only stations in the passport count as stamps, and a tap anywhere else shows
  as "Other station".
- **6 Oct:** both apps moved to Tailwind 4 (see Tooling and admin).
- **13 Oct:** claiming a token checks the three-token limit before whether someone else
  owns it, so someone already holding three is told to release one first.
- **14 Oct:** both apps use the GeeksHacking branding kit: its logos, its yellow and
  greys, and the Open Sans font.

The screens still run on demo data. They go online at checkpoint 5.

### Firmware

- **Zi Tao:** the screen shows each answer on its own (accepted, cooldown, unknown token)
  on 28 Sep, the token writer on 29 Sep, and the card reader's receiver gain turned to its
  maximum on 8 Oct.
- **Ethan, 29 Sep:** the station saves up to 100 taps in memory that survives a power cut,
  and sends them again later.
- **Adam:** the first test against the new backend found no tap stored, because the
  station looked for saved taps in the wrong place; fixed on 1 Oct. On 2 Oct the reader
  stopped starting switched off on about half of its starts. Since 6 Oct each result shows
  for 2 seconds, then the station is ready again. Since 12 Oct it talks HTTPS, and since
  15 Oct it sends a heartbeat every minute and shows "Reader error" when the card reader
  stops answering.
- **Setup mode (19 and 20 Oct):** a station takes a new server address, key or Wi-Fi
  network over its USB cable, from a terminal or from a browser page in Chrome or Edge.
  That is how the main station moved to key-api on 20 Oct, without a reflash.

### Hardware

Zi Tao has been working on the hardware and designing the 3D models, and Joshua has started
helping him with the modelling. The portable NFC scanner waits on a buck-boost converter,
which is on its way; Zi Tao starts on the scanner once it arrives.

### Tooling and admin

- The team's Linear is organised around the showcase on 18 Nov: one goal, five projects
  and the move's eight checkpoints as milestones (30 Sep).
- The whole repo runs on Node 24 (7 Oct), and all three web apps on Tailwind 4, which
  cleared a security advisory with no fixed version (6 Oct).
- The repo is now public, and since 18 Oct main is protected: a change reaches it only
  through a pull request whose checks pass.

## Decisions

**The Event Service runs on Google Cloud Run, and the GeekyKey Service on Cloudflare with
no database.** Why: Hyperdrive can't sign in to TiDB Cloud, and without it a Worker that
talks to TiDB directly used about 20 ms of CPU per tap, twice the free plan's 10 ms.
GeeksHacking's Cloudflare account is on the free plan. Cloud Run keeps database
connections open, and GeeksHacking already runs the Portal there. Rejected: TiDB's
serverless driver on a Worker, which used 7 ms and would only just fit, and Cloudflare's
paid plan. The cost: two platforms to set up and watch instead of one.

**Stations belong to the event that registers them.** Why: the GeekyKey Service has no
database to keep them in. It keeps each event's list of station keys in memory and
refreshes it every minute, so a made-up key still never reaches the database. Organizers
add, rekey and disable their own stations. Rejected: a stations table in the GeekyKey
Service, which would have given it a database again.

**Token owners stay on our own server until after the showcase.** Why: the Portal's token
API answers one request at a time, and every tap would wait on it. A stand-in on Cloud Run
answers the same questions, so after 18 Nov the claims move across with no change to
stations or screens. GeeksHacking agreed on 8 Oct. Rejected: building on the Portal's API
now.

**A station waits for each tap's result.** Why: amber for a tap that came too soon, and
"claim this token on a phone", both need the answer. When the server is slow, the station
saves the tap and shows "Will send later". Rejected: answering every tap at once, which
would lose both messages.

**The showcase logs in through Firebase.** Settled on 8 Oct with Julian and Qing Guan. Why:
the showcase's participants never end up in GeeksHacking's user list, and the login no longer
waits on the Portal's team. Participants sign in with Google, or with their GeeksHacking
account if Mr Pang agrees to offer it. Rejected: the Portal's own login, which comes after
the showcase.

**A station changes server, key or Wi-Fi through a setup mode.** Why: a new venue's Wi-Fi,
moving a station to another event and moving every station to key-api would each have
meant reflashing every station. Rejected: reflashing every station once when the GeekyKey
Service was cut out, as the plan of 7 Oct had it.

**Smaller calls:** Node on Cloud Run, after Bun and Deno ran the backend unchanged and no
faster (7 Oct). The Cloud Run setup is a runbook of commands rather than infrastructure as
code (8 Oct). event-api stays behind Cloudflare's proxy, because a station's request
passes through it untouched (12 Oct). The Event Service moves to its own repo after the
showcase, not before, as Julian agreed on 16 Oct.

## Blockers and asks

- **We need somewhere to run a mock test.** A section of the report depends on one, and
  people using the system as they would at the showcase would turn up problems we haven't
  found ourselves. The roadmap put the A/B test at an SSTInc or CCA event
  between 5 and 18 Oct, and no date was confirmed. With school ending, few events are left,
  so we may have to settle for a smaller test among the capstone groups.
- **GeeksHacking's login at the showcase** waits on Qing Guan's OIDC client, then on Mr
  Pang's answer. If he says no, the showcase offers Google sign-in only.
- **We can't see the GeekyKey Service's logs.** The Event Service's logs are ours, on
  Google Cloud, but the Worker runs on GeeksHacking's Cloudflare account, where the team
  has no access. Before the rehearsal on 7 Nov we need a way to see failed key checks and
  hand-offs (see the asks above).
- **The free plan's daily limit is still an estimate.** Our count is 60,000 to 90,000
  Worker requests on the showcase day against a limit of 100,000. The rehearsal measures
  the real number, and a stress test on staging comes before it.

## What we learned

- **Adam:** TiDB needed one more step than the plan expected. After waiting for one
  station's lock, a request must also read with a lock, or it misses the taps the request
  before it just stored. A test caught it before any station did.
- **Adam:** dropping a column breaks the running version of the server for about 20
  seconds, because our database library names every column in its queries. So each table
  change takes two deploys: the code stops using the column, then the column goes.
- **Adam:** a secret set in Cloudflare's build settings is visible only to the build, not
  to the Worker it deploys. The GeekyKey Service's first build failed that way on 19 Oct,
  until Julian moved the secrets onto the Worker.
- **Adam:** most of the Worker's CPU for a batch of taps went on Zod checking the batch's
  shape. Measuring a test copy of the Worker showed it, and a plain check that runs first
  halved the time.

## Next window

- **Adam:** checkpoint 5: both services log people in with Firebase, and Julian puts both
  sets of screens online at event.geekshacking.com and key.geekshacking.com. Then the
  stress test on staging.
- **Ethan:** both sets of screens sign in with Firebase, and My tokens claims a token by
  typing its code.
- **Zi Tao:** start on the portable NFC scanner once the buck-boost converter arrives.
- **Joshua:** keep editing the report's sections, and help Zi Tao with the 3D models.
- **The team:** find a place and a date for the mock test.
