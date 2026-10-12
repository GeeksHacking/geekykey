# Answers to "Key qns so everyone is on the same page"

Drafted 2 Oct 2026 from what the repo says today. Each answer cites where it comes from, so anyone can check it.

Updated 7 Oct 2026 for the redrawn hosting plan: the Event Service moved to Google Cloud Run, the GeekyKey Service keeps no database, and each event registers its own stations (ADR 0003; API v0.3; the rewritten spec, whose section numbers are used below).

Updated 12 Oct 2026 for the 8 Oct meeting and what followed: the showcase logs in through Firebase, not the Portal, and its claims are deleted with its data (ADR 0004; API v0.4); a station takes a new key through a setup mode instead of a reflash; and our Google Cloud project is agreed, and is our Firebase project.

**How to read this**

- **Decided** means a file in the repo records it. **Not decided** means nothing does yet, and the answer says who should settle it.
- **[Fill in: name]** marks something only that person knows, such as who tested a prototype. Don't make these up for the report.
- The Single Source of Truth (SSOT) is out of date in several places. Where it disagrees with the repo, the repo wins. The list is in section 0.

**Sources, and the short names used below**

| Short name | File |
|---|---|
| CONTEXT | [CONTEXT.md](../../CONTEXT.md), the project's vocabulary |
| API | [apps/API-AGREEMENT.md](../../apps/API-AGREEMENT.md), v0.4 (approved by Ethan on 10 Oct). If any other document disagrees, this one wins |
| spec | [.scratch/db-hosting/spec.md](../db-hosting/spec.md), the hosting and migration plan (29 Sep, rewritten 7 Oct) |
| map | [.scratch/db-hosting/map.md](../db-hosting/map.md): its "Givens", "Facts" and "Out of scope" sections |
| ADR 0001 | [docs/adr/0001-token-id-is-the-hardware-uid.md](../../docs/adr/0001-token-id-is-the-hardware-uid.md) |
| ADR 0002 | [docs/adr/0002-each-service-logs-in-through-the-portal.md](../../docs/adr/0002-each-service-logs-in-through-the-portal.md) |
| ADR 0003 | [docs/adr/0003-event-service-on-cloud-run-geekykey-service-without-a-database.md](../../docs/adr/0003-event-service-on-cloud-run-geekykey-service-without-a-database.md) |
| ADR 0004 | [docs/adr/0004-the-showcase-logs-in-through-firebase.md](../../docs/adr/0004-the-showcase-logs-in-through-firebase.md) |
| 24 Sep notes | `meeting-notes/[24 Sept 26] NFC token scanner design and interactive activity planning for showcase.md` |
| update 23 Sep | [apps/updates/src/content/entries/2026-09-23-first-end-to-end-tap.md](../../apps/updates/src/content/entries/2026-09-23-first-end-to-end-tap.md) |
| update 27 Sep | [apps/updates/src/content/entries/2026-09-27-hosting-plan-and-two-services.md](../../apps/updates/src/content/entries/2026-09-27-hosting-plan-and-two-services.md) |
| changelog | [apps/updates/src/content/changelog.yaml](../../apps/updates/src/content/changelog.yaml) |
| firmware | [firmware/geekykey_station/geekykey_station.ino](../../firmware/geekykey_station/geekykey_station.ino) and [firmware/token_writer/](../../firmware/token_writer/) |
| SSOT | `Centralised-Capstone-Folder/01_Project Management/Geekykey Single Source of Truth.docx` |
| issue NN | a ticket in [.scratch/db-hosting/issues/](../db-hosting/issues/), e.g. issue 16 = `16-ab-analysis-export.md` |

---

## 0. Read first: what the team needs to settle

1. **Update, 2 Oct: colour-match bingo is the proposed flagship.** It's a person-to-person game, so it closes the gap below if it's built. Its design is in section 4.3 of the updated SSOT (`Geekykey Single Source of Truth (updated 2 Oct 2026).docx`). Until it's decided, answer sections 2, 11 and 14 for both the passport and bingo.

   **What we're building doesn't yet match the problem we say we're solving.** The SSOT says the problem is people not mixing with new people, and sponsors not being visited. What's actually being built is a **passport**: a participant taps their token at stations and collects stamps and points (CONTEXT, "Passport"). That's an interaction between a person and a station. Nothing built or planned makes two participants interact. The API agreement puts "dual-tap connections, leaderboards, or archetype quests" out of scope for the showcase (API §12). Either a person-to-person mechanic gets added, or the report says the MVP tests the platform and the passport, with networking as future work. **Joshua (ideas and report) and Adam need to decide this first.** Most of sections 2 and 9 depend on it.
2. **The SSOT is out of date.** Every row below is wrong, or only partly right, in the SSOT:

   | SSOT says | What's true now | Source |
   |---|---|---|
   | PN532 reader, ESP32-WROOM | RC522 on an ESP32-S3 | firmware header, update 23 Sep |
   | NTAG 424 DNA tags against cloning | NTAG213. We accept that tags can be cloned | ADR 0001, "Consequences" |
   | Docker container on Cloud Run, Hono/Deno, SQLite | Partly right again since 2 Oct: the Event Service is Hono on Node, in a container on Cloud Run. The GeekyKey Service and the screens are Cloudflare Workers. TiDB, with no Deno or SQLite | ADR 0003, spec §3.2 |
   | Wi-Fi access-point setup page on the station | Partly right again since 8 Oct: Wi-Fi and the key are compiled into `secrets.h` today, and a setup mode, from a serial terminal or a browser page, is planned for a new server address, key and Wi-Fi network (HAR-14) | firmware, spec §2 |
   | Showcase on 17 Nov, setup on 16 Nov | Showcase Wed 18 Nov, setup Tue 17 Nov | spec §1, §2 |
   | Puzzle pieces collected from sponsors and swapped | Not built or planned. The passport is | CONTEXT, API |
   | WebSockets (WS) | Polling only | map "Out of scope", API §12 |
   | Roles: Joshua on frontend, Ethan on UI/UX and the token | Ethan leads the frontend. Joshua owns ideas and the report | update 23 Sep (Sprint 1 opens) |

3. **The A/B test isn't booked.** It needs a date from Mr Pang (spec §12).

---

## 1. The current project

**If we had to describe the current GeekyKey MVP in 2–3 sentences, what exactly does it do?**
Each participant gets an NFC token and claims it by tapping it with their phone and logging in, with Google or, if Mr Pang agrees, their GeeksHacking account (ADR 0004). They then tap the token at reader stations around the event. Each accepted tap stamps their digital passport and earns points. Organizers watch the stations and the taps live, and can export the data. Under the hood, the GeekyKey Service checks the station and finds the token's owner. It then passes the tap to the event's own Event Service, so a future event can bring its own games without changing the stations. (CONTEXT; spec §1, §3.3)

**What is the single main problem we are solving?**
On paper it's low cross-group networking, with sponsor engagement second (SSOT §2.1). In what's built, it's engagement and getting people to visit stations. See section 0, item 1. **Not decided.**

**What is the primary user interaction we are actually trying to cause?**
In what's built: person ↔ station, through the token. A station can stand at a sponsor booth, so person ↔ sponsor works if stations are placed there. Person ↔ person isn't built (API §12).

**What part of the current project is non-negotiable for the MVP?**
- Claiming a token
- Tapping it at a station and having the tap recorded
- The passport, with stamps and points
- The organizers' station board, tap log, and the CSV export that feeds the A/B analysis. API §9.6 says the export "must not be cut from scope".
- Logging in, through Firebase at the showcase (ADR 0004)

(spec §6, checkpoints 1–8)

**What features have been explicitly pushed to future work?**
- Entry, exit and food stations (24 Sep notes, map "Out of scope")
- Live sockets (24 Sep notes)
- Station offline sync over 4G, and battery power, at the backend level (map "Out of scope")
- Dual-tap connections, leaderboards and archetype quests (API §12)
- Editing profiles (API §12)
- Switching the GeekyKey Service to the Portal's tag APIs, after the showcase. The showcase's claims are deleted, not moved (spec §6, "After the showcase"; ADR 0004)
- Other teams' Event Services (map "Out of scope")

**What features are currently being built, rather than merely discussed?**
- Adam: moving the backend to TiDB, then to Google Cloud Run (the Event Service) and Cloudflare Workers (the GeekyKey Service). Checkpoint 1 is done, and the production database is ready (BAC-10). Hyperdrive couldn't reach TiDB Cloud on 2 Oct, so the plan was redrawn; checkpoint 2, the move to Cloud Run, comes next (spec §6; ADR 0003; changelog `move-step-1-proof`, `hyperdrive-cannot-reach-tidb`, `move-redrawn-planned`).
- Ethan: the web app's screens. They run on mock data until each endpoint lands (changelog `frontend-api-v0-2`).
- Zi Tao: the station firmware (saving taps, new statuses, HTTPS) and the token writer (changelog `station-saved-taps`, `token-writer`).

**What has actually been prototyped/tested so far?**
- 23 Sep: an ESP32-S3 with an RC522 read real tags and posted them to the backend over Wi-Fi. The result came back to the reader in about 0.2 s (update 23 Sep).
- 25 Sep: the reader got a blue/red LED and a 2-line LCD (update 27 Sep).
- 25 Sep: the web app logged in, showed the dashboard and logged out against the live backend (update 27 Sep).
- 26 Sep: Ethan's testing found five backend bugs, which were fixed (update 27 Sep).
- 30 Sep: the backend ran on Cloudflare's runtime against a local TiDB (changelog `move-step-1-proof`).
- The token writer and the firmware that saves taps have both been tried on hardware (Adam, 2 Oct).

**What can we realistically finish and demonstrate by the actual capstone deadline?**
The plan has all eight checkpoints done, plus a rehearsal on the live system by Sat 7 Nov (spec §6, §10.1). That would mean: claiming tokens on phones, stations around the venue stamping passports, and organizers watching the board live. The outside dependencies left are small: Julian switching `event-api.`'s DNS record to DNS only, which was found proxied on 12 Oct (checkpoint 2), Qing Guan's client for GeeksHacking's login and Mr Pang's yes to offering it (checkpoint 5, with Google sign-in as the fallback), and Julian connecting the Workers (checkpoints 4 and 5). Our Google Cloud project, the address `event-api.` and the Firebase login check were done between 8 and 11 Oct (spec §6, §9). A person-to-person mechanic would be extra work on top, and isn't planned.

**What is our definition of "MVP complete"?**
Not written down as one sentence. The closest thing is the "done when" line of checkpoint 8: the backup and restore have been tried, and the rehearsal ran on production by 7 Nov (spec §6). Suggested wording: "A participant can claim a token, tap it at every station, and see their passport fill in, and organizers can see and export every tap, all on the live system."

**What are we deliberately NOT building?**
The list in API §12 and map "Out of scope":
- more than one event in one Event Service
- dual-taps, leaderboards and archetype quests
- WebSockets
- reading a station key back
- editing or deleting taps
- editing profiles
- entry, exit and food stations
- encrypting the stations' flash
- the Portal's tag APIs, which are Qing Guan's to build

---

## 2. Core game mechanic

**What game mechanic are we currently leaning toward?**
The passport: one stamp slot per station, a stamp for your first accepted tap at a station, and points for every accepted tap after a 5-minute cooldown (CONTEXT "Passport"; spec §5.1 `TAP_COOLDOWN_SECONDS` 300). It's the only game that's built or planned.

**Is the token-matching/puzzle-piece mechanic still the main direction?**
It's in the SSOT summary and in §4.1 of the SSOT, but nothing in the code, the API agreement or the plan builds it. Treat it as **not the current direction** unless Joshua and Adam decide otherwise.

**Is Human Bingo still being considered for the actual MVP, or was it only a concept?**
It's a concept. The mentors liked it on 24 Sep (24 Sep notes §2), and the architecture leaves room for it (spec §3.7). Nobody is building it.

**Are digital pets/trading/battles actually part of the project, or are they future possibilities?**
Future possibilities. They came up on 24 Sep, and the action item was to "develop … further". The architecture can carry them, but trading would need database transactions and live play would need something that holds connections open, such as a Durable Object or the Cloud Run server itself (spec §3.7; issue 04).

**What exactly happens when two participants interact?**
Nothing in the system. There's no person-to-person interaction yet (section 0).

**What does the NFC scan actually accomplish?**
- **At a station:** the reader sends the token's hardware ID. The GeekyKey Service finds the owner and hands the tap to the event. The event records it and decides whether it counts. The station shows the result for about 2 s (spec §3.3).
- **On a phone:** tapping the token opens `https://key.geekshacking.com/t/<UID>`, where you claim it or see that it's yours (spec §3.4).

**Why does the physical token need to exist?**
- It works at a station without unlocking a phone or opening an app.
- It's something physical to hold, which the mentors said sells the showcase best (24 Sep notes §4).
- It stays yours from one event to the next (CONTEXT "Token").

The report needs Joshua's argument here. The repo only records these reasons.

**What can the token do that a QR code or website cannot?**
- A tap at a station needs no phone, no camera and no battery.
- It's faster than scanning a code. We measured about 0.2 s from tap to result (update 23 Sep).
- On a phone, the token opens its own link with no app. iPhones read NFC links natively, which avoids the Web NFC problem in SSOT §2.2.

Whether NFC actually beats QR for networking is exactly what the A/B test measures (SSOT §5).

**What makes the interaction meaningful rather than just "tap someone and get points"?**
Nothing yet. This is the gap in section 0. The 24 Sep notes give a design principle to build on: "give participants something that is useless alone but becomes valuable through interaction with others."

**Does a participant need another person to progress?**
No, not in the passport.

**If yes, what exactly do they need from that person?**
Doesn't apply yet.

**Is there a shared physical goal, such as completing a puzzle?**
No. A physical board that fills up with blocks was an idea on 24 Sep (24 Sep notes §2).

**Is there a digital goal, such as unlocking something?**
Yes: filling every stamp slot, and adding up points.

**Is there a competitive goal, cooperative goal, or both?**
Neither, as built. Points could become competitive with a leaderboard, but leaderboards are out of scope (API §12).

**Which of the four archetypes are we actually designing for in the MVP?**
Completer, through the passport. Explorer, only if stations are hidden around the venue. Social and Griefer aren't served: their mechanics, dual-taps and leaderboards, are out of scope (API §12).

**Which archetype is the primary one?**
Completer.

**What mechanic specifically supports that archetype?**
The stamp slots in the passport (CONTEXT "Stamp slot").

---

## 3. The token itself

**What is the current physical token?**
An NTAG213 NFC tag. We ordered 20, cut down from 100 (update 27 Sep; ADR 0001).

**Is it a puzzle piece, badge, keychain, clip, card, or something else?**
Not decided. The 24 Sep meeting asked for a clip that's easier to 3D-print, and Julian suggested a design like a keyboard keycap (24 Sep notes §1). [Fill in: Ethan or Zi Tao, on what the current housing is.]

**What is the physical form we are actually prototyping next?**
[Fill in: Ethan or Zi Tao.] It was an open question on 24 Sep (24 Sep notes, question 5).

**What is the purpose of the physical form beyond holding the NFC tag?**
Not decided. Ideas so far: something to collect, storytelling at the showcase, and parts that join together (24 Sep notes §2 and §4).

**What does the participant physically do with the token?**
Taps it on stations, and taps it on their phone once to claim it (spec §3.3, §3.4).

**Does the participant keep the token permanently?**
Yes. A token "stays theirs across events" (CONTEXT "Token"). The 27 Sep decision was that a token stays with its owner after the event (update 27 Sep).

**Is the token associated with one participant or can it be reassigned?**
It has one owner at a time. The owner can release it, or a GeekyKey admin can, and then anyone can claim it (CONTEXT "Claim", "Release").

**Can one participant have multiple tokens?**
Yes, up to 3 (spec §4, §5.1 `MAX_TOKENS_PER_USER`).

**Can one token ever belong to multiple participants?**
No. The first claim wins (spec §4).

**Can a token be reset and reused at another event?**
It doesn't need resetting. The same token works at the next event, whose Event Service registers its own stations (CONTEXT "Token", "Station"). To give the token to someone else, release it.

**What happens if someone loses their token?**
They release it on My tokens and claim a new one (CONTEXT "My tokens").

**What happens if someone receives someone else's token?**
Taps still count for the owner, not the person holding it (CONTEXT "Owner"). The token page tells the holder it "belongs to someone else", without saying who. The owner or a GeekyKey admin can release it (spec §3.4).

**How is a token initially registered?**
By claiming it: tap it with your phone (or type its ID), log in (through Firebase at the showcase), and press **Claim** (spec §3.4).

**Phone NFC registration or QR-code registration?**
Phone NFC, with typing the ID as the fallback for phones without NFC (issue 15). The QR-code option from 24 Sep wasn't chosen.

**Who performs registration — participant or organiser?**
The participant, on their own phone.

**Can registration happen without an organiser?**
Yes. The current plan has tokens handed out and claimed at check-in, and that part is still provisional (spec §10.1, §11.3).

**What happens if the token is already registered?**
If it's yours, you see "already yours". If it's someone else's, you see "This token belongs to someone else" (`409 token_taken`) (spec §3.4, §6 checkpoint 6).

**What happens if someone tries to register a token belonging to somebody else?**
It's refused with `token_taken`. Token IDs aren't secret, so someone could claim a token they don't hold before its holder does. We accept that risk, because the real holder can get the claim released (ADR 0001).

**What happens after the event?**
The showcase's claims are deleted with the rest of its data, because its users are Firebase users, not Portal users (ADR 0004). Until then they're in the claims stand-in on our Cloud Run server. Later events keep their claims in the Portal, through its tag APIs (spec §4, §6 "After the showcase"). When the event's own data is deleted is still provisional (spec §11.2).

**Does token → participant association persist across events?**
Not the showcase's: its claims are deleted with its data (ADR 0004). From the events after it, yes, in the Portal (CONTEXT "Token"; map "Out of scope", the Portal's tag APIs).

**If it persists, how is it reused for another event?**
The new event's Event Service registers its own stations. A reader moves to it by sending its saved taps, then taking the new event's key through the station's setup mode, which clears its saved taps (8 Oct, HAR-14). The token needs nothing done to it (spec §3.7).

**If it does not persist, how is it reset?**
Doesn't apply. Release covers handing a token to someone else.

---

## 4. The participant journey

### Before the event

**Does the participant already have an account?**
At the showcase, a Google account is enough, or a GeeksHacking account if Mr Pang agrees to offer that login (ADR 0004). Events after it need a GeeksHacking Portal account (CONTEXT "User").

**Do they already exist in the Geekshacking portal?**
They don't need to for the showcase: its visitors log in through Firebase, and nothing about them reaches the Portal (ADR 0004). Hackathon participants at later events already have Portal accounts. For the A/B test, Firebase's Google sign-in removes the need for one (spec §12).

**Do they receive a token before arriving?**
No. They get it at check-in (spec §10.1, provisional).

**Do they register it themselves?**
Yes.

**Does an organiser register it?**
No. The desk helps if someone gets stuck (spec §10.4).

### At entry

**Is NFC involved at entry?**
Only to claim the token on your phone. There's no entry station.

**Is QR involved?**
Not at entry. QR is the organizers' fallback when a reader fails (API §9.4).

**Is entry tracking part of MVP?**
No (24 Sep notes §1; map "Out of scope").

**If not, should the report explicitly say it is future scope?**
Yes. The client said it isn't a priority, so it's a recorded decision.

### During the event

**What is the first thing the participant does with GeekyKey?**
They tap the token on their phone and claim it.

**What causes them to interact with another person?**
Nothing in the system (section 0).

**What happens when they tap another person's token?**
On their phone, the token page says the token belongs to someone else (spec §3.4). Nothing else happens.

**What does each participant see?**
- **At the station:** the result on its LCD and LED for about 2 s.
- **On their phone:** their passport, with stamps, points and recent taps (spec §3.3; API §8.1).

**What happens physically?**
The station's light and screen change. [Fill in: Zi Tao, on the current colours. The amber colour for `cooldown` is in the station contract, spec §9.]

**What happens digitally?**
The tap goes station → GeekyKey Service → Event Service, and is stored with a status (spec §3.3).

**What gets recorded in the database?**
One `taps` row: station, the participant's user ID (a Firebase ID at the showcase), when it happened, when it arrived, the source (NFC or QR fallback) and the status (accepted, cooldown, no game). The token's ID isn't stored (spec §3.6).

**What reward/progress do they receive?**
A stamp at each station the first time, and that station's points for every accepted tap (CONTEXT "Stamp", "Points").

### At the end

**What does the participant have at the end?**
Their token, and their passport for that event.

**Does anything persist?**
Not from the showcase: its claims are deleted with its data (ADR 0004). When that happens is provisional (spec §11.2).

**Does their token remain linked?**
Until the showcase's data is deleted (ADR 0004).

**What happens to the data?**
Adam keeps a copy at the end of the day for Joshua's analysis. After that, the event's data, its claims and our copies are deleted. **Provisional** (spec §10.1, §11.2).

---

## 5. "Zero-barrier" and friction claims

**What exactly do we mean by "low-friction"?**
Not defined. Suggested: "after a one-time claim, each interaction is one tap, with no phone and no app." The 24 Sep notes say to show "why and how NFC can reduce the number of steps".

**Are we actually claiming "zero barrier"?**
We shouldn't. Claiming needs a login, with Google at the showcase (spec §3.4; ADR 0004).

**What steps does a participant have to complete before their first interaction?**
1. Have a Google account (or, if offered, a GeeksHacking one).
2. Get a token.
3. Tap it with their phone, or type its ID.
4. Log in.
5. Press **Claim**.

**Do they need to log in?**
Yes, once to claim. Opening the passport is a second login, which is one click if Google remembers them (ADR 0002; API §3 "Browser sessions").

**Do they need to register their token?**
Yes. A tap with an unclaimed token is turned away as "Not claimed yet" (spec §3.3).

**Do they need to read/accept anything?**
Nothing is designed. Consent is an open item (section 9).

**Does an organiser need to intervene?**
Normally no.

**How long should initial setup take?**
Not measured or set. Suggest measuring it at the A/B test.

**How long should a normal NFC interaction take?**
About 0.2 s from tap to result, measured on 23 Sep over a hotspot. The result then shows for about 2 s (update 23 Sep; spec §3.3).

**How many steps does NFC remove compared with the alternative?**
Not counted. To compare with QR: unlock the phone, open the camera, scan, open the link, then the page loads. That's about 4–5 steps against 1 tap. Count it properly for the report.

**What is the alternative we're comparing against?**
Condition B, scanning QR codes on the web, and Condition C, networking with no tools (SSOT §5.3).

**Do we have evidence that NFC actually reduces friction in our context?**
No. We only have the 0.2 s latency. The A/B test would give the evidence.

---

## 6. The existing GeeksHacking Portal

**What authentication system does the actual Geekshacking portal currently use?**
It's an OAuth/OIDC provider that already supports the client-credentials flow for services (map "Facts", 28 Sep). User IDs are GUIDs.

**What frontend does it use?**
[Fill in: Qing Guan.] Not recorded.

**What backend does it use?**
It runs as one Cloud Run instance in Singapore, handling one request at a time, and it sleeps when idle (map "Facts"). [Fill in: Qing Guan, on the framework.]

**What database does it use?**
[Fill in: Qing Guan.] The SSOT says MySQL/TiDB, but that hasn't been checked.

**What parts are we integrating with?**
At the showcase, only GeeksHacking's login, as a provider inside Firebase, if Mr Pang agrees (ADR 0004). After it, the Portal's login and its tag APIs for who owns each token (spec §4, §6).

**What parts are we building ourselves?**
The GeekyKey Service, the showcase's Event Service, the claims stand-in until the switch to the Portal, their screens, and the station firmware (spec §3.1).

**Who owns/maintains the portal?**
Qing Guan (spec §3.1).

**Have we actually spoken to the portal lead?**
Yes. Qing Guan and Julian shaped the architecture on 27 Sep, and Qing Guan advised on deploys and hostnames on 28 Sep (map "Givens"). Adam met Julian and Qing Guan on 8 Oct: the showcase logs in through Firebase, the Portal's team agrees with the claims stand-in, and our Google Cloud project is agreed (spec §2). Qing Guan is now asked for a client for GeeksHacking's login inside Firebase (spec §9).

**Do we have API access?**
None is needed before the showcase: the login is Firebase's (ADR 0004), and the tag APIs come after it. They don't exist yet: its draft `NfcTag` has no endpoints (map "Facts"). The request for two OAuth apps is parked until events log in through the Portal (spec §9).

**What information can our system obtain from the portal?**
At the showcase, through GeeksHacking's login inside Firebase, a Firebase user ID, and a name if the login carries one, which is still to ask (API §14). After the showcase, the user's Portal ID and name at login, and the owner of each token.

**What information are we allowed to send back?**
Nothing before the showcase. After it, claims and releases (spec §4). The showcase's claims are deleted, not sent (ADR 0004).

**Are we using OAuth/OpenID Connect?**
At the showcase, Firebase Authentication, with Google sign-in, and GeeksHacking's login as an OpenID Connect provider inside it (ADR 0004). After it, the Portal's OAuth/OpenID Connect (ADR 0002).

**What is our actual authentication flow?**
The screens sign in with Firebase's web SDK and send the ID token to their own service's `POST /auth/firebase`, which checks it against Google's public keys and sets its own cookie: `gk_session` or `event_session` (ADR 0004; API §7.2). Locally, dev-login stands in for this. After the showcase, each service sends the browser to the Portal and gets it back at its own `/auth/callback` (ADR 0002).

**Are we rebuilding authentication anywhere?**
No. Firebase knows the showcase's users, and the Portal everyone's after it. Each service only checks the login and sets its own cookie (ADR 0002, ADR 0004).

**If yes, why?**
Doesn't apply.

---

## 7. Database

**What database are we actually using for the MVP?**
TiDB (map "Givens").

**TiDB, Firestore, Firebase, SQLite, something else?**
TiDB Cloud Starter, on Alibaba Cloud in Singapore. SQLite was used until checkpoint 1 (spec §3.6, §6 checkpoint 1).

**Why was that database selected?**
The mentors asked us to use what GeeksHacking already runs, with TiDB first, and not to add Turso (24 Sep notes §1; update 27 Sep).

**Is the database part of Geekshacking's existing infrastructure or ours?**
GeeksHacking's. It's their cluster, with our own database `geekykey` inside it (spec §3.6).

**Are we creating a separate event database?**
No. One database, `geekykey`, holds the Event Service's tables and, until the switch to the Portal, the claims stand-in's `tokens`. The GeekyKey Service has no database (spec §1, §3.6).

**Are we using the existing portal database?**
No (spec §3.1).

**What data does our system actually need to store?**
Per event: its stations, users' IDs and names, taps, and the passport's settings. And token claims, in the claims stand-in until the switch to the Portal's tag APIs after the showcase (spec §3.1, §3.6).

**What tables/entities do we need?**
`stations`, `users`, `taps` and `passport_stations` in the Event Service, and `tokens` in the claims stand-in (spec §3.6 has the full table).

**How are users represented?**
By the user ID their login gives, a Firebase ID at the showcase, with a display name copied in at login (spec §3.6 `users`).

**How are tokens represented?**
By the chip's hardware ID, with the owner and when they claimed it, in the claims stand-in (ADR 0001; spec §3.6 `tokens`).

**How are events represented?**
Each event is its own Event Service, listed in the GeekyKey Service's settings. Each Event Service registers its own stations, and a station feeds the one that registered it (spec §3.1, §3.5, §5.1 `EVENT_SERVICES`).

**How are interactions represented?**
As taps (spec §3.6 `taps`).

**How are rewards/progress represented?**
They're worked out from taps every time they're read, and never stored (spec §10.3).

**How is token reassignment handled?**
Releasing deletes the claim, and the next person claims it (spec §3.6, §4).

**What happens to data after an event?**
Provisional (spec §11.2). See section 4.

**Do we need multi-event persistence for MVP?**
Only for token claims. Event data doesn't carry over.

**What is the actual deployment architecture?**
Two platforms (spec §3.2; ADR 0003):
- `event-service` on Google Cloud Run at `event-api.geekshacking.com`: a Node server that reaches TiDB through an ordinary `mysql2` connection pool. Until checkpoint 4 it's the whole backend, and stations call it. It also runs the claims stand-in. Its staging copy, `event-service-staging`, runs beside it against its own database.
- Three Cloudflare Workers: `geekykey-service` at `key-api.geekshacking.com`, with no database, from checkpoint 4; `geekykey-web` at `key.geekshacking.com` and `event-web` at `event.geekshacking.com`, from checkpoint 5.

Hyperdrive was dropped on 2 Oct, because it can't sign in to TiDB Cloud (map "Out of scope").

**Are containers actually required?**
Yes, for the Event Service: Cloud Run runs it as a container image. The Workers need none (spec §6 checkpoint 2).

**Is Cloud Run actually being used?**
Yes, for the Event Service, since 2 Oct, after Hyperdrive couldn't reach TiDB Cloud. Julian had chosen Workers on 25 Sep (map "Givens"; ADR 0003). It runs in a Google Cloud project of our own, agreed on 8 Oct: our existing Firebase project, `geekykey-b035a` (spec §3.2).

**Is the frontend/backend in one container or separate?**
Separate. The screens are Workers, and so is the GeekyKey Service from checkpoint 4. The Event Service is on Cloud Run (map "Givens"; spec §3.2).

---

## 8. Offline functionality

**Does the MVP need to work without internet?**
The station must keep taps through a dropped connection. Nothing else works offline (spec §3.3, "Why taps wait"; changelog `station-saved-taps`).

**Which exact functionality must work offline?**
Reading taps at a station and keeping them until they can be sent. Claiming and the passport need internet.

**Does NFC scanning itself work offline?**
Yes. The reader reads the chip without a network.

**Does the scanner store scans locally?**
Yes: up to 100 taps (changelog `station-saved-taps`). Tried on hardware (Adam, 2 Oct).

**Where are they stored?**
In the ESP32's flash, which survives a power cut (changelog `station-saved-taps`).

**How much data needs to be stored?**
Up to 100 taps per station. Each is a tap number, the chip ID and a time (firmware `QUEUE_CAPACITY`).

**What happens when connection returns?**
Saved taps go out together at most once a minute, and new taps go at once (API §6.1).

**How do we prevent duplicate uploads?**
Each tap carries the station's own tap number (`client_tap_id`). The event drops any repeat as `duplicate` (spec §3.3 step 6).

**What happens if the device loses power before synchronising?**
The taps are in flash, so they're sent after the restart. The tap counter is also saved before each tap (API §6.1 `client_tap_id`; update 23 Sep).

**Is 4G actually being implemented or just investigated?**
Only investigated (24 Sep notes §3; map "Out of scope").

**Is battery power actually being implemented?**
No, as far as the repo shows. The SSOT's parts list includes power banks. [Fill in: Zi Tao.]

**What happens if venue Wi-Fi fails?**
Stations keep their taps and resend them later. Phones can't claim or see passports. If a reader dies, the desk has the QR fallback (spec §10.4).

**Is offline mode an MVP requirement or a future enhancement?**
Saving taps at the station is MVP. Full offline mode (4G, battery) is future.

---

## 9. Scanner hardware

**What exact NFC reader are we using?**
RC522 (firmware header).

**RC522 or PN532?**
RC522. The SSOT prefers the PN532.

**Why that one?**
It was readily available (Adam, 2 Oct). It reads NTAG213 UIDs, which is all we need, because we don't use NTAG 424.

**What microcontroller are we using?**
ESP32-S3 (firmware header).

**ESP32 or RP2040?**
ESP32-S3.

**Why?**
Built-in Wi-Fi (SSOT §3.1). [Fill in: Zi Tao.]

**How does the scanner communicate with the backend?**
Over Wi-Fi, with HTTP to a laptop today. In production it will use HTTPS: to `event-api.geekshacking.com` from checkpoint 2, then to `key-api.geekshacking.com` through the station's setup mode at checkpoint 4 (spec §9 "Zi Tao"; API §6.1; update 23 Sep).

**Wi-Fi, USB, Web Serial, WebUSB, something else?**
Wi-Fi.

**Which configuration method are we actually implementing?**
The Wi-Fi details, the station key and the server address go in a `secrets.h` file, which is compiled into the firmware (firmware header).

**Wi-Fi access point or USB configuration?**
Neither. It's set when the firmware is flashed over USB. The access-point setup page in the SSOT isn't built.

**Does the scanner require a laptop?**
Only to flash it. Locally, the backend also runs on a laptop. In production, it doesn't need one.

**Does it require a phone?**
No. A phone hotspot was used as the Wi-Fi in testing (update 23 Sep).

**Does it require internet?**
To send taps, yes. Without internet it saves them (section 8).

**What happens when it cannot connect?**
It saves the tap and shows it wasn't recorded yet. It retries alongside its once-a-minute check-in (API §6.1).

**How is the scanner powered?**
Over USB. [Fill in: Zi Tao, on power banks.]

**What is the expected scanning distance/time?**
About 0.2 s from tap to result (update 23 Sep). [Fill in: Zi Tao, on distance. The RC522 with NTAG213 is typically a few centimetres.]

**Can two tokens be scanned simultaneously?**
No. The reader picks one card at a time.

**If not, how does the physical design prevent that?**
A slot that lets only one token in at a time was suggested (24 Sep notes §2). It isn't built.

**How many scanners are required for the MVP?**
Not decided. The SSOT's parts list has 4. The free-plan estimate assumed 20 (spec §11.1; `.scratch/db-hosting/assets/message-to-julian-workers-requests.md`, part 3).

**What hardware have we actually tested successfully?**
ESP32-S3 + RC522 + NTAG213 tags + the LED and LCD (update 23 Sep, update 27 Sep).

---

## 10. Actual testing

**What prototypes have we physically built?**
One reader station: ESP32-S3, RC522, LEDs and an LCD. [Fill in: Zi Tao and Ethan, on any token housings or enclosures.]

**What did we test on each prototype?**
Reading tags, posting taps to the backend, finding the backend by name, and the LEDs and LCD (update 23 Sep, update 27 Sep).

**Who tested it?**
Adam and Zi Tao on 23 Sep. Ethan tested the backend through the web app on 26 Sep.

**How many people tested it?**
Only the team. No outside users yet.

**What specifically did we observe?**
Taps came back in about 0.2 s. Seven taps were lost when the hotspot changed the laptop's address (update 23 Sep).

**What failed?**
- The fixed address. Fix: find the backend by name.
- No saving taps when the network drops. Fix: saved taps, on 29 Sep.
- Five backend bugs (update 27 Sep).

**What measurements did we collect?**
The 0.2 s tap-to-result time. Local TiDB starts in about 1.5 s and uses under 500 MB (changelog `dev-test-ci-planned`).

**What user feedback did we collect?**
Only the mentors' feedback on 24 Sep, for example that throwing games weren't well received (24 Sep notes §2). None from participants.

**What changed because of the testing?**
- Identifying tokens by hardware ID instead of text written on them.
- Finding the backend by name.
- `400` instead of `500` for bad requests.
- Saving taps.

(update 23 Sep)

**Which concept was eliminated because of evidence?**
Throwing games, from the mentors' feedback (24 Sep notes §2). Identifying tokens by text written on them was dropped after testing, because anyone can rewrite that text (update 23 Sep).

**Which concept improved because of evidence?**
How the station identifies tokens and finds the backend (update 23 Sep).

**Have we tested the actual networking behaviour?**
No.

**Have we tested whether strangers actually interact?**
No. That's the A/B test.

**Have we tested whether participants understand what they're supposed to do?**
No.

**Have we measured interaction time?**
Only the machine time: 0.2 s.

**Have we measured setup time?**
No.

**Have we tested accessibility?**
Only the web app's keyboard and phone use (update 27 Sep).

**Have we tested reliability?**
Only the backend's automated tests. No long runs on hardware.

**Have we tested NFC scanning repeatedly?**
Informally on 23 Sep. [Fill in: Zi Tao.]

**Have we tested offline recovery?**
Saving and resending taps has been tried on hardware (Adam, 2 Oct). [Fill in: Zi Tao, on what was tried, such as pulling the power or Wi-Fi.]

---

## 11. Token-matching mechanic

None of this is built or planned. Profile editing is out of scope, and names come from the login (API §12). These answers are true of the current design. If the team picks a matching mechanic, they all need new answers.

**Are participants actually going to answer profile questions?**
No.

**What questions?**
None.

**Who chooses the questions?**
Doesn't apply.

**Are the questions fixed or event-specific?**
Doesn't apply.

**How many questions?**
Doesn't apply.

**What counts as a match?**
There's no matching.

**How many matches are required?**
Doesn't apply.

**What happens when they match?**
Doesn't apply.

**What happens when they don't match?**
Doesn't apply.

**Does the participant know why they matched?**
Doesn't apply.

**Does the system reveal their shared interests?**
No.

**Does the system reveal any personal information?**
No. Other participants see only "belongs to someone else" (spec §3.4).

**How is consent handled?**
See section 12.

**Can someone opt out?**
Only by not claiming a token.

**What prevents someone from repeatedly scanning random people?**
There's nothing to gain from it. The token page shows no name.

**What prevents gaming the system?**
- The 5-minute cooldown per station.
- Repeat taps are dropped.
- At most 3 tokens per person.
- Rate limits.

Cloning a tag is possible and accepted (ADR 0001; spec §4, §5.1).

**What physical feedback does the token provide?**
None. The token is passive, and the station gives the feedback.

**Is there a puzzle piece involved?**
No.

**Does the puzzle piece represent the successful interaction?**
Doesn't apply.

**What makes someone want to continue doing it after the first interaction?**
Filling the passport, and earning more points after the cooldown.

---

## 12. Privacy and consent

**What participant information is stored?**
User ID (a Firebase ID at the showcase), display name, and each tap's station and times (spec §3.6).

**What information is visible to other participants?**
Nothing about anyone else (spec §3.4).

**What information is visible to organisers?**
The tap log and the export: user ID, display name, station and times (API §9.6).

**What information is visible to sponsors?**
Nothing. Sponsors have no view.

**What information is never exposed?**
- Token IDs to the Event Service (spec §3.1).
- Keys, cookies and names in logs (spec §6 checkpoint 3).
- Phone numbers, which we never collect.

**What requires explicit consent?**
Not designed. The 24 Sep notes ask that personal details are shared only with people a participant has chosen.

**Can participants disable profile sharing?**
There's no profile sharing to disable.

**Can participants revoke permission?**
They can release their token.

**Can someone see who scanned them?**
No.

**Is phone number sharing ever enabled?**
No.

**How is consent represented technically?**
It isn't, yet. [Gap: decide with Joshua.]

**How long is participant data retained?**
Until the event's data is deleted after the showcase. Provisional (spec §11.2).

**What happens to the data after the event?**
See section 4.

**Can a participant request their data to be removed?**
Nothing is built for it. Adam can delete it by hand (spec §10.3). [Gap.]

---

## 13. Scope

**What is absolutely essential?**
Claiming, taps, the passport, the organizers' board and export, and the login (section 1).

**What is useful but optional?**
- The QR fallback.
- Creating, rekeying and disabling stations on the station board. Until checkpoint 7 builds them, Adam sets up stations with one-off scripts (spec §6 checkpoint 3).
- The once-a-minute check-in and its reader check.

**What is future work?**
Section 1's "pushed to future work" list.

**What are we currently building that we could delete?**
Nothing obvious. The two-service split costs effort, but Julian asked for it (map "Givens").

**Are digital pets necessary?**
No.

**Are battles necessary?**
No.

**Is trading necessary?**
No.

**Is Human Bingo necessary?**
No, unless it becomes the person-to-person mechanic (section 0).

**Are sponsor stations necessary?**
Only as normal stations placed at sponsor booths.

**Are entry/exit stations necessary?**
No.

**Is live sockets functionality necessary?**
No.

**Is 4G necessary?**
No.

**Is offline mode necessary?**
Only saving taps at the station.

**Is multi-event persistence necessary?**
Only for token claims.

**Is the admin dashboard necessary for MVP?**
The organizers' station board is. Since 7 Oct it's also where stations are created and disabled, and there are no GeekyKey admin screens: a GeekyKey admin only releases tokens, on the token page (API §10).

**Is the public profile necessary?**
No. None is planned.

**Is the showcase version different from the actual MVP?**
They're the same build. The showcase is the MVP running live (spec §10).

---

## 14. Success criteria

**How will we know GeekyKey actually works?**
Technically: the rehearsal by 7 Nov (spec §10.1). As a product: the A/B test (SSOT §5).

**What does "successful networking" mean?**
The SSOT measures unique cross-group connections per user, and a connectedness score on a 1–5 scale (SSOT §5.3). The passport records taps at stations, not connections between people. That's the section 0 gap again.

**How will we measure interaction?**
With the tap export (API §9.6) and a post-event survey.

**What counts as a successful interaction?**
An `accepted` tap, as built.

**Are we measuring number of new people interacted with?**
That's the SSOT's plan, but the system can't log it today.

**Are we measuring time spent interacting?**
No.

**Are we measuring participant-reported connectedness?**
Yes, through the survey (SSOT §5.3).

**Are we comparing GeekyKey against a baseline?**
Yes. Condition B is QR codes and Condition C is no tools (SSOT §5.3).

**What is the baseline?**
Condition C, networking with no tools.

**Are we still planning an A/B test?**
Yes, but it isn't confirmed (spec §12).

**Where would the test happen?**
An SSTInc or CCA session, between 5 and 18 Oct (spec §12).

**Who would participate?**
SST students.

**How many participants can realistically be tested?**
The SSOT's number didn't survive the export. [Fill in: Joshua.] We have only 20 tokens (update 27 Sep).

**What data can we collect before the report deadline?**
The tap export and the survey, if the test runs in Sprint 2. It needs participants to log in, which Firebase's Google sign-in now allows without the Portal (spec §12).

**What would count as evidence that the design needs changing?**
Not defined. Suggested:
- No significant difference between A and B.
- Low survey scores.
- Many "Not claimed yet" taps.
- Long setup times.
