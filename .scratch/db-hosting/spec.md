# Spec: GeekyKey on Cloudflare Workers and TiDB

The hand-off spec for the map [Move GeekyKey to TiDB and Cloudflare](map.md), written on 29 Sep 2026 from its resolved tickets. The plan is due Wed 30 Sep 2026. **Adam reviews this spec before any code changes.**

> **Being revised, 2 Oct 2026.** Checkpoint 2 couldn't be done as written: Hyperdrive can't reach TiDB Cloud. On 2 Oct the Event Service moved to Google Cloud Run with TiDB, and the GeekyKey Service stays on Workers with no database ([ADR 0003](../../docs/adr/0003-event-service-on-cloud-run-geekykey-service-without-a-database.md)). Every section that assumes Hyperdrive, four Workers, or `stations` and `tokens` tables in the GeekyKey Service is out of date until the [redrawn map](map.md)'s last ticket, "Fold the answers into the spec", rewrites it. Checkpoint 1 and the decisions the map's "Decisions so far" doesn't list as overturned still hold.

- It says what we build, and in what order. Why we chose it, and what we turned down, is in the ticket each section links to.
- **Provisional** marks a decision that can still change, and says what would change it. Everything else is decided.
- **The spec's call** marks a gap that no ticket settled, which this spec had to fill to put the steps in order. Section 2 lists every one of them for review.
- Words such as token, claim, owner, link and hand-off mean what [CONTEXT.md](../../CONTEXT.md) says. Field names and status codes live in [apps/API-AGREEMENT.md](../../apps/API-AGREEMENT.md), which the first step rewrites (section 7).

## Contents

1. [In short](#1-in-short)
2. [For Adam's review](#2-for-adams-review)
3. [The architecture](#3-the-architecture)
4. [Claims behind one module](#4-claims-behind-one-module)
5. [Settings, secrets and bindings](#5-settings-secrets-and-bindings)
6. [The migration plan](#6-the-migration-plan)
7. [Edits to the API agreement](#7-edits-to-the-api-agreement)
8. [Edits to the README and other docs](#8-edits-to-the-readme-and-other-docs)
9. [What each person needs from us](#9-what-each-person-needs-from-us)
10. [Event day](#10-event-day)
11. [Provisional](#11-provisional)
12. [Still to confirm](#12-still-to-confirm)
13. [Sources](#13-sources)

---

## 1. In short

- **Three kinds of service.** The Portal, Qing Guan's, knows who every user is. The GeekyKey Service is what stations and tokens talk to: it knows each station and which event it feeds, finds each token's owner, and hands taps on. An Event Service runs one event's games. We build the GeekyKey Service, and one Event Service for the capstone showcase, whose first game is the passport.
- **Four Workers** in GeeksHacking's Cloudflare account: the two services, and in front of each one a Worker that serves its screens. Julian sets each one up, and the team has no access to the account (1 Oct 2026).
- **Staging** is one copy of `geekykey-service` on Adam's own free Cloudflare account, against its own database, where deploys are tried and logs read before production (section 3.2).
- **One TiDB database** holds both services' tables, and each table belongs to one service. The Workers reach it through Hyperdrive.
- **Three addresses,** chosen by Julian on 1 Oct 2026. Stations call `https://key-api.geekshacking.com`. People open `https://key.geekshacking.com` for the token page, My tokens and the GeekyKey admin screens, and `https://event.geekshacking.com` for the passport and the organizers' screens.
- **Claims stay in our `tokens` table through the showcase,** behind one module, `Claims`, and move to the Portal's tag APIs after it, if Julian agrees.
- **Move first, split second.** Today's backend moves unchanged onto one Worker and TiDB, and is deployed. Then the line between the two services is drawn inside it. Then it becomes two Workers. Login, the new features and getting ready for the day come after that. The whole move is eight checkpoints (section 6).
- **Dates.** The showcase is on Wed 18 Nov 2026 at Ngee Ann Polytechnic, with setup there on Tue 17 Nov. The rehearsal on production is by Sat 7 Nov, and the decision on Workers Paid is due by Wed 11 Nov.

## 2. For Adam's review

### The spec's calls

No ticket settled these. The spec needed them to put the steps in order.

1. **The single Worker is `geekykey-service` from its first deploy.** "How do deploys and secrets work?" left this to the spec. The Worker builds from `apps/backend` until the split renames that folder to `apps/geekykey-service`, and it gets `key-api.geekshacking.com` at the first deploy. At the split, the Event Service is carved out as the new Worker, so neither the stations' address nor the Worker behind it ever moves. The two screens Workers first deploy at checkpoint 5, once login works, because production has no way to log in before then.
2. **The order of the checkpoints** in section 6, including the order of the split-stage work, which "How do local dev, tests and CI get a runtime and a database?" left to the spec.
3. **New endpoints are built once, in the service that owns them.** Checkpoints 1 to 4 move today's five endpoints, and add only the hand-off and the heartbeat, which stations need early for their clock. Sprint 1's pairing and station endpoints, and the other `MVP` ones, wait for checkpoints 6 and 7, so the API agreement's `Sprint 1` and `MVP` tags change (section 7).
4. **Reshaping the tables keeps the migration rule** from "How is the database set up?": add first, switch the code, drop later. Production holds only test data until the rehearsal, so rows that no longer fit are deleted, not converted.
5. **Replaced on 1 Oct 2026.** The call was that Adam deploys by hand until `main` is protected. Julian gives the team no Cloudflare access, so production deploys only through Workers Builds, which Julian sets up, and Adam tries deploys on staging first (section 3.2). Adam still runs `db:migrate` against production from his laptop until "Migrate production" exists.
6. **`Claims.claim` gains a fourth result, `limit_reached`** (section 4). "How do we protect our public addresses without blocking the stations?" put the 3-token cap in the module after its interface was written.
7. **Paths for the new endpoints, and three names** (section 7.2). `GET /api/v1/me` on the GeekyKey Service returns the user, whether they're a GeekyKey admin, their tokens and the events to link to. `token_taken` replaces `uid_already_paired`. The Event Service's `/me` keeps `user.role`, now worked out from the organizer list.
8. **Two table names,** `event_stations` and `passport_stations` (section 3.5).
9. **The rate limits' binding names and namespace IDs** (section 5.1).
10. **Two more numbers for the decision on Paid:** the CPU time of a 500-tap batch against the free plan's 10 ms, and our log events against Workers Logs' 200,000 a day (section 11.1).
11. **The team's rules go in the README,** in a new "Deploying" section (section 8.1).

### Found while writing the spec, with Adam's answers (29 Sep)

- **The showcase's date:** setup on Tue 17 Nov and the showcase on Wed 18 Nov. The Single Source of Truth's roadmap and `apps/frontend/CLAUDE.md` both say 17 Nov, and need correcting.
- **The Sprint 2 A/B test.** The roadmap runs it at an SSTInc or CCA event between 5 and 18 Oct, on a date Mr Pang gives. It isn't confirmed yet (Adam, 29 Sep), so the checkpoints don't wait on it. Whenever it's confirmed, it needs the Portal login, whichever setup runs it.
- **This spec is committed with the map,** while the repo is still private. Before the repo goes public, Julian is asked whether his two diagrams in `assets/` can be public. The Wi-Fi message names Zi Tao's network, which is fine once its password is changed. Whether `meeting-notes/` is committed is a separate call.

---

## 3. The architecture

### 3.1 The services, and who owns what

| Service | Built by | Owns | Its tables |
|---|---|---|---|
| **Portal** | Qing Guan | Who each user is. After the showcase, also who owns each token | The Portal's own |
| **GeekyKey Service** | Adam | Stations (IDs, keys, labels, links, last seen, disabling), finding each token's owner, handing taps on, the token page, My tokens, the GeekyKey admins | `stations`, and `tokens` until the switch |
| **Event Service** (the showcase) | Adam | Taps, dropping replays, the cooldown, the passport (stamp slots, stamps, points), per-event users, the organizers, the tap log, stats, the export, the QR fallback | `users`, `taps`, `event_stations`, `passport_stations` |

The rules that hold the split together:

- The GeekyKey Service never knows about games. The Event Service never sees a token's ID, only users.
- A station feeds at most one Event Service at a time, through its link. The Event Service decides which of its games count a tap.
- A tap by an unclaimed token, or at a station that feeds no event, stops at the GeekyKey Service. It gets a status and a log line, and is stored nowhere.
- The Portal's user ID is the user ID everywhere. The GeekyKey Service keeps no users.
- Organizer is a role at one event, from a list in the Event Service's settings. GeekyKey admin is a GeeksHacking role, from a list in the GeekyKey Service's settings. One person can be on both.

Sources: [Which parts of today's backend belong to the GeekyKey Service, and which to the Event Service?](issues/12-backend-split.md), [How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?](issues/14-event-service-triggers.md), [Which screens belong to which service, and how does each know who is logged in?](issues/15-screens-and-login.md)

### 3.2 The four Workers

| Worker | Package | Serves | Address | Reaches |
|---|---|---|---|---|
| `geekykey-service` | `apps/geekykey-service` (`apps/backend` until the split) | Stations, Event Services' status calls, and the GeekyKey screens' `/api` and `/auth` | `key-api.geekshacking.com` | `event-service` through a service binding, for the hand-off. TiDB through Hyperdrive |
| `event-service` | `apps/event-service` | The hand-off, and the Event screens' `/api` and `/auth` | None: only its two bindings reach it | The GeekyKey Service's status call over HTTPS. TiDB through Hyperdrive |
| `geekykey-web` | `apps/geekykey-web` (new) | The token page, My tokens and the GeekyKey admin screens | `key.geekshacking.com`, also written on every token | `geekykey-service` through a service binding |
| `event-web` | `apps/event-web` (today's `apps/frontend`) | The dashboard, passport, activity and organizer screens | `event.geekshacking.com` | `event-service` through a service binding |

- Every production Worker sets `workers_dev = false` and `preview_urls = false`, so the three hostnames are the only way in.
- Each screens Worker serves its files in single-page-app mode and forwards `/api/*` and `/auth/*` to its service, with `run_worker_first` for those paths. Browsers see one address per set of screens, so there is no CORS anywhere.
- Every `/api/*` and `/auth/*` response carries `Cache-Control: no-store`.
- **Production** is in GeeksHacking's Cloudflare account. Julian creates each Worker, connects it to its repo with Workers Builds, and sets its Hyperdrive config and secrets. Nobody on the team can deploy there, set its secrets or read its logs (Julian, 1 Oct 2026).
- **Staging,** agreed with Julian on 1 Oct 2026, is one copy of `geekykey-service`, named `geekykey-service-staging`, on Adam's own free Cloudflare account. It answers at its `workers.dev` address, is deployed by hand with `deploy:staging` from an `env.staging` section of the same `wrangler.jsonc`, and uses its own database, `geekykey_staging` (BAC-15). It exists so deploys can be tried, and logs read, before production. There are no preview builds anywhere.
- **At the split, the Event Service and its screens move to a repo of their own,** at Julian's suggestion (1 Oct 2026), so they're built and deployed apart from GeekyKey's. How `packages/handoff` and the smoke test work across two repos is open (section 12).

Sources: [How is the frontend set up, and how does the browser reach the backend?](issues/05-frontend-setup-and-routing.md), [Which screens belong to which service, and how does each know who is logged in?](issues/15-screens-and-login.md), [How do deploys and secrets work?](issues/09-deploys-and-secrets.md), [How do we protect our public addresses without blocking the stations?](issues/18-protecting-public-addresses.md)

### 3.3 How a tap travels

```text
station ──HTTPS──▶ key-api.geekshacking.com ──▶ geekykey-service ──hand-off──▶ event-service ──▶ TiDB
                                                       │  (binding)
                                                       └─▶ tokens table (Claims), until the switch to the Portal
```

1. The station sends `POST /api/v1/taps` with its station key: one tap, or up to 500 saved ones.
2. The GeekyKey Service counts the request against the station's 60 a minute, then finds the station from its key in a list kept in memory. An unknown key, or a disabled station's, gets `401`. It records when the station was last seen.
3. It checks the station's link. No link, a link to an Event Service no longer in its settings, or a tap timed before the link started, gets `no_event`.
4. It asks `Claims` for each token's owner. A token nobody owns gets `unknown_token`.
5. It hands the rest to the linked Event Service in one call, `POST /geekykey/v1/taps` with the Event Service key: the station ID and, for each tap, its `client_tap_id`, the owner's user ID and `tapped_at` (null when the station sent none or it was wildly off). The Event Service gets 3 seconds. No answer in time, an answer that isn't a 2xx, a redirect, or a body the schema rejects fails the whole request with `503 event_service_unavailable`, and the station keeps and resends its taps.
6. The Event Service locks the station's row, drops replays (`duplicate`), applies the cooldown and stores each tap as `accepted`, `cooldown` or `no_game`, writing a `tap_stored` log line for each.
7. The GeekyKey Service puts every status back in request order and answers the station, which shows the result for about 2 seconds.

Sources: [How do stations talk to the GeekyKey Service?](issues/11-station-endpoints.md), [How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?](issues/14-event-service-triggers.md), [How do we protect our public addresses without blocking the stations?](issues/18-protecting-public-addresses.md)

### 3.4 How a phone claims a token

1. A phone taps a token and opens `https://key.geekshacking.com/t/<UID>`. The chip writes its own UID into that address each time it is read.
2. Someone not logged in sees a login prompt, and nothing is looked up. They log in through the Portal and land back on `/t/<UID>`.
3. The token page shows one of five things: a login prompt; **Claim** for a token nobody owns; your own token, with **Release**; "This token belongs to someone else", with no name; or, for a GeekyKey admin, that line with a **Release** button.
4. My tokens, the home page of `key.geekshacking.com`, lists your tokens with **Release**, has a form to claim a token by typing its UID, and links to each event with a public address, such as "Open Capstone Showcase".
5. The passport, on `event.geekshacking.com`, logs in separately. If the Portal remembers the user, that second login is only a quick redirect.

Sources: [What is a token's ID, and what URL is written on each token?](issues/13-token-id-and-url.md) ([ADR 0001](../../docs/adr/0001-token-id-is-the-hardware-uid.md)), [Which screens belong to which service, and how does each know who is logged in?](issues/15-screens-and-login.md) ([ADR 0002](../../docs/adr/0002-each-service-logs-in-through-the-portal.md)), [What does the GeekyKey Service need from the Portal's tag APIs?](issues/17-portal-tag-apis.md)

### 3.5 The database

**Where it is.** GeeksHacking's TiDB Cloud Starter cluster, on Alibaba Cloud in Singapore, with one database, `geekykey`, for both services' tables. Neither service's code reads the other's tables, and each Worker imports only its own schema.

**The connection.** The Workers reach TiDB through one Hyperdrive config, for production, which Julian creates from the app login Adam sends him, with the query cache off. Staging has its own, in Adam's account. Drizzle stays the ORM, through its `mysql2` adapter; `mysql2` must be 3.13 or later and connect with `disableEval: true`. **Provisional** until staging or checkpoint 2 shows a deployed Worker reaching TiDB through Hyperdrive. The fallback is TiDB's serverless driver.

**Logins.** Both carry the cluster's prefix:

- The **app login** can only read and write rows in `geekykey`. Both Workers share it for now, and it lives only in the Hyperdrive config.
- The **migration login** can also change tables. The `db:` tasks use it, from Adam's laptop and from GitHub's `production` environment.
- The **root login** creates those two once and is never deployed.
- **Staging** has its own database on the same cluster, `geekykey_staging`, with its own app and migration logins that can't touch `geekykey`. Its queries count against the same free 50 million Request Units a month.

**Rules for the schema.**

- Fixed sets of values are `ENUM` columns. The `check()` calls go, because TiDB ignores them and the switch that would enforce them is cluster-wide.
- Timestamps stay ISO strings in `VARCHAR(24)`, with a comment in the schema saying why, and the code sets their defaults.
- `taps` carries `/*T! AUTO_ID_CACHE=1 */`, added to the migration by hand, so a newer tap always has a higher `id`. MySQL ignores the comment.
- No foreign key crosses between the services' tables or points at the Portal. Foreign keys inside one service stay.
- `onConflictDoNothing()` becomes a no-op `ON DUPLICATE KEY UPDATE`, never `INSERT IGNORE`, which silently stores bad values. `.get()` becomes `.limit(1)`. No `db.batch()`.
- The cooldown locks: each ingest is one short transaction that first locks the station's row with `SELECT ... FOR UPDATE`, then reads, decides and writes.

**Migrations.** A `db:migrate` task runs Drizzle's `mysql2` migrator with the migration login, from a laptop or GitHub Actions, never inside a Worker. The two SQLite migrations are deleted and one MySQL migration starts the history again. Every migration must work with the Worker version still running: add a column before the code uses it, and drop one only after the code stops.

**The tables after checkpoint 3.** The last two names are the spec's call.

| Service | Table | Columns | Notes |
|---|---|---|---|
| GeekyKey | `stations` | `id`, `api_key_hash` (unique), `label`, `event_service_id`, `linked_at`, `disabled_at`, `created_at`, `last_seen_at`, `firmware_version`, `buffered_taps`, `reader_ok` | `label` is the device's name, such as "Reader 3". The link is `event_service_id` and `linked_at`, both empty for no link. `disabled_at` is empty while the station is enabled. Any request sets `last_seen_at`, and the heartbeat sets the last three |
| GeekyKey | `tokens` | `uid` (primary key), `user_id`, `claimed_at` | The stand-in for the Portal's tag APIs. Only current owners: releasing deletes the row. `user_id` is a Portal user ID with no foreign key |
| Event | `users` | `id`, `display_name`, `created_at` | The per-event copy. `id` is the Portal user ID, and the name is copied from the Portal at login. No `role` |
| Event | `taps` | `id`, `station_id`, `client_tap_id`, `user_id`, `source`, `status`, `tapped_at`, `received_at` | `source` is `ENUM('nfc', 'qr_fallback')` and `status` is `ENUM('accepted', 'cooldown', 'no_game')`. `(station_id, client_tap_id)` is unique. `user_id` is never empty and has no foreign key, so a tap by someone who has never logged in is still stored. No `token_uid` |
| Event | `event_stations` | `station_id`, `created_at` | One row per station that has fed this event, created at its first tap. This is the row the cooldown locks |
| Event | `passport_stations` | `station_id`, `name`, `location`, `points`, `added_at` | The passport's settings. Only these stations are stamp slots, in `added_at` order |

Sources: [Does TiDB fit this backend?](issues/01-tidb-fit.md), [How is the database set up?](issues/07-database-setup.md), [How do local dev, tests and CI get a runtime and a database?](issues/08-dev-test-ci.md), [How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?](issues/14-event-service-triggers.md), [How do we notice trouble on event day, and who watches?](issues/20-event-day-monitoring.md)

### 3.6 Room to grow

- **The 24 Sep game ideas all fit.** Live interaction would add a Durable Object, which the free plan has. Trading needs transactions, which `mysql2` through Hyperdrive keeps ordinary. Nothing may rely on `taps.id` order to pair two people's taps. A second game inside the Event Service keeps one verdict per tap: `accepted` if any game counted it, otherwise `cooldown` if a game held it back, otherwise `no_game`. Each game keeps its own record of what it counted, so a bingo-only tap can't earn passport points. Source: [Can the architecture carry the 24 Sep game ideas?](issues/04-future-ideas-fit.md)
- **The Portal's tag APIs.** Only the `Claims` module changes (section 4).
- **Other teams' Event Services** get the same hand-off, over HTTPS with their own Event Service key, a section of the API agreement and a JSON Schema generated from `packages/handoff`. Their own statuses pass through to stations, which treat any status they don't know as recorded. They log users in through the Portal themselves ([ADR 0002](../../docs/adr/0002-each-service-logs-in-through-the-portal.md)). Adding one is a reviewed change to the GeekyKey Service's settings and a deploy, and a GeekyKey admin links stations to it.
- **Another event.** Moving a station to another event is changing its link.
- **Later.** The GeekyKey Service's tables can move out of the shared database, and each service can then get a login of its own.

---

## 4. Claims behind one module

Claiming a token and finding who owns it go through one module, so switching from the `tokens` table to the Portal's tag APIs changes one implementation and nothing else.

```ts
/** Who owns each token: the `tokens` table until the switch, then the Portal's tag APIs. */
export interface Claims {
  /** The owners of up to 500 tokens, by UID. A UID missing from the map is unclaimed. */
  ownersOf(uids: string[]): Promise<Map<string, string>>;
  /** Claims the token for the user. The first claim wins, and a user holds at most the set number of tokens. */
  claim(uid: string, userId: string): Promise<"claimed" | "already_yours" | "taken" | "limit_reached">;
  /** Releases the token, but only if `ownerId` still owns it. */
  release(uid: string, ownerId: string): Promise<"released" | "not_owner">;
  /** The user's tokens, oldest claim first. */
  tokensOf(userId: string): Promise<{ uid: string; claimedAt: string }[]>;
}
```

- **`LocalClaims`** wraps the `tokens` table and replaces `TokenResolver` and `LocalTokenResolver` in `apps/backend/src/services/identity.ts`. The table keeps only current owners and when each claimed. Nothing else reads it.
- **`PortalClaims`**, after the showcase, calls the tag APIs as the GeekyKey Service itself, with the client-credentials flow and its own OAuth app. Each lookup gets 1.5 seconds, with no cache and no retry. When it can't answer it throws `ClaimsUnavailable`, which the station route turns into `503 portal_unavailable`, and the screens into "Couldn't reach GeeksHacking. Try again."
- **UIDs arrive normalised.** Who may release is decided by the routes: an owner passes their own user ID, and a GeekyKey admin passes the owner the token page found when it loaded, so a late or double click can't release a newer claim.
- **The cap** is 3 tokens, a GeekyKey Service setting, with no exemption for anyone. After the switch it counts through `tokensOf`. `limit_reached` is the spec's call (section 2).
- **Every release writes a `token_released` log line** saying who released which UID from whom. With no history kept, it's the only trace.
- **The switch** is in section 6, "After the showcase".

Sources: [What does the GeekyKey Service need from the Portal's tag APIs?](issues/17-portal-tag-apis.md), [How do we protect our public addresses without blocking the stations?](issues/18-protecting-public-addresses.md)

---

## 5. Settings, secrets and bindings

Settings live in each Worker's `wrangler.jsonc` and change through a reviewed pull request. Secrets live only on the two services: Julian sets production's, and Adam sets staging's. The configs are the source of truth: a deploy overwrites settings and routes changed in the dashboard, but never touches secrets. Names marked "suggested" are the spec's.

### 5.1 Each Worker

**`geekykey-service`**

| Kind | Name (suggested) | Value |
|---|---|---|
| Custom domain | `routes` | `key-api.geekshacking.com`, which Julian attached on 1 Oct 2026 |
| Side doors off | `workers_dev`, `preview_urls` | Both `false` |
| Flag | `compatibility_flags` | `nodejs_compat`, which `mysql2` needs |
| Binding | `HYPERDRIVE` | The production Hyperdrive config |
| Binding | `SHOWCASE` | Service binding to `event-service`, from the split |
| Binding | Rate limits | See the table below |
| Setting | `EVENT_SERVICES` | The list of Event Services. For each: an ID, a name, a binding name or an `https://` URL, and optionally a public address and name for the token page's link. For the showcase, one entry: `showcase`, "Capstone Showcase", binding `SHOWCASE`, `https://event.geekshacking.com` |
| Setting | `GEEKYKEY_ADMINS` | Portal user IDs. Adam, Ethan and Zi Tao for the showcase |
| Setting | `MAX_TOKENS_PER_USER` | `3` |
| Setting | `MAX_TAPS_PER_REQUEST` | `500` |
| Setting | `OAUTH_CLIENT_ID`, `OAUTH_REDIRECT_URL` | Its own OAuth app, and `https://key.geekshacking.com/auth/callback` |
| Setting | The Portal's login settings | Once Qing Guan gives them |
| Secret | `SESSION_SECRET` | Signs `gk_session` |
| Secret | `EVENT_SERVICE_KEY_SHOWCASE` | One for each entry in `EVENT_SERVICES` |
| Secret | `PORTAL_CLIENT_SECRET` | If Qing Guan issues one. Client credentials need it from the switch on |

Every secret it has goes under `secrets.required`, so a deploy fails if one is missing. Until the split, this Worker also holds the Event Service's settings.

**`event-service`**

| Kind | Name (suggested) | Value |
|---|---|---|
| Custom domain | | None. Only its two bindings reach it. Julian offered `event-api.geekshacking.com` on 1 Oct, and it isn't needed |
| Side doors off | `workers_dev`, `preview_urls` | Both `false` |
| Flag | `compatibility_flags` | `nodejs_compat` |
| Binding | `HYPERDRIVE` | The same Hyperdrive config |
| Binding | Rate limit | See the table below |
| Setting | `ORGANIZERS` | Portal user IDs. `dev-organizer-1` locally |
| Setting | `TAP_COOLDOWN_SECONDS` | `300` |
| Setting | `GEEKYKEY_API_URL` | `https://key-api.geekshacking.com`, and `http://localhost:8000` locally |
| Setting | `OAUTH_CLIENT_ID`, `OAUTH_REDIRECT_URL` | Its own OAuth app, and `https://event.geekshacking.com/auth/callback` |
| Setting | The Portal's login settings | Once Qing Guan gives them |
| Secret | `SESSION_SECRET` | Signs `event_session` |
| Secret | `EVENT_SERVICE_KEY` | Its own key, the same value as `EVENT_SERVICE_KEY_SHOWCASE` |
| Secret | `PORTAL_CLIENT_SECRET` | If Qing Guan issues one |

**`geekykey-web` and `event-web`**

| Kind | Value |
|---|---|
| Static assets | The Vite build, in single-page-app mode |
| `run_worker_first` | `["/api/*", "/auth/*"]`. Without it, a browser going to `/auth/login` gets `index.html` and login silently breaks |
| Binding | A service binding to its service |
| Custom domain | `key.geekshacking.com` and `event.geekshacking.com` |
| Side doors off | `workers_dev` and `preview_urls` both `false` |
| Build variable | `VITE_LIVE_API=1` on `event-web`, set in Workers Builds. Without it the build ships the mock client |
| Secrets | None |

**Rate limits.** Each limit is its own binding over 60 seconds, with a `namespace_id` that no other Worker in GeeksHacking's account uses, because bindings that share one share their counts. The IDs go to Julian so he knows they're taken. Check their format against Cloudflare's [Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) page when checkpoint 6 adds them.

| Worker | Binding (suggested) | Counts | Keyed by | Limit a minute | `namespace_id` (suggested) |
|---|---|---|---|---|---|
| `geekykey-service` | `STATION_LIMIT` | A station | The SHA-256 of the key it sent, before the database | 60 | `7101` |
| `geekykey-service` | `USER_LIMIT` | A user on its API | Portal user ID | 60 | `7102` |
| `geekykey-service` | `TOKEN_LIMIT` | A user looking up and claiming tokens | Portal user ID | 20, on top of the 60 | `7103` |
| `geekykey-service` | `STATUS_LIMIT` | An Event Service's status calls | The Event Service, found from its key | 120 | `7104` |
| `event-service` | `USER_LIMIT` | A user on its API | Portal user ID | 60 | `7105` |

### 5.2 Where every credential lives

| Credential | Lives in | Set by | If it leaks or is lost |
|---|---|---|---|
| TiDB root login | `~/.config/geekykey/tidb.env` on Adam's laptop. Never deployed | Julian provided it | Ask Julian |
| TiDB app login | Only the Hyperdrive config | Adam creates it with the root login and sends the password to Julian privately, keeping no copy. Julian puts it in the Hyperdrive config | Adam resets it and sends the new one to Julian |
| Staging's two TiDB logins | The app login only in staging's Hyperdrive config, in Adam's account. The migration login in `~/.config/geekykey/` | Adam | Adam resets them. Neither can touch `geekykey` |
| TiDB migration login | `~/.config/geekykey/` on Adam's laptop, and GitHub's `production` environment | Adam creates it. Julian adds it to the environment | Adam resets it, and Julian replaces the environment's copy |
| `SESSION_SECRET`, one per service | A Workers secret | Julian, as a random value nobody keeps. Adam sets staging's with `openssl rand` and `wrangler secret put --env staging` | A new one logs everyone out of that service |
| Event Service key, one per Event Service | A Workers secret on both Workers | Julian, as 32 random bytes nobody keeps, for our own Event Service. Another team's key goes to that team as well | Set the new one on both outside the event. Hand-offs fail with `503` until both match, and stations resend |
| Portal client secret, if issued | A Workers secret on each service | Qing Guan gives it to Julian, who sets it | Qing Guan and Julian replace it |
| Station key | The station's gitignored `secrets.h`. Only its hash is in `stations` | A GeekyKey admin creates it, shown once | A GeekyKey admin replaces it, keeping the station's ID, and Zi Tao reflashes the station |
| Token write password | `firmware/token_writer/secrets.h` (gitignored), and Adam's copy outside the repo | Zi Tao | Without it, tokens can never be rewritten |
| Wi-Fi details | Each station's `secrets.h` | Zi Tao | Change the password |
| Our database copies | Adam's laptop, outside the repo. Never GitHub, a workflow artifact or a chat | Adam | They hold Portal user IDs, names and who tapped where |

GitHub holds only the migration login. No Cloudflare API token is kept in GitHub at all, and nobody on the team holds a production Cloudflare secret.

### 5.3 Local development

| What | Where |
|---|---|
| GeekyKey Service | `wrangler dev` on port 8000, where real stations already point (`http://A-Mac.local:8000`) |
| Event Service | `wrangler dev` on port 8001, from the split |
| Event screens | Vite on 5173, proxying `/api` and `/auth` to 8000 until the split, then to 8001 |
| GeekyKey screens | Vite on 5174, proxying to 8000 |
| Database | TiDB v8.5.3 in Docker from the root `compose.yaml`, with `geekykey_dev` and `geekykey_test`. The Hyperdrive binding's local connection string points at it |
| Secrets | A gitignored `.dev.vars` per service: `SESSION_SECRET` and a local Event Service key. Never in a deployed config. Each service's `pnpm dev` turns dev-login on itself with `wrangler dev --var DEV_AUTH_ENABLED:true`, so a fresh clone runs with no `.dev.vars`, and `secrets.required`, which makes `wrangler dev` read only the listed keys from `.dev.vars`, can't drop it |
| Logging in | dev-login signs in seeded users. The Portal works too, once the `localhost` redirect URLs join their OAuth apps |

One root `pnpm dev` starts all four. Each service runs its own `wrangler dev`, because one command with two configs gives the second Worker no HTTP port. Mock mode stays for work on screens.

Sources for section 5: [How do deploys and secrets work?](issues/09-deploys-and-secrets.md), [How do local dev, tests and CI get a runtime and a database?](issues/08-dev-test-ci.md), [Which screens belong to which service, and how does each know who is logged in?](issues/15-screens-and-login.md), [How do we protect our public addresses without blocking the stations?](issues/18-protecting-public-addresses.md), [How do we back up the database, recover it on event day, and clear the test data before the doors open?](issues/19-backups-and-test-data.md)

---

## 6. The migration plan

Each checkpoint is one deliverable: Adam builds it, it's reviewed, and only then does the next one start. The order is the spec's call. Checkpoints 6 and 7 can swap, and checkpoint 5 can move after them if the Portal's login details are late: they're built and tested locally with dev-login meanwhile.

| | Checkpoint | Done when | Waits on |
|---|---|---|---|
| 0 | The contract and the asks | Ethan has approved the API agreement pull request, and the messages are sent | Ethan's review |
| 1 | Today's backend on workerd and TiDB | CI is green, the Vitest plugin is proven, and a station taps `wrangler dev` | Nothing outside the team |
| 2 | The first deploy | A tap to `key-api.geekshacking.com` is stored in TiDB through Hyperdrive, after staging, the log is checked, the first numbers are written down | Julian: the Worker, the Hyperdrive config, the secret and Workers Builds |
| 3 | The line drawn inside | One Worker, with two services inside it that talk only through the hand-off, on the new tables | Nothing outside the team |
| 4 | Two Workers | `event-service` runs behind its binding, in its own repo, and the smoke test runs on every pull request | Julian: the new repo, and connecting `event-service` |
| 5 | Login, and the screens deployed | Both logins work, the passport shows on a phone, the cookies are checked, the passport poll is measured | Qing Guan: the login details and two OAuth apps. Julian or Qing Guan: two domains |
| 6 | The GeekyKey Service's features | Stations are set up from the admin screens, tokens are claimed and released, the limits hold | Ethan's team: the `geekykey-web` screens |
| 7 | The Event Service's features | Organizers set up the passport's stations and watch taps, and the export is right | Ethan's team: the `event-web` changes |
| 8 | Ready for the event | The copy, restore and clear tasks work, the restore is tried, the rehearsal is done by 7 Nov | The whole team |
| | After the showcase | Claims live in the Portal | Julian agreeing, and Qing Guan's tag APIs |

Three tracks run alongside the checkpoints: going public, the screens (Ethan's team) and the stations (Zi Tao). They're at the end of this section.

### Step 0. The contract and the asks

No code.

- **The API agreement pull request,** with every edit in section 7, reviewed by Ethan. `CONTEXT.md` and `docs/adr/` are uncommitted today; commit them in the same pull request or just before it.
- **Messages to send now:**
  - to Julian and Qing Guan: [part 2 of the hostnames message](assets/message-to-julian-redirect-urls.md), if it hasn't gone, and [the tag APIs message](assets/message-to-qing-guan-tag-apis.md), whose part 1 asks Julian to keep the showcase on the `tokens` table;
  - to Zi Tao: [the Wi-Fi password](assets/message-to-zi-tao-wifi-password.md) and [the station contract](assets/message-to-zi-tao-station-contract.md), with the notes on the 29 Sep firmware in section 9;
  - to Qing Guan: [logging in through the Portal](assets/message-to-qing-guan-login.md), for the two OAuth apps, the login details and the QR code.
- **Adam raises with Julian himself** that `key.geekshacking.com` and its `/t/` path must keep working for as long as tokens are in use.
- **Once the Sprint 2 A/B test is confirmed,** decide which setup runs it (section 12), since it may pull the Portal login earlier.

### Checkpoint 1. Today's backend on workerd and TiDB

Today's five endpoints (`/api/health`, `POST /api/v1/taps`, `GET /api/v1/me`, `POST /auth/dev-login`, `POST /auth/logout`) run in `wrangler dev` against TiDB in Docker, unchanged on the wire, and Deno is gone.

- **The local database.** A root `compose.yaml` pins `pingcap/tidb:v8.5.3`, with no volume. mise tasks: `db:up` starts it, creates `geekykey_dev` and `geekykey_test` and migrates both; `db:reset` throws the data away and does that again; `db:down` stops it; `db:migrate`; `seed`. `db:migrate` and `seed` are Node scripts that connect with `mysql2` directly, not through Hyperdrive.
- **The schema and the driver.** Everything under "Rules for the schema" in section 3.5, on today's tables: `mysqlTable`, `VARCHAR(n)` keys and indexed columns, `VARCHAR(24)` timestamps, `ENUM` for the role, source and status, the no-op `ON DUPLICATE KEY UPDATE`, `.limit(1)`. One fresh MySQL migration with `AUTO_ID_CACHE 1` added by hand. `drizzle.config.ts` switches to the `mysql` dialect, and `@libsql/client` goes.
- **The Workers port.** The entry point exports the Hono app. Settings come from `c.env` instead of `Deno.env`. `Deno.serve`, `Deno.mkdir` and the migration at start-up go. Each request gets a connection from the Hyperdrive binding. `wrangler.jsonc` is named `geekykey-service`, with `nodejs_compat`, `workers_dev = false` and `preview_urls = false`. `wrangler dev` answers on port 8000, so the Vite proxy and the stations need no change.
- **The cooldown's lock.** `#oneAtATime` goes. Each ingest is one short transaction that first locks the station's row in `stations` with `SELECT ... FOR UPDATE`.
- **`Cache-Control: no-store`** on every `/api/*` and `/auth/*` response, from one middleware.
- **Tests.** Vitest with `@cloudflare/vitest-plugin` runs the suite inside workerd against `geekykey_test`. The database is migrated once per run, test files run one at a time, every row is deleted before each test, and no test assumes an id value. `Deno.test` becomes `test`, and `node:assert` stays. A new test proves the lock: two overlapping ingests from one station, on two connections.
- **Tooling.** `deno.json`, `deno.lock`, Deno in `.mise.toml` and the `deps:backend` task go. ESLint, oxfmt and `tsc` replace `deno lint`, `deno fmt` and `deno check`, as in the frontend, with the Workers types from `wrangler types`. `allowBuilds` in `pnpm-workspace.yaml` gains the approved `workerd` version, and each Wrangler upgrade needs a person to approve the new one. `pnpm dev` runs `wrangler dev --var DEV_AUTH_ENABLED:true`, as the Deno dev task set it, so a fresh clone needs no `.dev.vars`. `wrangler.jsonc` turns off Wrangler's usage data (`send_metrics: false`), as the updates site does for Astro's. `check:build` and `check:migrations` are package scripts, so CI's two new checks also run on a laptop, and `format:backend` mirrors `format:frontend`.
- **CI's backend job:** mise installs Node and pnpm; `pnpm install --frozen-lockfile`; lint, format check and `tsc`; `db:up` from `compose.yaml`; the tests; `wrangler deploy --dry-run`, which needs no Cloudflare login and proves the Worker builds; and `drizzle-kit generate`, which must write nothing. The "Check deno.lock is current" step goes.
- **The README's backend sections** (section 8.1).

Done when:

- CI is green, with its two new checks.
- **The first proof:** the Vitest plugin reaches the Docker TiDB through the Hyperdrive binding. If it can't, the same test files run on Node with `mysql2` connecting directly, and this spec is updated to say so.
- A real station on Adam's network posts a tap to `wrangler dev`, and the tap is stored in `geekykey_dev`.

### Checkpoint 2. The first deploy

Checkpoint 1's Worker is live at `https://key-api.geekshacking.com` and stores taps in TiDB through Hyperdrive.

**Changed on 1 Oct 2026.** The team has no Cloudflare access, so Julian sets up production and deploys it through Workers Builds, and staging comes first (BAC-15). Julian's first try on 1 Oct stopped at the stand-in Hyperdrive ID, as expected.

Before it, once:

- Julian creates `geekykey-service` and attaches `key-api.geekshacking.com` (done on 1 Oct 2026). A pull request adds the domain to `routes`.
- Adam, with the root login from his laptop, creates the `geekykey` database, the app login and the migration login, and keeps the migration login in `~/.config/geekykey/`. The same scripts make `geekykey_staging` and its two logins.
- **Staging first.** Adam creates a Hyperdrive config in his own account for the staging app login, with the query cache off, sets staging's `SESSION_SECRET`, and deploys `env.staging` with `deploy:staging`. Every check below is tried there first, where Adam can read the logs.
- Adam sends the production app login's password to Julian privately, keeping no copy. Julian creates the production Hyperdrive config with it and the query cache off, sets `SESSION_SECRET` to a random value nobody keeps, and sends back the config's ID, which goes in `wrangler.jsonc`. `secrets.required` lists `SESSION_SECRET`.

The deploy:

- Adam runs `db:migrate` against production from his laptop.
- Julian deploys `geekykey-service` from `main` through Workers Builds: root directory `apps/backend`, no build command, deploy command `npx wrangler deploy`, `NODE_VERSION` `22.23.3`, `PNPM_VERSION` `12.5.1`, watch paths `apps/backend/*` and `pnpm-lock.yaml`, and preview builds off. The first build is the trial that confirms pnpm 12.5.1 works in Cloudflare's build image. **Once Workers Builds is connected, every merge to `main` deploys,** so migrate before you merge starts then, even if `main` isn't protected yet.
- The GeekyKey admin screens don't exist yet, so Adam creates one test station with a script from his laptop, the seed's station part pointed at production, and keeps its key for testing.

Done when:

- **The second proof:** a tap sent with `curl` to `https://key-api.geekshacking.com/api/v1/taps` is stored in TiDB through Hyperdrive, after the same tap worked on staging. If Hyperdrive can't reach TiDB, switch to TiDB's serverless driver and update section 3.5.
- **The log check,** on staging, where Adam can read the logs. If the `Authorization` header, and so the station key, appears, set `observability.logs.invocation_logs = false` in the config, for production and staging, before production's first tap, and replace the key. Julian looks at one production log at the first deploy to confirm.
- **The first numbers** are written down for "Staying on the free plan" (section 11.1): Hyperdrive queries per tap and the CPU time of a 500-tap batch, measured on staging, and TiDB's Request Units after a day, which only Julian can see.
- Once Zi Tao's firmware speaks HTTPS, a real station taps production.

### Checkpoint 3. The line drawn inside

Still one Worker, but its code is now two services that talk only through the hand-off, on the tables in section 3.5, with every station rule from the tickets.

- **Two areas** inside `apps/backend/src`, for example `geekykey/` and `event/`, each with its own schema file. Neither imports the other; a lint rule can enforce it.
- **`packages/handoff`**: the Zod schemas for the hand-off's request and response, types from `z.infer`, and a JSON Schema generated with `z.toJSONSchema` for other teams. The Event side checks each request with them, and the GeekyKey side checks each response.
- **The Event side:**
  - `POST /geekykey/v1/taps`, checking the Event Service key in constant time;
  - today's ingest, with replays dropped by station ID and `client_tap_id`, and the lock now on the station's `event_stations` row, created at its first tap;
  - `no_game` for a station without passport settings;
  - taps stored with the user ID and no token UID;
  - `users` keyed by the Portal user ID;
  - organizers from the `ORGANIZERS` setting, checked on every request, with `dev-organizer-1` on the local list; the `users.role` column goes;
  - `/me` without `tokens`, with `user.role` worked out from the list, and stamp slots only for passport stations, in the order they were added.
- **The GeekyKey side:**
  - `Claims`, with `LocalClaims` replacing `TokenResolver` (section 4);
  - the station's link: `no_event`, checked before the token, for no link, a link to an Event Service missing from the settings (also logged), or a tap timed before the link started;
  - `unknown_token` answered and logged, not stored;
  - the hand-off, with its 3 seconds and `503 event_service_unavailable`, and no retry;
  - `POST /api/v1/stations/heartbeat`, storing last seen, firmware version, saved taps and the optional `reader_ok`, and answering `server_time`;
  - the `EVENT_SERVICES` list, with the showcase's entry reached inside the same Worker until the split, and the `GEEKYKEY_ADMINS` list.
- **Log lines.** From here on, every log line either service writes is one JSON object with a fixed name, such as `tap_stored`, `unknown_token`, `no_event` and `handoff_failed`, and never holds a key, a cookie or a name. `tap_stored` carries the station ID, `client_tap_id`, user ID, `tapped_at` and status, so taps lost to a restore can be rebuilt.
- **The tables** change to section 3.5's under the migration rule: add first, switch the code, drop in a later migration, so each change takes two merges. Test data that no longer fits is deleted, not converted (the spec's call). Station IDs and keys stay, so stations keep working throughout.
- **Tests** for each side, with the other side faked at the hand-off, including one for each status a station can hear.

Done when CI is green and, on production, a test station answers `no_event` until it's linked, then `unknown_token` for an unclaimed token and `accepted` for a claimed one. Until checkpoint 6 builds the admin screens and claiming, Adam sets the link and the claim with one-off queries from his laptop.

### Checkpoint 4. Two Workers

`geekykey-service` and `event-service` are two Workers, joined by a service binding, and both are deployed.

**Changed on 1 Oct 2026:** at Julian's suggestion, the Event Service and its screens move to a repo of their own at the split. The folders, CI, the smoke test and `packages/handoff` below were written for one repo, and need rethinking before this checkpoint starts (section 12).

- **Folders.** `apps/backend` becomes `apps/geekykey-service`. The Event side moves to a new `apps/event-service`. Each has its own `package.json`, `wrangler.jsonc`, schema, tests and CI job. `apps/frontend` becomes `apps/event-web` now, not before, so Ethan's work in progress isn't disrupted.
- **The binding.** `geekykey-service` sends the hand-off with `env.SHOWCASE.fetch(request)`, and the `EVENT_SERVICES` entry names the binding. Another team's Event Service gets the same request through `fetch(request)`, to an address that must start with `https://`. Every hand-off sets `redirect: "manual"`.
- **Names.** The package names, root scripts, mise tasks and CI filters follow the new folder names.
- **The Event Service key:** 32 random bytes, set by Julian on both Workers, and listed in both `secrets.required`.
- **Local dev:** each service in its own `wrangler dev` on 8000 and 8001, started together by the root `pnpm dev`, with the Event screens' proxy now pointing at 8001.
- **CI:** one job per service, plus the end-to-end smoke test on every pull request, which starts both Workers with `wrangler dev` and sends a station tap through to the database.
- **The README's layout and diagram** for the new folders (section 8.1).

The deploy, in this order the first time, because a Worker can't deploy with a binding to a Worker that doesn't exist yet: Julian connects `event-service` to Workers Builds from its new repo and changes `geekykey-service`'s root directory to `apps/geekykey-service` the same day; `db:migrate` if the split needs it; `event-service` deploys, then `geekykey-service`.

Done when the smoke test passes in CI, a station's tap on production goes through the binding, and **the log check** is done with Julian on `event-service` for the hand-off's `Authorization` header. If the Event Service key shows, turn invocation logs off there and replace the key on both Workers.

### Checkpoint 5. Login, and the screens deployed

Waits on Qing Guan: the Portal's login details (the issuer, each app's client ID, which claim carries the display name, and whether there is a client secret) and the two OAuth apps (section 9).

- **Each service logs users in itself** ([ADR 0002](../../docs/adr/0002-each-service-logs-in-through-the-portal.md)): `GET /auth/login?return_to=...`, which accepts only a relative `return_to`, the rule `isSafeReturnTo` already applies in the screens; `GET /auth/callback`, which checks `state` before it calls the Portal; and `POST /auth/logout`. Each has its own cookie (`gk_session`, `event_session`), its own `SESSION_SECRET`, and its client ID and redirect URL from its settings. The Event Service's callback creates or updates the user's row with their display name. The GeekyKey Service keeps no users, so its session holds only the Portal user ID.
- **The forwarding Workers.** A small `worker/` folder in `apps/event-web` and in `apps/geekykey-web`, with its own Wrangler config (section 5.1). Adam writes them. Afterwards Ethan owns them, and Adam reviews any change to their list of paths.
- **`apps/geekykey-web`** exists by now, from the screens track, with at least its login and shell.

The deploy: Julian or Qing Guan attaches `event.geekshacking.com` to `event-web` and `key.geekshacking.com` to `geekykey-web`, and Julian connects both to Workers Builds (`apps/geekykey-web` in this repo, `event-web` in the Event Service's, with `VITE_LIVE_API=1` on `event-web`). A pull request adds each domain to `routes` the same day.

Done when:

- logging in and out works on both hostnames, and the passport shows on a phone;
- **the log check** for `Cookie` is done with Julian on all four Workers: if a cookie shows, turn invocation logs off on that Worker and replace the service's `SESSION_SECRET`, which logs everyone out;
- **the passport poll is measured** for section 11.1: Hyperdrive queries, Workers requests and outside requests per poll.

### Checkpoint 6. The GeekyKey Service's features

The endpoints behind the token page, My tokens and the GeekyKey admin screens, plus the station path's protections. Ethan's team builds the screens (see the tracks). Section 7.2 lists the proposed paths.

- **For GeekyKey admins,** each request checked against `GEEKYKEY_ADMINS`:
  - list every station, with its online light, link, saved taps and whether it's disabled;
  - create a station, showing its key once;
  - replace a station's key, keeping its ID, showing the new key once;
  - change its link to an Event Service from the settings, or to none. Linking or moving a station sets its link start to now, linking it again to the Event Service it already feeds changes nothing, and unlinking empties both columns. Each change writes `link_changed` with who made it;
  - disable and enable it, setting `disabled_at`. A disabled station's key gets `401`. Each writes a log line with who did it.
- **For users:** the token page's lookup, which says whether a token is unclaimed, yours or someone else's, and gives a GeekyKey admin the owner's ID to release with; claiming (`201`, or `200` if it's already yours, `409 token_taken`, `409 token_limit_reached`); releasing, by the owner or by a GeekyKey admin; and the user's own tokens, with the events that have a public address.
- **The status call,** `GET /api/v1/event-service/stations`, for an Event Service with its key. It lists only the stations linked to that Event Service now, each with its station ID, label, link start, last seen, whether it's online, firmware version, saved taps and `reader_ok`, which is missing when the station hasn't sent one.
- **The station key list in memory.** Each instance keeps which key hash belongs to which station, refreshed at most once a minute and never because a key wasn't found. A new, replaced or disabled key takes up to a minute to take effect. Links and everything else are still read fresh on each request.
- **The four limits** on this Worker (section 5.1). Each answers `429` with `{"error": "rate_limited"}` and `Retry-After: 60`, and writes one `rate_limited` log line naming the caller: a station ID, a user ID or an Event Service ID, never a key.

Done when, on production: a GeekyKey admin creates, links, disables and enables a station from the admin screens; a phone claims a token from its token page and another by typing its UID; an owner and a GeekyKey admin each release one; and the tests show each limit tripping.

### Checkpoint 7. The Event Service's features

The organizers' screens and the rest of the passport.

- **The station board's endpoint:** the stations from the status call, merged with their passport settings, and each station's last tap time from the Event Service's own taps. A linked station without passport settings is "Not in the passport". A passport station that's no longer linked keeps its slot and its stamps, and shows as "no longer linked". When the status call fails, after 3 seconds, every station's status is unknown, not offline.
- **Passport settings:** adding or changing a station's name, location and points. Stamp slots follow the order stations were added.
- **The tap log** without `token_uid`, **the stats**, **the export** with its ten columns and the statuses `accepted`, `cooldown` and `no_game`, and **the QR fallback**, which takes a `user_id` only and stores the tap through the same pipeline with `source = qr_fallback`.
- **The limit** of 60 requests a minute per user on this Worker.

Done when an organizer sets up the passport's stations on production and watches taps arrive, and the export's columns match section 7.

### Checkpoint 8. Ready for the event

- **Three tasks** in TypeScript with `mysql2`, run from Adam's laptop with the migration login, and tested in CI against the Docker TiDB:
  - `db:backup` writes every GeekyKey table to a file on Adam's laptop, a few MB for the whole showcase;
  - `db:restore <file> --tables <names>` puts back chosen tables only, so restoring taps doesn't undo claims, key replacements or link changes made since;
  - `db:clear-test-data` takes a copy itself, prints the row counts, asks Adam to type the database name, empties `taps` and `tokens`, moves every station's link start to now, and prints the counts again, expecting 0 taps and 0 claims. It keeps `stations`, `users`, `event_stations` and `passport_stations`.
- **The three saved queries** in the Workers Observability dashboard, shared as one link: errors in the last 15 minutes by name and Worker; failed hand-offs by Event Service; and responses of 500 or above by Worker.
- **The lists for the day:** Adam, Ethan and Zi Tao in `GEEKYKEY_ADMINS`, and the showcase's organizers in `ORGANIZERS`. The passport shows each user's Portal user ID, so a helper can send theirs to Adam.
- **The event-day sheet** from section 10, printed for the desk.

Done when the restore has been tried once on production (back up, restore, compare the counts), and the rehearsal in section 10 has run by Sat 7 Nov, in time for the decision on Paid by 11 Nov.

### After the showcase: the switch to the Portal's tag APIs

Waits on Julian agreeing to keep the showcase on the `tokens` table, and on Qing Guan's tag APIs.

- `PortalClaims` (section 4), and the Portal client secret as a secret on `geekykey-service`.
- A GeekyKey admin action, "Copy claims to the Portal": it replays each row of `tokens` as an ordinary claim, 40 rows a request to stay under the free plan's 50 outside requests, and the admin screen repeats it until every row is done. It's safe to run twice, and it reports any UID the Portal says someone else owns.
- The order: deploy the action; run it; deploy the version with `PortalClaims`; run the action once more for stragglers; drop `tokens` in a later migration. All of this happens before the showcase's data is cleaned up ("After the event", section 11.2).
- The API agreement gains `503 portal_unavailable` for stations.
- Accepted: a release made in the minutes between the copy and the switch doesn't reach the Portal, so that token stays claimed until it's released again.

**If Julian wants the Portal on the station path at the showcase instead,** the fallback is to switch before it only if the tag APIs are live by 28 Oct, with a Portal instance kept warm that takes more than one request at a time.

### The tracks alongside

**Going public** (Zi Tao, Adam, Julian). Nothing can be taken back once the repo is public.

1. Zi Tao changes the Wi-Fi password committed in `firmware/NFC_test/test.ino`, or confirms it's a throwaway hotspot, and moves it into a gitignored `secrets.h`.
2. Adam decides whether `.scratch/` and `meeting-notes/` stay uncommitted or become public.
3. Julian makes the repo public.
4. Julian protects `main` (a pull request with CI passing), and creates a `production` environment with Adam as its required reviewer. Julian adds the migration login there, from Adam.
5. A manual "Migrate production" workflow on GitHub Actions, run on a pull request's branch through the `production` environment. From then on: **migrate before you merge**.
6. With `main` protected, only a merge that passed CI can go live through Workers Builds.

Until step 5, Adam runs `db:migrate` against production from his laptop before merging. Production deploys are Julian's, through Workers Builds, and Adam tries them on staging first.

**The screens** (Ethan's team). They build against the mock client as soon as the API agreement pull request is approved, and wire each screen as its endpoint lands, as `apps/frontend/CLAUDE.md` describes.

- **A new `apps/geekykey-web`,** a second Vite app on the same stack, with a few shadcn components copied across:
  - the token page at `/t/<UID>`, with its five levels, landing back on it after login;
  - My tokens, the home page, with **Release**, the form to claim by typing a UID, and a link to each event with a public address;
  - the GeekyKey admin screens at `/admin`: every station with its online light, create a station and replace a key (each key shown once), change a link with the saved-taps warning before a move, and disable or enable.
- **Moved from `apps/frontend`:** the station board, the add-station dialog and the key reveal go to `apps/geekykey-web`.
- **In `apps/frontend`, which becomes `apps/event-web` at checkpoint 4:**
  - the passport drops its pair screen and its token status line. While a participant has no taps, it shows "Tap your token with your phone to claim it", with a link to My tokens. It shows the user's Portal user ID where it can be copied;
  - the organizers' station board merges the status call with passport settings, shows "Not in the passport" with a button to add its settings, "no longer linked", "status unknown" when the call fails, and each station's last tap. Stations that are offline, holding saved taps, not in the passport, or whose reader isn't responding turn red and go first. A station that's only quiet stays uncoloured;
  - the QR fallback form loses its "Token UID" mode;
  - `429`: screens that poll keep showing their last data, and the token page, the claim form and My tokens say "Too many tries. Wait a minute and try again.";
  - a fourth claim says "You already have 3 tokens. Release one on My tokens first."

**The stations** (Zi Tao): the station contract, the token writer and the Wi-Fi password, in section 9.

Sources for section 6: every ticket in section 13, in particular [How do deploys and secrets work?](issues/09-deploys-and-secrets.md) and [How do local dev, tests and CI get a runtime and a database?](issues/08-dev-test-ci.md).

---

## 7. Edits to the API agreement

The first migration step, in one pull request that Ethan reviews. The agreement wins over every other document, including this one, once merged.

### 7.1 Section by section

**Throughout.**

- "The backend" becomes the GeekyKey Service or the Event Service, whichever owns the endpoint.
- Say "claim" and "release", not "pair" and "unpair".
- The owners table names Adam for both services, Ethan for the screens and Zi Tao for the firmware.
- The version moves to 0.2.
- Each endpoint's status tag names the checkpoint that builds it (section 6), since `Sprint 1` and `MVP` no longer match the plan.

**1. How to use and change this document.**

- One exception to "fields are only ever added, never renamed or removed, within `/api/v1`": this rewrite removes `tokens` from `/me`, `token_uid` from the tap log and the export, and stored `unknown_token` taps. It's allowed once, because nothing relies on them in production yet, and the changelog records it.
- Add: a change to the hand-off must work with the other service's previous version, so either service can be rolled back alone.

**2. Conventions.**

- **Base URLs:**

  | Who | Local | Production |
  |---|---|---|
  | Stations and Event Services | `http://localhost:8000` | `https://key-api.geekshacking.com` |
  | Browsers, for the GeekyKey screens | `http://localhost:5174` | `https://key.geekshacking.com` |
  | Browsers, for the Event Service's screens | `http://localhost:5173` | `https://event.geekshacking.com` |

  Browsers only ever use their screens' hostname, which forwards `/api` and `/auth` to its service.
- **Status codes:** add `429` and `503`, and update the `409` examples.
- **Error codes:** add `rate_limited` (`429`, with `Retry-After: 60`), `token_limit_reached` (`409`), `event_service_unavailable` (`503`), and `portal_unavailable` (`503`, only from the switch after the showcase). `token_taken` (`409`) replaces `uid_already_paired`.
- **CORS and cookies,** rewritten: no service ever sends CORS headers, because each set of screens reaches its service through its own hostname. Cookies are `gk_session` (the GeekyKey Service) and `event_session` (the Event Service), each `HttpOnly`, `SameSite=Lax`, `Path=/`, with no `Domain`, and `Secure` outside local development. Every `/api/*` and `/auth/*` response carries `Cache-Control: no-store`.

**3. Roles and authentication.**

- **The callers table:**

  | Caller | Identified by | Talks to |
  |---|---|---|
  | Participant | `event_session` | The Event Service |
  | Organizer | `event_session`, with a Portal user ID on the Event Service's organizer list (not `users.role`) | The Event Service |
  | User | `gk_session` | The GeekyKey Service: the token page and My tokens |
  | GeekyKey admin | `gk_session`, with a Portal user ID on the GeekyKey Service's admin list | The GeekyKey Service |
  | Station | `Authorization: Bearer gk_sta_…` | The GeekyKey Service |
  | Event Service | `Authorization: Bearer` with its Event Service key | The GeekyKey Service's status call, and the other way for the hand-off |

- **Browser sessions:** each service sets its own cookie, from its own `/auth/callback`, or `/auth/dev-login` locally.
- **Station keys:** GeekyKey admins create them, replace them keeping the station's ID, and disable and enable stations. A disabled station gets `401`, the same as a wrong key.
- **A new subsection on Event Service keys:** 32 random bytes that nobody picks; compared in constant time; never logged; the hand-off never follows a redirect, and another team's address must start with `https://`. To replace one, set the new key on both sides outside the event: hand-offs fail with `503` until both match, and stations resend.

**4. Shared vocabulary.**

- **Token UID:** add the token address, `https://key.geekshacking.com/t/<UID>`, whose UID is the chip's own, 14 upper-case hex characters for our NTAG213 tokens. The wider 4-to-10-byte rule stays, since stations can read other cards.
- **`tap_status`:**

  | Value | Answered by | Stored | Meaning |
  |---|---|---|---|
  | `accepted` | Event Service | yes | Counts in at least one game |
  | `cooldown` | Event Service | yes | Same user, same station, inside the cooldown. Recorded, doesn't count |
  | `no_game` | Event Service | yes | Reached the event, but no game counts taps at that station |
  | `duplicate` | Event Service | no | This `client_tap_id` was already received |
  | `unknown_token` | GeekyKey Service | no, only logged | Nobody has claimed this token |
  | `no_event` | GeekyKey Service | no, only logged | The station feeds no event, or the tap was timed before its current link started |

  A station treats any status it doesn't know as recorded.
- **`role`:** `participant` or `organizer`, worked out from the Event Service's organizer list.
- **Stamps and points:** worked out by the Event Service, from stations that have passport settings, in the order they were added.

**5. Endpoint index:** two tables, one per service (section 7.2).

**6. Station endpoints,** now on the GeekyKey Service at `https://key-api.geekshacking.com`.

- **6.1 `POST /api/v1/taps`:**
  - The request and the response don't change. The GeekyKey Service answers `unknown_token` and `no_event` itself, and passes back the Event Service's statuses unchanged. `no_event` is checked before the token.
  - The firmware contract:
    - remove a tap from the buffer as soon as any status comes back for it;
    - on `401`, keep the taps, show a setup error, and retry at the heartbeat's pace;
    - on `429` or any `5xx`, including `503 event_service_unavailable`, keep the taps and retry later;
    - on `400`, drop that batch and log it on the serial port;
    - resend saved taps at most once a minute, alongside the heartbeat; a new tap is still sent at once, with any saved taps in the same request;
    - ignore response fields you don't know, and treat a status you don't know as recorded.
  - The screen and LED table from [the message to Zi Tao](assets/message-to-zi-tao-station-contract.md) replaces "accepted green, cooldown amber, unknown_token red", as the suggested mapping.
  - **New security rules for firmware:** send the station key over `http://` only to a `.local` address; leave redirects off; never print the key. In production the station trusts the 14 root certificates of the certificate authorities Cloudflare uses, and keeps one HTTPS connection open.
- **6.2 `POST /api/v1/stations/heartbeat`:** an optional `reader_ok` in the request. The heartbeat is also the boot check, instead of `/api/health`, and the clock source: set the clock from `server_time` every time. Every 60 seconds, which also keeps the connection open, since Cloudflare closes an idle one after 400 seconds.
- **"To rotate, create a new station"** becomes: a GeekyKey admin replaces the key, keeping the station's ID.

**7. Auth endpoints,** on each service: `/auth/login`, `/auth/callback`, `/auth/logout`, and `/auth/dev-login` in local development only. Each service has its own OAuth app and redirect URL. The GeekyKey Service's token page logs in with `return_to=/t/<UID>`. On login, the Event Service creates or updates the user's row with their display name; the GeekyKey Service keeps no users.

**8. Participant endpoints.**

- **8.1 `GET /api/v1/me`** on the Event Service: no `tokens`, and `user.role` comes from the organizer list. `stamps` lists stations with passport settings, in the order they were added, not every station. `user.id` is the Portal user ID.
- **8.2 and 8.3 move to the GeekyKey Service** as claim and release, with the token page's lookup and My tokens beside them (section 7.2). At most 3 tokens per user, answered with `409 token_limit_reached`. A GeekyKey admin can release someone else's token. "The row is kept with `revoked_at`" goes: releasing deletes the claim.

**9. Organizer endpoints.** They stay on the Event Service, except creating a station, showing and replacing its key, linking it and disabling it, which move to the GeekyKey Service for GeekyKey admins.

- **9.1** becomes adding a station's passport settings (name, location, points) on the Event Service.
- **9.2** becomes the station board, merged from the status call, with each station's last tap.
- **9.3** loses `token_uid`. `user` is never null, but `display_name` is null for someone who has never logged in. Its `status` filter takes `accepted`, `cooldown` or `no_game`.
- **9.4** takes `user_id` only. Its `uid` mode, and the rule about unpaired UIDs, go.
- **9.6** keeps ten columns, in this order: `tap_id, client_tap_id, station_id, station_name, user_id, display_name, status, source, tapped_at, received_at`. One row per stored tap, whose `status` is `accepted`, `cooldown` or `no_game`.

**A new section: building an Event Service.** For other teams:

- the hand-off, `POST /geekykey/v1/taps`: its request, and its answer of one status per tap, in request order, with the same `client_tap_id`s;
- dropping replays by station ID and `client_tap_id`, which every Event Service must do;
- the 3-second limit, and what counts as a failure;
- the Event Service key and its rules;
- the status call, `GET /api/v1/event-service/stations`;
- the JSON Schema generated from `packages/handoff`;
- what the hand-off leaves out: the token's ID, taps turned away, the source, the GeekyKey Service's receipt time, and the user's name, which an Event Service asks the Portal for if it needs one.

**10. Out of scope.**

- "One container is one event" becomes "one Event Service runs one event, and a station feeds one Event Service at a time".
- Replacing a station's key moves into scope, for GeekyKey admins. Reading a key back stays out.

**11. The screen map,** split by service. The GeekyKey Service gets the token page, My tokens and the GeekyKey admin screens. The "Pair token" row goes. The local setup commands become the new mise tasks.

**12. Open questions.**

- "Production origin for CORS" closes: there is no CORS.
- "Does the station firmware persist a tap counter across power loss?" closes: since its first version on 23 Sep, the firmware has saved its counter in flash before each tap.
- The Portal's QR code and the Portal's login details stay open, with Qing Guan.
- The Event Service's hostname is `event.geekshacking.com`, chosen by Julian on 1 Oct 2026, so it isn't an open question.

**13. Changelog:** one entry for the rewrite, naming the one-off removals.

### 7.2 The endpoint index

Paths marked **new** are the spec's proposal, and the pull request settles them.

**The GeekyKey Service**

| Method | Path | Caller | Purpose | |
|---|---|---|---|---|
| GET | `/api/health` | anyone | Liveness | today's |
| POST | `/api/v1/taps` | Station | Taps, one or a batch | today's, moved |
| POST | `/api/v1/stations/heartbeat` | Station | Online light, clock, `reader_ok` | was `MVP` |
| GET | `/api/v1/event-service/stations` | Event Service | The status of the stations linked to it | decided |
| GET | `/api/v1/me` | User | The user, whether they're a GeekyKey admin, their tokens (oldest claim first) and the events to link to | **new** |
| GET | `/api/v1/tokens/{uid}` | User | What the token page shows: unclaimed, yours or someone else's, plus the owner's ID for a GeekyKey admin | **new** |
| POST | `/api/v1/tokens/{uid}/claim` | User | Claim, from the token page or the claim-by-code form | **new**, replaces pairing |
| DELETE | `/api/v1/tokens/{uid}` | User, GeekyKey admin | Release. A GeekyKey admin adds `?owner_id=` | replaces unpairing |
| GET | `/api/v1/admin/stations` | GeekyKey admin | Every station | moved |
| POST | `/api/v1/admin/stations` | GeekyKey admin | Create a station, key shown once | moved |
| POST | `/api/v1/admin/stations/{id}/key` | GeekyKey admin | Replace the key, new key shown once | **new** |
| PUT | `/api/v1/admin/stations/{id}/link` | GeekyKey admin | Link to an Event Service, or to none | **new** |
| POST | `/api/v1/admin/stations/{id}/disable`, `/enable` | GeekyKey admin | Disable or enable | **new** |
| GET, GET, POST | `/auth/login`, `/auth/callback`, `/auth/logout` | browser | Login through the Portal, `gk_session` | was `MVP` |
| POST | `/auth/dev-login` | local only | Sign in a seeded user | today's |

**The Event Service**

| Method | Path | Caller | Purpose | |
|---|---|---|---|---|
| GET | `/api/health` | anyone | Liveness | today's |
| POST | `/geekykey/v1/taps` | GeekyKey Service | The hand-off | decided |
| GET | `/api/v1/me` | Participant, organizer | The dashboard and passport, without `tokens` | today's, changed |
| GET | `/api/v1/admin/stations` | Organizer | The station board | changed |
| PUT | `/api/v1/admin/stations/{id}/passport` | Organizer | Add or change a station's passport settings | **new** |
| GET | `/api/v1/admin/taps` | Organizer | The tap log | changed |
| POST | `/api/v1/admin/taps` | Organizer | The QR fallback, `user_id` only | changed |
| GET | `/api/v1/admin/stats` | Organizer | Totals | as agreed |
| GET | `/api/v1/admin/export.csv` | Organizer | The ten-column export | changed |
| GET, GET, POST | `/auth/login`, `/auth/callback`, `/auth/logout` | browser | Login through the Portal, `event_session` | was `MVP` |
| POST | `/auth/dev-login` | local only | Sign in a seeded user | today's |

Sources for section 7: every "Settled by" note in [Write the migration spec](issues/10-migration-spec.md), and the tickets it names.

---

## 8. Edits to the README and other docs

### 8.1 The README

Each change lands with the checkpoint that makes it true.

**Checkpoint 1:**

- The repo layout: `.mise.toml` pins Node and pnpm, not Deno; add `compose.yaml`.
- The stack table: the backend is "Hono on Cloudflare Workers, Drizzle ORM, TiDB".
- "How the pieces connect": SQLite becomes TiDB.
- "Inside the backend": the entry point exports the Worker; add `wrangler.jsonc` and the scripts; `data/` goes.
- "Install the tools": mise installs Node and pnpm.
- The task table: `deps:backend` goes; add `db:up`, `db:reset`, `db:down`, `db:migrate`, `seed` and `format:backend`; `dev:backend` runs `wrangler dev` with dev-login on, and `test:backend` runs Vitest.
- "Where a task's command comes from": the backend tasks no longer end in a `deno task`.
- "Running the backend," rewritten: install Docker, then `mise run db:up`, `mise run seed` and `mise run dev:backend`. Quit Docker Desktop when you're not working on the backend: it can use 4 GiB of memory.
- "Settings": settings live in `wrangler.jsonc`, and local secrets in `.dev.vars`. The `DATABASE_URL` row goes.
- "Other backend commands": lint, format check, typecheck, `drizzle-kit generate`, and CI's two checks, `check:build` and `check:migrations`.
- "Changing backend dependencies" goes: there is no second lockfile.
- CI: the backend job's new steps.
- "Where to read next": add `CONTEXT.md` and `docs/adr/`.

**Checkpoint 2: a new "Deploying" section** with each Worker's folder and address, how production and staging are each deployed, and the team's rules:

1. **Migrate before you merge.** A pull request that adds a migration runs "Migrate production" on its own branch first, and merges only once that succeeds. Every migration works with the version still running.
2. **Every merge to `main` deploys.**
3. **The freeze.** From the evening before the showcase until it ends, nothing merges to `main` except a fix Adam approves, announced in the team chat, and "Migrate production" doesn't run.
4. **Rolling back.** One Worker at a time. The team reverts the commit on `main`, and Workers Builds deploys the revert in a few minutes. For an instant rollback, Julian rolls back one version from the Worker's Deployments page, and the commit is still reverted, or the next merge deploys it again. Never roll back past a key replacement. The database is never rolled back.
5. **The hand-off.** A change to `packages/handoff` must work with the other service's previous version.
6. **Copies.** Adam takes one with `db:backup` before every "Migrate production" run, just before the test data is cleared, and at the end of the event day. They stay on his laptop, never in GitHub or a chat.
7. **On the event day,** only Adam changes data, with a fresh copy first and Ethan reading the query. A counting or display bug is fixed by rolling back, not by changing data.
8. **Staging first.** A change to how the Worker starts, its config or its database access is deployed to staging with `deploy:staging` before it merges.

**Checkpoint 4:** the layout, the stack table and the diagram for `apps/geekykey-service`, `apps/event-service`, `apps/geekykey-web`, `apps/event-web` and `packages/handoff`; the four local ports; and one `pnpm dev`.

**When Zi Tao's HTTPS firmware lands:** "Station firmware" says the server setting is a full base URL, `http://A-Mac.local:8000` locally and `https://key-api.geekshacking.com` in production.

### 8.2 Other docs

- **`apps/frontend/CLAUDE.md`,** which becomes `apps/event-web/CLAUDE.md` at the split, for Ethan to update: the backend is no longer "Hono on Deno" in `apps/backend`; the showcase's date, 18 Nov rather than 17; the screens table loses `/pair`, and the station screens move to `apps/geekykey-web`; `uid_already_paired` goes from the error handling; replacing a station's key is now a GeekyKey admin screen, and reading a key back stays out of scope. `src/lib/constants.ts` still says "Seeded by `deno task seed`".
- **`CONTEXT.md` and `docs/adr/`:** commit them with the API agreement pull request, or just before it.

---

## 9. What each person needs from us

### Julian

- **Now:** part 2 of [the hostnames message](assets/message-to-julian-redirect-urls.md) if it hasn't gone, and part 1 of [the tag APIs message](assets/message-to-qing-guan-tag-apis.md): may the showcase keep its claims in our `tokens` table and switch to the Portal after it?
- **Adam raises himself:** `key.geekshacking.com` and its `/t/` path must keep working for as long as tokens are in use.
- **At checkpoint 2, part 3a of the hostnames message and its follow-up,** both sent on 1 Oct 2026 (BAC-8):
  - `geekykey-service` with `key-api.geekshacking.com` attached (done on 1 Oct);
  - the production Hyperdrive config with the query cache off, from the app login Adam sends, and its ID back to us;
  - `SESSION_SECRET`, as a random value nobody keeps;
  - Workers Builds for `geekykey-service`, with the settings Adam sent: root directory `apps/backend` until the split;
  - a screen share at the first deploy, for the log check;
  - note the five rate-limit namespace IDs we use (section 5.1);
  - Qing Guan's custom rule for `key-api.geekshacking.com` (below).
- **Dropped on 1 Oct:** the roles part 3a asked for. The team gets no access to the Cloudflare account.
- **For going public:** make the repo public once Zi Tao's Wi-Fi fix is in; protect `main`; create the `production` environment, and add the migration login to it.
- **At checkpoint 4, part 3b:** the Event Service's new repo; connect `event-service` from it; and change `geekykey-service`'s root directory to `apps/geekykey-service`.
- **At checkpoint 5, part 3c:** attach `key.geekshacking.com` to `geekykey-web` and `event.geekshacking.com` to `event-web`, and connect both (`VITE_LIVE_API=1` on `event-web`).
- **By 11 Nov:** the decision on Workers Paid, with our numbers from section 11.1, and TiDB's Request Units, which only he can see.
- **Before the showcase, part 4 of the hostnames message:** be reachable by phone during the event, with his number on the event-day sheet if he agrees; upgrade on the spot if we pass 70% of the free day; roll a Worker back when we ask; restore TiDB's backup if the cluster is lost. How the team sees production's logs and usage on the day is still open (section 12).
- **Keep off:** Bot Fight Mode on geekshacking.com, which could challenge every station.

### Qing Guan

- **Now, [logging in through the Portal](assets/message-to-qing-guan-login.md):** the two OAuth apps, each with its final redirect URL and its `localhost` one, now that the Portal takes several per app:

  | App | Redirect URLs |
  |---|---|
  | The GeekyKey Service | `https://key.geekshacking.com/auth/callback`, `http://localhost:5174/auth/callback` |
  | The Event Service | `https://event.geekshacking.com/auth/callback`, `http://localhost:5173/auth/callback` |

- **The login details:** the issuer, each app's client ID, which claim carries the display name, and whether there's a client secret.
- **What the Portal's participant QR code holds,** which the QR fallback scans.
- **The tag APIs:** part 2 of [the tag APIs message](assets/message-to-qing-guan-tag-apis.md).
- **At checkpoint 2, in part 3a of the hostnames message:** one custom rule that skips Browser Integrity Check, Security Level and all rate limiting rules for `key-api.geekshacking.com`, so "I'm Under Attack" on another site can't stop the stations. We ask for no rate limiting rule.
- **On the day:** reachable by phone, for the Portal and the zone.

### Ethan

- **Review the API agreement pull request** (step 0).
- **The screens track** in section 6, with his team, and the edits to `apps/frontend/CLAUDE.md` (section 8.2).
- **Own the two forwarding Workers** once Adam has written them. Adam reviews any change to their list of paths.
- **Access:** none, like the rest of the team (Julian, 1 Oct 2026). His screens deploy when his pull requests merge, and roll back by reverting.
- **Install Docker** to run the backend locally.
- **On the day:** watch the screens and roll them back by reverting; a second pair of eyes on whatever the team can see of production (section 12); read any query Adam runs to change data; at the desk whenever Adam isn't; a GeekyKey admin who only links, unlinks and disables stations.

### Zi Tao

- **[The station contract](assets/message-to-zi-tao-station-contract.md):** the address and HTTPS with the 14 roots, the heartbeat with `reader_ok` and the clock, the statuses and the screen table (including `no_event`, `no_game` and `Reader error`), the resend pace, and the three rules for the station key.
  - **Since the message was drafted,** the firmware of 29 Sep keeps failed taps in flash, so its part 5 applies now. Four things in that firmware differ from the contract, and matter once the service answers the new statuses:
    - `isValidTapStatus` accepts only today's four statuses, so a tap answered `no_event`, `no_game` or another team's status counts as failed and stays at the head of the queue. Every later tap waits behind it, so the station stops sending altogether: at the latest, the first tap at a station that isn't linked yet. The contract says to remove the tap and show the table's screen, or `Tap received` for a status it doesn't know;
    - a `400` stays at the head of the queue in the same way, where the contract says to drop that batch;
    - retries start 2 seconds after a failure and double up to 60, where the contract says at most once a minute, alongside the heartbeat;
    - saved taps go one per request, where a single request can carry up to 500, which saves the free plan's requests.
- **[The token writer](assets/message-to-zi-tao-token-writer.md):** the sketch is in `firmware/token_writer/`. Every token is written with it before the event, and Adam keeps a copy of the password. On 1 Oct the address became `key.geekshacking.com` and the sketch moved the UID mirror to match. It compiles but hasn't been tried on a token yet (HAR-12).
- **[The Wi-Fi password](assets/message-to-zi-tao-wifi-password.md),** before the repo goes public.
- **Access:** none (Julian, 1 Oct 2026). The station's own screen and serial output show the service's answers, and staging's logs are Adam's to read.
- **On the day:** watch the stations and walk to any that turns red; a GeekyKey admin who only links, unlinks and disables stations; reflash a station whose key is replaced, with Adam's agreement.

### Joshua

- The export keeps ten columns, as he confirmed in [Does the A/B analysis need token IDs or unclaimed-token taps?](issues/16-ab-analysis-export.md). The end-of-day copy feeds his analysis.
- He runs the A/B study on the day, and isn't a watcher.
- The Sprint 2 A/B test's setup, with Adam (section 12).

---

## 10. Event day

The showcase is on Wed 18 Nov 2026 at Ngee Ann Polytechnic, with setup there on Tue 17 Nov.

### 10.1 The run-up

- **By Sat 7 Nov, the rehearsal on production.** It runs the evening-before steps (the freeze, a copy, the clear), the morning check, the team using passports and tapping stations for an hour, the one restore try, one rollback of a screens Worker by reverting, and pulling one station's power to watch it turn red on the board. The watchers use the saved queries and the sheet as they would on the day. Then the data is cleared again. Its numbers feed the decision on Paid, and it comes out of November's TiDB allowance, which the showcase also draws on.
- **By Wed 11 Nov:** Paid or not (section 11.1).
- **The evening before, Tue 17 Nov,** after the day's setup at the venue and straight after the last merge: the freeze starts, Adam runs `db:clear-test-data`, which takes its own copy first, and from then on nobody makes a test claim or taps a claimed token. If we're still on the free plan, Julian checks TiDB's Request Units, which only he can see: if less than twice what the rehearsal used is left, he raises TiDB's spending limit above $0.
- **The morning,** before check-in: tap each station with an unclaimed token and expect `Not claimed yet`, which proves the station's Wi-Fi, key, certificate and link and stores nothing. The station board shows any station missing passport settings. The organizers' stats still show 0 taps.
- **Check-in:** tokens are handed out and claimed (provisional). Team members who play claim again like everyone else.
- **The end of the day:** Adam takes a copy, the source for Joshua's analysis and for "Copy claims to the Portal". The freeze ends when the showcase does.

### 10.2 Who watches

- **Adam:** the services. He decides on fixes, and he's the only one who changes data. Since 1 Oct the team can't open production's logs or saved queries, so what he watches them through is open (section 12).
- **Zi Tao:** the stations, walking to any that turns red.
- **Ethan:** the screens, which he can roll back, and a second pair of eyes on the logs.
- **Joshua:** runs the A/B study. Not a watcher.
- **The desk:** one laptop keeps the station board open all day. Adam or Ethan is at the desk at every moment, and whoever leaves hands over first. Once an hour, the desk looks down the last-tap column. The rota's times stay blank until the programme is out.
- **GeekyKey admins on the day:** Adam, Ethan and Zi Tao. They only link, unlink and disable stations. Replacing a key means reflashing, so it stays with Zi Tao, with Adam's agreement.
- **If we're still on the free plan:** someone checks the account's Workers requests and Hyperdrive queries every hour from 08:00, when both reset, and if either passes 70% before the event ends, Julian upgrades on the spot. Only Julian can see them today (section 12).

### 10.3 Rules for touching data

- The freeze covers "Migrate production": no migration runs on the day, and a fix that needs one waits until the event is over.
- A counting or display bug is fixed by rolling back the Worker, not by changing data. Stamps and points are worked out from taps every time they're read.
- Only Adam decides to change data, with a repair query or `db:restore` for chosen tables. He takes a fresh copy first, and Ethan reads the query before it runs. If Adam can't be reached, nobody changes data, and Ethan can still roll back the screens.
- If TiDB is down, nothing is restored. Stations keep their taps and resend them, and we wait.
- If the whole cluster is lost: Julian restores TiDB's latest daily backup into a new cluster; Adam creates the two logins there and sends the app login to Julian, who points the Hyperdrive config at it; then he restores our own copy on top, if it's newer. Probably under an hour.
- Taps lost to a restore come back from the `tap_stored` log lines, kept 3 days. The tool that replays them is written only if it's ever needed.

### 10.4 The event-day sheet

One page, printed and kept at the desk, with Julian's and Qing Guan's numbers if they agree.

| What you see | Most likely | Who acts | What they do |
|---|---|---|---|
| A station red on the board: offline | Power or Wi-Fi | Zi Tao | Walks over. The station keeps its taps and resends them |
| A station red: online, but holding saved taps | Hand-offs to the Event Service failing | Adam | Checks the failed hand-offs (section 12 settles where). If a fix just went out, reverts it, or asks Julian to roll back the Event Service |
| A station red: reader not responding | A dead or loose reader | Zi Tao | Swaps the station, or sends people to the next one. The QR fallback is at the desk |
| A station shows `Setup error` | A wrong key, or the station is disabled | A GeekyKey admin | Checks the station on the admin screens |
| A station shows `Not in an event` | The link is missing | A GeekyKey admin | Links the station |
| Many `Not claimed yet` at stations | Participants haven't claimed their tokens | Whoever is at the desk | Helps them claim on their phones, or by typing the UID in My tokens |
| A busy station's last tap is long ago | A fault the reader check can't catch, or older firmware | Zi Tao | As for a dead reader |
| The passport or organizer screens are broken | A bad screens deploy | Ethan | Reverts the last screens merge, or asks Julian to roll back `event-web` or `geekykey-web` |
| Logins fail, and people already logged in are fine | The Portal | Adam calls Qing Guan | Taps still count. New people try again later |
| Error 1027 everywhere | The free day's requests are used up | Adam calls Julian | Julian upgrades to Paid |
| Database errors from both services | TiDB is down, or its monthly allowance is used up | Adam calls Julian | Julian checks the TiDB console |
| Nothing is reachable | Cloudflare | Nobody | Watch cloudflarestatus.com. Stations keep their taps |
| A station has gone missing | Theft | A GeekyKey admin | Disables it. Its key is replaced before it's used again |

Accepted: between the first deploy and the rehearsal, a fault is noticed only if someone happens to be using the system; if Adam and Ethan both leave the desk without handing over, a fault waits until someone looks; a dead reader on a station with older firmware shows only as a stale last tap; and on the free plan, a sudden rush can use up the day between two hourly checks.

Sources for section 10: [How do we notice trouble on event day, and who watches?](issues/20-event-day-monitoring.md), [How do we back up the database, recover it on event day, and clear the test data before the doors open?](issues/19-backups-and-test-data.md), [How do deploys and secrets work?](issues/09-deploys-and-secrets.md)

---

## 11. Provisional

### 11.1 Staying on the free plan

GeeksHacking's Cloudflare account is on the free plan until the numbers say otherwise, and the decision on Workers Paid, which starts at $5 a month, is due by 11 Nov.

- **What we measure:** at checkpoint 2, on staging, what a tap costs; at checkpoint 5, what a passport poll costs; each in Hyperdrive queries, Workers requests and outside requests. Against the free plan's 100,000 queries a day, 100,000 requests a day and 50 outside requests per request. Two more, the spec's call: the CPU time of a 500-tap batch, against the free plan's 10 ms per request, which "What does running the backend on Workers involve?" found to be the tightest limit; and our log events against Workers Logs' 200,000 a day, since every stored tap writes one. TiDB's console, which only Julian can open, shows what a day of polling and heartbeats costs against its 50 million Request Units a month, after which TiDB refuses new connections. The rehearsal gives a whole day's numbers.
- **What we know already:** the passport alone could use up Hyperdrive's day in about 55 passport-hours, polling every 10 seconds at about five queries a poll. A heartbeat costs one query, since station keys are found in memory; 20 stations over 10 hours make about 12,000 requests and 12,000 queries.
- **Ways to fit, if the numbers say so:** fewer queries per poll; polling only while the passport is on screen; slower polling; or a push design through a Durable Object, as Qing Guan suggested. The mentors ruled out live sockets on 24 Sep unless a game needs them, so push would go back to them with cost as the reason.
- **Or pay.** A flood from many addresses could still use up the free day, which the rate limits can't stop, and that risk counts toward paying. A TiDB spending limit above $0 would also keep backups for up to 30 days, at a time we choose, instead of one day at a random time.
- **If we're still on the free plan on the day:** the hourly check, and Julian upgrading at 70% (section 10.2).

### 11.2 After the event

What happens to the showcase's data once it ends. Julian suggested keeping a per-event copy of user details and deleting it afterwards. With one database, deleting the event's data also takes the `tokens` stand-in and the stations with it, so the claims must first be copied to the Portal ("After the showcase", section 6). Unlinking the event's stations afterwards is a GeekyKey admin's job. The end-of-day copy on Adam's laptop feeds Joshua's analysis and the claims copy, and our copies are deleted along with the event's data. The Single Source of Truth plans the documentation and code handover to GeeksHacking for 19 and 20 Nov, which bears on who runs the switch and the deletion.

### 11.3 Other provisional decisions

| Decision | Firm when | Fallback |
|---|---|---|
| Hyperdrive with `mysql2` | Staging or checkpoint 2 shows a deployed Worker reaching TiDB | TiDB's serverless driver |
| `@cloudflare/vitest-plugin` | Checkpoint 1 shows it reaching the Docker TiDB through the Hyperdrive binding | The same tests on Node, with `mysql2` connecting directly |
| The showcase on the `tokens` table | Julian agrees | Switch before the showcase only if the tag APIs are live by 28 Oct, with a warm Portal that takes several requests at once |
| Tokens claimed at check-in | Adam decides ("still up to discussion") | Release only the team's own claims instead of emptying `tokens` |
| The clear as a laptop task | Adam decides | A manual workflow like "Migrate production", once copies have a private home such as an R2 bucket |

---

## 12. Still to confirm

**Facts to check:**

- **The showcase's hours,** and whether Adam or Ethan presents at set times.
- **That only Julian can use the TiDB Cloud console,** and so restore TiDB's backup.
- **Whether the Portal accepts `http://localhost` redirect URLs.**
- **The Portal's login details and its QR code,** with Qing Guan.

**Open, for Adam:**

- **Seeing production without access** (Julian, 1 Oct 2026). The team can't open production's logs, saved queries or usage numbers, which checkpoints 2, 4 and 5 and the event day relied on. Staging covers the checks before production. For the day, the choices are: ask Julian for read-only access to Workers Observability and the account's usage only; Julian, or someone he names, watches them on the day; or the GeekyKey admin and organizer screens show what the watchers need, such as failed hand-offs and the day's requests. Settle it before part 4 of the hostnames message.
- **Two repos at the split** (Julian, 1 Oct 2026). Before checkpoint 4: who creates the Event Service's repo, and where; how both repos get the hand-off's Zod schemas, today planned as `packages/handoff`; whether the end-to-end smoke test still runs on every pull request, and in which repo; and the move of `apps/frontend`, which becomes `event-web` there, for Ethan's team.
- **Whether the GeekyKey Service keeps its tables in TiDB.** Julian asked on 1 Oct why `geekykey-service` needs TiDB now. Until the split it is the whole backend. After the split it keeps `stations` and the `tokens` stand-in, and after the switch to the Portal, only `stations`, which could move to a store of its own, such as D1 (section 3.6, "Later").

- **The Sprint 2 A/B test.** The roadmap runs the A/B/C test at an SSTInc or CCA event between 5 and 18 Oct, on a date Mr Pang gives. It isn't confirmed yet (Adam, 29 Sep), so nothing waits on it until it is. Condition A needs claimed tokens, stations and the passport; Condition B needs QR scanning and the passport; both feed the export. Participants see their passports only by logging in, and dev-login only signs in seeded users, so **the Portal login is on its path whichever setup runs it.** The choices, for Adam and Joshua:
  - **on production:** checkpoints 1 to 7 and the Portal login, within one to three weeks;
  - **on a laptop at the venue,** as in the 23 Sep test: today's backend, with the stations over `http://`, still needing the Portal login or some other way for participants to log in;
  - **later:** a date late in Sprint 2 or after it, if the course allows.
- **Before the repo goes public:** whether Julian's two diagrams in `assets/` can be public, and whether `meeting-notes/` is committed.

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

Decision records: [ADR 0001, tokens are identified by their hardware UID](../../docs/adr/0001-token-id-is-the-hardware-uid.md), and [ADR 0002, each service logs users in through the Portal itself](../../docs/adr/0002-each-service-logs-in-through-the-portal.md).

Messages: [to Julian, hostnames and deploys](assets/message-to-julian-redirect-urls.md), [to Julian and Qing Guan, the tag APIs](assets/message-to-qing-guan-tag-apis.md), [to Qing Guan, logging in](assets/message-to-qing-guan-login.md), [to Zi Tao, the station contract](assets/message-to-zi-tao-station-contract.md), [to Zi Tao, the token writer](assets/message-to-zi-tao-token-writer.md), [to Zi Tao, the Wi-Fi password](assets/message-to-zi-tao-wifi-password.md), and [to Joshua, the export](assets/message-to-joshua-ab-export.md).

Outside the map: the Single Source of Truth's roadmap (`Centralised-Capstone-Folder/01_Project Management/Geekykey Single Source of Truth.docx`, gitignored), and the station firmware as of 29 Sep 2026 (`firmware/geekykey_station/geekykey_station.ino`).
