# Spec: GeekyKey on Cloudflare Workers, Cloud Run and TiDB

The hand-off spec for the map [Move GeekyKey to TiDB and Cloudflare](map.md), written on 29 Sep 2026 from its resolved tickets, and rewritten on 7 Oct 2026 after the map was redrawn. **Adam reviews this spec before any code changes.**

> **Rewritten 7 Oct 2026.** Checkpoint 2 couldn't be done as first written: Hyperdrive can't reach TiDB Cloud. On 2 Oct the Event Service moved to Google Cloud Run with TiDB, and the GeekyKey Service stays on Workers with no database ([ADR 0003](../../docs/adr/0003-event-service-on-cloud-run-geekykey-service-without-a-database.md)). The answers of the redrawn map's tickets are folded in here, from "What does Cloud Run "v1" mean, and what does running the Event Service there involve?" to "How is the Event Service built, deployed and staged on Cloud Run?". Checkpoint 1 is done. Several decisions are provisional until Adam meets Julian and Qing Guan on Thu 8 Oct; section 11.3 lists them.

> **Updated 8 Oct 2026,** after Adam met Julian and Qing Guan ([the agenda, with the answers](../meetings/2026-10-08-julian-and-qing-guan.md)). Five things changed: the showcase logs people in through Firebase, not the Portal ([ADR 0004](../../docs/adr/0004-the-showcase-logs-in-through-firebase.md)); the Google Cloud resources are set up by hand, with no infrastructure as code for now; a station takes a new key through a setup mode instead of a reflash; the backend freezes a week before the showcase; and a stress test comes before it. The claims stand-in and our own Google Cloud project are agreed. "The 8 Oct answers" in section 2 lists everything, and section 12 what's still open.

> **Updated 9 Oct 2026** (BAC-18): the Event Service's Google Cloud project is our existing Firebase project, `geekykey-b035a`, with billing on, rather than a new one. Adam is Editor there, which lets him create resources but not grant access. So he ran the runbook's steps 1 to 5 (the APIs, the image repository, the service accounts, the empty secrets and the two services, closed to callers), and the grants need more. So Julian, as Owner, gives Adam a role that can grant, and Adam runs the keyless sign-in, each account's access, opening the services and Logs Viewer himself (steps 6 to 8); Julian runs the domain mapping and the budget (steps 9 and 10), in the web console. Each deploy account reads only its migration login; each service reads its other secrets as its own account. Adam settled three more things the same day: the project's billing account is GeeksHacking's, Julian adds the DNS record for `event-api.` once we're ready, and Zi Tao doesn't get the logs.

> **Updated 13 Oct 2026** (BAC-30): each Event Service keeps its session secret, app login and two keys in one Secret Manager secret, `APP_SECRETS`, as JSON, at Julian's suggestion. The project then stores 4 secret versions instead of 10, inside Secret Manager's free 6. The migration login stays a secret of its own. Adam's account can no longer grant access or read a secret, so Julian gives each service access to its `APP_SECRETS` (section 12).

- It says what we build, and in what order. Why we chose it, and what we turned down, is in the ticket each section links to.
- **Provisional** marks a decision that can still change, and says what would change it. Everything else is decided.
- **The spec's call** marks a gap that no ticket settled, which this spec had to fill to put the steps in order. Section 2 lists every one of them for review.
- Words such as token, claim, owner, registered stations and hand-off mean what [CONTEXT.md](../../CONTEXT.md) says. Field names and status codes live in [apps/API-AGREEMENT.md](../../apps/API-AGREEMENT.md), whose version 0.3 carries this rewrite and version 0.4 the Firebase login (section 7).

## Contents

1. [In short](#1-in-short)
2. [For Adam's review](#2-for-adams-review)
3. [The architecture](#3-the-architecture)
4. [Claims behind one module](#4-claims-behind-one-module)
5. [Settings, secrets and bindings](#5-settings-secrets-and-bindings)
6. [The migration plan](#6-the-migration-plan)
7. [The API agreement](#7-the-api-agreement)
8. [Edits to the README and other docs](#8-edits-to-the-readme-and-other-docs)
9. [What each person needs from us](#9-what-each-person-needs-from-us)
10. [Event day](#10-event-day)
11. [Provisional](#11-provisional)
12. [Still to confirm](#12-still-to-confirm)
13. [Sources](#13-sources)

---

## 1. In short

- **Three kinds of service.** The Portal, Qing Guan's, knows who every GeeksHacking user is. At the showcase, people log in through Firebase instead, with Google or with GeeksHacking's login (ADR 0004). The GeekyKey Service is what stations and tokens talk to: it checks each station's key against the stations the Event Services have registered, finds each token's owner, and hands taps on. An Event Service runs one event's games and registers that event's stations. We build the GeekyKey Service, and one Event Service for the capstone showcase, whose first game is the passport.
- **Two platforms.** The GeekyKey Service and both sets of screens are Cloudflare Workers in GeeksHacking's account, which Julian sets up, and the team has no access to it (1 Oct 2026). The Event Service is a Node server on Google Cloud Run, which GitHub Actions deploys on every merge to `main`, in a Google Cloud project of our own on GeeksHacking's billing account (8 Oct), which turned out to be our existing Firebase project, `geekykey-b035a` (9 Oct). Its resources are set up by hand for now, from written commands.
- **One TiDB database,** reached only from Cloud Run through an ordinary `mysql2` connection pool. The GeekyKey Service keeps no database: it keeps a copy in memory of the registered stations, and asks for everything else.
- **Claims stay on our side through the showcase,** in a claims stand-in on our Cloud Run server, behind one module, `Claims`, and the GeekyKey Service moves to the Portal's tag APIs after it (Julian agreed on 8 Oct). The showcase's claims are deleted with its data rather than copied, since its users are Firebase users (ADR 0004). The stand-in isn't part of the Event Service, so token IDs never reach one.
- **Four addresses,** chosen by Julian on 1 Oct 2026. Stations call `https://key-api.geekshacking.com`. People open `https://key.geekshacking.com` for the token page and My tokens, and `https://event.geekshacking.com` for the passport and the organizers' screens. `https://event-api.geekshacking.com` is the Event Service's own, called by the GeekyKey Service and by the Event screens' Worker.
- **Staging** is one copy of the Event Service, `event-service-staging`, beside it on Cloud Run, against its own database.
- **Move first, split second.** Today's backend already runs on TiDB (checkpoint 1). It moves unchanged to Cloud Run and is deployed. Then the line between the two services is drawn inside it. Then the GeekyKey Service is cut out as a Worker, and stations move to it. Login, the new features and getting ready for the day come after that. The whole move is eight checkpoints (section 6).
- **Dates.** The showcase is on Wed 18 Nov 2026 at Ngee Ann Polytechnic, with setup there on Tue 17 Nov. The rehearsal on production is by Sat 7 Nov, the backend freezes from Wed 11 Nov, and the last merge is on Mon 16 Nov. GeeksHacking's Cloudflare account stays on the free plan, which Adam accepts for the showcase (7 Oct), and the rehearsal checks it (section 11.1).

## 2. For Adam's review

### The 8 Oct answers

From the meeting with Julian and Qing Guan on Thu 8 Oct, and Adam's calls on them the same day. [The agenda](../meetings/2026-10-08-julian-and-qing-guan.md) has each question beside its answer.

1. **Our own Google Cloud project,** on GeeksHacking's billing account. Julian creates it and sets up the keyless sign-in from GitHub. *Since 9 Oct:* it's our existing Firebase project, `geekykey-b035a`, where Adam is Editor (section 12). The roles are as proposed: Adam deploys, adds secret values and reads logs; Ethan gets Logs Viewer; Joshua gets none. Zi Tao was to get Logs Viewer too, until Adam dropped it on 9 Oct.
2. **No infrastructure as code for now.** Julian would rather the architecture firmed up and the MVP ran first: set the services up by hand, then turn the glue into code. Pulumi is "nice if we have the time but not really needed". So the resources are made by hand with `gcloud`, and every command goes into a runbook, `infra/README.md`, from which code can be written later (the spec's call). The GitHub Actions deploy with keyless sign-in stays (Adam), and it sets the service's settings and pins its secret versions from files in the repo (`--env-vars-file`, `--set-secrets`), so they still change through a reviewed pull request (the spec's call). The warm instance is switched with a `gcloud` command from the runbook, not a reviewed change.
3. **Cloud Run "v1".** Julian finds v2 costs noticeably more, so we stay on v1 unless we need a v2 feature. We read this as the domain mapping through Cloud Run's v1 interface, which the setup uses anyway, and the first-generation execution environment. The cold start is measured on the first generation only.
4. **The claims stand-in is agreed** ("it should be ok"), and the Portal's team agrees with the approach. After the switch, Julian asked whether the Cache API can keep an owner for an hour, or else to use Redis or KV. It can: it keeps an entry for as long as its `max-age`. But each data centre keeps its own copy, and a delete clears only the copy in the data centre that runs it, so the longer the time, the longer a release can go unseen elsewhere. The time is chosen at the switch (section 4).
5. **No reflash to move a reader.** Julian wants a station set up from a terminal or a browser page instead of being reflashed. So the firmware gains a setup mode that takes a new server address, station key and Wi-Fi network without a reflash (Adam added the Wi-Fi, since every venue has its own), and clears the saved taps when the key changes (Zi Tao, HAR-14, before checkpoint 4). Stations move to `key-api.` through it at checkpoint 4, and a replaced key on event day goes in through it too. `no_event` stays retired.
6. **The showcase logs in through Firebase** ([ADR 0004](../../docs/adr/0004-the-showcase-logs-in-through-firebase.md)). Google sign-in for anyone, and GeeksHacking's login as an OIDC provider inside Firebase for people with a GeeksHacking account. Its users aren't stored in GeeksHacking's database, so taking the showcase down leaves no mess in the Portal. We use our existing Firebase project, and Julian links GeeksHacking's billing account to it, which the OIDC provider needs. A user ID at the showcase is a Firebase UID. Adam checks with Mr Pang about offering GeeksHacking's login at the showcase.
7. **The showcase's claims are thrown away,** with the rest of its data. A Firebase UID isn't a Portal user, so "Copy claims to the Portal" goes, and the Portal's tag APIs start empty.
8. **How each service checks a Firebase login is provisional:** whether a Worker can do it well enough (Adam: "it depends, see if Workers works out"). The spec's call, until the check before checkpoint 5 (BAC-20): the screens sign in with Firebase's SDK, send the ID token to their own service, which checks it against Google's public keys and sets its own cookie, so ADR 0002's rule that each service logs users in itself still holds. *Settled 10 Oct:* a Worker checks the login in about 1 ms of CPU, so this stays (BAC-20, checkpoint 5).
9. **Housekeeping.** Julian agreed to disconnect Workers Builds from `apps/backend`, and to make the repo public and protect `main`. The first looks done, since Workers Builds hasn't built `main` since 8 Oct. The second isn't done yet. His two diagrams in `assets/` may be public. He makes sure `key.geekshacking.com/t/` keeps working, and `key.` never changes. Only he can use the TiDB console, and he'll be at the showcase. At the split, the Event Service's repo goes under the GeeksHacking organisation.
10. **The freeze moves earlier** (Julian suggested two weeks; Adam chose one). The backend freezes from Wed 11 Nov: only fixes merge after it. The last merge of all is on Mon 16 Nov, so nothing deploys the night before the showcase.
11. **A stress test before the showcase,** on staging, and rate limiting before it, which isn't built yet (checkpoint 8, BAC-21). Julian also raised a server-side queue for taps. It's in the backlog (BAC-22), and the stress test decides whether we need it (section 12).
12. **Two ideas stay open.** The meeting suggested a 15-minute cooldown in place of 5; it stays at 5 until Adam decides (section 12). The token page sending its owner straight to the ongoing event, and later the Portal listing active events, is in the backlog (BAC-23, section 3.7).
13. **Polling stays.** The screens keep polling every few seconds; server-sent events aren't needed at this size.

Still unanswered: the budget alert, what the QR fallback scans, how the team sees the GeekyKey Service on the day, the showcase's hours, and the Workers free plan questions (section 12).

### The spec's calls, 7 Oct

No ticket settled these. The rewrite needed them to put the steps in order.

1. **The order of the redrawn checkpoints** (section 6): checkpoint 2 is the move to Cloud Run, checkpoint 3 draws the line inside the one server, and checkpoint 4 cuts the GeekyKey Service out as a Worker. Stations call `event-api.` from checkpoint 2 and move to `key-api.` at checkpoint 4, through the setup mode since 8 Oct.
2. **Inside one server, the sides talk through their own requests.** At checkpoint 3, the GeekyKey side reaches the Event side and the claims stand-in through `app.request()` in the same process, with the same paths, bodies and keys it will send over HTTPS after the split. So the wire shapes and the key checks run on production before the split.
3. **`event_stations` goes.** The Event Service now owns `stations`, so the cooldown locks the station's own row, as checkpoint 1 already does.
4. **The heartbeat hand-off answers `204`,** and carries the station's optional fields as the station sent them (section 7).
5. **The claims stand-in's routes,** under `/claims-stand-in/v1` (section 4). The fifth, read-only route for "Copy claims to the Portal" went on 8 Oct.
6. **The Event Service's own rate limit is counted in each instance's memory,** since Cloud Run has no rate limiting binding. With at most two instances, one user can get up to 120 requests a minute through (section 5.1).
7. **Staging deploys through a second service account,** which can touch only `event-service-staging` and its secrets. That lets the staging workflow run from any branch while production's keyless sign-in stays limited to `main` (section 5.2).
8. **The token page's calls also get 4 seconds,** the same deadline as a tap, since a cold start lands on them too.
9. **The organizers' station endpoints keep the GeekyKey admin endpoints' shapes,** moved to the Event Service without the link (section 7).
10. **Before the evening-before clear, every station must show 0 saved taps,** because there are no links left to restart (section 6, checkpoint 8).

### The 29 Sep calls, and what became of them

1. ~~The single Worker is `geekykey-service` from its first deploy.~~ *Replaced on 7 Oct.* The first deploy is the Cloud Run server at `event-api.` `geekykey-service`, which Julian created on 1 Oct with `key-api.` attached, first deploys at checkpoint 4. The two screens Workers still first deploy at checkpoint 5, once login works.
2. **The order of the checkpoints:** redrawn on 7 Oct (call 1 above).
3. **New endpoints are built once, in the service that owns them.** Still holds. Checkpoints 1 to 4 add only what the split needs: the hand-off, the heartbeat and its hand-off, the registered stations and the claims stand-in's calls. Everything else waits for checkpoints 6 and 7.
4. **Reshaping the tables keeps the migration rule:** add first, switch the code, drop later. Still holds. Production holds only test data until the rehearsal, so rows that no longer fit are deleted, not converted.
5. ~~Adam deploys by hand until `main` is protected.~~ *Replaced on 1 Oct, then on 7 Oct:* GitHub Actions deploys the Event Service on every push to `main`, with its migrations in the same job, and Workers Builds deploys the Workers.
6. ~~`Claims.claim` gains `limit_reached`.~~ *Replaced on 5 Oct:* the claim route checks `tokensOf` before `claim` (section 4).
7. **Paths for the new endpoints, and three names.** Still holds: the GeekyKey Service's `GET /api/v1/me`, `token_taken`, and the Event Service's `/me` keeping `user.role`.
8. **Two table names.** `passport_stations` stays; `event_stations` goes (call 3 above).
9. **The rate limits' binding names and namespace IDs.** Three remain, on `geekykey-service` (section 5.1).
10. ~~Two more numbers for the decision on Paid.~~ *Replaced on 7 Oct:* the numbers that matter now are in section 11.1.
11. **The team's rules go in the README,** in a "Deploying" section. Still holds, rewritten for two platforms (section 8.1).

### Found while writing the spec, with Adam's answers (29 Sep)

- **The showcase's date:** setup on Tue 17 Nov and the showcase on Wed 18 Nov. The Single Source of Truth's roadmap still says 17 Nov, and needs correcting.
- **The Sprint 2 A/B test.** It isn't confirmed yet (section 12), so the checkpoints don't wait on it.
- **Before the repo goes public,** Julian is asked whether his two diagrams in `assets/` can be public. `meeting-notes/` is never committed (BAC-7).

---

## 3. The architecture

### 3.1 The services, and who owns what

| Service | Built by | Runs on | Owns | Its tables |
|---|---|---|---|---|
| **Portal** | Qing Guan | Cloud Run, in GeeksHacking's project | Who each GeeksHacking user is. After the switch, also who owns each token | The Portal's own |
| **Firebase Authentication** | Google, set up by Adam | Our existing Firebase project, on GeeksHacking's billing | Who each user is at the showcase: Google sign-in, and GeeksHacking's login as an OIDC provider (ADR 0004) | None of ours |
| **GeekyKey Service** | Adam | Cloudflare Workers | Checking station keys, the station's clock, finding each token's owner, handing taps and heartbeats on, the token page, My tokens, the GeekyKey admins | None. A copy in memory of the registered stations |
| **Claims stand-in** | Adam | Cloud Run, on our Event Service's server, until the switch | Who owns each token, until the switch | `tokens` |
| **Event Service** (the showcase) | Adam | Cloud Run | Its stations (IDs, keys, labels, health, disabling), taps, dropping replays, the cooldown, the passport (stamp slots, stamps, points), per-event users, the organizers, the station board, the tap log, stats, the export, the QR fallback | `stations`, `users`, `taps`, `passport_stations` |

The rules that hold the split together:

- The GeekyKey Service never knows about games, and keeps no database. The Event Service never sees a token's ID, only users.
- Each Event Service registers its own stations and issues their station keys. A station feeds the Event Service that registered it, so there are no links. A reader moved to another event becomes a new station there, given the new event's key through the firmware's setup mode, which clears its saved taps (8 Oct).
- A tap by an unclaimed token stops at the GeekyKey Service. It gets `unknown_token` and a log line, and is stored nowhere.
- The user ID is the one the login gives: a Firebase UID at the showcase (ADR 0004), and the Portal's user ID once events log in through the Portal. Every "user ID" below means this. The GeekyKey Service keeps no users.
- Organizer is a role at one event, from a list in the Event Service's settings, and organizers look after their event's stations. GeekyKey admin is a GeeksHacking role, from a list in the GeekyKey Service's settings, and its one job is releasing someone else's token. At the showcase they're the same people.
- Only the GeekyKey Service calls the claims stand-in, with a key of its own. It isn't part of what an Event Service offers, and other teams' Event Services never build one.

Sources: [Which parts of today's backend belong to the GeekyKey Service, and which to the Event Service?](issues/12-backend-split.md), [Which screens belong to which service, and how does each know who is logged in?](issues/15-screens-and-login.md), [Who registers stations, where is a station key checked, and how does the GeekyKey Service know which Event Service a station feeds?](issues/24-stations-without-a-database.md), [Where do token owners live until the Portal's tag APIs exist, and what does the token page do?](issues/23-token-owners-before-portal.md)

### 3.2 Where each part runs

| Part | Platform | Package | Serves | Address | Reaches |
|---|---|---|---|---|---|
| `geekykey-service` | Worker, from checkpoint 4 | `apps/geekykey-service` | Stations, and the GeekyKey screens' `/api` and `/auth` | `key-api.geekshacking.com` | Each Event Service, for its registered stations and the hand-offs, and the claims stand-in, all over HTTPS |
| `event-service` | Cloud Run, from checkpoint 2 | `apps/backend`, which becomes `apps/event-service` at checkpoint 4 | The hand-offs, the registered stations, the claims stand-in, and the Event screens' `/api` and `/auth`. Until checkpoint 4, stations too | `event-api.geekshacking.com`, and its `run.app` address | TiDB, through one `mysql2` pool |
| `event-service-staging` | Cloud Run, from checkpoint 2 | The same | The same, for trying changes | Its `run.app` address only | `geekykey_staging` |
| `geekykey-web` | Worker, from checkpoint 5 | `apps/geekykey-web` | The token page and My tokens | `key.geekshacking.com`, also written on every token | `geekykey-service` through a service binding |
| `event-web` | Worker, from checkpoint 5 | `apps/event-web` (today's `apps/frontend`) | The dashboard, passport, activity and organizer screens, including the station board | `event.geekshacking.com` | `event-api.geekshacking.com` over HTTPS |

**The Workers.**

- Every Worker sets `workers_dev = false` and `preview_urls = false`, so its hostname is the only way in.
- Each screens Worker serves its files in single-page-app mode and forwards `/api/*` and `/auth/*` to its service, with `run_worker_first` for those paths. Browsers see one address per set of screens, so there is no CORS anywhere. `event-web` forwards over HTTPS with `redirect: "manual"`, so the login's redirects and the session cookie pass back to the browser unchanged.
- Every `/api/*` and `/auth/*` response carries `Cache-Control: no-store`.
- They live in GeeksHacking's Cloudflare account. Julian creates each Worker, connects it to the repo with Workers Builds, and sets its secrets. Nobody on the team can deploy there, set its secrets or read its logs (Julian, 1 Oct 2026).

**The Cloud Run service** (agreed on 8 Oct; Julian mapped `event-api.` to it on 11 Oct).

- A Google Cloud project of our own, on GeeksHacking's billing account, so our roles never touch the Portal's: our existing Firebase project, `geekykey-b035a` (9 Oct). Its resources are made by hand with `gcloud`, and each command is written into `infra/README.md`, a runbook from which infrastructure as code can be written once the architecture settles (Julian, 8 Oct). Cloud Run's v1 interface and the first-generation execution environment, since v2 costs more (Julian, 8 Oct).
- `event-api.geekshacking.com` is a Cloud Run domain mapping behind Cloudflare's proxy, unlike the Portal's `portal-api.` Julian set it up that way, and Adam kept it (12 Oct), since a request sent the way a station sends one passes the zone's checks (BAC-27). Cloudflare answers with its own certificate, from one of the authorities the stations' 14 roots already cover, and passes each request on to Google, whose own certificate sits behind it. The `run.app` address stays open, so the limits and key checks in our own code still protect both. The trade-offs we accept: Cloud Run's logs show Cloudflare's addresses instead of each caller's, and Google's certificate renews from behind the proxy, which Google's docs warn can fail, so it's checked in December (`infra/README.md`, step 9). The fallback, if domain mapping lets us down, is a Google load balancer at about US$18 a month.
- Region `asia-southeast1`; 1 vCPU and 512 MiB; up to 80 requests at once per instance; request-based billing, with startup CPU boost on. At most 2 instances, which also caps TiDB connections at 20.
- No warm instance, except one on event days: the rehearsal (by 7 Nov) and 17 to 18 Nov. Adam switches it on and off with the `gcloud` command in the runbook.
- Logs go to Cloud Logging. Its request logs record no headers, so no keys or cookies, but they do record full URLs. Adam and Ethan can read them; Joshua and Zi Tao don't need to (9 Oct).
- **Staging** is `event-service-staging`, in the same project, on `geekykey_staging`. It has no warm instance and only its `run.app` address. Adam deploys it by hand, from any branch, by running the deploy workflow, and nobody else does unless he asks them to. Anyone with write access to the repo can run the workflow, so this is a team rule rather than a lock: staging runs one branch at a time, and a branch's migrations stay in `geekykey_staging` (12 Oct). Whether the GeekyKey Service gets a staging copy is decided at the split. The 1 Oct staging on Adam's own Cloudflare account was dropped on 7 Oct, before it was ever deployed.

**At the split, the Event Service and its screens move to a repo of their own,** at Julian's suggestion (1 Oct 2026), under the GeeksHacking organisation (8 Oct), taking the claims stand-in, `infra/` and the deploy workflow with them. How `packages/handoff` and the smoke test work across two repos and two platforms is open (section 12).

Sources: [How is the frontend set up, and how does the browser reach the backend?](issues/05-frontend-setup-and-routing.md), [Which screens belong to which service, and how does each know who is logged in?](issues/15-screens-and-login.md), [How do deploys and secrets work?](issues/09-deploys-and-secrets.md), [What does Cloud Run "v1" mean, and what does running the Event Service there involve?](issues/21-cloud-run-facts.md), [How is the Event Service built, deployed and staged on Cloud Run?](issues/27-event-service-on-cloud-run.md)

### 3.3 How a tap travels

From checkpoint 4:

```text
station ──HTTPS──▶ key-api.geekshacking.com (geekykey-service, a Worker)
                     │  key checked against its copy of the registered stations
                     ├──owners──────HTTPS──▶ claims stand-in ─┐
                     └──hand-off────HTTPS──▶ event-service ───┴─ event-api.geekshacking.com (Cloud Run) ──▶ TiDB
```

1. The station sends `POST /api/v1/taps` with its station key: one tap, or up to 500 saved ones.
2. The GeekyKey Service counts the request against the station's 60 a minute, then finds the key's hash in its copy of the registered stations (section 3.5). The station is the one whose hash matches, and it feeds the Event Service that registered it. A key on no list gets `401`. If one Event Service's list couldn't be fetched and the key isn't on the others, the answer is `503 event_service_unavailable` instead, since the key may be on the missing list.
3. One 4-second deadline starts, for the next two steps together. A cold start takes up to about 2.6 seconds of it (section 11.3).
4. It asks `Claims` for each token's owner: the claims stand-in until the switch, then the Portal. A token nobody owns gets `unknown_token`, and a log line. No answer in time, a `429` or `5xx`, or a body that doesn't parse fails the whole request with `503 claims_unavailable`.
5. It hands the rest to that Event Service in one call, `POST /geekykey/v1/taps` with the Event Service key: the station ID and, for each tap, its `client_tap_id`, the owner's user ID and `tapped_at` (null when the station sent none or it was wildly off). No answer within what's left of the 4 seconds, an answer that isn't a 2xx, a redirect, or a body the schema rejects fails the whole request with `503 event_service_unavailable`. Neither call is retried.
6. The Event Service locks the station's row, drops replays (`duplicate`), applies the cooldown and stores each tap as `accepted`, `cooldown` or `no_game`, writing a `tap_stored` log line for each. It also records when the station was last seen.
7. The GeekyKey Service puts every status back in request order and answers the station, which shows the result for about 2 seconds.

**Why taps wait.** Since 29 Sep the station saves each tap to flash before sending it, and deletes it only once a status comes back. A station that hears nothing within its 5 seconds, or gets a `503`, shows `Tap saved` / `Will send later`, and resends with the next tap or a minute later. So a slow or missing Event Service costs a participant the screen's answer, never the tap.

**The heartbeat** comes every 60 seconds, with the station key. The key is checked the same way. The GeekyKey Service answers `server_time` at once, and sends the firmware version, saved taps and `reader_ok` on to `POST /geekykey/v1/heartbeats` in `waitUntil()`, with no retry: a lost one is replaced a minute later. So a heartbeat sets the station's clock even while Cloud Run is down, as long as the station's key is in the copy.

**Until checkpoint 4,** stations call `https://event-api.geekshacking.com`, and the one Cloud Run server does every step itself. From checkpoint 3 its GeekyKey side already talks to its Event side and the stand-in only through these requests.

Sources: [How do stations talk to the GeekyKey Service?](issues/11-station-endpoints.md), [How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?](issues/14-event-service-triggers.md), [How do we protect our public addresses without blocking the stations?](issues/18-protecting-public-addresses.md), [Who registers stations, where is a station key checked, and how does the GeekyKey Service know which Event Service a station feeds?](issues/24-stations-without-a-database.md), [Does a station wait for the Event Service's verdict?](issues/25-wait-for-the-verdict.md)

### 3.4 How a phone claims a token

1. A phone taps a token and opens `https://key.geekshacking.com/t/<UID>`. The chip writes its own UID into that address each time it is read.
2. Someone not logged in sees a login prompt, and nothing is looked up. They log in (through Firebase at the showcase, ADR 0004) and land back on `/t/<UID>`. "Register the token (which will redirect to portal)", in Julian's words, is this login: claiming happens on our page.
3. The token page shows one of five things: a login prompt; **Claim** for a token nobody owns; your own token, with **Release** and a button for each event with a public address, such as "Open Capstone Showcase"; "This token belongs to someone else", with no name; or, for a GeekyKey admin, that line with a **Release** button.
4. My tokens, the home page of `key.geekshacking.com`, lists your tokens with **Release**, has a form to claim a token by typing its UID, and has the same button for each event.
5. A claim or a release that can't reach the claims stand-in, or later the Portal, says "Couldn't reach GeeksHacking. Try again.", and nothing is saved.
6. The passport, on `event.geekshacking.com`, logs in separately. Someone still signed in to Google, or to GeeksHacking, only picks their account again.

Sources: [What is a token's ID, and what URL is written on each token?](issues/13-token-id-and-url.md) ([ADR 0001](../../docs/adr/0001-token-id-is-the-hardware-uid.md)), [Which screens belong to which service, and how does each know who is logged in?](issues/15-screens-and-login.md) ([ADR 0002](../../docs/adr/0002-each-service-logs-in-through-the-portal.md)), [What does the GeekyKey Service need from the Portal's tag APIs?](issues/17-portal-tag-apis.md), [Where do token owners live until the Portal's tag APIs exist, and what does the token page do?](issues/23-token-owners-before-portal.md)

### 3.5 The registered stations

How the GeekyKey Service checks a station's key with no database.

- **What an Event Service serves.** `GET /geekykey/v1/stations`, called by the GeekyKey Service with that Event Service's key, lists its enabled stations, each with its station ID and the SHA-256 of its key, in hex. Nothing else: no label, no location, and never the key. A disabled station simply drops off the list.
- **Where the copy lives.** In memory, in each Worker isolate, as the 29 Sep key list did. It's free, needs no setup and behaves the same in tests. Each new isolate starts empty.
- **An empty copy is filled on the request path,** inside the same 4-second deadline as the owner lookup and the hand-off: one request to each Event Service in the settings.
- **A copy more than a minute old** is used for the request, then refreshed in `waitUntil()`, so a tap never waits on a refresh. Each Event Service's list is refreshed on its own. When one doesn't answer, or its answer doesn't parse, its last good list is kept, with no time limit, and the failure is logged.
- **An unknown key never causes a refresh,** so junk keys can't make us call Cloud Run.
- **`401` or `503`.** Only when every list is in hand and the key is on none of them does the station get `401`. When a list is missing and the key isn't on the others, it gets `503 event_service_unavailable`, keeps its taps and resends them. A heartbeat is treated the same way: no `server_time` until its key is checked.
- **A station ID or key hash that appears twice,** in one list or in two, is refused and logged.
- **A new, replaced or disabled key** takes up to a minute to take effect.
- **`stations_copy_filled`,** a log line for each fill, says how long it took and whether every list came back.
- **The Cache API goes in behind memory only if the rehearsal shows the need:** a fill ran out of time and caused a `503`, or fills came more than about once every 10 minutes while stations were busy. Otherwise it stays out. KV, D1, Upstash and Redis are ruled out.
- **Tests.** One module owns the copy, the lists' ages and the refresh, with the clock and the fetch passed in. Each test makes its own instance. The tests cover the empty-copy fill, `503` against `401` when a list is missing, a stale list kept when an Event Service fails, and no refresh on an unknown key.

Sources: [Who registers stations, where is a station key checked, and how does the GeekyKey Service know which Event Service a station feeds?](issues/24-stations-without-a-database.md), [What does the GeekyKey Service cache, and in which store?](issues/26-what-to-cache.md), [Which cache can a Worker use for free?](issues/22-worker-cache-options.md)

### 3.6 The database

**Where it is.** GeeksHacking's TiDB Cloud Starter cluster, on Alibaba Cloud in Singapore, with one database, `geekykey`, holding the Event Service's tables and the claims stand-in's `tokens`. Only our Cloud Run server reaches it. Neither the Event Service's code nor the stand-in's reads the other's tables, and each imports only its own schema.

**The connection.** One shared `mysql2` pool of 10 connections per instance, made once at start-up, with `verifyIdentity`, so TiDB Cloud's certificate and hostname are both checked. Drizzle stays the ORM, through its `mysql2` adapter.

- Idle connections are dropped after a short time, because Cloud Run cuts the CPU between requests and the pool's timers stall.
- A query is retried once, but only when its connection was already dead before the query was sent. A query that failed partway is never retried.
- The pool is closed on `SIGTERM`, which Cloud Run sends 10 seconds before it stops an instance.

**Logins.** All carry the cluster's prefix:

- The **app login** can only read and write rows in `geekykey`. The Cloud Run service reads its connection URL from Secret Manager.
- The **migration login** can also change tables. The `db:` tasks use it, from Adam's laptop and from the deploy job, which reads it from Secret Manager.
- The **root login** created those two once and is never deployed.
- **Staging** has its own database on the same cluster, `geekykey_staging`, with its own app and migration logins that can't touch `geekykey`. Its queries count against the same free 50 million Request Units a month.

**Rules for the schema.** In force since checkpoint 1.

- Fixed sets of values are `ENUM` columns. There are no `check()` calls, because TiDB ignores them and the switch that would enforce them is cluster-wide.
- Timestamps are ISO strings in `VARCHAR(24)`, with a comment in the schema saying why, and the code sets their defaults.
- `taps` carries `/*T! AUTO_ID_CACHE=1 */`, added to the migration by hand, so a newer tap always has a higher `id`. MySQL ignores the comment.
- No foreign key crosses between the Event Service's tables and the stand-in's, or points at the Portal. Foreign keys inside one of them stay.
- `onConflictDoNothing()` is a no-op `ON DUPLICATE KEY UPDATE`, never `INSERT IGNORE`, which silently stores bad values. `.limit(1)`, never `.get()`. No `db.batch()`.
- The cooldown locks: each ingest is one short transaction that first locks the station's row in `stations` with `SELECT ... FOR UPDATE`, then reads, with `FOR UPDATE` too, decides and writes.

**Migrations.** A `db:migrate` task runs Drizzle's `mysql2` migrator with the migration login, from a laptop or the deploy job, never at start-up. Every migration must work with the version still running: add a column before the code uses it, and drop one only after the code stops.

**The tables after checkpoint 3.**

| Owner | Table | Columns | Notes |
|---|---|---|---|
| Event | `stations` | `id`, `api_key_hash` (unique), `label`, `disabled_at`, `created_at`, `last_seen_at`, `firmware_version`, `buffered_taps`, `reader_ok` | Today's table, reshaped. `label` is the device's name, such as "Reader 3"; its passport name, location and points move to `passport_stations`. `disabled_at` is empty while the station is enabled. Each hand-off sets `last_seen_at`, and a heartbeat's hand-off also sets the last three. This is the row the cooldown locks |
| Event | `users` | `id`, `display_name`, `created_at` | The per-event copy. `id` is the user ID, and the name is copied from the login. `portal_user_id` and `role` go |
| Event | `taps` | `id`, `station_id`, `client_tap_id`, `user_id`, `source`, `status`, `tapped_at`, `received_at` | `source` is `ENUM('nfc', 'qr_fallback')` and `status` is `ENUM('accepted', 'cooldown', 'no_game')`. `(station_id, client_tap_id)` is unique. `user_id` is never empty and has no foreign key, so a tap by someone who has never logged in is still stored. `token_uid` goes |
| Event | `passport_stations` | `station_id`, `name`, `location`, `points`, `added_at` | The passport's settings. Only these stations are stamp slots, in `added_at` order |
| Claims stand-in | `tokens` | `uid` (primary key), `user_id`, `claimed_at` | Only current owners: releasing deletes the row, so `revoked_at` goes. `user_id` is a user ID with no foreign key. Marked "GeekyKey's stand-in, removed after the switch", and dropped then |

Sources: [Does TiDB fit this backend?](issues/01-tidb-fit.md), [How is the database set up?](issues/07-database-setup.md), [How is the Event Service built, deployed and staged on Cloud Run?](issues/27-event-service-on-cloud-run.md), [Who registers stations, where is a station key checked, and how does the GeekyKey Service know which Event Service a station feeds?](issues/24-stations-without-a-database.md), [How do we notice trouble on event day, and who watches?](issues/20-event-day-monitoring.md)

### 3.7 Room to grow

- **The 24 Sep game ideas all fit.** Live interaction would add something that holds connections open, such as a Durable Object or the Cloud Run server itself. Trading needs transactions, which an ordinary `mysql2` pool keeps simple. Nothing may rely on `taps.id` order to pair two people's taps. A second game inside the Event Service keeps one status per tap: `accepted` if any game counted it, otherwise `cooldown` if a game held it back, otherwise `no_game`. Each game keeps its own record of what it counted, so a bingo-only tap can't earn passport points. Source: [Can the architecture carry the 24 Sep game ideas?](issues/04-future-ideas-fit.md)
- **The Portal's tag APIs.** Only the `Claims` module changes (section 4), and the claims stand-in is deleted.
- **Other teams' Event Services** get the same three requests (the registered stations, the hand-off and the heartbeat hand-off) over HTTPS, with their own Event Service key, a section of the API agreement and a JSON Schema generated from `packages/handoff`. They register their own stations and issue their keys. Their own statuses pass through to stations, which treat any status they don't know as recorded. They log users in themselves ([ADR 0002](../../docs/adr/0002-each-service-logs-in-through-the-portal.md)), through the same login as the GeekyKey Service, so the user IDs match. Adding one is a reviewed change to the GeekyKey Service's settings and a deploy.
- **Another event.** A reader moves by sending its saved taps, then taking a key from the new event's Event Service through the firmware's setup mode, which clears its saved taps (8 Oct).
- **The token page sends its owner to the ongoing event** (backlog, BAC-23, 8 Oct). Julian's idea: the token's one URL never changes, and after login the GeekyKey screens route the owner to the event on now, or show their tokens when none is. For the showcase, assume one event at a time. Later, the Portal could list active events with their Event Service addresses. One way to build it: each `EVENT_SERVICES` entry gains optional start and end times, the GeekyKey Service's `/me` says which event is on, and the token page redirects there, keeping **Release** one tap away on My tokens. Until it's picked up, the owner's view keeps its button for each event (section 3.4).
- **Later.** Once the stand-in is gone, the one database holds only our Event Service's data, and each Event Service can have a database of its own.

---

## 4. Claims behind one module

Claiming a token and finding who owns it go through one module in the GeekyKey Service, so switching from the claims stand-in to the Portal's tag APIs changes one implementation and nothing else.

```ts
/** Who owns each token: the claims stand-in until the switch, then the Portal's tag APIs. */
export interface Claims {
  /** The owners of up to 500 tokens, by UID. A UID missing from the map is unclaimed. */
  ownersOf(uids: string[], signal: AbortSignal): Promise<Map<string, string>>;
  /** Claims the token for the user. The first claim wins. */
  claim(uid: string, userId: string, signal: AbortSignal): Promise<"claimed" | "already_yours" | "taken">;
  /** Releases the token, but only if `ownerId` still owns it. */
  release(uid: string, ownerId: string, signal: AbortSignal): Promise<"released" | "not_owner">;
  /** The user's tokens, oldest claim first. */
  tokensOf(userId: string, signal: AbortSignal): Promise<{ uid: string; claimedAt: string }[]>;
}
```

- **`StandInClaims`** calls the claims stand-in over HTTPS with `CLAIMS_STAND_IN_KEY`, and replaces `TokenResolver` and `LocalTokenResolver` in `apps/backend/src/services/identity.ts`. Inside the one server at checkpoint 3, it calls the same routes through `app.request()`.
- **`PortalClaims`**, after the showcase, calls the tag APIs as the GeekyKey Service itself, with the client-credentials flow and its own OAuth app. It caches owners in Cloudflare's Cache API (provisional): owned tokens only, never "unclaimed", and a claim or release deletes the token's entry. For how long is chosen at the switch: 5 minutes was planned, and Julian asked for an hour (8 Oct). The Cache API keeps an entry for its `max-age`, but each data centre keeps its own copy and a delete clears only the local one, so a release can go unseen elsewhere for that long. If that's too long, the fallback is Redis or KV.
- **The deadline.** Each call gives up when its `signal` fires: the station request's shared 4 seconds, or 4 seconds of its own on the screens' calls (the spec's call). There's no retry.
- **When it can't answer** (no answer in time, a `429` or `5xx`, or a body that doesn't parse), it throws `ClaimsUnavailable`. The station route turns that into `503 claims_unavailable`, the same code before and after the switch, and the screens into "Couldn't reach GeeksHacking. Try again."
- **UIDs arrive normalised.** Who may release is decided by the routes: an owner passes their own user ID, and a GeekyKey admin passes the owner the token page found when it loaded, so a late or double click can't release a newer claim.
- **The cap** is 3 tokens, a GeekyKey Service setting, with no exemption for anyone. The claim route checks `tokensOf` before `claim`: a token already among them answers `200` as already yours, whatever the count, and otherwise a user at the cap gets `409 token_limit_reached`, even when the token is someone else's. Accepted: two claims by one user at the same instant could leave them with 4 tokens.
- **Every release writes a `token_released` log line** saying who released which UID from whom. With no history kept, it's the only trace.

**The claims stand-in** keeps the `tokens` table and offers the four calls we're asking the Portal for, in [part 2 of the tag APIs message](assets/message-to-qing-guan-tag-apis.md). Before the split it's simply today's `tokens` table and claim code, moved to Cloud Run with everything else. From checkpoint 3 it's a folder of its own on the Cloud Run server, `claims-stand-in/`, with its own schema file, marked "GeekyKey's stand-in, removed after the switch". Its routes are the spec's call. The fifth, read-only route for "Copy claims to the Portal" went on 8 Oct, with the copy. Each takes `Authorization: Bearer <CLAIMS_STAND_IN_KEY>`, compared in constant time:

| Method | Path | Body or answer |
|---|---|---|
| POST | `/claims-stand-in/v1/owners` | `{ "uids": [...] }`, up to 500. Answers `{ "owners": [{ "uid", "user_id" }] }`, leaving unclaimed UIDs out |
| POST | `/claims-stand-in/v1/tokens/{uid}/claim` | `{ "user_id" }`. Answers `{ "result": "claimed" \| "already_yours" \| "taken", "claimed_at" }` |
| POST | `/claims-stand-in/v1/tokens/{uid}/release` | `{ "owner_id" }`. Answers `{ "result": "released" \| "not_owner" }` |
| GET | `/claims-stand-in/v1/users/{user_id}/tokens` | Answers `{ "tokens": [{ "uid", "claimed_at" }] }`, oldest claim first |

They aren't in the API agreement: nothing but the GeekyKey Service calls them, and they go after the switch. The switch is in section 6, "After the showcase".

Sources: [What does the GeekyKey Service need from the Portal's tag APIs?](issues/17-portal-tag-apis.md), [How do we protect our public addresses without blocking the stations?](issues/18-protecting-public-addresses.md), [Where do token owners live until the Portal's tag APIs exist, and what does the token page do?](issues/23-token-owners-before-portal.md), [Does a station wait for the Event Service's verdict?](issues/25-wait-for-the-verdict.md), [What does the GeekyKey Service cache, and in which store?](issues/26-what-to-cache.md)

---

## 5. Settings, secrets and bindings

Settings for a Worker live in its `wrangler.jsonc`. Settings for the Event Service live in its Cloud Run service's environment, set by the deploy workflow from a file in the repo. Either way, they change through a reviewed pull request. Secrets live only on the services: Julian sets the Workers', and Adam adds the Event Service's to Secret Manager. Names marked "suggested" are the spec's.

### 5.1 Each part

**`geekykey-service`** (a Worker, from checkpoint 4)

| Kind | Name (suggested) | Value |
|---|---|---|
| Custom domain | `routes` | `key-api.geekshacking.com`, which Julian attached on 1 Oct 2026 |
| Side doors off | `workers_dev`, `preview_urls` | Both `false` |
| Binding | Rate limits | See the table below |
| Setting | `EVENT_SERVICES` | The list of Event Services. For each: an ID, a name, an `https://` address, and optionally a public address and name for the token page's and My tokens' buttons. For the showcase, one entry: `showcase`, "Capstone Showcase", `https://event-api.geekshacking.com`, `https://event.geekshacking.com` |
| Setting | `CLAIMS_STAND_IN_URL` | `https://event-api.geekshacking.com/claims-stand-in/v1`, until the switch |
| Setting | `GEEKYKEY_ADMINS` | User IDs. Adam, Ethan and Zi Tao for the showcase |
| Setting | `MAX_TOKENS_PER_USER` | `3` |
| Setting | `MAX_TAPS_PER_REQUEST` | `500` |
| Setting | `TAP_DEADLINE_MS` | `4000`, the shared deadline. A cold start takes up to about 2.6 seconds of it (section 11.3) |
| Setting | `FIREBASE_PROJECT_ID` | The Firebase project whose ID tokens it accepts, at the showcase (ADR 0004). The Portal's login settings replace it once events log in through the Portal |
| Secret | `SESSION_SECRET` | Signs `gk_session` |
| Secret | `EVENT_SERVICE_KEY_SHOWCASE` | One for each entry in `EVENT_SERVICES` |
| Secret | `CLAIMS_STAND_IN_KEY` | Until the switch |
| Secret | `PORTAL_CLIENT_SECRET` | From the switch, for the client-credentials flow |

Every secret it has goes under `secrets.required`, so a deploy fails if one is missing.

**`event-service`** (Cloud Run, from checkpoint 2; until checkpoint 4 it is the whole backend)

| Kind | Name (suggested) | Value |
|---|---|---|
| Address | | `event-api.geekshacking.com`, a domain mapping behind Cloudflare's proxy, and its `run.app` address |
| Size | | As in section 3.2. Minimum instances 0, and 1 on event days |
| Setting | `ORGANIZERS` | User IDs. `dev-organizer-1` locally |
| Setting | `TAP_COOLDOWN_SECONDS` | `300`. 900 was suggested on 8 Oct, for Adam to decide (section 12) |
| Setting | `MAX_TAPS_PER_REQUEST` | `500` |
| Setting | `FIREBASE_PROJECT_ID` | As for the GeekyKey Service |
| Secret | `APP_SECRETS` | One JSON object holding the four values below, by name (13 Oct) |
| In `APP_SECRETS` | `SESSION_SECRET` | Signs `event_session` from checkpoint 4, and `gk_session` before that |
| In `APP_SECRETS` | `DATABASE_URL` | The app login's connection URL |
| In `APP_SECRETS` | `EVENT_SERVICE_KEY` | From checkpoint 3. The same value as the GeekyKey Service's `EVENT_SERVICE_KEY_SHOWCASE` |
| In `APP_SECRETS` | `CLAIMS_STAND_IN_KEY` | From checkpoint 3 until the switch |
| Secret | `MIGRATION_DATABASE_URL` | Read only by the deploy job, for `db:migrate` |

The service pins each secret to a version number in its `deploy.env` in `infra/`, which the deploy workflow reads, so changing one is a reviewed change and a new revision. The settings are read once at start-up, and a missing secret stops the server starting. The server unpacks `APP_SECRETS` into its four settings before it reads them, and checks each as before; an error in it names the setting, never a value. Locally the four stay separate settings. `event-service-staging` has the same names, with its own values and `geekykey_staging`.

Why one secret for four values (13 Oct): Secret Manager bills each stored version after the first 6 on the billing account, and one secret per value made 10. The migration login can't join them, because the deploy accounts read it and the services must not. The cost is in changing a value (section 5.2).

**`geekykey-web` and `event-web`** (Workers, from checkpoint 5)

| Kind | Value |
|---|---|
| Static assets | The Vite build, in single-page-app mode, with Firebase's web config as build variables (not secret) |
| `run_worker_first` | `["/api/*", "/auth/*"]`. Without it, a browser going to `/auth/login` gets `index.html` and login silently breaks |
| Reaching its service | `geekykey-web`: a service binding to `geekykey-service`. `event-web`: `fetch()` to the setting `EVENT_API_URL`, `https://event-api.geekshacking.com`, with `redirect: "manual"` |
| Custom domain | `key.geekshacking.com` and `event.geekshacking.com` |
| Side doors off | `workers_dev` and `preview_urls` both `false` |
| Build variable | `VITE_LIVE_API=1`, set in Workers Builds. Without it the build ships the mock client |
| Secrets | None |

**Rate limits.** On `geekykey-service`, each limit is its own binding over 60 seconds, with a `namespace_id` that no other Worker in GeeksHacking's account uses, because bindings that share one share their counts. The IDs go to Julian so he knows they're taken. Check their format against Cloudflare's [Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) page when checkpoint 6 adds them. The Event Service counts its one limit in each instance's memory (the spec's call).

| Where | Binding (suggested) | Counts | Keyed by | Limit a minute | `namespace_id` (suggested) |
|---|---|---|---|---|---|
| `geekykey-service` | `STATION_LIMIT` | A station | The SHA-256 of the key it sent, before the key check | 60 | `7101` |
| `geekykey-service` | `USER_LIMIT` | A user on its API | User ID | 60 | `7102` |
| `geekykey-service` | `TOKEN_LIMIT` | A user looking up and claiming tokens | User ID | 20, on top of the 60 | `7103` |
| `event-service` | In memory, per instance | A user on its API | User ID | 60 | None |

The status call's limit, `7104`, went with the status call on 5 Oct.

### 5.2 Where every credential lives

| Credential | Lives in | Set by | If it leaks or is lost |
|---|---|---|---|
| TiDB root login | `~/.config/geekykey/tidb.env` on Adam's laptop. Never deployed | Julian provided it | Ask Julian |
| TiDB app login | Secret Manager, as `DATABASE_URL` in `APP_SECRETS` | Adam creates it with the root login and adds it from his laptop, keeping no copy | Adam resets it, a new version of `APP_SECRETS` is made with it (below), and a reviewed change pins the service to it |
| TiDB migration login | Secret Manager, as `MIGRATION_DATABASE_URL`, and `~/.config/geekykey/` on Adam's laptop | Adam | Adam resets it, and adds a new version |
| Staging's two TiDB logins | Secret Manager, for `event-service-staging`, and the migration login in `~/.config/geekykey/` | Adam | Adam resets them. Neither can touch `geekykey` |
| `SESSION_SECRET`, one per service | A Workers secret on `geekykey-service`; Secret Manager for the Event Service | Julian, as a random value nobody keeps; Adam, with `openssl rand` piped into `APP_SECRETS`, never printed | A new one logs everyone out of that service |
| Event Service key, one per Event Service | A Workers secret on `geekykey-service`, and `APP_SECRETS` for ours | Adam generates 32 random bytes into `APP_SECRETS`, keeping no copy. How it reaches the Worker is still open (section 12). Another team's key goes to that team, and to Julian | Set the new one on both sides outside the event. Hand-offs fail with `503` until both match, and stations resend |
| `CLAIMS_STAND_IN_KEY` | As the Event Service key | As the Event Service key | As the Event Service key. Deleted on both sides after the switch |
| Portal client secret, from the switch | A Workers secret on `geekykey-service` | Qing Guan gives it to Julian, who sets it | Qing Guan and Julian replace it |
| The GeeksHacking OIDC client secret inside Firebase | Firebase's own settings, in our Firebase project | Qing Guan issues it, and whoever sets up the provider pastes it in | Qing Guan issues a new one |
| Station key | The station's gitignored `secrets.h`. Only its hash is in the Event Service's `stations` | An organizer creates it on the station board, shown once | An organizer replaces it, keeping the station's ID, and Zi Tao enters the new one through the station's setup mode |
| Token write password | `firmware/token_writer/secrets.h` (gitignored), and Adam's copy outside the repo | Zi Tao | Without it, tokens can never be rewritten |
| Wi-Fi details | Each station's `secrets.h` at first, then whatever the setup mode stored (HAR-14) | Zi Tao | Change the password, and enter the new one through the setup mode |
| Our database copies | Adam's laptop, outside the repo. Never GitHub, a workflow artifact or a chat | Adam | They hold user IDs, names and who tapped where |

**Changing one value in `APP_SECRETS`** (13 Oct). Secret Manager stores a whole new version, so the other three values go into it unchanged. Adam's account can't read them, so either Julian, who can, makes the new version in the console, or Adam makes one with every random value new: everyone is signed out, and from checkpoint 4 the keys are set again on the Worker. A leak of one value is a reason to replace all four anyway, since they're stored together.

**GitHub holds no secret at all.** The deploy signs in to Google Cloud without a key (Workload Identity Federation), through two service accounts (the spec's call):

- **production's,** usable only by this repo's `main` branch, can deploy `event-service` and read its migration login;
- **staging's,** usable from any branch of this repo, can deploy only `event-service-staging` and read only its migration login.

Neither reads the other secrets: each service reads its own `APP_SECRETS` (its session secret, app login and, from checkpoint 3, its two keys) as an account of its own, which can read nothing else (9 Oct, 13 Oct). Both push to one image repository, and the deploy runs each image by its digest, so staging's pushes can't change what production runs (accepted, 9 Oct).

So a workflow on another branch can't deploy production or read its migration login. No Cloudflare API token is kept in GitHub either, and nobody on the team holds a production Cloudflare secret.

### 5.3 Local development

| What | Where |
|---|---|
| The backend, until checkpoint 4 | `node --watch` on port 8000, where real stations already point (`http://A-Mac.local:8000`) |
| GeekyKey Service, from checkpoint 4 | `wrangler dev` on port 8000, so stations keep pointing there |
| Event Service, from checkpoint 4 | `node --watch` on port 8001 |
| Event screens | Vite on 5173, proxying `/api` and `/auth` to 8000 until the split, then to 8001 |
| GeekyKey screens | Vite on 5174, proxying to 8000 |
| Database | TiDB v8.5.3 in Docker from the root `compose.yaml`, with `geekykey_dev` and `geekykey_test`. The server connects to it with `mysql2` directly |
| Secrets | A gitignored `.env` for the Node server and `.dev.vars` for the Worker, each holding `SESSION_SECRET` and the local keys. Never in a deployed config. Each service's `pnpm dev` turns dev-login on itself, so a fresh clone runs with neither file |
| Logging in | dev-login signs in seeded users. Firebase works too, since it allows `localhost` by default |

From checkpoint 4, one root `pnpm dev` starts all four. Mock mode stays for work on screens.

Sources for section 5: [How do deploys and secrets work?](issues/09-deploys-and-secrets.md), [How do local dev, tests and CI get a runtime and a database?](issues/08-dev-test-ci.md), [How do we protect our public addresses without blocking the stations?](issues/18-protecting-public-addresses.md), [How do we back up the database, recover it on event day, and clear the test data before the doors open?](issues/19-backups-and-test-data.md), [How is the Event Service built, deployed and staged on Cloud Run?](issues/27-event-service-on-cloud-run.md)

---

## 6. The migration plan

Each checkpoint is one deliverable: Adam builds it, it's reviewed, and only then does the next one start. The order is the spec's call. Checkpoints 6 and 7 can swap, and checkpoint 5 can move after them if it runs late: they're built and tested locally with dev-login meanwhile.

| | Checkpoint | Done when | Waits on |
|---|---|---|---|
| 0 | The contract and the asks | **Done:** version 0.2 (29 Sep); version 0.3, for this rewrite (7 Oct); and version 0.4, the Firebase login, which Ethan approved and which merged on 10 Oct (PR #48). His approval covers 0.3 too (Adam, 12 Oct) | |
| 1 | Today's backend on workerd and TiDB | **Done** (BAC-1 to BAC-6) | |
| 2 | The move to Cloud Run | A tap to `event-api.geekshacking.com` is stored in TiDB, after staging; the log check; the cold start is measured | Julian: the project, the keyless sign-in and the roles (agreed 8 Oct), disconnecting Workers Builds, and the DNS record, once we're ready |
| 3 | The line drawn inside | One server, with the GeekyKey side, the Event side and the claims stand-in talking only through their requests, on the new tables | Nothing outside the team |
| 4 | The GeekyKey Service cut out | `geekykey-service` runs at `key-api.`, the stations have moved to it, and the smoke test runs on every pull request | Julian: connecting `geekykey-service`, its secrets, and the Event Service's new repo under GeeksHacking. Zi Tao: the setup mode |
| 5 | Login, and the screens deployed | Both logins work through Firebase, the passport shows on a phone, the cookies are checked, the passport poll is measured | Qing Guan: an OIDC client for GeeksHacking's login, asked before Mr Pang (10 Oct). Julian or Qing Guan: two domains. Done: Google sign-in and the check that a Worker can verify its login (Adam, 10 Oct), and billing on the Firebase project (Julian, by 9 Oct) |
| 6 | The GeekyKey Service's features | Tokens are claimed and released, and the limits hold | Ethan's team: the `geekykey-web` screens |
| 7 | The Event Service's features | Organizers create and disable stations, set up the passport and watch taps, and the export is right | Ethan's team: the `event-web` changes |
| 8 | Ready for the event | The copy, restore and clear tasks work, the restore is tried, the stress test has run, the rehearsal is done by 7 Nov | The whole team |
| | After the showcase | The GeekyKey Service uses the Portal's tag APIs | Qing Guan's tag APIs, and events logging in through the Portal |

Three tracks run alongside the checkpoints: going public, the screens (Ethan's team) and the stations (Zi Tao). They're at the end of this section.

### Step 0. The contract and the asks

**Done for version 0.2.** The API agreement was rewritten for the two services and merged on 29 Sep, and amended on 1 Oct for Julian's hostnames. `CONTEXT.md` and `docs/adr/` are committed.

**Version 0.3,** for this rewrite, went to `main` on 7 Oct (section 7). **Version 0.4,** the Firebase login, followed in PR #48, which Ethan approved and which merged on 10 Oct. His approval of 0.4 covers 0.3 as well (Adam, 12 Oct), so checkpoint 3 and the station screens on `event-web` can build 0.3's shapes.

**Asked in person on Thu 8 Oct,** from [the agenda](../meetings/2026-10-08-julian-and-qing-guan.md). The answers are in section 2, and what's still open in section 12.

**Messages to send now:** [the station contract](assets/message-to-zi-tao-station-contract.md), with its notes of 5, 6 and 8 Oct, to Zi Tao. Part 2 of [the tag APIs message](assets/message-to-qing-guan-tag-apis.md) can wait: the Portal's team agrees with the approach, and nothing is needed before the showcase. [Logging in through the Portal](assets/message-to-qing-guan-login.md) is parked until events log in through the Portal (ADR 0004).

**Adam asks:** Mr Pang, whether the showcase offers GeeksHacking's login beside Google (built first since 10 Oct, and turned off if he says no); and the teachers, whether the showcase has a theme, for Joshua's games.

**Done on 8 Oct:** Julian makes sure `key.geekshacking.com` and its `/t/` path keep working for as long as tokens are in use.

**Once the Sprint 2 A/B test is confirmed,** decide which setup runs it (section 12).

### Checkpoint 1. Today's backend on workerd and TiDB

**Done** (BAC-1 to BAC-6). Today's five endpoints (`/api/health`, `POST /api/v1/taps`, `GET /api/v1/me`, `POST /auth/dev-login`, `POST /auth/logout`) run against TiDB, unchanged on the wire, and Deno is gone. BAC-9 and BAC-10 then readied production: the `geekykey` database with today's tables, its app and migration logins and a test station, and `geekykey_staging` with its own two logins.

What carries on: TiDB v8.5.3 in Docker from `compose.yaml`, with the `db:up`, `db:reset`, `db:down`, `db:migrate` and `seed` tasks; the MySQL schema and its rules (section 3.6) with one fresh migration; the cooldown's `FOR UPDATE` lock and its test; `Cache-Control: no-store`; ESLint, oxfmt and `tsc`; and CI's `check:migrations`.

What checkpoint 2 undoes, because the Event Service leaves Workers: `wrangler dev`, the Vitest plugin, the Hyperdrive binding, and CI's `check:build`, the dry-run deploy.

### Checkpoint 2. The move to Cloud Run

Today's backend, unchanged on the wire, runs as a Node server on Cloud Run at `https://event-api.geekshacking.com`, on production TiDB through a `mysql2` pool. Stations can tap it there until checkpoint 4.

**Before it, one small pull request:** Node 24 for the whole repo, in `.mise.toml`, `package.json` and CI, because one Node is pinned for every app. Node 26 waits until after the showcase.

**The code,** still in `apps/backend`:

- `src/worker.ts` becomes `src/server.ts` on `@hono/node-server`. Settings come from `process.env` and are still read once at start-up.
- `src/db/hyperdrive.ts` becomes the shared `mysql2` pool in section 3.6. The `FOR UPDATE` reads stay.
- The image: Rolldown bundles one file at build time (it replaced esbuild on 9 Oct, PR #44), and `node:24-slim` runs it.
- `wrangler.jsonc`, `worker-configuration.d.ts`, the `disableEval` setting and the compatibility flags leave `apps/backend`. A Worker comes back as the GeekyKey Service's own package at checkpoint 4.
- `node --watch` replaces `wrangler dev`, on port 8000, so the Vite proxy and the stations need no change. `pnpm dev` still turns dev-login on.
- **Tests:** plain Vitest on Node, in one project. `@cloudflare/vitest-plugin` and the `requireLikeNode` workaround go. TiDB in Docker stays.
- **CI:** `docker build` on the image, without pushing it, replaces "Build the Worker", proving the image and the bundle build. `typecheck` drops `wrangler types`.

**The infrastructure,** made by hand with `gcloud` (8 Oct), each command written into `infra/README.md` so it can be repeated and later turned into code: the Artifact Registry repository; `event-service` and `event-service-staging`; their secrets, created without values; the domain mapping for `event-api.`; the two deploy service accounts (section 5.2); Logs Viewer for Adam and Ethan, and Adam's roles to deploy, add secret values and read logs; the warm-instance switch; and a budget alert to Julian and Adam. Adam ran steps 1 to 5 on 9 Oct with his Editor role, and the grants, steps 6 to 8, the same day, once Julian gave him a role that can grant. Julian mapped the address, step 9, on 11 Oct. The budget alert, step 10, is still to confirm (section 12).

**The deploy workflow,** on every push to `main`, after the backend checks pass. One job:

1. builds the image and pushes it to Artifact Registry;
2. runs `db:migrate`, with the migration login read from Secret Manager;
3. deploys to Cloud Run.

Run by hand (`workflow_dispatch`) from any branch, the same workflow migrates `geekykey_staging` and deploys `event-service-staging`.

Before the first deploy, once:

- ~~Julian creates the project on GeeksHacking's billing account~~ (it's `geekykey-b035a`, 9 Oct), and gives Adam a role that can grant, so Adam sets up the keyless sign-in from GitHub and the grants in the runbook's steps 6 to 8 (agreed 8 Oct; Adam runs them, 9 Oct).
- ~~Julian disconnects Workers Builds from `apps/backend`, which builds every push to `main` and fails~~ (agreed 8 Oct; it hasn't built `main` since that day).
- ~~Adam adds each secret's value from his laptop, keeping no copy: `SESSION_SECRET`, `DATABASE_URL` and `MIGRATION_DATABASE_URL`, for production and for staging~~ (9 Oct, the runbook's step 11).
- ~~Julian adds the DNS record for `event-api.geekshacking.com` that the domain mapping asks for, with Cloudflare's proxy off, once we tell him it's ready~~ (11 Oct). He added it with the proxy on, which Adam kept (12 Oct, section 3.2).

Done when:

- **The proof:** with the test station's key, `curl` to `event-service-staging`'s `run.app` address, then to `https://event-api.geekshacking.com/api/v1/taps`, gets `unknown_token` for an unclaimed UID and `accepted` for the test token. The same `client_tap_id` sent again gets `duplicate`, and a new tap by the test token gets `cooldown`. Each tap is in the right database. Staging passed on 10 Oct (BAC-19), and production on 12 Oct (BAC-11), through `event-api.` and Cloudflare's proxy, using a second test station, since the first one's key was lost.
- **The log check,** in Cloud Logging, on staging and then production: no key or cookie in any log line, and no secret in a URL. Staging passed on 10 Oct (BAC-12), and production on 12 Oct (BAC-11).
- **The cold start is measured** on staging, with and without startup CPU boost, on the first-generation execution environment (Julian: stay on v1, 8 Oct). The faster is kept, and the 4-second deadline is revisited with the number. Done 11 Oct (BAC-12): boost stays on, and the deadline stays at 4 seconds (section 11.3).
- **The first numbers** are written down for section 11.1: Cloud Run's requests and CPU, and TiDB's Request Units after a day, which only Julian can see. Cloud Run's are in (11 Oct), and TiDB's (12 Oct, from Julian's screenshots).
- A real station taps `event-api.` over HTTPS (BAC-14). Passed on 12 Oct, with the HTTPS firmware (HAR-10, taken over from Zi Tao by Adam): its taps were stored in `geekykey_staging` through staging's `run.app` address, then in production through `event-api.`.

### Checkpoint 3. The line drawn inside

Still one Cloud Run server, but its code is now the GeekyKey side, the Event side and the claims stand-in, which talk only through their requests, on the tables in section 3.6, with every station rule from the tickets.

- **Three areas** inside `apps/backend/src`: `geekykey/`, `event/` and `claims-stand-in/`. The last two have their own schema files, and the first has none. None imports another; a lint rule can enforce it.
- **`packages/handoff`:** the Zod schemas for the three requests to an Event Service (the hand-off, the heartbeat hand-off and the registered stations), request and answer, with types from `z.infer`, and a JSON Schema generated with `z.toJSONSchema` for other teams. The Event side checks each request with them, and the GeekyKey side checks each answer.
- **The Event side:**
  - `POST /geekykey/v1/taps`, `POST /geekykey/v1/heartbeats` and `GET /geekykey/v1/stations`, each checking the Event Service key in constant time;
  - today's ingest, with replays dropped by station ID and `client_tap_id`, and the lock on the station's row in `stations`;
  - the heartbeat hand-off stores the firmware version, saved taps and `reader_ok`, and every hand-off sets `last_seen_at`;
  - `no_game` for a station without passport settings;
  - taps stored with the user ID and no token UID;
  - `users` keyed by the user ID;
  - organizers from the `ORGANIZERS` setting, checked on every request, with `dev-organizer-1` on the local list; the `users.role` column goes;
  - `/me` without `tokens`, with `user.role` worked out from the list, and stamp slots only for passport stations, in the order they were added.
- **The claims stand-in:** today's `tokens` table and claim code, reshaped as section 3.6 says, behind the routes in section 4.
- **The GeekyKey side:**
  - the copy of the registered stations (section 3.5), with `stations_copy_filled`;
  - `Claims`, with `StandInClaims` replacing `TokenResolver` (section 4);
  - `unknown_token` answered and logged, not stored;
  - the shared 4-second deadline, with `503 claims_unavailable` and `503 event_service_unavailable`, and no retry;
  - `POST /api/v1/stations/heartbeat`, answering `server_time` once the key is checked, and sending the heartbeat hand-off without waiting for it;
  - the `EVENT_SERVICES` list, with the showcase's entry reached through `app.request()` inside the same server until the split, carrying the keys (the spec's call), and the `GEEKYKEY_ADMINS` list.
- **The keys.** Adam adds `EVENT_SERVICE_KEY` and `CLAIMS_STAND_IN_KEY` to Secret Manager, inside each service's `APP_SECRETS` (section 5.1), for production and staging, so the key checks run from now on.
- **Log lines.** From here on, every log line either side writes is one JSON object with a fixed name, such as `tap_stored`, `unknown_token`, `handoff_failed`, `claims_unavailable` and `stations_copy_filled`, and never holds a key, a cookie or a name. `tap_stored` carries the station ID, `client_tap_id`, user ID, `tapped_at` and status, so taps lost to a restore can be rebuilt.
- **The tables** change to section 3.6's under the migration rule: add first, switch the code, drop in a later migration, so each change takes two merges. Test data that no longer fits is deleted, not converted. Station IDs and keys stay, so stations keep working throughout.
- **Tests** for each side, with the others faked at their requests, including one for each status a station can hear, the deadline, and `503` against `401` when a list is missing.

Done when CI is green and, on production, a test station's tap answers `unknown_token` for an unclaimed token and `accepted` for a claimed one, and a heartbeat sets its last seen. Until checkpoints 6 and 7 build claiming and the station screens, Adam claims tokens and creates stations with one-off scripts from his laptop.

### Checkpoint 4. The GeekyKey Service cut out

The GeekyKey side becomes `geekykey-service`, a Worker at `key-api.geekshacking.com` with no database. The Cloud Run server keeps the Event side and the claims stand-in. Stations move to `key-api.`

**Changed on 1 Oct 2026:** at Julian's suggestion, the Event Service and its screens move to a repo of their own at the split. The folders, CI, the smoke test and `packages/handoff` below were written for one repo, and need rethinking before this checkpoint starts (section 12).

- **Folders.** The GeekyKey side moves to a new `apps/geekykey-service`. `apps/backend` becomes `apps/event-service`, with the Event side and the stand-in. `apps/frontend` becomes `apps/event-web` now, not before, so Ethan's work in progress isn't disrupted. Each has its own `package.json`, tests and CI job.
- **The Worker.** Its own `wrangler.jsonc` (section 5.1), reading its settings once from `env`. Every call to Cloud Run is a `fetch()` to an address that must start with `https://`, with `redirect: "manual"`. The heartbeat hand-off and the copy's refreshes go in `waitUntil()`.
- **The station endpoints leave the Event Service** in a later merge, once every station has moved.
- **Names.** The package names, root scripts, mise tasks and CI filters follow the new folder names.
- **Local dev:** the GeekyKey Service in `wrangler dev` on 8000 and the Event Service on 8001, started together by the root `pnpm dev`, with the Event screens' proxy now pointing at 8001.
- **CI:** one job per service, plus the end-to-end smoke test on every pull request, which starts both services and sends a station tap through to the database.
- **The README's layout and diagram** for the new folders (section 8.1).

The deploy, the first time:

1. Adam reads `EVENT_SERVICE_KEY` and `CLAIMS_STAND_IN_KEY` from Secret Manager once and sends them to Julian privately, keeping no copy.
2. Julian connects `geekykey-service` to Workers Builds from `apps/geekykey-service`, with the settings Adam sends, and sets its `SESSION_SECRET` to a random value nobody keeps, `EVENT_SERVICE_KEY_SHOWCASE` and `CLAIMS_STAND_IN_KEY`.
3. The merge deploys both: the Event Service through GitHub Actions, the Worker through Workers Builds.
4. A test station taps `key-api.`. Then Zi Tao sets each station's server to `https://key-api.geekshacking.com` through its setup mode, keeping its key.
5. A later merge removes `/api/v1/taps` and `/api/v1/stations/heartbeat` from the Event Service.

Done when the smoke test passes in CI, a station's tap on production goes through `key-api.` to Cloud Run, and **the log check** is done with Julian on `geekykey-service`: if the station key or the Event Service key shows in its invocation logs, turn them off there and replace the key.

### Checkpoint 5. Login, and the screens deployed

Changed on 8 Oct: the showcase logs in through Firebase, not the Portal ([ADR 0004](../../docs/adr/0004-the-showcase-logs-in-through-firebase.md)).

**Before it, the Firebase setup and one check:**

- Adam turns on Google sign-in in our Firebase project and adds `key.geekshacking.com` and `event.geekshacking.com` to its authorised domains (*done 10 Oct*, runbook step 12). Julian links GeeksHacking's billing account to the project, which the Identity Platform upgrade needs (*done by 9 Oct*). *Changed 10 Oct (Adam):* GeeksHacking's login is added now, and Mr Pang is asked afterwards. Qing Guan issues an OIDC client for Firebase's redirect URL, and Adam upgrades the project to Identity Platform and adds it as a provider (runbook step 12). If Mr Pang says no, the provider is turned off and the screens drop its button. OIDC sign-ins are free for 49 users a month, then US$0.015 each.
- **The check** (Adam, BAC-20): a Worker verifies a Firebase ID token against Google's public keys, and the CPU time per login is measured against the free plan's 10 ms. *Passed 10 Oct:* a median of 1 ms of CPU with Google's keys cached and 2 ms with them fetched, and Google sign-in works on `localhost` ([the check](research/firebase-login-check.md)).

- **Each service logs users in itself** ([ADR 0002](../../docs/adr/0002-each-service-logs-in-through-the-portal.md)), like this, firm since the check passed: the screens sign in with Firebase's SDK and send the ID token to their own service, which checks its signature, issuer, audience and expiry against Google's public keys, then sets its own cookie; after login the screens go to a relative `return_to` only, the rule `isSafeReturnTo` already applies; and `POST /auth/logout`. The API agreement's login section changed with it, in version 0.4 (10 Oct). Each has its own cookie (`gk_session`, `event_session`), its own `SESSION_SECRET`, and its client ID and redirect URL from its settings. The Event Service creates or updates the user's row with their display name at login. The GeekyKey Service keeps no users, so its session holds only the user ID.
- **The forwarding Workers.** A small `worker/` folder in `apps/event-web` and in `apps/geekykey-web`, with its own Wrangler config (section 5.1). Adam writes them. Afterwards Ethan owns them, and Adam reviews any change to their list of paths.
- **`apps/geekykey-web`** exists by now, from the screens track, with at least its login and shell.

The deploy: Julian or Qing Guan attaches `event.geekshacking.com` to `event-web` and `key.geekshacking.com` to `geekykey-web`, and Julian connects both to Workers Builds (`apps/geekykey-web` in this repo, `event-web` in the Event Service's, with `VITE_LIVE_API=1`). A pull request adds each domain to `routes` the same day.

Done when:

- logging in and out works on both hostnames, and the passport shows on a phone;
- **the log check** for `Cookie`, with Julian on the three Workers and in Cloud Logging for the Event Service: if a cookie shows, turn invocation logs off on that Worker and replace the service's `SESSION_SECRET`, which logs everyone out;
- **the passport poll is measured** for section 11.1: Workers requests per poll, and the Event Service's time per poll.

### Checkpoint 6. The GeekyKey Service's features

The endpoints behind the token page and My tokens, plus the station path's protections. Ethan's team builds the screens (see the tracks). The API agreement's section 8 has the shapes.

- **For users:** the token page's lookup, which says whether a token is unclaimed, yours or someone else's, and gives a GeekyKey admin the owner's ID to release with; claiming (`201`, or `200` if it's already yours, `409 token_taken`, `409 token_limit_reached` from the cap check); releasing, by the owner or by a GeekyKey admin; and `/me`, with the user's tokens and the events that have a public address.
- **For GeekyKey admins,** checked against `GEEKYKEY_ADMINS` on every request: only releasing someone else's token, from the token page. They have no station jobs.
- **The three limits** on this Worker (section 5.1). Each answers `429` with `{"error": "rate_limited"}` and `Retry-After: 60`, and writes one `rate_limited` log line naming the caller: a station ID once known, or a user ID, never a key.

Done when, on production: a phone claims a token from its token page and another by typing its UID; the owner's view opens the showcase; an owner and a GeekyKey admin each release one; and the tests show each limit tripping.

### Checkpoint 7. The Event Service's features

The organizers' screens and the rest of the passport.

- **The organizers' station endpoints:** create a station, showing its key once; replace its key, keeping its ID, showing the new key once; disable and enable it. Each change writes a log line with who made it. A disabled station drops off the registered stations, so within a minute its key gets `401`.
- **The station board's endpoint:** every station of this event, from its own `stations`, with its passport settings, whether it's online (last seen within 120 seconds), its firmware version, saved taps, `reader_ok`, and its last tap. A station without passport settings is "Not in the passport".
- **Passport settings:** adding or changing a station's name, location and points. Stamp slots follow the order stations were added.
- **The tap log** without `token_uid`, **the stats**, **the export** with its ten columns and the statuses `accepted`, `cooldown` and `no_game`, and **the QR fallback**, which takes a `user_id` only and stores the tap through the same pipeline with `source = qr_fallback`.
- **The limit** of 60 requests a minute per user, counted in each instance's memory.

Done when, on production, an organizer creates a station, sets it up in the passport and watches its taps arrive, then disables it and sees its key refused within a minute, and the export's columns match the API agreement.

### Checkpoint 8. Ready for the event

- **Three tasks** in TypeScript with `mysql2`, run from Adam's laptop with the migration login, and tested in CI against the Docker TiDB:
  - `db:backup` writes every table, the stand-in's included, to a file on Adam's laptop, a few MB for the whole showcase;
  - `db:restore <file> --tables <names>` puts back chosen tables only, so restoring taps doesn't undo claims, key replacements or stations disabled since;
  - `db:clear-test-data` takes a copy itself, prints the row counts, asks Adam to type the database name, empties `taps` and `tokens`, and prints the counts again, expecting 0 taps and 0 claims. It keeps `stations`, `users` and `passport_stations`.
- **Before the clear, every station shows 0 saved taps** on the station board (the spec's call). With no links left to restart, a test tap saved before the clear and sent after it would be judged afresh, usually as `unknown_token`, since the clear empties `tokens`.
- **The saved queries.** In Cloud Logging, for the Event Service: errors in the last 15 minutes by name, and responses of 500 or above. In Workers Observability, for the GeekyKey Service, for whoever can open it (section 12): failed hand-offs and owner lookups by Event Service, responses of 500 or above, and `stations_copy_filled`.
- **The lists for the day:** Adam, Ethan and Zi Tao in `ORGANIZERS` and `GEEKYKEY_ADMINS`, and the showcase's other organizers in `ORGANIZERS`. The passport shows each user's user ID, so a helper can send theirs to Adam.
- **The stress test** (8 Oct, BAC-21), on `event-service-staging` with a staging `geekykey-service` if there is one, after the rate limits of checkpoints 6 and 7 are in: many stations' taps and many passports' polls at once, more than the showcase expects. It says whether Cloud Run and TiDB keep up inside the 4-second deadline, and so whether the server-side tap queue in the backlog is needed (section 12). It draws on the same TiDB allowance as production, so it's kept short.
- **The warm instance,** switched on by Adam with the runbook's command on the morning of the rehearsal and of 17 Nov, and off after each.
- **The event-day sheet** from section 10, printed for the desk.

Done when the restore has been tried once on production (back up, restore, compare the counts), the stress test has run, and the rehearsal in section 10 has run by Sat 7 Nov. After it, `stations_copy_filled` decides whether the Cache API goes in for the registered stations (section 3.5), and the day's Workers requests whether the free plan holds (section 11.1).

### After the showcase: the switch to the Portal's tag APIs

Waits on Qing Guan's tag APIs, and on events logging in through the Portal. Julian agreed to the claims stand-in on 8 Oct.

- `PortalClaims` (section 4), with its owners cache, and the Portal client secret on `geekykey-service`.
- **Changed on 8 Oct: nothing is copied.** The showcase's users are Firebase users (ADR 0004), so its claims don't belong to Portal users. They're deleted with the showcase's data, and the Portal's tag APIs start empty. "Copy claims to the Portal" and the stand-in's fifth route are gone.
- **The login moves to the Portal too** (Adam, 10 Oct, ADR 0004). Each service gets `GET /auth/login` and `GET /auth/callback`, as the API agreement has them, and drops the Firebase route. Firebase's sign-in providers are turned off once the showcase's users are deleted; the project stays, as the Event Service's Google Cloud project.
- The order: deploy the version with `PortalClaims`; then delete the stand-in's routes and folder, drop `tokens` in a later migration, and delete `CLAIMS_STAND_IN_KEY` on both sides.
- The API agreement doesn't change: `503 claims_unavailable` already covers the Portal.

### The tracks alongside

**Going public** (Julian). Nothing can be taken back once the repo is public.

1. **Done:** Zi Tao dealt with the Wi-Fi password in git history (HAR-8), and `meeting-notes/` is never committed (BAC-7).
2. Julian makes the repo public, and protects `main` (a pull request with CI passing). He agreed on 8 Oct, along with making his two diagrams public.
3. From then on, only a merge that passed CI can deploy, on either platform. GitHub needs no `production` environment: the Event Service's deploy reads the migration login from Secret Manager, and only `main` can sign in as production's deploy account.

Until then, anyone with write access could push to `main` and deploy, so the team's rule is pull requests only.

**The screens** (Ethan's team). They build against the mock client from the API agreement, and wire each screen as its endpoint lands, as `apps/frontend/CLAUDE.md` describes.

- **`apps/geekykey-web`:**
  - the token page at `/t/<UID>`, with its five views, landing back on it after login, and a button for each event in the owner's view;
  - My tokens, the home page, with **Release**, the form to claim by typing a UID, and a button for each event;
  - "Couldn't reach GeeksHacking. Try again." on `claims_unavailable`, and "You already have 3 tokens. Release one on My tokens first." on `token_limit_reached`;
  - "Someone else already claimed this token." on `token_taken`, and on the token page, the view from a fresh lookup underneath, whatever it answers;
  - no GeekyKey admin screens: a GeekyKey admin releases a found token on its token page.
- **In `apps/frontend`, which becomes `apps/event-web` at checkpoint 4:**
  - **Done:** the passport without pairing, the Portal user ID to copy, passport stations only, the tap log and export of version 0.2, the QR fallback by user ID, and passport settings from the station board.
  - **The station board, changed by version 0.3:** it reads the Event Service's own stations, so "status unknown", "no longer linked" and `status_known` go. Organizers create a station (its key shown once), replace its key, and disable or enable it there, so the station dialogs stay in `event-web` rather than moving to `geekykey-web`. Stations that are offline, holding saved taps, not in the passport, or whose reader isn't responding still turn red and go first.
  - `429`: screens that poll keep showing their last data.

**The stations** (Zi Tao): the station contract, HTTPS, the heartbeat, the token writer, the setup mode, and moving to `key-api.` through it at checkpoint 4, in section 9.

Sources for section 6: every ticket in section 13, in particular [How is the Event Service built, deployed and staged on Cloud Run?](issues/27-event-service-on-cloud-run.md), [How do deploys and secrets work?](issues/09-deploys-and-secrets.md) and [How do local dev, tests and CI get a runtime and a database?](issues/08-dev-test-ci.md).

---

## 7. The API agreement

The agreement wins over every other document, including this one. Step 0 rewrote it as version 0.2, merged on 29 Sep. The redraw's changes are made in the agreement itself, as **version 0.3**, which went to `main` on 7 Oct and is agreed with Ethan's approval of 0.4 on 10 Oct; its changelog lists them. Every endpoint they touch is a `Checkpoint N` one, so a pull request from either side may change it (the agreement's section 1). In short:

- **New, in the section for Event Service builders and in `packages/handoff`:** the registered stations, `GET /geekykey/v1/stations`, and the heartbeat hand-off, `POST /geekykey/v1/heartbeats`, answering `204` (the spec's call).
- **Gone:** the status call, `GET /api/v1/event-service/stations`, with its limit of 120 a minute and its "status unknown" case; the status `no_event`; links; and the GeekyKey admins' station endpoints.
- **Moved to the Event Service's organizer endpoints:** creating a station, replacing its key, and disabling and enabling it, keeping their shapes without the link. The station board reads the Event Service's own stations.
- **`503 claims_unavailable`** replaces `portal_unavailable`, from checkpoint 3.
- **One 4-second deadline** for the owner lookup and the hand-off together replaces the 3-second limit (provisional).
- **The heartbeat** answers `server_time` without waiting for the Event Service, and a missing list gives `503` rather than `401`.
- **The screen table's "no answer" row** says `Tap saved` / `Will send later`, and the `no_event` row goes.
- **Addresses:** the Event Service gets `https://event-api.geekshacking.com`; stations call it until checkpoint 4. The checkpoint table follows section 6.
- **Added in version 0.4** (10 Oct, PR #48): the Firebase login, `POST /auth/firebase` on both services (section 6, checkpoint 5).

The endpoint index is the agreement's section 5.

Sources: [Write the migration spec](issues/10-migration-spec.md) for version 0.2, and for version 0.3 the tickets in section 3.

---

## 8. Edits to the README and other docs

### 8.1 The README

Each change lands with the checkpoint that makes it true. Checkpoint 1's are done (BAC-6).

**Checkpoint 2:**

- The repo layout: `infra/` and the deploy workflow; `apps/backend` loses `wrangler.jsonc` and gains a `Dockerfile`.
- The stack table: the backend is "Hono on Node, on Google Cloud Run, Drizzle ORM, TiDB".
- "Inside the backend": the entry point is `src/server.ts`; the pool; the bundle and the image.
- The task table and "Running the backend": `dev:backend` runs `node --watch` with dev-login on; `test:backend` runs Vitest on Node; CI's `docker build` replaces `check:build`.
- "Settings": settings are environment variables, and local secrets live in a gitignored `.env`.
- **A new "Deploying" section** (BAC-13), with each part's folder, platform and address; how the Event Service and its staging copy deploy; where each credential lives, from section 5.2, never its value; and the team's rules:
  1. **Every merge to `main` deploys.** The Event Service's deploy job migrates the database first, then deploys. From checkpoint 4, Workers Builds deploys the Workers.
  2. **Every migration works with the version still running:** add first, switch the code, drop later.
  3. **Staging first.** A change to how the server starts, its config, its infrastructure or its database access runs on `event-service-staging` before it merges.
  4. **The freeze.** From Wed 11 Nov, a week before the showcase, only fixes merge to the backend. The last merge of all is on Mon 16 Nov: from then until the showcase ends, nothing merges to `main` except a fix Adam approves, announced in the team chat, so nothing deploys the night before. Since every merge migrates, the freeze stops migrations too.
  5. **Rolling back.** The Event Service: Adam sends all traffic back to the previous revision, with `gcloud run services update-traffic` or the console, and Julian as the backstop. A Worker: revert the commit on `main` and Workers Builds deploys the revert in a few minutes, or Julian rolls back one version. Either way, revert the bad commit straight after, or the next deploy brings it back. One version back is safe, because every migration works with the version before it, unless the bad deploy changed a secret's version: never roll back past a change of secret, since the older version uses the older value, which may no longer work or may be the one that leaked. A bad deploy that changed a secret is fixed forward instead, with a new pull request pinning a version that works (12 Oct). The database is never rolled back. Tried on staging on 12 Oct (BAC-13); the rehearsal tries it on production.
  6. **The hand-off.** A change to `packages/handoff` must work with the other service's previous version.
  7. **Copies.** Adam takes one with `db:backup` before merging a migration, just before the test data is cleared, and at the end of the event day. They stay on his laptop, never in GitHub or a chat.
  8. **On the event day,** only Adam changes data, with a fresh copy first and Ethan reading the query. A counting or display bug is fixed by rolling back, not by changing data.

  Where a rule needs something that doesn't exist yet, such as `db:backup` or `packages/handoff`, the README says it's coming.

**Checkpoint 4:** the layout, the stack table and the diagram for `apps/geekykey-service`, `apps/event-service`, `apps/geekykey-web`, `apps/event-web` and `packages/handoff`; the four local ports; and one `pnpm dev`.

**When Zi Tao's HTTPS firmware lands:** "Station firmware" says the server setting is a full base URL: `http://A-Mac.local:8000` locally, `https://event-api.geekshacking.com` until checkpoint 4, and `https://key-api.geekshacking.com` after it.

### 8.2 Other docs

- **`apps/frontend/CLAUDE.md`,** which becomes `apps/event-web/CLAUDE.md` at the split, for Ethan to update: the backend is Node on Cloud Run, not a Worker; the station screens (creating a station, its key, disabling it) stay on the organizers' station board; there is no status call.
- **`apps/geekykey-web/CLAUDE.md`:** no GeekyKey admin screens; a GeekyKey admin releases a found token on its token page.
- **The Single Source of Truth** still says 17 Nov for the showcase, and Docker on Cloud Run with SQLite; it's the team's to correct.

---

## 9. What each person needs from us

### Julian

- **Agreed on 8 Oct, to do:** ~~give Adam a role that can grant, so Adam runs steps 6 to 8 of `infra/README.md` himself (the keyless sign-in, each account's access, and Logs Viewer; [what to ask him, and Adam's own steps](assets/cloud-run-setup-who-does-what.md))~~ (9 Oct); ~~the domain mapping for `event-api.` (step 9, which needs `geekshacking.com` verified with Google), in the web console (the project itself is `geekykey-b035a`, 9 Oct); add the DNS record for `event-api.` once we're ready (9 Oct)~~ (11 Oct); ~~disconnect Workers Builds from `apps/backend`~~ (no build since 8 Oct); make the repo public and protect `main`; ~~link GeeksHacking's billing account to our Firebase project~~ (done by 9 Oct); keep `key.geekshacking.com/t/` working for as long as tokens are in use.
- **Still to ask:** the budget alert; how the team sees the GeekyKey Service on the day (section 12); the showcase's hours.
- **At checkpoint 4:** connect `geekykey-service` to Workers Builds from `apps/geekykey-service`, with the settings Adam sends; set its `SESSION_SECRET`, as a random value nobody keeps, and the two keys Adam sends; a screen share for the log check; note the three rate-limit namespace IDs we use (section 5.1). And the Event Service's new repo, if it moves then.
- **At checkpoint 5:** attach `key.geekshacking.com` to `geekykey-web` and `event.geekshacking.com` to `event-web`, and connect both.
- **On the day, and before it:** at the showcase himself (8 Oct), and reachable by phone, with his number on the event-day sheet if he agrees; upgrade to Workers Paid on the spot if we pass 70% of the free day; roll a Worker back when we ask, and roll the Event Service back if Adam can't; check TiDB's Request Units the evening before; restore TiDB's backup if the cluster is lost. How the team sees the GeekyKey Service's logs and the account's usage is still open (section 12).
- **Keep off:** Bot Fight Mode on geekshacking.com, which could challenge every station.

### Qing Guan

- **Now, before Mr Pang is asked** (Adam, 10 Oct): [an OIDC client for our Firebase project](assets/message-to-qing-guan-firebase-client.md), with Firebase's redirect URL; its client ID and secret; and whether the ID token carries the user's name. The Portal's issuer is `https://hackomania-api.geekshacking.com/`, which offers the code flow and `openid profile email`.
- **Parked until events log in through the Portal** (ADR 0004): [logging in through the Portal](assets/message-to-qing-guan-login.md), with its two OAuth apps.
- **The tag APIs,** after the showcase: his team agrees with our approach (8 Oct). Part 2 of [the tag APIs message](assets/message-to-qing-guan-tag-apis.md) goes when they start.
- **On the day:** reachable by phone, for the Portal and the zone. His custom rule for `key-api.` is already on (BAC-8).

### Ethan

- ~~**Review version 0.3 of the API agreement**~~ (section 7). *Done:* his approval of 0.4 on 10 Oct covers it (Adam, 12 Oct).
- **The screens track** in section 6, with his team, the Linear tickets the rewrite changes (listed in "Fold the answers into the spec"), and the edits to `apps/frontend/CLAUDE.md` (section 8.2).
- **Own the two forwarding Workers** once Adam has written them. Adam reviews any change to their list of paths.
- **Access:** none on Cloudflare (Julian, 1 Oct 2026); his screens deploy when his pull requests merge, and roll back by reverting. Logs Viewer on Google Cloud, for the Event Service's logs, and no deploy role there.
- **Install Docker** to run the backend locally.
- **The Firebase login on both sets of screens,** now that the check has passed (checkpoint 5, FRO-33).
- **On the day:** watch the screens and roll them back by reverting; a second pair of eyes on the Event Service's logs; read any query Adam runs to change data; at the desk whenever Adam isn't; an organizer who disables and enables stations, and a GeekyKey admin who releases found tokens.

### Zi Tao

- **[The station contract](assets/message-to-zi-tao-station-contract.md),** with its notes of 5 and 6 Oct: the address and HTTPS with the 14 roots, the heartbeat with `reader_ok` and the clock, the statuses and the screen table, the resend pace, and the three rules for the station key. Since 5 Oct, `no_event` is retired and organizers issue station keys. Since 8 Oct, a reader moves to another event by sending its saved taps, then taking the new event's key through the setup mode. Since 6 Oct, the "no answer" row says `Tap saved` / `Will send later`.
- **The firmware already follows the contract's queue rules,** checked on 6 Oct: any status removes a tap, a `400` drops the batch, and saved taps go together at most once a minute. It still has to be tried on a real station (HAR-9).
- **HTTPS (HAR-10):** passed on a real station on 12 Oct, in Adam's PR #53, since Adam took the ticket over: `SERVER_URL` is a full base URL, `https://event-api.geekshacking.com` until checkpoint 4, then `https://key-api.geekshacking.com`, checked against the 14 roots in `ca_roots.h`. `event-api.` answers with Cloudflare's certificate, as `key-api.` will, so the same 14 roots cover both.
- **The heartbeat (HAR-11),** once checkpoint 3 adds it.
- **The setup mode,** before checkpoint 4 (8 Oct): a station takes a new server address, station key and Wi-Fi network from a serial terminal or a browser page, without a reflash, and clears its saved taps when the key changes. Which of the two is his choice.
- **At checkpoint 4:** set each station's server to `key-api.` through the setup mode, keeping its key (HAR-13).
- **[The token writer](assets/message-to-zi-tao-token-writer.md)** (HAR-12): every token written before the rehearsal, and Adam keeps a copy of the password.
- **Access:** none on Cloudflare (Julian, 1 Oct 2026), and none on Google Cloud (Adam, 9 Oct).
- **On the day:** watch the stations and walk to any that turns red; an organizer who disables and enables stations; enter a replaced key through the setup mode, with Adam's agreement.

### Joshua

- The game ideas from 8 Oct, and whether the showcase has a theme, which Adam asks the teachers.
- The export keeps ten columns, as he confirmed in [Does the A/B analysis need token IDs or unclaimed-token taps?](issues/16-ab-analysis-export.md). The end-of-day copy feeds his analysis.
- He runs the A/B study on the day, and isn't a watcher.
- The Sprint 2 A/B test's setup, with Adam (section 12).

---

## 10. Event day

The showcase is on Wed 18 Nov 2026 at Ngee Ann Polytechnic, with setup there on Tue 17 Nov.

### 10.1 The run-up

- **By Sat 7 Nov, the rehearsal on production,** with the warm instance on. It runs the evening-before steps (the freeze, the saved-taps check, a copy, the clear), the morning check, the team using passports and tapping stations for an hour, the one restore try, one rollback of the Event Service by revision and one of a screens Worker by reverting, and pulling one station's power to watch it turn red on the board. The watchers use the saved queries and the sheet as they would on the day. Then the data is cleared again, and the warm instance switched off. Its numbers decide the Cache API for the registered stations and whether the Workers free plan holds (section 11.1). It comes out of November's TiDB allowance, which the showcase also draws on.
- **The morning of Tue 17 Nov:** Adam switches the warm instance on, before the freeze.
- **The freeze:** only fixes merge to the backend from Wed 11 Nov, and nothing merges after Mon 16 Nov (section 8.1).
- **The evening before, Tue 17 Nov,** after the day's setup at the venue: every station shows 0 saved taps on the board; Adam runs `db:clear-test-data`, which takes its own copy first; and from then on nobody makes a test claim or taps a claimed token. If we're still on TiDB's free allowance, Julian checks its Request Units, which only he can see: if less than twice what the rehearsal used is left, he raises TiDB's spending limit above $0.
- **The morning,** before check-in: tap each station with an unclaimed token and expect `Not claimed yet`, which proves the station's Wi-Fi, key, certificate and registration and stores nothing. The station board shows any station missing passport settings. The organizers' stats still show 0 taps.
- **Check-in:** tokens are handed out and claimed (provisional). Team members who play claim again like everyone else.
- **The end of the day:** Adam takes a copy, the source for Joshua's analysis. The freeze ends when the showcase does, and Adam switches the warm instance off.

### 10.2 Who watches

- **Adam:** the services, through the Event Service's logs in Cloud Logging and the station board. He decides on fixes, rolls the Event Service back, and he's the only one who changes data. The GeekyKey Service's logs are Julian's to open (section 12).
- **Zi Tao:** the stations, walking to any that turns red.
- **Ethan:** the screens, which he can roll back, and a second pair of eyes on the Event Service's logs.
- **Joshua:** runs the A/B study. Not a watcher.
- **The desk:** one laptop keeps the station board open all day. Adam or Ethan is at the desk at every moment, and whoever leaves hands over first. Once an hour, the desk looks down the last-tap column. The rota's times stay blank until the programme is out.
- **Organizers and GeekyKey admins on the day:** Adam, Ethan and Zi Tao. As organizers they disable and enable stations; a replaced key goes in through the station's setup mode, so it stays with Zi Tao, with Adam's agreement. As GeekyKey admins they release found tokens.
- **If we're still on the Workers free plan:** someone checks the account's Workers requests every hour from 08:00, when they reset, and if they pass 70% before the event ends, Julian upgrades on the spot. Only Julian can see them today (section 12).

### 10.3 Rules for touching data

- The freeze covers migrations: no migration runs on the day, and a fix that needs one waits until the event is over.
- A counting or display bug is fixed by rolling back, not by changing data. Stamps and points are worked out from taps every time they're read.
- Only Adam decides to change data, with a repair query or `db:restore` for chosen tables. He takes a fresh copy first, and Ethan reads the query before it runs. If Adam can't be reached, nobody changes data, and Ethan can still roll back the screens.
- If TiDB or Cloud Run is down, nothing is restored. Stations keep their taps and resend them, their heartbeats still set their clocks, and we wait.
- If the whole cluster is lost: Julian restores TiDB's latest daily backup into a new cluster; Adam creates the two logins there, adds their new URLs to Secret Manager and deploys a revision pinned to them; then he restores our own copy on top, if it's newer. Probably under an hour.
- Taps lost to a restore come back from the `tap_stored` log lines, kept 30 days in Cloud Logging. The tool that replays them is written only if it's ever needed.

### 10.4 The event-day sheet

One page, printed and kept at the desk, with Julian's and Qing Guan's numbers if they agree.

| What you see | Most likely | Who acts | What they do |
|---|---|---|---|
| A station red on the board: offline | Power or Wi-Fi | Zi Tao | Walks over. The station keeps its taps and resends them |
| A station red: online, but holding saved taps | Hand-offs or owner lookups failing | Adam | Checks the Event Service's logs, and asks Julian about the GeekyKey Service's. If a fix just went out, sends traffic back to the previous revision |
| Many stations show `Will send later` | The Event Service is down, slow or cold, or TiDB is | Adam | Checks Cloud Run and the warm instance. Stations keep their taps |
| A station red: reader not responding | A dead or loose reader | Zi Tao | Swaps the station, or sends people to the next one. The QR fallback is at the desk |
| A station shows `Setup error` | A wrong key, or the station is disabled | An organizer | Checks the station on the station board |
| Many `Not claimed yet` at stations | Participants haven't claimed their tokens | Whoever is at the desk | Helps them claim on their phones, or by typing the UID in My tokens |
| A busy station's last tap is long ago | A fault the reader check can't catch, or older firmware | Zi Tao | As for a dead reader |
| The passport or organizer screens are broken | A bad screens deploy, or the Event Service | Ethan, then Adam | Reverts the last screens merge, or asks Julian to roll back `event-web` or `geekykey-web`. If the Event Service is at fault, Adam rolls it back |
| Logins fail, and people already logged in are fine | Firebase, or GeeksHacking's login inside it | Adam checks Firebase's status, and calls Qing Guan for GeeksHacking's login | Taps still count. New people try Google sign-in, or again later |
| Error 1027 everywhere | The free day's Workers requests are used up | Adam calls Julian | Julian upgrades to Paid |
| Database errors from the Event Service | TiDB is down, or its monthly allowance is used up | Adam finds Julian, who is there | Julian checks the TiDB console |
| Nothing is reachable | Cloudflare | Nobody | Watch cloudflarestatus.com. Stations keep their taps |
| A station has gone missing | Theft | An organizer | Disables it on the station board. Its key is replaced before it's used again |
| The morning of 17 Nov, and after 18 Nov | The warm instance | Adam | Switches it on, then off, with the runbook's command |

Accepted: between the first deploy and the rehearsal, a fault is noticed only if someone happens to be using the system; if Adam and Ethan both leave the desk without handing over, a fault waits until someone looks; a dead reader on a station with older firmware shows only as a stale last tap; and on the free plan, a sudden rush can use up the day between two hourly checks.

Sources for section 10: [How do we notice trouble on event day, and who watches?](issues/20-event-day-monitoring.md), [How do we back up the database, recover it on event day, and clear the test data before the doors open?](issues/19-backups-and-test-data.md), [How do deploys and secrets work?](issues/09-deploys-and-secrets.md), [How is the Event Service built, deployed and staged on Cloud Run?](issues/27-event-service-on-cloud-run.md)

---

## 11. Provisional

### 11.1 Staying on the free plans

**Cloudflare.** GeeksHacking's account stays on the free plan, and Adam accepts it for the showcase (7 Oct), because fewer people are expected than the worst case.

- **What counts** against the 100,000 Workers requests a day, shared by every Worker on the account and reset at 08:00 Singapore time: taps and heartbeats at `key-api.`, the GeekyKey screens' calls, and every passport and organizer poll that `event-web` forwards to Cloud Run. Only plain files are free. A showcase day should use about 60,000 to 90,000, mostly the organizers' screens, which poll all day ([the estimate](assets/message-to-julian-workers-requests.md), part 3). Going over stops every Worker on the account until 08:00 the next day: stations keep their taps, but nobody gets a stamp.
- **What we measure:** the passport poll at checkpoint 5, and a whole day at the rehearsal. Also the CPU time of a 500-tap batch on the GeekyKey Service at checkpoint 4, against the free plan's 10 ms a request, though with no database it should be small; and our log events against Workers Logs' 200,000 a day, now that `tap_stored` is written on Cloud Run.
- **Outside requests:** a station request makes up to three calls to Cloud Run (the registered stations on a fill, the owners and the hand-off), far under the free plan's 50. Before the switch the GeekyKey Service uses no cache store, so no other free limit applies.
- **Ways to fit, if the rehearsal says so:** poll the organizers' screens less often, or poll only while a screen is on show, which TanStack Query already does for hidden tabs. A push design was ruled out by the mentors on 24 Sep unless a game needs it.
- **Or pay.** Workers Paid starts at $5 a month. A flood from many addresses could still use up the free day, which the rate limits can't stop. With the free plan accepted, the 29 Sep decision on Paid by 11 Nov is moot unless the rehearsal passes about 70,000 requests.

**Cloud Run.** The free tier is 2 million requests and 180,000 vCPU-seconds a month, shared across GeeksHacking's billing account, and a showcase day fits. One warm instance on event days costs cents. A budget alert goes to Julian and Adam (still to confirm, 8 Oct).

- **The first numbers** (staging, 11 Oct, BAC-12). A tap is one request, and a warm one takes 68 to 92 ms on Cloud Run (BAC-19). 60 warm taps sent 2 seconds apart billed 5.2 vCPU-seconds, about 0.09 each. They carried made-up keys, so they stopped at the station lookup and answered in a median of 17 ms. A real tap should bill about the same, a little under 0.1 vCPU-second, though that wasn't measured. Requests that overlap share their billed time, so a busy instance costs less per request. A cold start bills its start-up too, about 1 to 2 seconds. [The measurements](assets/cold-start.md).
- **What a showcase day's requests use:** the 60,000 to 90,000 Worker requests above, nearly all of which reach Cloud Run, at about 0.1 vCPU-second each when warm, come to at most 9,000 vCPU-seconds: about 5% of the month's free CPU and 4.5% of its free requests, each day.
- **Not yet known: the warm instance.** Kept from the morning of 17 Nov to the end of 18 Nov, about 40 hours, plus the rehearsal, it is up to about 150,000 instance-seconds. If Cloud Run bills its idle time as vCPU-seconds against the free tier, that alone is most of the month's 180,000, and the rest is paid. Google's billing page doesn't say how idle time is billed under request-based billing, so it's measured before the rehearsal: `--min=1` on staging for an hour, then `billable_instance_time` read for that hour.

**Firebase.** Google sign-in is free for up to 50,000 users a month. GeeksHacking's login, as an OIDC provider, is free for 49 users a month, then US$0.015 each, on GeeksHacking's billing account.

**TiDB.** Starter's free 50 million Request Units a month, after which TiDB refuses new connections. The passport's and organizers' polls reach it from Cloud Run, and staging draws on the same allowance. Only Julian can see the console. A spending limit above $0 would also keep backups for up to 30 days, at a time we choose, instead of one day at a random time.

- **The first numbers** (the whole cluster, both databases, about 10 to 12 Oct, from Julian's screenshots of the console's metrics, BAC-12). Two days of staging's and production's first taps, the cold-start rounds and the station's HTTPS taps used Request Units in short bursts of up to about 9 a second, and none in between: at most a few tens of thousands of the month's 50 million. No query failed, no transaction waited on a lock, a transaction took under 4 ms on average and about 40 ms at worst, and no more than one connection was open at once.
- **What a showcase day uses** isn't known from this. The bursts of about 9 a second came with under 0.15 queries a second, so a request, with the sign-in when it opens a connection, may cost tens of Request Units. At 60 each, a day's 60,000 to 90,000 requests would use about 5 million, a tenth of the month. The rehearsal measures it, and Julian's check the evening before (section 10.1) stays.

### 11.2 After the event

What happens to the showcase's data once it ends. Julian suggested keeping a per-event copy of user details and deleting it afterwards. The showcase's users are Firebase users (ADR 0004), so nothing about them reaches GeeksHacking's database, and its claims are deleted with its data rather than copied to the Portal. Stations are the Event Service's own, so there's nothing to unlink. The end-of-day copy on Adam's laptop feeds Joshua's analysis, and our copies are deleted along with the event's data. The Single Source of Truth plans the documentation and code handover to GeeksHacking for 19 and 20 Nov, which bears on who runs the deletion.

### 11.3 Other provisional decisions

Settled on 8 Oct, and so no longer here: the claims stand-in (agreed), our own Google Cloud project (agreed), Pulumi in TypeScript (no infrastructure as code for now), and moving a reader by a reflash (a setup mode instead). Settled on 10 Oct: how each service checks a Firebase login, since a Worker does it in about 1 ms of CPU (BAC-20). Settled on 11 Oct: the 4-second shared deadline, by the cold start below. Settled on 12 Oct: `event-api.` as a Cloud Run domain mapping, which works, behind Cloudflare's proxy (BAC-11).

| Decision | Firm when | Fallback |
|---|---|---|
| GeeksHacking's login offered at the showcase, inside Firebase | Mr Pang agrees. Built before he's asked (Adam, 10 Oct), once Qing Guan issues the OIDC client | The provider turned off: Google sign-in only |
| No server-side tap queue | The stress test (checkpoint 8) | A queue, from the backlog (section 12) |
| The showcase on the Workers free plan | The rehearsal's day of requests | Slower organizer polling, or Workers Paid |
| The Cache API for the registered stations: not used | The rehearsal's `stations_copy_filled` | Added behind memory |
| Owners cached in the Cache API after the switch, for 5 minutes to an hour | Built at the switch | No cache, if the Portal keeps up; Redis or KV, if a per-data-centre cache is too loose |
| Tokens claimed at check-in | Adam decides ("still up to discussion") | Release only the team's own claims instead of emptying `tokens` |
| The clear as a laptop task | Adam decides | A manual workflow, once copies have a private home such as a Cloud Storage bucket |

**The cold start, measured** on `event-service-staging` on 10 and 11 Oct (BAC-12), in 13 rounds that each woke a new instance. "Cloud Run" is the latency in its request log; "curl" is the whole request from a laptop in Singapore, with a new TLS handshake. The tap carried a made-up key, so it opened the first TiDB connection but skipped the tap's own transaction (about 0.1 s warm). [Every round](assets/cold-start.md).

| Startup CPU boost | Cold tap, Cloud Run | Cold tap, curl | Cold health check, Cloud Run |
|---|---|---|---|
| On (4 taps, 4 health checks) | 1.31 to 2.00 s, mean 1.59 | 1.82 to 2.60 s, mean 2.20 | 0.33 to 0.99 s |
| Off (3 taps, 2 health checks) | 1.31 to 2.05 s, mean 1.68 | 1.84 to 2.52 s, mean 2.28 | 0.68 to 0.69 s |

Boost stays on, as the runbook already has it: cold taps were a little faster with it, though by less than the spread between rounds. Day was no slower than night. The slowest cold tap took 2.05 s on Cloud Run and 2.60 s at curl, which leaves at least 1.3 seconds of the deadline even with the tap's own transaction. While the claims stand-in and the passport share one Cloud Run service, only the owner lookup can wake it, so the hand-off after it is warm. Another team's Event Service brings its own cold start, and should keep warm on event days, as the agreement asks. The 4 seconds stay.

---

## 12. Still to confirm

**Facts to check:**

- ~~**Who adds the DNS record for `event-api.geekshacking.com`,** with Cloudflare's proxy off, and how we ask when ready.~~ *Answered 9 Oct:* Julian adds it, once we tell him it's ready. He added it on 11 Oct.
- ~~**`event-api.`'s record with Cloudflare's proxy off** (BAC-27).~~ *Answered 12 Oct:* it had the proxy on, and Adam kept it, since a request sent the way a station sends one passes through (section 3.2).
- **The budget alert** on the project, to Julian and Adam (asked 8 Oct, not answered).
- **What Secret Manager costs us** (Julian asked, 13 Oct). Google bills about US$0.06 a month for each stored version of a secret, a disabled one included, and US$0.03 for each 10,000 reads, after 6 versions and 10,000 reads free each month, shared across the billing account. We have 10 versions, so it's $0.24 a month if the free 6 are ours, and $0.60 if other projects on GeeksHacking's billing account use them. Reads stay free: each instance start reads 4. Julian can see in Billing → Reports, filtered to Secret Manager, whether other projects use the free 6. *Settled 13 Oct:* each service's four runtime values go into one secret, `APP_SECRETS` (section 5.1), at Julian's suggestion, so we store 4 versions and each instance start reads 1. That's free unless other projects on the billing account use 3 or more of the 6.
- ~~**Which roles Adam gets to make the resources by hand,** or whether Julian makes them from the runbook.~~ *Answered 9 Oct:* Adam is Editor on `geekykey-b035a`, which creates resources but grants nothing. He made the resources (steps 1 to 5). Julian, as Owner, gives him a role that can grant, so he runs the grants too (steps 6 to 8); Julian runs the domain mapping and the budget (steps 9 and 10). *Found 13 Oct:* that role was taken away after 9 Oct, so any grant since is Julian's, such as each service's access to its `APP_SECRETS` (BAC-30). Editor can't read a secret's value either.
- **That "v1" means what we read it as** (section 2, answer 3): the v1 interface and the first-generation execution environment.
- **Whether the Portal's web app is on GeeksHacking's Cloudflare account, and runs a Worker on each page load,** which would count against the same free day (asked 8 Oct, not answered).
- **The showcase's hours,** and whether Adam or Ethan presents at set times.
- **What the QR fallback scans.** It takes a user ID only, and the showcase's users aren't Portal users, so the Portal's participant QR code no longer fits. Likely a QR code of the user ID on the passport, which Ethan's team would add.

**Open, for Adam:**

- **The cooldown.** The meeting suggested 15 minutes instead of 5. Every accepted tap after the cooldown earns the station's points again, so the cooldown sets how often one person can earn at one station: 12 times an hour at 5 minutes, 4 at 15. It's one setting, `TAP_COOLDOWN_SECONDS`, so it can change up to the freeze.
- **A server-side tap queue** (backlog, BAC-22, Julian, 8 Oct). Taps would be put on a queue and stored a moment later, so a burst can't overwhelm TiDB. The catch: the station waits for each tap's verdict, for amber "too soon" and "claim this token" ("Does a station wait for the Event Service's verdict?"), and a queue can't give a verdict at once. The stress test decides whether we need one; if we do, the options to weigh are a queue inside the server with the verdict still worked out first, or Cloud Tasks or Pub/Sub with the station answered "recorded".
- **Getting the keys onto the Worker at checkpoint 4** (13 Oct). Its step 1 has Adam read `EVENT_SERVICE_KEY` and `CLAIMS_STAND_IN_KEY` once and send them to Julian, but Adam's Editor role can't read a secret. The same goes for any later replacement, such as one the log check calls for. The choices: Julian, as Owner, copies each value from Secret Manager into the Worker's secrets himself, so no key ever passes through a chat (suggested); or Julian gives Adam read access to production's two keys for the day. Settle it before checkpoint 4, and change section 5.2 and checkpoint 4 to match.
- **Seeing the GeekyKey Service without access** (Julian, 1 Oct 2026), asked again on 8 Oct with no answer. The Event Service's logs and the station board are ours, on Google Cloud. What the team still can't see is the GeekyKey Service's logs (failed key checks, owner lookups and hand-offs, `stations_copy_filled`) and the account's Workers requests. The choices: ask Julian for read-only access to Workers Observability and the account's usage; Julian, who will be at the showcase, or someone he names, watches them on the day; or rely on what the stations and the station board show. Settle it before the rehearsal.
- **Two repos at the split** (Julian, 1 Oct 2026). The Event Service's repo goes under the GeeksHacking organisation (8 Oct). Before checkpoint 4: how both repos get `packages/handoff`'s schemas; whether the end-to-end smoke test still runs on every pull request, and in which repo, now across two platforms; the move of `apps/frontend`, which becomes `event-web` there, for Ethan's team; and the claims stand-in, `infra/` and the deploy workflow, which go with the Event Service. The keyless sign-in trusts only this repo's ID (`1310668143`), so the new repo needs the provider's condition and both deploy accounts' bindings redone (the runbook's step 6), which takes a role that can grant (13 Oct).
- **Whether the GeekyKey Service gets a staging copy,** decided at the split. The stress test would use it.
- **The Sprint 2 A/B test.** The roadmap runs the A/B/C test at an SSTInc or CCA event between 5 and 18 Oct, on a date Mr Pang gives. It isn't confirmed yet, so nothing waits on it until it is. Condition A needs claimed tokens, stations and the passport; Condition B needs QR scanning and the passport; both feed the export. Participants see their passports only by logging in, and dev-login only signs in seeded users. Since 8 Oct, the login no longer waits on the Portal: Firebase's Google sign-in can be set up by Adam alone. The choices, for Adam and Joshua:
  - **on production:** checkpoints 2 to 7 and the Firebase login, within one to three weeks;
  - **on a laptop at the venue,** as in the 23 Sep test: today's backend, with the stations over `http://`, and Firebase's Google sign-in added to it;
  - **later:** a date late in Sprint 2 or after it, if the course allows.

## 13. Sources

The map: [Move GeekyKey to TiDB and Cloudflare](map.md). Its tickets, in the order the map lists them:

- [Does TiDB fit this backend?](issues/01-tidb-fit.md)
- [What does running the backend on Workers involve?](issues/02-workers-runtime.md)
- [How can the frontend run on Cloudflare and reach the backend?](issues/03-cloudflare-frontend.md)
- [Can the architecture carry the 24 Sep game ideas?](issues/04-future-ideas-fit.md)
- [How is the frontend set up, and how does the browser reach the backend?](issues/05-frontend-setup-and-routing.md)
- [Which hostnames, and which OAuth redirect URLs?](issues/06-hostnames-and-oauth-redirects.md)
- [Which parts of today's backend belong to the GeekyKey Service, and which to the Event Service?](issues/12-backend-split.md)
- [How is the database set up?](issues/07-database-setup.md)
- [How do local dev, tests and CI get a runtime and a database?](issues/08-dev-test-ci.md)
- [What is a token's ID, and what URL is written on each token?](issues/13-token-id-and-url.md)
- [How do stations talk to the GeekyKey Service?](issues/11-station-endpoints.md)
- [How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?](issues/14-event-service-triggers.md)
- [Which screens belong to which service, and how does each know who is logged in?](issues/15-screens-and-login.md)
- [Does the A/B analysis need token IDs or unclaimed-token taps?](issues/16-ab-analysis-export.md)
- [How do deploys and secrets work?](issues/09-deploys-and-secrets.md)
- [What does the GeekyKey Service need from the Portal's tag APIs?](issues/17-portal-tag-apis.md)
- [How do we back up the database, recover it on event day, and clear the test data before the doors open?](issues/19-backups-and-test-data.md)
- [How do we protect our public addresses without blocking the stations?](issues/18-protecting-public-addresses.md)
- [How do we notice trouble on event day, and who watches?](issues/20-event-day-monitoring.md)
- [Write the migration spec](issues/10-migration-spec.md)
- [What does Cloud Run "v1" mean, and what does running the Event Service there involve?](issues/21-cloud-run-facts.md)
- [Which cache can a Worker use for free?](issues/22-worker-cache-options.md)
- [Who registers stations, where is a station key checked, and how does the GeekyKey Service know which Event Service a station feeds?](issues/24-stations-without-a-database.md)
- [Where do token owners live until the Portal's tag APIs exist, and what does the token page do?](issues/23-token-owners-before-portal.md)
- [Does a station wait for the Event Service's verdict?](issues/25-wait-for-the-verdict.md)
- [What does the GeekyKey Service cache, and in which store?](issues/26-what-to-cache.md)
- [How is the Event Service built, deployed and staged on Cloud Run?](issues/27-event-service-on-cloud-run.md)
- [Fold the answers into the spec](issues/28-fold-into-the-spec.md)

Decision records: [ADR 0001, tokens are identified by their hardware UID](../../docs/adr/0001-token-id-is-the-hardware-uid.md); [ADR 0002, each service logs users in through the Portal itself](../../docs/adr/0002-each-service-logs-in-through-the-portal.md); [ADR 0004, the showcase logs in through Firebase](../../docs/adr/0004-the-showcase-logs-in-through-firebase.md); and [ADR 0003, the Event Service runs on Cloud Run, and the GeekyKey Service keeps no database](../../docs/adr/0003-event-service-on-cloud-run-geekykey-service-without-a-database.md).

Research: [Cloud Run](research/cloud-run.md), [a Worker's cache](research/worker-cache.md), [Node, Bun and Deno, and how the Portal runs](research/backend-runtimes.md), and [Hyperdrive's alternatives](research/hyperdrive-alternatives-benchmark.md).

Meetings: [Julian and Qing Guan, 8 Oct, with the answers](../meetings/2026-10-08-julian-and-qing-guan.md).

Messages: [what to ask Julian and Qing Guan on 8 Oct](assets/message-to-julian-workers-requests.md), [to Julian, hostnames and deploys](assets/message-to-julian-redirect-urls.md), [to Julian and Qing Guan, the tag APIs](assets/message-to-qing-guan-tag-apis.md), [to Qing Guan, logging in](assets/message-to-qing-guan-login.md), [to Zi Tao, the station contract](assets/message-to-zi-tao-station-contract.md), [to Zi Tao, the token writer](assets/message-to-zi-tao-token-writer.md), [to Zi Tao, the Wi-Fi password](assets/message-to-zi-tao-wifi-password.md), and [to Joshua, the export](assets/message-to-joshua-ab-export.md).

Outside the map: the Single Source of Truth's roadmap (`Centralised-Capstone-Folder/01_Project Management/Geekykey Single Source of Truth.docx`, gitignored), and the station firmware as of 6 Oct 2026 (`firmware/geekykey_station/geekykey_station.ino`).
