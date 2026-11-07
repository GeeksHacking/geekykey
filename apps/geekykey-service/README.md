# GeekyKey Service

The GeekyKey Service is what stations and tokens talk to. It is a Hono app on a Cloudflare Worker at
`https://key-api.geekshacking.com`, with no database. Every GeeksHacking event shares it, while
each event runs its own Event Service.

It does five jobs:

- checks each station's key, and hands the station's taps and heartbeats to the Event Service that
  registered it
- asks the claims stand-in who owns each token, so an Event Service only ever sees users
- logs users in to the GeekyKey screens (`apps/geekykey-web`), and makes login links into an
  event's screens
- claims and releases tokens, and lets a GeekyKey admin load token kinds
- passes one half of a connection to the events that run connections

The routes and their shapes are in [the API agreement](../API-AGREEMENT.md): section 6 for
stations, 7 and 8 for the screens, 11 for what it sends an Event Service.

## Layout

`src/worker.ts` reads the settings once and hands each request to `src/app.ts`, which mounts the
routes. Each file in `src/` is one area, with its test beside it:

| File | What it does |
|---|---|
| `station-routes.ts`, `station-auth.ts`, `station-keys.ts` | `POST /api/v1/taps` and `POST /api/v1/stations/heartbeat`, and the key check |
| `stations-copy.ts` | The in-memory copy of each Event Service's registered stations |
| `claims.ts`, `claims-deadline.ts` | Calls to the claims stand-in, behind one module, `Claims`, so the switch to the Portal changes one file |
| `event-service.ts`, `service-request.ts` | Calls to an Event Service |
| `auth-routes.ts`, `session.ts` | Logging in with Firebase, and the `gk_session` cookie |
| `me-routes.ts`, `token-routes.ts`, `login-link-routes.ts`, `token-kind-routes.ts` | The screens' endpoints |
| `rate-limit.ts` | The three rate limits in `wrangler.jsonc` |
| `config.ts` | Every setting, checked at start-up |

## How a tap travels

1. A station sends `POST /api/v1/taps` with its station key: one tap, or up to 500 saved ones.
2. The Worker counts the request against the station's rate limit, then starts one deadline,
   `TAP_DEADLINE_MS` (4 seconds), for every step after this one. Each call gets the time left.
3. It finds the key's hash in its copy of the registered stations, filling the copy first if it is
   empty. The match says which station sent it and which Event Service registered that station.
   An unknown key gets `401`.
4. It asks the claims stand-in, with `CLAIMS_STAND_IN_KEY`, who owns each token. A token nobody
   owns gets `unknown_token` and goes no further. No proper answer in time fails the request with
   `503 claims_unavailable`.
5. It sends the rest as users to the Event Service's `POST /geekykey/v1/taps`, with that Event
   Service's key. No proper answer in time fails the request with `503 event_service_unavailable`.
6. It answers the station with each tap's status, in the order the station sent them.

Neither call is retried. On a `503` the station keeps its taps and sends them again later, so a
slow Event Service costs the station's answer, never the tap.

**The registered stations.** The Worker fills its copy from each Event Service's
`GET /geekykey/v1/stations` on the first station request after it starts, then refreshes it at most
once a minute. A list that fails to load is asked for again at most once a minute too. So a new,
replaced or disabled station key takes up to a minute to take effect.

**The heartbeat.** `POST /api/v1/stations/heartbeat` checks the key the same way and answers
`server_time` at once. The Worker then passes the station's health to the Event Service's
`POST /geekykey/v1/heartbeats`. A failed hand-off writes `heartbeat_handoff_failed` and isn't
retried, since the station sends another a minute later. So a heartbeat sets a station's clock even
while the Event Service is down.

Work that happens after the answer, such as the heartbeat hand-off and refreshing the copy, runs in
the Worker's `waitUntil`, so the station doesn't wait for it.

## Users and the screens

**Logging in.** The GeekyKey screens send a Firebase ID token to `POST /auth/firebase`. The Worker
checks it with `packages/firebase-login` and sets `gk_session`. It keeps no users, so the session
holds only the user ID and the login's name. Each isolate fetches Google's keys once an hour.

**`GET /api/v1/me`** reads the session, asks the claims stand-in for the user's tokens, and lists
each event in `EVENT_SERVICES` that has a `public_url`. The stand-in has 4 seconds to answer, or the
Worker answers `503 claims_unavailable`.

**Login links.** An event button calls `POST /api/v1/login-links`. The answer is the event's
address with a link in its fragment (`#login=`), signed with a key derived from that Event
Service's key (`packages/login-link`). The Event Service checks it, uses it once, and signs in the
same user. The link lasts 60 seconds, and neither service logs it. When the token page sends its
token's UID and the user owns that token, the link also carries the token's kind.

**Token kinds.** A GeekyKey admin loads kinds with `POST /api/v1/admin/token-kinds`, up to 500
tokens at a time, which writes a `token_kinds_loaded` log line. A GeekyKey admin, or an organizer
on `TOKEN_KIND_VIEWERS`, reads the count of each kind with `GET` on the same path. The Worker passes
both to the claims stand-in, so a UID never reaches an Event Service.

**Connections.** When the token page shows someone else's token, it calls
`POST /api/v1/tokens/{uid}/meet`. The Worker looks up the user's first-claimed token, the owner of
the token they tapped, and both kinds. It then sends the half to `POST /geekykey/v1/meetings` on
every Event Service whose `EVENT_SERVICES` entry has `"meetings": true`, all at once, within 4
seconds. Each answers `waiting`, `connected`, `already_connected` or `same_kind`. One that doesn't
answer in time gets `unavailable` and a `meeting_handoff_failed` log line. One that answers `404`,
as an Event Service from before connections does, is left out.

## Settings

`wrangler.jsonc` holds the settings, and Cloudflare holds the secrets. A deploy overwrites anything
changed in the Cloudflare dashboard, so change settings in a pull request.

| Setting | What it is |
|---|---|
| `EVENT_SERVICES` | The Event Services: each one's ID, name, address, public address for the screens' buttons, and whether it runs connections |
| `GEEKYKEY_ADMINS` | User IDs who can release others' tokens and load token kinds |
| `TOKEN_KIND_VIEWERS` | User IDs who can read the count of each kind. It is the Worker's own list, because it can't read an Event Service's `ORGANIZERS` |
| `FIREBASE_PROJECT_ID` | `geekykey-b035a`, the same as the Event Service's |
| `CLAIMS_STAND_IN_URL` | The claims stand-in's address, on the Event Service |
| `TAP_DEADLINE_MS`, `MAX_TAPS_PER_REQUEST` | 4 seconds for a station's request, and 500 taps in one |
| `MAX_TOKENS_PER_USER` | How many tokens one user may claim: 3 |
| `STATION_LIMIT`, `USER_LIMIT`, `TOKEN_LIMIT` | Rate limits, a minute each: 60 requests per station, 60 per user, and 20 token lookups, claims and meetings per user. A request over a limit gets `429 rate_limited` |
| Secrets: `SESSION_SECRET`, `CLAIMS_STAND_IN_KEY`, `EVENT_SERVICE_KEY_SHOWCASE` | Required. The Worker stops at start-up, naming the setting, if one is missing or malformed |

Locally, `mise run dev:geekykey-service` runs
`wrangler dev --env-file dev.env --var DEV_AUTH_ENABLED:true`. The committed `dev.env` holds no real
secret. It points `EVENT_SERVICES` at the Event Service on `localhost:8001` and the Event screens on
`localhost:5173`, and uses the keys the Event Service's dev sign-in uses. `DEV_AUTH_ENABLED` adds
`POST /auth/dev-login`, which accepts any user ID, and drops `Secure` from the cookie. It never
appears in `wrangler.jsonc`, so it is off in production. A setting in your shell wins over
`dev.env` for one run: `TAP_DEADLINE_MS=1000 mise run dev:geekykey-service`. `wrangler dev` reads no
`.dev.vars`, and takes only the settings `wrangler.jsonc` names.

## Commands

From any folder:

```bash
mise run dev:geekykey-service      # wrangler dev on 8000, with dev sign-in on
mise run test:geekykey-service     # Vitest inside workerd. No database needed
mise run format:geekykey-service   # format in place (oxfmt)
```

From `apps/geekykey-service`:

```bash
mise exec -- pnpm lint            # oxlint
mise exec -- pnpm format:check    # list unformatted files without changing them
mise exec -- pnpm typecheck       # writes types from wrangler.jsonc, then tsc
mise exec -- pnpm check:build     # wrangler deploy --dry-run
```

CI's GeekyKey Service job runs those four and the tests. Cloudflare's Workers Builds deploys the
Worker from `main` ([docs/operations.md](../../docs/operations.md)).
