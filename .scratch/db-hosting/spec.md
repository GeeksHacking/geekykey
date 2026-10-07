# Spec: GeekyKey on Cloudflare Workers, Cloud Run and TiDB

The hand-off spec for the map [Move GeekyKey to TiDB and Cloudflare](map.md), written on 29 Sep 2026 from its resolved tickets, and rewritten on 7 Oct 2026 after the map was redrawn. **Adam reviews this spec before any code changes.**

> **Rewritten 7 Oct 2026.** Checkpoint 2 couldn't be done as first written: Hyperdrive can't reach TiDB Cloud. On 2 Oct the Event Service moved to Google Cloud Run with TiDB, and the GeekyKey Service stays on Workers with no database ([ADR 0003](../../docs/adr/0003-event-service-on-cloud-run-geekykey-service-without-a-database.md)). The answers of the redrawn map's tickets are folded in here, from "What does Cloud Run "v1" mean, and what does running the Event Service there involve?" to "How is the Event Service built, deployed and staged on Cloud Run?". Checkpoint 1 is done. Several decisions are provisional until Adam meets Julian and Qing Guan on Thu 8 Oct; section 11.3 lists them.

- It says what we build, and in what order. Why we chose it, and what we turned down, is in the ticket each section links to.
- **Provisional** marks a decision that can still change, and says what would change it. Everything else is decided.
- **The spec's call** marks a gap that no ticket settled, which this spec had to fill to put the steps in order. Section 2 lists every one of them for review.
- Words such as token, claim, owner, registered stations and hand-off mean what [CONTEXT.md](../../CONTEXT.md) says. Field names and status codes live in [apps/API-AGREEMENT.md](../../apps/API-AGREEMENT.md), whose version 0.3 carries this rewrite (section 7).

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

- **Three kinds of service.** The Portal, Qing Guan's, knows who every user is. The GeekyKey Service is what stations and tokens talk to: it checks each station's key against the stations the Event Services have registered, finds each token's owner, and hands taps on. An Event Service runs one event's games and registers that event's stations. We build the GeekyKey Service, and one Event Service for the capstone showcase, whose first game is the passport.
- **Two platforms.** The GeekyKey Service and both sets of screens are Cloudflare Workers in GeeksHacking's account, which Julian sets up, and the team has no access to it (1 Oct 2026). The Event Service is a Node server on Google Cloud Run, which GitHub Actions deploys on every merge to `main`, in a Google Cloud project of our own (provisional until 8 Oct).
- **One TiDB database,** reached only from Cloud Run through an ordinary `mysql2` connection pool. The GeekyKey Service keeps no database: it keeps a copy in memory of the registered stations, and asks for everything else.
- **Claims stay on our side through the showcase,** in a claims stand-in on our Cloud Run server, behind one module, `Claims`, and move to the Portal's tag APIs after it (provisional until 8 Oct). The stand-in isn't part of the Event Service, so token IDs never reach one.
- **Four addresses,** chosen by Julian on 1 Oct 2026. Stations call `https://key-api.geekshacking.com`. People open `https://key.geekshacking.com` for the token page and My tokens, and `https://event.geekshacking.com` for the passport and the organizers' screens. `https://event-api.geekshacking.com` is the Event Service's own, called by the GeekyKey Service and by the Event screens' Worker.
- **Staging** is one copy of the Event Service, `event-service-staging`, beside it on Cloud Run, against its own database.
- **Move first, split second.** Today's backend already runs on TiDB (checkpoint 1). It moves unchanged to Cloud Run and is deployed. Then the line between the two services is drawn inside it. Then the GeekyKey Service is cut out as a Worker, and stations move to it. Login, the new features and getting ready for the day come after that. The whole move is eight checkpoints (section 6).
- **Dates.** The showcase is on Wed 18 Nov 2026 at Ngee Ann Polytechnic, with setup there on Tue 17 Nov. The rehearsal on production is by Sat 7 Nov. GeeksHacking's Cloudflare account stays on the free plan, which Adam accepts for the showcase (7 Oct), and the rehearsal checks it (section 11.1).

## 2. For Adam's review

### The spec's calls, 7 Oct

No ticket settled these. The rewrite needed them to put the steps in order.

1. **The order of the redrawn checkpoints** (section 6): checkpoint 2 is the move to Cloud Run, checkpoint 3 draws the line inside the one server, and checkpoint 4 cuts the GeekyKey Service out as a Worker. Stations call `event-api.` from checkpoint 2 and are reflashed for `key-api.` at checkpoint 4.
2. **Inside one server, the sides talk through their own requests.** At checkpoint 3, the GeekyKey side reaches the Event side and the claims stand-in through `app.request()` in the same process, with the same paths, bodies and keys it will send over HTTPS after the split. So the wire shapes and the key checks run on production before the split.
3. **`event_stations` goes.** The Event Service now owns `stations`, so the cooldown locks the station's own row, as checkpoint 1 already does.
4. **The heartbeat hand-off answers `204`,** and carries the station's optional fields as the station sent them (section 7).
5. **The claims stand-in's routes,** under `/claims-stand-in/v1`, with a fifth, read-only route for "Copy claims to the Portal" (section 4).
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
| **Portal** | Qing Guan | Cloud Run, in GeeksHacking's project | Who each user is. After the switch, also who owns each token | The Portal's own |
| **GeekyKey Service** | Adam | Cloudflare Workers | Checking station keys, the station's clock, finding each token's owner, handing taps and heartbeats on, the token page, My tokens, the GeekyKey admins | None. A copy in memory of the registered stations |
| **Claims stand-in** | Adam | Cloud Run, on our Event Service's server, until the switch | Who owns each token, until the switch | `tokens` |
| **Event Service** (the showcase) | Adam | Cloud Run | Its stations (IDs, keys, labels, health, disabling), taps, dropping replays, the cooldown, the passport (stamp slots, stamps, points), per-event users, the organizers, the station board, the tap log, stats, the export, the QR fallback | `stations`, `users`, `taps`, `passport_stations` |

The rules that hold the split together:

- The GeekyKey Service never knows about games, and keeps no database. The Event Service never sees a token's ID, only users.
- Each Event Service registers its own stations and issues their station keys. A station feeds the Event Service that registered it, so there are no links. A reader moved to another event becomes a new station there, by a reflash with its flash erased (provisional until 8 Oct).
- A tap by an unclaimed token stops at the GeekyKey Service. It gets `unknown_token` and a log line, and is stored nowhere.
- The Portal's user ID is the user ID everywhere. The GeekyKey Service keeps no users.
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

**The Cloud Run service** (provisional until 8 Oct: the project, the tool and the address).

- A Google Cloud project of our own, on GeeksHacking's billing account, so our roles never touch the Portal's. Its setup is infrastructure as code: Pulumi in TypeScript, in `infra/`, applied by GitHub Actions on `main`, as the Portal's is.
- `event-api.geekshacking.com` is a Cloud Run domain mapping with Cloudflare's proxy off, exactly like the Portal's `portal-api.` Google issues its certificate from Google Trust Services, whose roots the stations already trust. Cloudflare's zone rules don't cover it, and the `run.app` address stays open, so the limits and key checks in our own code protect both. The fallback, if domain mapping lets us down, is a Google load balancer at about US$18 a month.
- Region `asia-southeast1`; 1 vCPU and 512 MiB; up to 80 requests at once per instance; request-based billing, with startup CPU boost on. At most 2 instances, which also caps TiDB connections at 20.
- No warm instance, except one on event days: the rehearsal (by 7 Nov) and 17 to 18 Nov. Adam switches it on and off with a reviewed one-line change to the infrastructure code.
- Logs go to Cloud Logging. Its request logs record no headers, so no keys or cookies, but they do record full URLs. Adam, Ethan and Zi Tao can read them; Joshua doesn't need to.
- **Staging** is `event-service-staging`, in the same project, on `geekykey_staging`. It has no warm instance and only its `run.app` address, and Adam deploys it by hand, from any branch, by running the deploy workflow. Whether the GeekyKey Service gets a staging copy is decided at the split. The 1 Oct staging on Adam's own Cloudflare account was dropped on 7 Oct, before it was ever deployed.

**At the split, the Event Service and its screens move to a repo of their own,** at Julian's suggestion (1 Oct 2026), taking the claims stand-in, `infra/` and the deploy workflow with them. How `packages/handoff` and the smoke test work across two repos and two platforms is open (section 12).

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
3. One 4-second deadline starts, for the next two steps together (provisional, until the first deploy measures a cold start).
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
2. Someone not logged in sees a login prompt, and nothing is looked up. They log in through the Portal and land back on `/t/<UID>`. "Register the token (which will redirect to portal)", in Julian's words, is this login: claiming happens on our page.
3. The token page shows one of five things: a login prompt; **Claim** for a token nobody owns; your own token, with **Release** and a button for each event with a public address, such as "Open Capstone Showcase"; "This token belongs to someone else", with no name; or, for a GeekyKey admin, that line with a **Release** button.
4. My tokens, the home page of `key.geekshacking.com`, lists your tokens with **Release**, has a form to claim a token by typing its UID, and has the same button for each event.
5. A claim or a release that can't reach the claims stand-in, or later the Portal, says "Couldn't reach GeeksHacking. Try again.", and nothing is saved.
6. The passport, on `event.geekshacking.com`, logs in separately. If the Portal remembers the user, that second login is only a quick redirect.

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
| Event | `users` | `id`, `display_name`, `created_at` | The per-event copy. `id` is the Portal user ID, and the name is copied from the Portal at login. `portal_user_id` and `role` go |
| Event | `taps` | `id`, `station_id`, `client_tap_id`, `user_id`, `source`, `status`, `tapped_at`, `received_at` | `source` is `ENUM('nfc', 'qr_fallback')` and `status` is `ENUM('accepted', 'cooldown', 'no_game')`. `(station_id, client_tap_id)` is unique. `user_id` is never empty and has no foreign key, so a tap by someone who has never logged in is still stored. `token_uid` goes |
| Event | `passport_stations` | `station_id`, `name`, `location`, `points`, `added_at` | The passport's settings. Only these stations are stamp slots, in `added_at` order |
| Claims stand-in | `tokens` | `uid` (primary key), `user_id`, `claimed_at` | Only current owners: releasing deletes the row, so `revoked_at` goes. `user_id` is a Portal user ID with no foreign key. Marked "GeekyKey's stand-in, removed after the switch", and dropped then |

Sources: [Does TiDB fit this backend?](issues/01-tidb-fit.md), [How is the database set up?](issues/07-database-setup.md), [How is the Event Service built, deployed and staged on Cloud Run?](issues/27-event-service-on-cloud-run.md), [Who registers stations, where is a station key checked, and how does the GeekyKey Service know which Event Service a station feeds?](issues/24-stations-without-a-database.md), [How do we notice trouble on event day, and who watches?](issues/20-event-day-monitoring.md)

### 3.7 Room to grow

- **The 24 Sep game ideas all fit.** Live interaction would add something that holds connections open, such as a Durable Object or the Cloud Run server itself. Trading needs transactions, which an ordinary `mysql2` pool keeps simple. Nothing may rely on `taps.id` order to pair two people's taps. A second game inside the Event Service keeps one status per tap: `accepted` if any game counted it, otherwise `cooldown` if a game held it back, otherwise `no_game`. Each game keeps its own record of what it counted, so a bingo-only tap can't earn passport points. Source: [Can the architecture carry the 24 Sep game ideas?](issues/04-future-ideas-fit.md)
- **The Portal's tag APIs.** Only the `Claims` module changes (section 4), and the claims stand-in is deleted.
- **Other teams' Event Services** get the same three requests (the registered stations, the hand-off and the heartbeat hand-off) over HTTPS, with their own Event Service key, a section of the API agreement and a JSON Schema generated from `packages/handoff`. They register their own stations and issue their keys. Their own statuses pass through to stations, which treat any status they don't know as recorded. They log users in through the Portal themselves ([ADR 0002](../../docs/adr/0002-each-service-logs-in-through-the-portal.md)). Adding one is a reviewed change to the GeekyKey Service's settings and a deploy.
- **Another event.** A reader moves by sending its saved taps, then a reflash with its flash erased and a key from the new event's Event Service (provisional). If moves become frequent, the fix is a firmware setup mode that takes a new key without USB.
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
- **`PortalClaims`**, after the showcase, calls the tag APIs as the GeekyKey Service itself, with the client-credentials flow and its own OAuth app. It caches owners in Cloudflare's Cache API (provisional): owned tokens only, never "unclaimed", for 5 minutes, and a claim or release deletes the token's entry.
- **The deadline.** Each call gives up when its `signal` fires: the station request's shared 4 seconds, or 4 seconds of its own on the screens' calls (the spec's call). There's no retry.
- **When it can't answer** (no answer in time, a `429` or `5xx`, or a body that doesn't parse), it throws `ClaimsUnavailable`. The station route turns that into `503 claims_unavailable`, the same code before and after the switch, and the screens into "Couldn't reach GeeksHacking. Try again."
- **UIDs arrive normalised.** Who may release is decided by the routes: an owner passes their own user ID, and a GeekyKey admin passes the owner the token page found when it loaded, so a late or double click can't release a newer claim.
- **The cap** is 3 tokens, a GeekyKey Service setting, with no exemption for anyone. The claim route checks `tokensOf` before `claim`, and answers `409 token_limit_reached`. Accepted: two claims by one user at the same instant could leave them with 4 tokens.
- **Every release writes a `token_released` log line** saying who released which UID from whom. With no history kept, it's the only trace.

**The claims stand-in** keeps the `tokens` table and offers the four calls we're asking the Portal for, in [part 2 of the tag APIs message](assets/message-to-qing-guan-tag-apis.md). Before the split it's simply today's `tokens` table and claim code, moved to Cloud Run with everything else. From checkpoint 3 it's a folder of its own on the Cloud Run server, `claims-stand-in/`, with its own schema file, marked "GeekyKey's stand-in, removed after the switch". Its routes are the spec's call. Each takes `Authorization: Bearer <CLAIMS_STAND_IN_KEY>`, compared in constant time:

| Method | Path | Body or answer |
|---|---|---|
| POST | `/claims-stand-in/v1/owners` | `{ "uids": [...] }`, up to 500. Answers `{ "owners": [{ "uid", "user_id" }] }`, leaving unclaimed UIDs out |
| POST | `/claims-stand-in/v1/tokens/{uid}/claim` | `{ "user_id" }`. Answers `{ "result": "claimed" \| "already_yours" \| "taken", "claimed_at" }` |
| POST | `/claims-stand-in/v1/tokens/{uid}/release` | `{ "owner_id" }`. Answers `{ "result": "released" \| "not_owner" }` |
| GET | `/claims-stand-in/v1/users/{user_id}/tokens` | Answers `{ "tokens": [{ "uid", "claimed_at" }] }`, oldest claim first |
| GET | `/claims-stand-in/v1/tokens?after=<uid>&limit=40` | Every claim, in UID order, 40 at a time. Only "Copy claims to the Portal" uses it |

They aren't in the API agreement: nothing but the GeekyKey Service calls them, and they go after the switch. The switch is in section 6, "After the showcase".

Sources: [What does the GeekyKey Service need from the Portal's tag APIs?](issues/17-portal-tag-apis.md), [How do we protect our public addresses without blocking the stations?](issues/18-protecting-public-addresses.md), [Where do token owners live until the Portal's tag APIs exist, and what does the token page do?](issues/23-token-owners-before-portal.md), [Does a station wait for the Event Service's verdict?](issues/25-wait-for-the-verdict.md), [What does the GeekyKey Service cache, and in which store?](issues/26-what-to-cache.md)

---

## 5. Settings, secrets and bindings

Settings for a Worker live in its `wrangler.jsonc`. Settings for the Event Service live in its Cloud Run service's environment, set by the infrastructure code. Either way, they change through a reviewed pull request. Secrets live only on the services: Julian sets the Workers', and Adam adds the Event Service's to Secret Manager. Names marked "suggested" are the spec's.

### 5.1 Each part

**`geekykey-service`** (a Worker, from checkpoint 4)

| Kind | Name (suggested) | Value |
|---|---|---|
| Custom domain | `routes` | `key-api.geekshacking.com`, which Julian attached on 1 Oct 2026 |
| Side doors off | `workers_dev`, `preview_urls` | Both `false` |
| Binding | Rate limits | See the table below |
| Setting | `EVENT_SERVICES` | The list of Event Services. For each: an ID, a name, an `https://` address, and optionally a public address and name for the token page's and My tokens' buttons. For the showcase, one entry: `showcase`, "Capstone Showcase", `https://event-api.geekshacking.com`, `https://event.geekshacking.com` |
| Setting | `CLAIMS_STAND_IN_URL` | `https://event-api.geekshacking.com/claims-stand-in/v1`, until the switch |
| Setting | `GEEKYKEY_ADMINS` | Portal user IDs. Adam, Ethan and Zi Tao for the showcase |
| Setting | `MAX_TOKENS_PER_USER` | `3` |
| Setting | `MAX_TAPS_PER_REQUEST` | `500` |
| Setting | `TAP_DEADLINE_MS` | `4000`, the shared deadline. Provisional until the first deploy measures a cold start |
| Setting | `OAUTH_CLIENT_ID`, `OAUTH_REDIRECT_URL` | Its own OAuth app, and `https://key.geekshacking.com/auth/callback` |
| Setting | The Portal's login settings | Once Qing Guan gives them |
| Secret | `SESSION_SECRET` | Signs `gk_session` |
| Secret | `EVENT_SERVICE_KEY_SHOWCASE` | One for each entry in `EVENT_SERVICES` |
| Secret | `CLAIMS_STAND_IN_KEY` | Until the switch |
| Secret | `PORTAL_CLIENT_SECRET` | From the switch, for the client-credentials flow |

Every secret it has goes under `secrets.required`, so a deploy fails if one is missing.

**`event-service`** (Cloud Run, from checkpoint 2; until checkpoint 4 it is the whole backend)

| Kind | Name (suggested) | Value |
|---|---|---|
| Address | | `event-api.geekshacking.com`, a domain mapping with Cloudflare's proxy off, and its `run.app` address |
| Size | | As in section 3.2. Minimum instances 0, and 1 on event days |
| Setting | `ORGANIZERS` | Portal user IDs. `dev-organizer-1` locally |
| Setting | `TAP_COOLDOWN_SECONDS` | `300` |
| Setting | `MAX_TAPS_PER_REQUEST` | `500` |
| Setting | `OAUTH_CLIENT_ID`, `OAUTH_REDIRECT_URL` | Its own OAuth app, and `https://event.geekshacking.com/auth/callback` |
| Setting | The Portal's login settings | Once Qing Guan gives them |
| Secret | `SESSION_SECRET` | Signs `event_session` from checkpoint 4, and `gk_session` before that |
| Secret | `DATABASE_URL` | The app login's connection URL |
| Secret | `MIGRATION_DATABASE_URL` | Read only by the deploy job, for `db:migrate` |
| Secret | `EVENT_SERVICE_KEY` | From checkpoint 3. The same value as the GeekyKey Service's `EVENT_SERVICE_KEY_SHOWCASE` |
| Secret | `CLAIMS_STAND_IN_KEY` | From checkpoint 3 until the switch |
| Secret | `PORTAL_CLIENT_SECRET` | If Qing Guan issues one |

The service pins each secret to a version number, so changing one is a reviewed change and a new revision. The settings are read once at start-up, and a missing secret stops the server starting. `event-service-staging` has the same names, with its own values and `geekykey_staging`.

**`geekykey-web` and `event-web`** (Workers, from checkpoint 5)

| Kind | Value |
|---|---|
| Static assets | The Vite build, in single-page-app mode |
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
| `geekykey-service` | `USER_LIMIT` | A user on its API | Portal user ID | 60 | `7102` |
| `geekykey-service` | `TOKEN_LIMIT` | A user looking up and claiming tokens | Portal user ID | 20, on top of the 60 | `7103` |
| `event-service` | In memory, per instance | A user on its API | Portal user ID | 60 | None |

The status call's limit, `7104`, went with the status call on 5 Oct.

### 5.2 Where every credential lives

| Credential | Lives in | Set by | If it leaks or is lost |
|---|---|---|---|
| TiDB root login | `~/.config/geekykey/tidb.env` on Adam's laptop. Never deployed | Julian provided it | Ask Julian |
| TiDB app login | Secret Manager, as `DATABASE_URL` | Adam creates it with the root login and adds it from his laptop, keeping no copy | Adam resets it, adds a new version, and a reviewed change pins the service to it |
| TiDB migration login | Secret Manager, as `MIGRATION_DATABASE_URL`, and `~/.config/geekykey/` on Adam's laptop | Adam | Adam resets it, and adds a new version |
| Staging's two TiDB logins | Secret Manager, for `event-service-staging`, and the migration login in `~/.config/geekykey/` | Adam | Adam resets them. Neither can touch `geekykey` |
| `SESSION_SECRET`, one per service | A Workers secret on `geekykey-service`; Secret Manager for the Event Service | Julian, as a random value nobody keeps; Adam, with `openssl rand` piped into `gcloud secrets versions add --data-file=-` | A new one logs everyone out of that service |
| Event Service key, one per Event Service | A Workers secret on `geekykey-service`, and Secret Manager for ours | Adam generates 32 random bytes into Secret Manager, then reads the value back once to send to Julian privately, keeping no copy. Another team's key goes to that team, and to Julian | Set the new one on both sides outside the event. Hand-offs fail with `503` until both match, and stations resend |
| `CLAIMS_STAND_IN_KEY` | As the Event Service key | As the Event Service key | As the Event Service key. Deleted on both sides after the switch |
| Portal client secret, if issued | A Workers secret on `geekykey-service` | Qing Guan gives it to Julian, who sets it | Qing Guan and Julian replace it |
| Station key | The station's gitignored `secrets.h`. Only its hash is in the Event Service's `stations` | An organizer creates it on the station board, shown once | An organizer replaces it, keeping the station's ID, and Zi Tao reflashes the station |
| Token write password | `firmware/token_writer/secrets.h` (gitignored), and Adam's copy outside the repo | Zi Tao | Without it, tokens can never be rewritten |
| Wi-Fi details | Each station's `secrets.h` | Zi Tao | Change the password |
| Our database copies | Adam's laptop, outside the repo. Never GitHub, a workflow artifact or a chat | Adam | They hold Portal user IDs, names and who tapped where |

**GitHub holds no secret at all.** The deploy signs in to Google Cloud without a key (Workload Identity Federation), through two service accounts (the spec's call):

- **production's,** usable only by this repo's `main` branch, can deploy `event-service` and read its secrets, including the migration login;
- **staging's,** usable from any branch of this repo, can touch only `event-service-staging` and its secrets.

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
| Logging in | dev-login signs in seeded users. The Portal works too, once the `localhost` redirect URLs join their OAuth apps |

From checkpoint 4, one root `pnpm dev` starts all four. Mock mode stays for work on screens.

Sources for section 5: [How do deploys and secrets work?](issues/09-deploys-and-secrets.md), [How do local dev, tests and CI get a runtime and a database?](issues/08-dev-test-ci.md), [How do we protect our public addresses without blocking the stations?](issues/18-protecting-public-addresses.md), [How do we back up the database, recover it on event day, and clear the test data before the doors open?](issues/19-backups-and-test-data.md), [How is the Event Service built, deployed and staged on Cloud Run?](issues/27-event-service-on-cloud-run.md)

---

## 6. The migration plan

Each checkpoint is one deliverable: Adam builds it, it's reviewed, and only then does the next one start. The order is the spec's call. Checkpoints 6 and 7 can swap, and checkpoint 5 can move after them if the Portal's login details are late: they're built and tested locally with dev-login meanwhile.

| | Checkpoint | Done when | Waits on |
|---|---|---|---|
| 0 | The contract and the asks | **Done** for version 0.2 (29 Sep). Version 0.3, for this rewrite, is approved by Ethan before checkpoint 3 | Ethan's review |
| 1 | Today's backend on workerd and TiDB | **Done** (BAC-1 to BAC-6) | |
| 2 | The move to Cloud Run | A tap to `event-api.geekshacking.com` is stored in TiDB, after staging; the log check; the cold start is measured | Julian and Qing Guan: the project, the keyless sign-in, the roles and the DNS record (asked 8 Oct) |
| 3 | The line drawn inside | One server, with the GeekyKey side, the Event side and the claims stand-in talking only through their requests, on the new tables | Nothing outside the team |
| 4 | The GeekyKey Service cut out | `geekykey-service` runs at `key-api.`, the stations have moved to it, and the smoke test runs on every pull request | Julian: connecting `geekykey-service`, its secrets, and the Event Service's new repo |
| 5 | Login, and the screens deployed | Both logins work, the passport shows on a phone, the cookies are checked, the passport poll is measured | Qing Guan: the login details and two OAuth apps. Julian or Qing Guan: two domains |
| 6 | The GeekyKey Service's features | Tokens are claimed and released, and the limits hold | Ethan's team: the `geekykey-web` screens |
| 7 | The Event Service's features | Organizers create and disable stations, set up the passport and watch taps, and the export is right | Ethan's team: the `event-web` changes |
| 8 | Ready for the event | The copy, restore and clear tasks work, the restore is tried, the rehearsal is done by 7 Nov | The whole team |
| | After the showcase | Claims live in the Portal | Julian agreeing, and Qing Guan's tag APIs |

Three tracks run alongside the checkpoints: going public, the screens (Ethan's team) and the stations (Zi Tao). They're at the end of this section.

### Step 0. The contract and the asks

**Done for version 0.2.** The API agreement was rewritten for the two services and merged on 29 Sep, and amended on 1 Oct for Julian's hostnames. `CONTEXT.md` and `docs/adr/` are committed.

**Version 0.3,** for this rewrite, is a pull request that Ethan reviews (section 7). It should be approved before checkpoint 3 builds the shapes it changes, and before Ethan's team builds the station screens on `event-web`.

**Asked in person on Thu 8 Oct:** everything in [the meeting notes](assets/message-to-julian-workers-requests.md), parts 1 and 2: the Google Cloud project and its keyless sign-in, the roles, the infrastructure tool, the DNS record for `event-api.`, disconnecting Workers Builds from `apps/backend`, a budget alert, what "v1" meant, the claims stand-in, and moving a reader by a reflash with `no_event` retired. Part 3, on the Workers free plan, only if it comes up.

**Messages to send now:** part 2 of [the tag APIs message](assets/message-to-qing-guan-tag-apis.md) to Qing Guan, or its follow-up if part 2 has gone; [the station contract](assets/message-to-zi-tao-station-contract.md), with its notes of 5 and 6 Oct, to Zi Tao; and [logging in through the Portal](assets/message-to-qing-guan-login.md) to Qing Guan, if it hasn't gone.

**Adam raises with Julian himself** that `key.geekshacking.com` and its `/t/` path must keep working for as long as tokens are in use.

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
- The image: esbuild bundles one file at build time, and `node:24-slim` runs it.
- `wrangler.jsonc`, `worker-configuration.d.ts`, the `disableEval` setting and the compatibility flags leave `apps/backend`. A Worker comes back as the GeekyKey Service's own package at checkpoint 4.
- `node --watch` replaces `wrangler dev`, on port 8000, so the Vite proxy and the stations need no change. `pnpm dev` still turns dev-login on.
- **Tests:** plain Vitest on Node, in one project. `@cloudflare/vitest-plugin` and the `requireLikeNode` workaround go. TiDB in Docker stays.
- **CI:** `docker build` on the image, without pushing it, replaces "Build the Worker", proving the image and the bundle build. `typecheck` drops `wrangler types`.

**The infrastructure,** in `infra/`, as Pulumi in TypeScript (provisional until 8 Oct): the Artifact Registry repository; `event-service` and `event-service-staging`; their secrets, created without values; the domain mapping for `event-api.`; the two deploy service accounts (section 5.2); Logs Viewer for Adam, Ethan and Zi Tao, and Adam's roles to deploy, add secret values and read logs; and a budget alert to Julian and Adam. Its state lives in a versioned Cloud Storage bucket, as the Portal's does. GitHub Actions applies it on `main`.

**The deploy workflow,** on every push to `main`, after the backend checks pass. One job:

1. builds the image and pushes it to Artifact Registry;
2. runs `db:migrate`, with the migration login read from Secret Manager;
3. deploys to Cloud Run.

Run by hand (`workflow_dispatch`) from any branch, the same workflow migrates `geekykey_staging` and deploys `event-service-staging`.

Before the first deploy, once:

- Julian or Qing Guan create the project on GeeksHacking's billing account and set up the keyless sign-in from GitHub.
- Julian disconnects Workers Builds from `apps/backend`, which builds every push to `main` and fails.
- Adam adds each secret's value from his laptop, keeping no copy: `SESSION_SECRET`, `DATABASE_URL` and `MIGRATION_DATABASE_URL`, for production and for staging.
- Julian or Qing Guan add the DNS record for `event-api.geekshacking.com` that the domain mapping asks for, with Cloudflare's proxy off.

Done when:

- **The proof:** with the test station's key, `curl` to `event-service-staging`'s `run.app` address, then to `https://event-api.geekshacking.com/api/v1/taps`, gets `unknown_token` for an unclaimed UID and `accepted` for the test token. The same `client_tap_id` sent again gets `duplicate`, and a new tap by the test token gets `cooldown`. Each tap is in the right database.
- **The log check,** in Cloud Logging, on staging and then production: no key or cookie in any log line, and no secret in a URL.
- **The cold start is measured** on staging, with and without startup CPU boost, and on the first- and second-generation execution environments. The fastest is kept, and the 4-second deadline is revisited with the number.
- **The first numbers** are written down for section 11.1: Cloud Run's requests and CPU, and TiDB's Request Units after a day, which only Julian can see.
- Once Zi Tao's firmware speaks HTTPS, a real station taps `event-api.` (BAC-14).

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
  - `users` keyed by the Portal user ID;
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
- **The keys.** Adam adds `EVENT_SERVICE_KEY` and `CLAIMS_STAND_IN_KEY` to Secret Manager, for production and staging, so the key checks run from now on.
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
4. A test station taps `key-api.`. Then Zi Tao reflashes each station with `https://key-api.geekshacking.com` as its server, keeping its key.
5. A later merge removes `/api/v1/taps` and `/api/v1/stations/heartbeat` from the Event Service.

Done when the smoke test passes in CI, a station's tap on production goes through `key-api.` to Cloud Run, and **the log check** is done with Julian on `geekykey-service`: if the station key or the Event Service key shows in its invocation logs, turn them off there and replace the key.

### Checkpoint 5. Login, and the screens deployed

Waits on Qing Guan: the Portal's login details (the issuer, each app's client ID, which claim carries the display name, and whether there is a client secret) and the two OAuth apps (section 9).

- **Each service logs users in itself** ([ADR 0002](../../docs/adr/0002-each-service-logs-in-through-the-portal.md)): `GET /auth/login?return_to=...`, which accepts only a relative `return_to`, the rule `isSafeReturnTo` already applies in the screens; `GET /auth/callback`, which checks `state` before it calls the Portal; and `POST /auth/logout`. Each has its own cookie (`gk_session`, `event_session`), its own `SESSION_SECRET`, and its client ID and redirect URL from its settings. The Event Service's callback creates or updates the user's row with their display name. The GeekyKey Service keeps no users, so its session holds only the Portal user ID.
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
- **The lists for the day:** Adam, Ethan and Zi Tao in `ORGANIZERS` and `GEEKYKEY_ADMINS`, and the showcase's other organizers in `ORGANIZERS`. The passport shows each user's Portal user ID, so a helper can send theirs to Adam.
- **The warm instance,** switched on by Adam's one-line change on the morning of the rehearsal and of 17 Nov, and off after each.
- **The event-day sheet** from section 10, printed for the desk.

Done when the restore has been tried once on production (back up, restore, compare the counts), and the rehearsal in section 10 has run by Sat 7 Nov. After it, `stations_copy_filled` decides whether the Cache API goes in for the registered stations (section 3.5), and the day's Workers requests whether the free plan holds (section 11.1).

### After the showcase: the switch to the Portal's tag APIs

Waits on Julian agreeing to the claims stand-in, and on Qing Guan's tag APIs.

- `PortalClaims` (section 4), with its owners cache, and the Portal client secret on `geekykey-service`.
- A GeekyKey admin action, "Copy claims to the Portal": it reads the stand-in's claims 40 at a time and replays each as an ordinary claim, staying under the free plan's 50 outside requests, and the admin screen repeats it until every row is done. It's safe to run twice, and it reports any UID the Portal says someone else owns.
- The order: deploy the action; run it; deploy the version with `PortalClaims`; run the action once more for stragglers; then delete the stand-in's routes and folder, drop `tokens` in a later migration, and delete `CLAIMS_STAND_IN_KEY` on both sides. All of this happens before the showcase's data is cleaned up ("After the event", section 11.2).
- The API agreement doesn't change: `503 claims_unavailable` already covers the Portal.
- Accepted: a release made in the minutes between the copy and the switch doesn't reach the Portal, so that token stays claimed until it's released again.

**If Julian wants the Portal on the station path at the showcase instead,** the fallback is to switch before it only if the tag APIs are live by 28 Oct, with a Portal instance kept warm that takes more than one request at a time.

### The tracks alongside

**Going public** (Julian). Nothing can be taken back once the repo is public.

1. **Done:** Zi Tao dealt with the Wi-Fi password in git history (HAR-8), and `meeting-notes/` is never committed (BAC-7).
2. Julian makes the repo public, and protects `main` (a pull request with CI passing).
3. From then on, only a merge that passed CI can deploy, on either platform. GitHub needs no `production` environment: the Event Service's deploy reads the migration login from Secret Manager, and only `main` can sign in as production's deploy account.

Until then, anyone with write access could push to `main` and deploy, so the team's rule is pull requests only.

**The screens** (Ethan's team). They build against the mock client from the API agreement, and wire each screen as its endpoint lands, as `apps/frontend/CLAUDE.md` describes.

- **`apps/geekykey-web`:**
  - the token page at `/t/<UID>`, with its five views, landing back on it after login, and a button for each event in the owner's view;
  - My tokens, the home page, with **Release**, the form to claim by typing a UID, and a button for each event;
  - "Couldn't reach GeeksHacking. Try again." on `claims_unavailable`, and "You already have 3 tokens. Release one on My tokens first." on `token_limit_reached`;
  - no GeekyKey admin screens: a GeekyKey admin releases a found token on its token page.
- **In `apps/frontend`, which becomes `apps/event-web` at checkpoint 4:**
  - **Done:** the passport without pairing, the Portal user ID to copy, passport stations only, the tap log and export of version 0.2, the QR fallback by user ID, and passport settings from the station board.
  - **The station board, changed by version 0.3:** it reads the Event Service's own stations, so "status unknown", "no longer linked" and `status_known` go. Organizers create a station (its key shown once), replace its key, and disable or enable it there, so the station dialogs stay in `event-web` rather than moving to `geekykey-web`. Stations that are offline, holding saved taps, not in the passport, or whose reader isn't responding still turn red and go first.
  - `429`: screens that poll keep showing their last data.

**The stations** (Zi Tao): the station contract, HTTPS, the heartbeat, the token writer, and the reflash for `key-api.` at checkpoint 4, in section 9.

Sources for section 6: every ticket in section 13, in particular [How is the Event Service built, deployed and staged on Cloud Run?](issues/27-event-service-on-cloud-run.md), [How do deploys and secrets work?](issues/09-deploys-and-secrets.md) and [How do local dev, tests and CI get a runtime and a database?](issues/08-dev-test-ci.md).

---

## 7. The API agreement

The agreement wins over every other document, including this one. Step 0 rewrote it as version 0.2, merged on 29 Sep. The redraw's changes are made in the agreement itself, as **version 0.3**, in a pull request that Ethan reviews; its changelog lists them. Every endpoint they touch is a `Checkpoint N` one, so a pull request from either side may change it (the agreement's section 1). In short:

- **New, in the section for Event Service builders and in `packages/handoff`:** the registered stations, `GET /geekykey/v1/stations`, and the heartbeat hand-off, `POST /geekykey/v1/heartbeats`, answering `204` (the spec's call).
- **Gone:** the status call, `GET /api/v1/event-service/stations`, with its limit of 120 a minute and its "status unknown" case; the status `no_event`; links; and the GeekyKey admins' station endpoints.
- **Moved to the Event Service's organizer endpoints:** creating a station, replacing its key, and disabling and enabling it, keeping their shapes without the link. The station board reads the Event Service's own stations.
- **`503 claims_unavailable`** replaces `portal_unavailable`, from checkpoint 3.
- **One 4-second deadline** for the owner lookup and the hand-off together replaces the 3-second limit (provisional).
- **The heartbeat** answers `server_time` without waiting for the Event Service, and a missing list gives `503` rather than `401`.
- **The screen table's "no answer" row** says `Tap saved` / `Will send later`, and the `no_event` row goes.
- **Addresses:** the Event Service gets `https://event-api.geekshacking.com`; stations call it until checkpoint 4. The checkpoint table follows section 6.

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
  4. **The freeze.** From the evening before the showcase until it ends, nothing merges to `main` except a fix Adam approves, announced in the team chat. Since every merge migrates, the freeze stops migrations too.
  5. **Rolling back.** The Event Service: Adam sends all traffic back to the previous revision, with `gcloud run services update-traffic` or the console, and Julian as the backstop. A Worker: revert the commit on `main` and Workers Builds deploys the revert in a few minutes, or Julian rolls back one version. Either way, revert the bad commit straight after, or the next deploy brings it back. One version back is always safe. Never roll back past a key replacement. The database is never rolled back.
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

- **On Thu 8 Oct, in person:** [the meeting notes](assets/message-to-julian-workers-requests.md), parts 1 and 2: our own Google Cloud project and its keyless sign-in from GitHub; the roles; the infrastructure tool, with Qing Guan; the DNS record for `event-api.`; disconnecting Workers Builds from `apps/backend`; a budget alert; what "v1" meant; the claims stand-in; and moving a reader by a reflash, with `no_event` retired. Part 3, on the Workers free plan, only if it comes up.
- **Adam raises himself:** `key.geekshacking.com` and its `/t/` path must keep working for as long as tokens are in use.
- **For going public:** make the repo public, and protect `main`.
- **At checkpoint 4:** connect `geekykey-service` to Workers Builds from `apps/geekykey-service`, with the settings Adam sends; set its `SESSION_SECRET`, as a random value nobody keeps, and the two keys Adam sends; a screen share for the log check; note the three rate-limit namespace IDs we use (section 5.1). And the Event Service's new repo, if it moves then.
- **At checkpoint 5:** attach `key.geekshacking.com` to `geekykey-web` and `event.geekshacking.com` to `event-web`, and connect both.
- **On the day, and before it:** reachable by phone during the event, with his number on the event-day sheet if he agrees; upgrade to Workers Paid on the spot if we pass 70% of the free day; roll a Worker back when we ask, and roll the Event Service back if Adam can't; check TiDB's Request Units the evening before; restore TiDB's backup if the cluster is lost. How the team sees the GeekyKey Service's logs and the account's usage is still open (section 12).
- **Keep off:** Bot Fight Mode on geekshacking.com, which could challenge every station.

### Qing Guan

- **On Thu 8 Oct:** the infrastructure tool (our pick is Pulumi in TypeScript; the Portal's is C#), whether he'd review it, and the project's setup with Julian.
- **[Logging in through the Portal](assets/message-to-qing-guan-login.md):** the two OAuth apps, each with its final redirect URL and its `localhost` one:

  | App | Redirect URLs |
  |---|---|
  | The GeekyKey Service | `https://key.geekshacking.com/auth/callback`, `http://localhost:5174/auth/callback` |
  | The Event Service | `https://event.geekshacking.com/auth/callback`, `http://localhost:5173/auth/callback` |

- **The login details:** the issuer, each app's client ID, which claim carries the display name, and whether there's a client secret.
- **What the Portal's participant QR code holds,** which the QR fallback scans.
- **The tag APIs:** part 2 of [the tag APIs message](assets/message-to-qing-guan-tag-apis.md), or its follow-up.
- **On the day:** reachable by phone, for the Portal and the zone. His custom rule for `key-api.` is already on (BAC-8).

### Ethan

- **Review the API agreement's version 0.3 pull request** (section 7).
- **The screens track** in section 6, with his team, the Linear tickets the rewrite changes (listed in "Fold the answers into the spec"), and the edits to `apps/frontend/CLAUDE.md` (section 8.2).
- **Own the two forwarding Workers** once Adam has written them. Adam reviews any change to their list of paths.
- **Access:** none on Cloudflare (Julian, 1 Oct 2026); his screens deploy when his pull requests merge, and roll back by reverting. Logs Viewer on Google Cloud, for the Event Service's logs, and no deploy role there.
- **Install Docker** to run the backend locally.
- **On the day:** watch the screens and roll them back by reverting; a second pair of eyes on the Event Service's logs; read any query Adam runs to change data; at the desk whenever Adam isn't; an organizer who disables and enables stations, and a GeekyKey admin who releases found tokens.

### Zi Tao

- **[The station contract](assets/message-to-zi-tao-station-contract.md),** with its notes of 5 and 6 Oct: the address and HTTPS with the 14 roots, the heartbeat with `reader_ok` and the clock, the statuses and the screen table, the resend pace, and the three rules for the station key. Since 5 Oct, `no_event` is retired, organizers issue station keys, and a reader moves to another event by sending its saved taps, then a reflash with its flash erased and the new event's key (provisional). Since 6 Oct, the "no answer" row says `Tap saved` / `Will send later`.
- **The firmware already follows the contract's queue rules,** checked on 6 Oct: any status removes a tap, a `400` drops the batch, and saved taps go together at most once a minute. It still has to be tried on a real station (HAR-9).
- **HTTPS (HAR-10):** `https://event-api.geekshacking.com` until checkpoint 4, then `https://key-api.geekshacking.com`. Google Trust Services, which issues `event-api.`'s certificate, is among the 14 roots.
- **The heartbeat (HAR-11),** once checkpoint 3 adds it.
- **At checkpoint 4:** reflash each station with `key-api.` as its server, keeping its key.
- **[The token writer](assets/message-to-zi-tao-token-writer.md)** (HAR-12): every token written before the rehearsal, and Adam keeps a copy of the password.
- **Access:** none on Cloudflare (Julian, 1 Oct 2026). Logs Viewer on Google Cloud, since station health now lives in the Event Service.
- **On the day:** watch the stations and walk to any that turns red; an organizer who disables and enables stations; reflash a station whose key is replaced, with Adam's agreement.

### Joshua

- The export keeps ten columns, as he confirmed in [Does the A/B analysis need token IDs or unclaimed-token taps?](issues/16-ab-analysis-export.md). The end-of-day copy feeds his analysis.
- He runs the A/B study on the day, and isn't a watcher.
- The Sprint 2 A/B test's setup, with Adam (section 12).

---

## 10. Event day

The showcase is on Wed 18 Nov 2026 at Ngee Ann Polytechnic, with setup there on Tue 17 Nov.

### 10.1 The run-up

- **By Sat 7 Nov, the rehearsal on production,** with the warm instance on. It runs the evening-before steps (the freeze, the saved-taps check, a copy, the clear), the morning check, the team using passports and tapping stations for an hour, the one restore try, one rollback of the Event Service by revision and one of a screens Worker by reverting, and pulling one station's power to watch it turn red on the board. The watchers use the saved queries and the sheet as they would on the day. Then the data is cleared again, and the warm instance switched off. Its numbers decide the Cache API for the registered stations and whether the Workers free plan holds (section 11.1). It comes out of November's TiDB allowance, which the showcase also draws on.
- **The morning of Tue 17 Nov:** Adam switches the warm instance on, before the freeze.
- **The evening before, Tue 17 Nov,** after the day's setup at the venue and straight after the last merge: the freeze starts; every station shows 0 saved taps on the board; Adam runs `db:clear-test-data`, which takes its own copy first; and from then on nobody makes a test claim or taps a claimed token. If we're still on TiDB's free allowance, Julian checks its Request Units, which only he can see: if less than twice what the rehearsal used is left, he raises TiDB's spending limit above $0.
- **The morning,** before check-in: tap each station with an unclaimed token and expect `Not claimed yet`, which proves the station's Wi-Fi, key, certificate and registration and stores nothing. The station board shows any station missing passport settings. The organizers' stats still show 0 taps.
- **Check-in:** tokens are handed out and claimed (provisional). Team members who play claim again like everyone else.
- **The end of the day:** Adam takes a copy, the source for Joshua's analysis and for "Copy claims to the Portal". The freeze ends when the showcase does, and Adam switches the warm instance off.

### 10.2 Who watches

- **Adam:** the services, through the Event Service's logs in Cloud Logging and the station board. He decides on fixes, rolls the Event Service back, and he's the only one who changes data. The GeekyKey Service's logs are Julian's to open (section 12).
- **Zi Tao:** the stations, walking to any that turns red.
- **Ethan:** the screens, which he can roll back, and a second pair of eyes on the Event Service's logs.
- **Joshua:** runs the A/B study. Not a watcher.
- **The desk:** one laptop keeps the station board open all day. Adam or Ethan is at the desk at every moment, and whoever leaves hands over first. Once an hour, the desk looks down the last-tap column. The rota's times stay blank until the programme is out.
- **Organizers and GeekyKey admins on the day:** Adam, Ethan and Zi Tao. As organizers they disable and enable stations; replacing a key means reflashing, so it stays with Zi Tao, with Adam's agreement. As GeekyKey admins they release found tokens.
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
| Logins fail, and people already logged in are fine | The Portal | Adam calls Qing Guan | Taps still count. New people try again later |
| Error 1027 everywhere | The free day's Workers requests are used up | Adam calls Julian | Julian upgrades to Paid |
| Database errors from the Event Service | TiDB is down, or its monthly allowance is used up | Adam calls Julian | Julian checks the TiDB console |
| Nothing is reachable | Cloudflare | Nobody | Watch cloudflarestatus.com. Stations keep their taps |
| A station has gone missing | Theft | An organizer | Disables it on the station board. Its key is replaced before it's used again |
| The morning of 17 Nov, and after 18 Nov | The warm instance | Adam | Switches it on, then off, with the one-line change |

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

**Cloud Run.** The free tier is 2 million requests and 180,000 vCPU-seconds a month, shared across GeeksHacking's billing account, and a showcase day fits. One warm instance on event days costs cents. A budget alert goes to Julian and Adam.

**TiDB.** Starter's free 50 million Request Units a month, after which TiDB refuses new connections. The passport's and organizers' polls reach it from Cloud Run, and staging draws on the same allowance. Only Julian can see the console. A spending limit above $0 would also keep backups for up to 30 days, at a time we choose, instead of one day at a random time.

### 11.2 After the event

What happens to the showcase's data once it ends. Julian suggested keeping a per-event copy of user details and deleting it afterwards. The showcase's claims sit in the claims stand-in, in the same database, so "Copy claims to the Portal" runs before the event's data is deleted (section 6, "After the showcase"). Stations are the Event Service's own, so there's nothing to unlink. The end-of-day copy on Adam's laptop feeds Joshua's analysis and the claims copy, and our copies are deleted along with the event's data. The Single Source of Truth plans the documentation and code handover to GeeksHacking for 19 and 20 Nov, which bears on who runs the switch and the deletion.

### 11.3 Other provisional decisions

| Decision | Firm when | Fallback |
|---|---|---|
| The claims stand-in on our Cloud Run server | Julian agrees, 8 Oct | Switch to the Portal before the showcase, only if the tag APIs are live by 28 Oct, with a warm Portal that takes several requests at once |
| Moving a reader by a reflash with its flash erased, and `no_event` retired | Julian agrees, 8 Oct | A firmware setup mode that takes a new key without USB, if moves need to be easier |
| Our own Google Cloud project | Julian and Qing Guan agree, 8 Oct | A stack in the Portal's project |
| Pulumi in TypeScript | Qing Guan agrees, 8 Oct | Pulumi in C#, Terraform or OpenTofu, or `gcloud` commands at first |
| `event-api.` as a Cloud Run domain mapping | Agreed on 8 Oct, and working at checkpoint 2 | A Google load balancer at about US$18 a month |
| The 4-second shared deadline | Checkpoint 2 measures a cold start | A number that fits the measurement, inside the station's 5 seconds |
| The showcase on the Workers free plan | The rehearsal's day of requests | Slower organizer polling, or Workers Paid |
| The Cache API for the registered stations: not used | The rehearsal's `stations_copy_filled` | Added behind memory |
| Owners cached in the Cache API after the switch | Built at the switch | No cache, if the Portal keeps up |
| Tokens claimed at check-in | Adam decides ("still up to discussion") | Release only the team's own claims instead of emptying `tokens` |
| The clear as a laptop task | Adam decides | A manual workflow, once copies have a private home such as a Cloud Storage bucket |

---

## 12. Still to confirm

**Facts to check:**

- **What Julian meant by "Cloud Run v1"** (8 Oct). The setup uses the domain mapping either way.
- **Whether the Portal's web app is on GeeksHacking's Cloudflare account, and runs a Worker on each page load,** which would count against the same free day (8 Oct, only if the free plan comes up).
- **The showcase's hours,** and whether Adam or Ethan presents at set times.
- **That only Julian can use the TiDB Cloud console,** and so restore TiDB's backup.
- **Whether the Portal accepts `http://localhost` redirect URLs.**
- **The Portal's login details and its QR code,** with Qing Guan.

**Open, for Adam:**

- **Seeing the GeekyKey Service without access** (Julian, 1 Oct 2026), narrowed on 7 Oct. The Event Service's logs and the station board are ours, on Google Cloud. What the team still can't see is the GeekyKey Service's logs (failed key checks, owner lookups and hand-offs, `stations_copy_filled`) and the account's Workers requests. The choices: ask Julian for read-only access to Workers Observability and the account's usage; Julian, or someone he names, watches them on the day; or rely on what the stations and the station board show. Settle it before the rehearsal.
- **Two repos at the split** (Julian, 1 Oct 2026). Before checkpoint 4: who creates the Event Service's repo, and where; how both repos get `packages/handoff`'s schemas; whether the end-to-end smoke test still runs on every pull request, and in which repo, now across two platforms; the move of `apps/frontend`, which becomes `event-web` there, for Ethan's team; and the claims stand-in, `infra/` and the deploy workflow, which go with the Event Service.
- **Whether the GeekyKey Service gets a staging copy,** decided at the split.
- **The Sprint 2 A/B test.** The roadmap runs the A/B/C test at an SSTInc or CCA event between 5 and 18 Oct, on a date Mr Pang gives. It isn't confirmed yet, so nothing waits on it until it is. Condition A needs claimed tokens, stations and the passport; Condition B needs QR scanning and the passport; both feed the export. Participants see their passports only by logging in, and dev-login only signs in seeded users, so **the Portal login is on its path whichever setup runs it.** The choices, for Adam and Joshua:
  - **on production:** checkpoints 2 to 7 and the Portal login, within one to three weeks;
  - **on a laptop at the venue,** as in the 23 Sep test: today's backend, with the stations over `http://`, still needing the Portal login or some other way for participants to log in;
  - **later:** a date late in Sprint 2 or after it, if the course allows.
- **Before the repo goes public:** whether Julian's two diagrams in `assets/` can be public.

---

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

Decision records: [ADR 0001, tokens are identified by their hardware UID](../../docs/adr/0001-token-id-is-the-hardware-uid.md); [ADR 0002, each service logs users in through the Portal itself](../../docs/adr/0002-each-service-logs-in-through-the-portal.md); and [ADR 0003, the Event Service runs on Cloud Run, and the GeekyKey Service keeps no database](../../docs/adr/0003-event-service-on-cloud-run-geekykey-service-without-a-database.md).

Research: [Cloud Run](research/cloud-run.md), [a Worker's cache](research/worker-cache.md), [Node, Bun and Deno, and how the Portal runs](research/backend-runtimes.md), and [Hyperdrive's alternatives](research/hyperdrive-alternatives-benchmark.md).

Messages: [what to ask Julian and Qing Guan on 8 Oct](assets/message-to-julian-workers-requests.md), [to Julian, hostnames and deploys](assets/message-to-julian-redirect-urls.md), [to Julian and Qing Guan, the tag APIs](assets/message-to-qing-guan-tag-apis.md), [to Qing Guan, logging in](assets/message-to-qing-guan-login.md), [to Zi Tao, the station contract](assets/message-to-zi-tao-station-contract.md), [to Zi Tao, the token writer](assets/message-to-zi-tao-token-writer.md), [to Zi Tao, the Wi-Fi password](assets/message-to-zi-tao-wifi-password.md), and [to Joshua, the export](assets/message-to-joshua-ab-export.md).

Outside the map: the Single Source of Truth's roadmap (`Centralised-Capstone-Folder/01_Project Management/Geekykey Single Source of Truth.docx`, gitignored), and the station firmware as of 6 Oct 2026 (`firmware/geekykey_station/geekykey_station.ino`).
