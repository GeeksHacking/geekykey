# GeekyKey API Agreement

Contract between GeekyKey's two services and everything that talks to them: the ESP32 reader
stations, the two sets of screens, and other teams' Event Services. Words such as token, claim,
owner, registered stations and hand-off mean what [`CONTEXT.md`](../CONTEXT.md) says.

| Part | What it does | Code |
|---|---|---|
| GeekyKey Service | What stations and tokens talk to. It checks each station's key against the stations the Event Services have registered, finds each token's owner, and hands taps on. A Cloudflare Worker with no database | `apps/geekykey-service` |
| Event Service | Runs one event's games, and registers that event's stations. Ours runs the grad tea on 12 November 2026, then the capstone showcase, whose first game is the passport. A server on Google Cloud Run | `apps/event-service` |
| GeekyKey screens | The token page and My tokens | `apps/geekykey-web` |
| Event screens | The dashboard, passport, activity and organizer screens, including the station board, and the map on the big screen at our booth | `apps/event-web` |

| | |
|---|---|
| Version | 0.9 |
| Date | 30 October 2026 |
| GeekyKey Service owner | Adam |
| Event Service owner | Adam |
| Screens owner | Ethan |
| Station firmware owner | Zi Tao |
| Scope | Up to the capstone showcase on 17 November 2026. See [Out of scope](#12-out-of-scope-for-the-showcase). |

**Status legend used throughout**

| Tag | Meaning |
|---|---|
| `Implemented` | Live in `apps/event-service` or `apps/geekykey-service` with tests, as described here. Changes need a pull request that also edits this file. |
| `Implemented, changes at checkpoint N` | Live today in an older shape. This file describes the shape from checkpoint N, and says what differs until then. |
| `Checkpoint N` | Built at that checkpoint of the migration plan. The shape is agreed; fields may still be added. |

**The checkpoints.** The migration plan builds GeekyKey in eight checkpoints, one after another.
The full plan is section 6 of [the migration spec](../.scratch/db-hosting/spec.md#6-the-migration-plan).

| Checkpoint | What it delivers |
|---|---|
| 1 | Today's backend on TiDB, unchanged on the wire. Done |
| 2 | Today's backend moved to Google Cloud Run, at `https://event-api.geekshacking.com`. Done |
| 3 | The GeekyKey Service and the Event Service drawn inside one server, talking only through their requests. Done |
| 4 | The GeekyKey Service cut out as a Worker at `https://key-api.geekshacking.com`, and the stations moved to it. Done |
| 5 | Login through Firebase, with Google, GeeksHacking's login or as a guest, login links, and both sets of screens deployed |
| 6 | The GeekyKey Service's features: claiming and releasing, rate limits |
| 7 | The Event Service's features: the organizers' station endpoints, the station board, passport settings, the tap log, stats, the export, the QR fallback, the map's data |
| 8 | Ready for the event |

---

## 1. How to use and change this document

- The screens and the stations build against the shapes here, not against either service's
  source. If a service differs from this file, the file wins and the service is fixed. This
  file also wins over every other document, including the migration spec.
- Changing an `Implemented` endpoint requires a pull request that edits this file and gets a
  review from both a service owner and the screens owner.
- `Checkpoint N` endpoints can be refined in a pull request from either side. Record the
  change in the [changelog](#15-changelog).
- Fields are only ever added, never renamed or removed, within `/api/v1` and `/geekykey/v1`.
- **One exception, in version 0.2.** This rewrite removes `tokens` from the Event Service's
  `GET /api/v1/me`, `token_uid` from the tap log and the export, and stored `unknown_token`
  taps. That is allowed once, because nothing relies on them in production yet, and the
  changelog records it.
- A change to the hand-off (section 11) must work with the other service's previous version,
  so either service can be rolled back alone.

---

## 2. Conventions

### Base URLs

| Who | Local | Production |
|---|---|---|
| Stations, to the GeekyKey Service | `http://localhost:8000` | `https://key-api.geekshacking.com` |
| The GeekyKey Service, to our Event Service | `http://localhost:8001` | `https://event-api.geekshacking.com` |
| Browsers, for the GeekyKey screens | `http://localhost:5174` | `https://key.geekshacking.com` |
| Browsers, for the Event Service's screens | `http://localhost:5173` | `https://event.geekshacking.com` |

Browsers only ever use their screens' hostname, which forwards `/api/*` and `/auth/*` to its
service: Vite's proxy locally, and a small Worker in front of each set of screens in
production. So the screens call relative paths, such as `/api/v1/me`, and never name a
service's address.

- A real station on the local network uses the laptop's `.local` name, such as
  `http://A-Mac.local:8000`.
- The Event Service's own address, `event-api.`, is for the GeekyKey Service and the Event
  screens' Worker. Browsers never call it directly, and nor do stations: it has no station
  endpoints, so a station's request there gets `404 not_found`.

All resource endpoints live under `/api/v1`. Auth endpoints live under `/auth` because they are
browser redirects, not JSON resources. Health is at `/api/health`. What the GeekyKey Service asks
of an Event Service lives under `/geekykey/v1`.

### Wire format

- JSON request and response bodies, `Content-Type: application/json`, UTF-8.
- Keys are `snake_case` in JSON. Internally the services use camelCase; the screens should not
  care.
- IDs are opaque strings. Do not parse them. The only numeric ID is `taps.id`, used as a
  pagination cursor.
- User IDs come from the login, and are the same in both services. At the showcase they are
  Firebase user IDs (UIDs), whichever way the user signed in; after it, the Portal's user IDs
  ([ADR 0004](../docs/adr/0004-the-showcase-logs-in-through-firebase.md)).
- Timestamps are ISO 8601. Both services always **return** UTC with milliseconds, for example
  `2026-10-10T09:00:00.000Z`. Clients may **send** any ISO 8601 string with an offset; the
  services normalise it.
- Absent optional fields are omitted in requests and returned as `null` in responses.

### HTTP status codes

| Code | When |
|---|---|
| 200 | Successful read, or a write that is idempotent (taps, claiming a token you already own) |
| 201 | A new resource was created |
| 204 | Successful delete or logout, no body |
| 400 | Body, query or path failed validation. Body contains `issues` |
| 401 | Not authenticated, or a station key, Event Service key or login link is missing or invalid. A disabled station's key also gets 401 |
| 403 | Authenticated but not allowed: not on the organizer list, the map screen list or the GeekyKey admin list, as the endpoint needs |
| 404 | Resource does not exist or is not visible to this user |
| 409 | Conflict with existing state: a token someone else has claimed, a user who already holds 3 tokens, or a station whose game can no longer change |
| 429 | Too many requests from this caller in the last minute. See [Rate limits](#rate-limits) |
| 500 | A bug in a service. Screens show a generic error and log the request ID if present |
| 503 | A service this one depends on didn't answer: whatever holds the claims (the claims stand-in, then the Portal), the station's Event Service during a station request, Google's keys during login, or, for the Worker in front of a set of screens, the service behind it |

### Error body

Every non-2xx response has this shape:

```json
{
  "error": "validation_failed",
  "issues": [
    { "path": ["taps", 0, "uid"], "message": "uid must be 4 to 10 hex bytes" }
  ]
}
```

`error` is a stable snake_case code that screens and stations can switch on. `issues` is present
only for `validation_failed` and follows Zod's issue format.

| `error` code | HTTP | Meaning |
|---|---|---|
| `validation_failed` | 400 | See `issues` |
| `unauthenticated` | 401 | No valid session cookie |
| `invalid_token` | 401 | The Firebase ID token sent to log in can't be trusted: not signed by Google, for another Firebase project, or expired. The screens say "Couldn't log you in. Try again." |
| `invalid_login_link` | 401 | The login link sent to log in (7.4) has expired, has been used already, or was changed. The screens say "That link has expired. Tap your token again to get back in." |
| `missing_station_key` | 401 | No `Authorization: Bearer` header on a station endpoint |
| `invalid_station_key` | 401 | Station key on no Event Service's registered stations, which leave out disabled stations |
| `invalid_event_service_key` | 401 | Event Service key missing or not recognised, on any request under `/geekykey/v1` |
| `forbidden` | 403 | Not on the organizer list, the map screen list or the GeekyKey admin list, as the endpoint needs |
| `not_found` | 404 | |
| `token_taken` | 409 | Someone else has claimed this token |
| `token_limit_reached` | 409 | The user already holds 3 tokens |
| `station_has_taps` | 409 | A game has counted or held back a tap at the station, so its game can't change until the data is cleared ([Games](#games)) |
| `rate_limited` | 429 | Sent with `Retry-After: 60` |
| `internal_error` | 500 | |
| `event_service_unavailable` | 503 | The station's Event Service didn't answer in time or answered wrongly, or its registered stations couldn't be fetched to check the key. The station keeps its taps and resends them |
| `login_unavailable` | 503 | Google's keys couldn't be fetched to check a Firebase ID token. The token may be fine; the screens say "Couldn't log you in. Try again." |
| `claims_unavailable` | 503 | Who owns a token couldn't be found in time: from the claims stand-in until the switch after the showcase, then from the Portal. A station keeps its taps and resends them; the screens say "Couldn't reach GeeksHacking. Try again." |
| `service_unavailable` | 503 | Sent by the Worker that serves a set of screens, under `/api` and `/auth`, when its service gave no answer at all: it was down, or failed before answering. Any answer the service does give, errors included, passes through unchanged |

### Rate limits

Every limit here is `Implemented`. Each limit counts a caller's requests over one minute, and
once it is passed answers `429` with `{"error": "rate_limited"}` and `Retry-After: 60`.

| Service | Counts | Limit a minute |
|---|---|---|
| GeekyKey Service | Each station's requests, taps and heartbeats together | 60 |
| GeekyKey Service | Each user's requests to its API | 60 |
| GeekyKey Service | Each user's token lookups and claims, which also count toward the 60 | 20 |
| Event Service | Each user's requests to its API | 60, counted by each server instance |

- The station limit counts a request by the key it sends, before the key is checked. So a wrong
  key is counted too, and over the limit it gets `429` rather than `401`. A request with no key
  isn't counted, and gets `401 missing_station_key`.
- The GeekyKey Service's user limits count by user ID every `/api/v1` request that has a session:
  `/me`, the token lookup, the claim, the release and login links. A request whose path or body
  fails its check counts too. `/auth/*` isn't counted, since there's no user ID before login. A
  request with no session isn't counted, and gets `401 unauthenticated`.
- A user over the 20 gets `429` from the lookup and the claim only, and their other calls still
  answer until they pass the 60.
- The GeekyKey Service's limits are approximate. Cloudflare counts each one separately in each of
  its data centres, so a caller whose requests reach several can sometimes get past it.
- The Event Service's limit counts by user ID every request with a session to its `/api/v1`
  endpoints: `/me`, the name change (8.1 and 8.7) and the organizer endpoints (section 9),
  including a participant's, which gets `403`. A request whose path or body fails its check
  counts too. `/auth/*` isn't counted, nor are the hand-off routes, which the GeekyKey Service
  calls with the Event Service key (section 11). A request with no `event_session`, or one that
  fails its signature or has expired, isn't counted, and gets `401 unauthenticated`.
- On the Event Service, a user's minute starts at their first request, and their first request
  after it ends starts a new count. An organizer's screens share one count: the station board
  polled every 10 to 15 seconds (9.2) and the scan log every 5 (9.3) use at most 18 a minute.
  The map, polled every 2 seconds (9.10), uses 30, so an organizer with all three open uses 48.
- Each Event Service server instance keeps its own count, so a user whose requests reach two
  instances can get up to 120 a minute through.

### CORS and cookies

No service sends CORS headers, and none are needed: each set of screens reaches its service
through its own hostname, so every request from the screens is same-origin, and `fetch` sends
the session cookie by default.

| Cookie | Set by | Attributes |
|---|---|---|
| `gk_session` | The GeekyKey Service | `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`, and `Secure` outside local development |
| `event_session` | The Event Service | The same |

- With no `Domain`, each cookie belongs only to the hostname that set it. The screens cannot
  and should not read it.
- Locally both sets of screens run on `localhost`, where cookies ignore the port, so the two
  names keep the services from overwriting each other's session.
- Every `/api/*` and `/auth/*` response carries `Cache-Control: no-store`.
- Our Event Service sends it on every response, including those under `/geekykey/v1` and the
  claims stand-in's, since the registered stations (11.1) carry key hashes and the stand-in
  says who owns which token.

---

## 3. Roles and authentication

### Who calls what

| Caller | Identified by | Talks to |
|---|---|---|
| Participant | `event_session` | The Event Service |
| Organizer | `event_session`, with a user ID on the Event Service's organizer list (not `users.role`) | The Event Service, including its stations |
| Map screen | `event_session`, with a user ID on the Event Service's map screen list | The Event Service, for the map's data (9.10) as well as what a participant calls |
| User | `gk_session` | The GeekyKey Service: the token page and My tokens |
| GeekyKey admin | `gk_session`, with a user ID on the GeekyKey Service's admin list | The GeekyKey Service, to release other people's tokens |
| Station | `Authorization: Bearer gk_sta_…` | The GeekyKey Service |
| GeekyKey Service | `Authorization: Bearer` with the Event Service key | Each Event Service, under `/geekykey/v1` |

- The organizer list, the map screen list and the GeekyKey admin list are settings of their
  service, changed through a reviewed pull request and a deploy. Each is checked on every
  request, so removing someone takes effect at the next deploy. One person can be on more than
  one.
- The map screen list holds the user IDs that the screens showing the map (9.10) log in as. The
  screen at our booth logs in on the Event screens with an account kept for it. Someone who gets
  hold of that login can read the map, and every other organizer endpoint answers them
  `forbidden`.
- The user ID is always taken from the session, never from a request body, except where an
  endpoint says otherwise: an organizer's QR fallback tap names the participant, and a GeekyKey
  admin's release names the owner. An endpoint that "acts on the current user" means the user
  behind the cookie.

### Browser sessions

Each service sets its own cookie, and the screens' code is identical whichever route set it:

- `POST /auth/firebase`, with the ID token the screens get from Firebase's web SDK after the
  user signs in with Google, with GeeksHacking's login, or as a guest. `Implemented` on both
  services, with guests at checkpoint 5.
- `POST /auth/login-link`, on the Event Service only, with a login link made by the GeekyKey
  Service (7.4). `Implemented`.
- `POST /auth/dev-login`, in local development only. This exists so the screens can be built
  before the login lands, without any code that has to be removed later.

"Am I logged in?" is answered by calling that service's `GET /api/v1/me`. A 401 means no.

Firebase keeps its sign-in per hostname, so a sign-in on `key.` means nothing on `event.`. A user
reaches the Event screens from the GeekyKey screens' event buttons, which open a login link and
log them in there as the same user, without a second login. A guest can only get there that way:
a guest sign-in on `event.` would be a different guest, so the Event screens don't offer one.

### Station keys

Each station belongs to one Event Service, which registers it and issues its one key. An
organizer creates it with the Event Service's `POST /api/v1/admin/stations`, and can replace it
with `POST /api/v1/admin/stations/{id}/key`, which keeps the station's ID. The key is shown once
and only its hash is stored. Firmware sends it on every request to the GeekyKey Service as
`Authorization: Bearer <key>`.

- The GeekyKey Service checks the key against its copy of every Event Service's registered
  stations (11.1), and the station feeds the Event Service that registered it.
- An organizer can disable a station and enable it again. A disabled station drops off its
  Event Service's registered stations, and its key gets `401 invalid_station_key`, the same as a
  wrong key.
- A new, replaced or disabled key takes up to a minute to take effect, because the GeekyKey
  Service refreshes its copy at most once a minute.
- A reader moved to another event becomes a new station there, with a new ID and key from that
  event's Event Service. It first sends its saved taps, then takes the new key through the
  station's setup mode, which clears its saved taps. There is no reflash (8 October 2026).
- A station never receives any information about a participant beyond a tap status, in line
  with the privacy row of the risk assessment.

### Event Service keys

`Implemented`. Each Event Service shares one key with the GeekyKey Service, which sends
it as `Authorization: Bearer <key>` on every request under `/geekykey/v1`: the registered
stations, the hand-off and the heartbeat hand-off. Event Services never call the GeekyKey
Service.

- It is 32 random bytes, written as 64 lower-case hex characters, as `openssl rand -hex 32`
  makes them. Nobody picks one.
- The Event Service compares it in constant time, on every request, since its address is
  public.
- Neither side ever logs it.
- The GeekyKey Service never follows a redirect, because `fetch()` sends `Authorization` on to
  wherever a redirect points, even another domain. Every Event Service address must start with
  `https://`. The one exception is local development, where it may be `http://` to the same
  machine, such as `http://localhost:8001`. A deployed GeekyKey Service can't reach that
  address, so the exception never applies in production.
- To replace one, set the new key on both sides outside the event. Hand-offs fail with
  `503 event_service_unavailable` until both match, and stations keep their taps and resend
  them.

---

## 4. Shared vocabulary

Domain terms such as participant, passport, stamp slot and station points are defined in
[`CONTEXT.md`](../CONTEXT.md). This section covers the values that travel on the wire.

### Token UID

The NFC token's hardware UID as hex. The services normalise on input by stripping anything that
is not a hex digit and upper-casing, so `04:a1:b2:c3:d4:e5:f6` and `04A1B2C3D4E5F6` are the
same token. After normalisation a UID must be 4 to 10 bytes, that is 8 to 20 hex characters,
since stations can read other cards. Our NTAG213 tokens have 7-byte UIDs, 14 characters. The
services always return the normalised form.

A UID in a path, such as `{uid}` in `/api/v1/tokens/{uid}`, is percent-encoded, as
`encodeURIComponent` does. Then a UID typed with spaces or `/` between its bytes still reaches
the service as one value. Unencoded, a `/` splits the path and the answer is `404 not_found`.

**The token address** is `https://key.geekshacking.com/t/<UID>`, written on every token,
where `<UID>` is the chip's own UID in 14 upper-case hex characters, for example
`/t/04A1B2C3D4E5F6`. A phone that taps a token opens it, and lands on the token page. The
address must keep working for as long as tokens are in use
([ADR 0001](../docs/adr/0001-token-id-is-the-hardware-uid.md)).

### `tap_status`

Every tap a station sends comes back with one of these.

| Value | Answered by | Stored | Meaning |
|---|---|---|---|
| `accepted` | Event Service | yes | Counts in at least one game, such as the passport |
| `cooldown` | Event Service | yes | Same user, same station, inside the cooldown. Recorded, doesn't count |
| `no_game` | Event Service | yes | Reached the event, but no game counts taps at that station: one that runs no game, or one that runs the passport without passport settings |
| `duplicate` | Event Service | no | This station already sent this `client_tap_id`. Nothing written. Returned only to stations |
| `unknown_token` | GeekyKey Service | no, only logged | Nobody has claimed this token |

- **Stored** means kept in the Event Service's taps, so only `accepted`, `cooldown` and
  `no_game` appear in the tap log, the export and `recent_taps`.
- Another team's Event Service may answer statuses of its own, which the GeekyKey Service
  passes on unchanged. A station treats any status it doesn't know as recorded.
- `no_event`, in version 0.2, is retired: every station belongs to the Event Service that
  registered it, and a key no Event Service has registered gets `401`. No service sends it.

The cooldown window is an Event Service setting, default 300 seconds. The screens never need to
compute it.

### `tap_source`

| Value | Meaning |
|---|---|
| `nfc` | From a reader station |
| `qr_fallback` | Entered by an organizer through the QR fallback |

### `role`

`participant` or `organizer`, worked out by the Event Service from its organizer list on every
request. Being a GeekyKey admin is not a `role`: the GeekyKey Service's `/me` says
`is_geekykey_admin`. Nor is being a map screen: a map screen's `/me` says `participant` (9.10).

### Games

Each station runs one of the event's games, or none. Organizers choose it (9.11), and the station
board lists the games they can choose from (9.2). A game has an `id`, such as `passport`, which
is what a station's `game` holds, and a `name` organizers see, such as "Passport". The event's
list of games is in the Event Service's code, so it changes only with a deploy.

- Only the station's own game judges its taps. A tap at a station with no game gets `no_game`.
- The station's own game can also give what the station shows after an `accepted` or `cooldown`
  tap, as `lines` and `complete` (6.1). The passport's are the participant's progress, by name.
- A station's game is **fixed** once the station has a tap that a game counted or held back, an
  `accepted` or `cooldown` tap, from the station or the QR fallback (9.4). After that, a change
  answers `409 station_has_taps`. The passport's record is the accepted taps at its stations,
  so a change after one would turn another game's accepted taps into stamps. `no_game` taps
  don't fix it, so a station tapped before anyone chose its game can still be given one.
- The evening-before clear empties `taps`, so organizers can choose new games between the grad
  tea and the showcase.
- Stations created before version 0.7 with passport settings run the passport.

### Stamps and points

Worked out by the Event Service from accepted taps. The screens display them and never calculate
them.

- Only stations that run the passport and have passport settings are **stamp slots**, in the
  order their settings were added, oldest first, so adding one never moves the others. A
  station that has settings but runs another game keeps them, and isn't a stamp slot.
- A user has a **stamp** for a station once they have at least one `accepted` tap there.
- **Points** are the sum of the station's points over the user's accepted taps, so tapping a
  station again after the cooldown earns its points again. This is the simplest rule that keeps
  the showcase interesting and can be changed later without an API change.
- A station disabled later keeps its stamp slot and the stamps already earned there.

---

## 5. Endpoint index

**The GeekyKey Service**

| Method | Path | Caller | Status | Purpose |
|---|---|---|---|---|
| GET | `/api/health` | anyone | `Implemented` | Liveness check |
| POST | `/api/v1/taps` | Station | `Implemented` | Taps, one or a batch |
| POST | `/api/v1/stations/heartbeat` | Station | `Implemented` | Online light, clock, `reader_ok` |
| POST | `/auth/dev-login` | local only | `Implemented` | Set `gk_session` for any user ID |
| POST | `/auth/firebase` | browser | `Implemented` | Log in with a Firebase ID token, set `gk_session` |
| POST | `/auth/logout` | browser | `Implemented` | Clear `gk_session` |
| GET | `/api/v1/me` | User | `Implemented` | The user, whether they're a GeekyKey admin, their tokens and the events to link to |
| GET | `/api/v1/tokens/{uid}` | User | `Implemented` | What the token page shows |
| POST | `/api/v1/tokens/{uid}/claim` | User | `Implemented` | Claim a token |
| DELETE | `/api/v1/tokens/{uid}` | User, GeekyKey admin | `Implemented` | Release a token |
| POST | `/api/v1/login-links` | User | `Implemented` | A login link to one event's screens |

**The Event Service**

| Method | Path | Caller | Status | Purpose |
|---|---|---|---|---|
| GET | `/api/health` | anyone | `Implemented` | Liveness check |
| GET | `/geekykey/v1/stations` | GeekyKey Service | `Implemented` | Its registered stations |
| POST | `/geekykey/v1/taps` | GeekyKey Service | `Implemented` | The hand-off |
| POST | `/geekykey/v1/heartbeats` | GeekyKey Service | `Implemented` | The heartbeat hand-off |
| POST | `/auth/dev-login` | local only | `Implemented` | Set `event_session` for a seeded user |
| POST | `/auth/firebase` | browser | `Implemented` | Log in with a Firebase ID token, set `event_session` |
| POST | `/auth/login-link` | browser | `Implemented` | Log in with a login link, set `event_session` |
| POST | `/auth/logout` | browser | `Implemented` | Clear `event_session` |
| GET | `/api/v1/me` | Participant, Organizer | `Implemented` | Profile, stamps, points, history |
| PATCH | `/api/v1/me` | Participant, Organizer | `Implemented` | Set the name the event shows |
| PUT | `/api/v1/admin/stations/{id}/passport` | Organizer | `Implemented` | Add or change a station's passport settings |
| PUT | `/api/v1/admin/stations/{id}/game` | Organizer | `Implemented` | Set the game a station runs |
| PUT | `/api/v1/admin/stations/{id}/booth` | Organizer | `Implemented` | Set the booth a station stands at |
| GET | `/api/v1/admin/stations` | Organizer | `Implemented` | The station board |
| POST | `/api/v1/admin/stations` | Organizer | `Implemented` | Create a station, key shown once |
| POST | `/api/v1/admin/stations/{id}/key` | Organizer | `Implemented` | Replace a station's key, new key shown once |
| POST | `/api/v1/admin/stations/{id}/disable` | Organizer | `Implemented` | Disable a station |
| POST | `/api/v1/admin/stations/{id}/enable` | Organizer | `Implemented` | Enable it again |
| GET | `/api/v1/admin/taps` | Organizer | `Implemented` | Recent taps, newest first |
| POST | `/api/v1/admin/taps` | Organizer | `Implemented` | QR fallback tap |
| GET | `/api/v1/admin/stats` | Organizer | `Implemented` | Totals for the dashboard |
| GET | `/api/v1/admin/export.csv` | Organizer | `Implemented` | Raw tap export for the A/B analysis |
| GET | `/api/v1/map` | Organizer, map screen | `Implemented` | Each station's game, booth and counts, for the map |

---

## 6. Station endpoints

On the GeekyKey Service, at `https://key-api.geekshacking.com` in production. The Event Service
has none, and answers them `404 not_found`.

### 6.1 `POST /api/v1/taps` (`Implemented`)

Ingest one or many taps from the authenticated station. Live taps and saved taps use the same
call; the only difference is the array length.

**Auth:** station key.

**Request**

```json
{
  "taps": [
    { "client_tap_id": "tap-000123", "uid": "04:A1:B2:C3:D4:E5:F6", "tapped_at": "2026-10-10T09:00:00+08:00" },
    { "client_tap_id": "tap-000124", "uid": "DEADBEEF" }
  ]
}
```

| Field | Type | Rules |
|---|---|---|
| `taps` | array | 1 to 500 items |
| `taps[].client_tap_id` | string | 1 to 128 chars. Generated by the station, unique per station forever. A counter persisted in flash is fine |
| `taps[].uid` | string | Token UID, any separator style. See [Token UID](#token-uid) |
| `taps[].tapped_at` | string, optional | ISO 8601 device time. Omit if the station has no trustworthy clock. A time more than 5 minutes ahead of the server or more than 7 days behind it is ignored: the tap is judged by when the Event Service received it, and stored with `tapped_at` null |

**Response `200`**

```json
{
  "station_id": "ca939e19-8216-4b95-8375-5b54e543c5f6",
  "results": [
    { "client_tap_id": "tap-000123", "status": "accepted", "lines": ["Alex: 3 of 6", "Tap counted!"] },
    { "client_tap_id": "tap-000124", "status": "unknown_token" }
  ]
}
```

`results` is in the same order as the request, one per tap, with the same `client_tap_id`s. Every
item has a [`tap_status`](#tap_status).

| Field | Type | Rules |
|---|---|---|
| `results[].client_tap_id` | string | The tap's, from the request |
| `results[].status` | string | A [`tap_status`](#tap_status), or another team's own |
| `results[].lines` | array of strings, optional | 1 or 2 lines for the station's screen, written by the station's game. Each is 0 to 16 printable ASCII characters, space to `~`. Only with `accepted` and `cooldown` |
| `results[].complete` | boolean, optional | `true` on the tap that finishes the station's game, such as the passport's last stamp, so the station plays its own tune. Only with `accepted` and `cooldown`. Ours gives it only when `true`, with `lines` |

- The passport's lines are the participant's progress, and what happened: `Alex: 3 of 6` and
  `Tap counted!`, or `Already counted` in the cooldown. The tap that earns the last stamp says
  `Alex: 6 of 6` and `All 6 done!`, with `complete`. The wording can change.
- The name is the first word of the name the event shows, only while the participant has a name of
  their own (`user.has_name` in 8.1), with accents taken off and cut to fit. Without one, the line
  is `3 of 6 stamps`. That includes a name the screen can't show, such as one in Chinese
  characters, and a participant who has never logged in to the event.
- No token UID or user ID is ever in a line, and no log line prints them.
- A saved tap sent later gets them too, but the station doesn't show them, since the participant has
  gone.

**How a tap is answered, from checkpoint 3**

1. The GeekyKey Service checks the key against its copy of every Event Service's registered
   stations (11.1). A key on none of them, which includes a disabled station's, gets `401`. If
   an Event Service's registered stations couldn't be fetched and the key isn't on the others,
   the request fails with `503 event_service_unavailable` instead, since the key may be on the
   missing list.
2. It finds each token's owner: from the claims stand-in until the switch after the showcase,
   then from the Portal. A token nobody has claimed gets `unknown_token`.
3. It hands every other tap to the Event Service that registered the station in one call, the
   hand-off (11.2), and passes back the statuses it answers unchanged.
4. Steps 2 and 3 share one deadline of 4 seconds (11.5, provisional), with filling or
   refreshing the copy of the registered stations in step 1. If the owners can't be found properly in time, the whole request fails with `503 claims_unavailable`. If the Event
   Service doesn't answer properly in what's left, it fails with
   `503 event_service_unavailable`. Either way, the station keeps every tap in it to resend.

**Errors:** `missing_station_key`, `invalid_station_key`, `validation_failed`,
`claims_unavailable` and `event_service_unavailable` (from checkpoint 3), and `rate_limited`
([Rate limits](#rate-limits)).

**Firmware contract**

- Remove a tap from the local buffer as soon as **any** status comes back for it, including
  `duplicate`, `unknown_token`, `no_game`, and statuses you don't know.
- Re-sending a `client_tap_id` is always safe. It returns `duplicate` and writes nothing.
- Wait 5 seconds for an answer. The GeekyKey Service uses at most 4 of them.
- On `401`, keep the taps, show a setup error, and retry at the heartbeat's pace. Once the key
  is fixed, or the station is enabled again, they still count.
- On `429`, any `5xx` including either `503`, or no answer, keep the taps and retry later.
- On `400`, drop that batch and print it on the serial port. Sending it again would never work,
  and it would block every tap saved after it.
- Resend saved taps at most once a minute, alongside the heartbeat, never in a loop. A new tap
  is still sent at once, with any saved taps in the same request, up to 500.
- Ignore response fields you don't know, and treat a status you don't know as recorded.
- For a live tap with `lines`, show `lines[0]` and `lines[1]`, or a blank second line, in place
  of the screen in the table below, cutting each to 16 characters in case. Keep the status's LED
  and sound, except with `complete: true`: play a tune of your own instead of the accepted beep,
  and light the LED in a way of its own. An answer without `lines` shows the table's screen, as
  today.
- The cooldown for saved taps is judged by `tapped_at` when present, so saved taps can be sent
  in any order, and a tap is compared with the accepted taps nearest it in time on either side,
  including ones already stored. Without `tapped_at` the receipt time is used, which means every
  tap in a flush by the same user at the same station after the first will be `cooldown`.
  Stations should send `tapped_at` whenever they have had a time sync.

**Suggested screen and LED mapping.** Each line is at most 16 characters, and the wording can
change. Show each result for about 2 seconds with its LED on, then go back to "Ready".

| Result | Screen | LED |
|---|---|---|
| any result with `lines`, for a live tap | `lines[0]` / `lines[1]` | the status's, or its own with `complete` |
| `accepted` | `Tap counted!` / `Check your phone` | blue |
| `cooldown` | `Already counted` / `Try again later` | amber |
| `unknown_token` | `Not claimed yet` / `Claim on phone` | red |
| `no_game` | `Not in a game` / `Tell organizer` | red |
| `duplicate` | nothing; it only happens when a saved tap is resent | none |
| any status the station doesn't know | `Tap received` | blue |
| no answer, `503` or `429` | `Tap saved` / `Will send later`, since the station keeps the tap and resends it | red |
| `401` | `Setup error` / `Tell organizer` | red |
| the reader stops answering (the station's own check, section 6.2) | `Reader error` / `Tell organizer` | red |

**Security rules for firmware**

- Send the station key over `http://` only to a `.local` address. If the server setting starts
  with `http://` and its host doesn't end in `.local`, show `Setup error` and send nothing.
- Leave redirects off. `HTTPClient` has them off by default, so don't call
  `setFollowRedirects`. A redirect would carry the key to wherever it points.
- Never print the key on the serial port, even in debug output.
- In production, trust the 14 root certificates of the certificate authorities Cloudflare uses,
  listed in [the message to Zi Tao](../.scratch/db-hosting/assets/message-to-zi-tao-station-contract.md),
  and never use `setInsecure()`. Keep one HTTPS connection open, so a tap doesn't pay a new
  handshake each time.

### 6.2 `POST /api/v1/stations/heartbeat` (`Implemented`)

Gives the station its clock, and lets the station board show an online light between taps and
whether the reader works.

**Auth:** station key.

**Request** (all optional)

```json
{ "firmware_version": "0.3.1", "buffered_taps": 0, "reader_ok": true }
```

| Field | Type | Rules |
|---|---|---|
| `firmware_version` | string | 1 to 64 chars. Shown to organizers on the station board |
| `buffered_taps` | integer | 0 to 2147483647, the largest 32-bit integer. Taps saved on the station and not yet sent |
| `reader_ok` | boolean | `false` when the NFC reader doesn't answer the station's own check. Leave it out if the station doesn't check |

**Response `200`**

```json
{ "station_id": "…", "server_time": "2026-10-10T09:00:00.000Z" }
```

- Stations call this at boot and every 60 seconds. At boot it replaces `/api/health`, because
  it also proves the station key.
- A station may hold a heartbeat back while it answers taps, since a tap read during a heartbeat
  is lost, but by at most 30 seconds. So two heartbeats can be up to about 90 seconds apart, and
  the taps meanwhile keep the station online.
- It is the station's clock: set the clock from `server_time` every time, and send `tapped_at`
  only once it has been set.
- Every 60 seconds also keeps the HTTPS connection open, since Cloudflare closes an idle one
  after 400 seconds.
- The GeekyKey Service answers as soon as the key is checked, and passes the other fields to the
  station's Event Service afterwards, without waiting (11.3). So a heartbeat succeeds, and sets
  the clock, even while the Event Service is down.
- Wait 5 seconds for an answer, as for a tap.
- A station is shown as online when its Event Service heard from it, by a tap or a heartbeat,
  within 120 seconds.

**Errors:** `missing_station_key`, `invalid_station_key`, `validation_failed`,
`event_service_unavailable` when the key can't be checked, and `rate_limited`
([Rate limits](#rate-limits)). The key is checked before the body, so a station with a wrong key
gets `401` whatever it sends, until it's over the limit.

---

## 7. Auth endpoints

Each service has its own set, on its screens' hostname. The GeekyKey Service's set `gk_session`,
the Event Service's set `event_session`. Both accept logins from the same Firebase project,
`geekykey-b035a`, so a user has the same ID in both. The Event Service also accepts login links
from the GeekyKey Service (7.4), which carry that same ID.

### 7.1 `POST /auth/dev-login` (`Implemented`)

Only mounted when the service runs with `DEV_AUTH_ENABLED=true`, from its local development
settings: the committed `apps/event-service/dev.env` and `apps/geekykey-service/dev.env`, which
each service's `pnpm dev` reads. Never enabled in production.

**Request**

```json
{ "user_id": "dev-user-1" }
```

**Response `204`** with `Set-Cookie` for that service's cookie.

- **The Event Service** answers `not_found` if the user does not exist. The seed script creates
  `dev-user-1` (participant) and `dev-organizer-1`, who is on the local organizer list, so both
  views can be developed.
- **The GeekyKey Service** signs in any `user_id`, because it keeps no users. `dev-organizer-1`
  is also on its local GeekyKey admin list, so releasing someone else's token can be developed.

### 7.2 `POST /auth/firebase` (`Implemented`)

Logs the user in with the ID token Firebase gave the screens. The service checks it against
Google's public keys, then sets its cookie. There's no redirect: the screens stay where they
are, so the token page stays on `/t/<UID>` after logging in.

**The screens' side,** with Firebase's web SDK and the project's config. None of it is secret:
the API key only names the project, and Firebase allows sign-in only from `localhost`,
`key.geekshacking.com` and `event.geekshacking.com`.

```js
initializeApp({
  apiKey: "AIzaSyDw6Xhurpkj5pFu-qmxjkySBPZm2K8Xhpc",
  authDomain:
    location.hostname === "localhost" ? "geekykey-b035a.firebaseapp.com" : location.host,
  projectId: "geekykey-b035a",
  appId: "1:468223998400:web:19878ad2672a1c7116b025",
});
```

`authDomain` is where the sign-in popup opens Firebase's pages, and the address Google's
sign-in names ("to continue to event.geekshacking.com"). In production it's the page's own
address. Each set of screens' Worker forwards `/__/auth/*` and `/__/firebase/init.json` to
`https://geekykey-b035a.firebaseapp.com` without the browser's cookie, and sends Firebase's
answer back unchanged. On `localhost` no Worker forwards them, so `authDomain` stays
`geekykey-b035a.firebaseapp.com`. Google returns from the popup only to an address the
project's OAuth client lists: `https://event.geekshacking.com/__/auth/handler` and
`https://key.geekshacking.com/__/auth/handler`. GeeksHacking's client needs the same two.

1. Sign in with `signInWithPopup`, using `GoogleAuthProvider` for Google, or
   `new OAuthProvider("oidc.geekshacking")` for GeeksHacking's login. Disable the button while
   the popup is open: a second popup cancels the first (`auth/cancelled-popup-request`). On the
   GeekyKey screens only, "Continue as guest" signs in with `signInAnonymously`, which opens no
   popup and asks nothing.
2. Get the ID token with `user.getIdToken()`, and send it here.
3. On `204`, call `GET /api/v1/me` as usual. The service's cookie is the session from now on,
   so the screens don't need Firebase again until the next login.

**Logging a returning user in again,** on the GeekyKey screens. A session lasts 12 hours, and
Firebase's saved sign-in in the browser lasts longer. When `GET /api/v1/me` answers 401 and
Firebase's `onAuthStateChanged` reports a signed-in user, the screens get a fresh ID token and
send it here, without showing the login. For a guest this matters: the login would offer
"Continue as guest" again, which makes a new guest who doesn't own their token.

GeeksHacking's login appears only once it's set up in Firebase, which waits on Qing Guan's
client and, in the end, Mr Pang. If he says no, it's turned off and its button removed.

**Request**, as `application/json`. Any other content type fails validation, so a form on
another site can't log someone in.

```json
{ "id_token": "eyJhbGciOiJSUzI1NiIs…" }
```

**Response `204`** with `Set-Cookie` for that service's cookie.

- The token must be signed by Google for the project `geekykey-b035a`, unexpired, and for a
  sign-in that has already happened. Its `sub`, the Firebase UID, becomes the user ID.
- A guest's ID token is like any other, with no `name`. Its `firebase.sign_in_provider` is
  `anonymous`, and neither service treats it differently.
- **The Event Service** creates or updates the user's row with the token's `name`, unless the user
  has set their own name (8.7), which a login never replaces. If the token has none, it keeps the
  name it already has, or uses `Guest` for a new user.
- **The GeekyKey Service** keeps no users: its session holds only the user ID and the token's
  `name`, if it has one, so a login link (8.6) can carry the name.

**Errors:** `validation_failed`; `invalid_token` (401); `login_unavailable` (503) when Google's
keys couldn't be fetched, so the token may be fine and the screens offer to try again.

### 7.3 `POST /auth/logout` (`Implemented`)

**Response `204`**, clears that service's cookie. The screens also call Firebase's `signOut()`,
so a shared device doesn't stay signed in to Firebase.

### 7.4 `POST /auth/login-link` on the Event Service (`Implemented`)

Logs the user in with a login link from the GeekyKey Service (8.6), so someone who logged in on
the GeekyKey screens is logged in here as the same user, without logging in again. It is the only
way a guest reaches the Event screens. The link's format is in 11.9.

**The screens' side.** The GeekyKey screens open the link's `url`, which ends in
`#login=<link>`. The fragment never reaches a server or a log. On arrival, the Event screens:

1. read the link from the fragment, and remove the fragment with `history.replaceState`, so a
   reload or a shared screenshot doesn't carry it;
2. send it here;
3. on `204`, call `GET /api/v1/me` as usual.

**Request**, as `application/json`, for the same reason as 7.2:

```json
{ "login_link": "eyJ2IjoxLCJzdWIiOi…" }
```

**Response `204`** with `Set-Cookie` for `event_session`.

- The link must be signed with this Event Service's login link key (11.9), unexpired, and not
  used before. The Event Service keeps each link's `jti` until the link expires, and refuses it a
  second time.
- Its `sub` becomes the user ID. The user's row takes its `name` as 7.2 takes a token's `name`:
  never over a name the user set, and `Guest` for a new user without one.
- It replaces any `event_session` the browser already has, so the link's user wins. On a phone a
  family shares, the token tapped last is the one being looked at.
- A link that fails leaves the existing session as it was.

**Errors:** `validation_failed`; `invalid_login_link` (401).

---

## 8. User endpoints

8.1 and 8.7 are on the Event Service, for participants and organizers. 8.2 to 8.6 are on the
GeekyKey Service, for any logged-in user, and are what the token page and My tokens call. Each of 8.2 to
8.5 answers `503 claims_unavailable` when the claims stand-in, or after the switch the Portal,
doesn't answer properly within 4 seconds. The screens say "Couldn't reach GeeksHacking. Try
again." Nothing changes, with one exception each in 8.2 and 8.3: the claim or the release may
already have been made.

### 8.1 `GET /api/v1/me` on the Event Service (`Implemented`)

Everything the participant dashboard and passport view need in one call.

**Auth:** `event_session`, any role.

**Response `200`**

```json
{
  "user": { "id": "dev-user-1", "display_name": "Alex", "role": "participant", "has_name": true },
  "points": 3,
  "stamps": [
    { "station_id": "…", "name": "3D Printing Booth", "location": "Hall A", "points": 1, "link": "https://example.com/3d-printing", "earned_at": "2026-10-10T09:00:01.250Z" },
    { "station_id": "…", "name": "Cloud Sponsor",     "location": "Hall B", "points": 2, "link": null, "earned_at": null }
  ],
  "recent_taps": [
    { "id": 42, "station_id": "…", "station_name": "3D Printing Booth", "status": "accepted", "source": "nfc", "tapped_at": "2026-10-10T09:00:00.000Z", "received_at": "2026-10-10T09:00:01.250Z" }
  ]
}
```

- `user.id` is the user's ID from the login (section 2). `user.role` is worked out from the
  organizer list.
- `user.has_name` is `false` while `display_name` is the default, `Guest`, because neither a
  login nor the user has given a name. Then the passport asks "What should we call you?" (8.7).
  A name the user sets counts, even `Guest`.
- `stamps` lists **every** stamp slot (section 4), so the passport can render empty slots. They
  come in the order their settings were added, oldest first. A station that isn't a stamp slot
  never appears here, even if it has passport settings or the user has tapped it.
- `earned_at` is `null` until the user has an accepted tap at that station. After that it is
  when the Event Service **received** their first accepted tap there. For a station that was
  offline, that is when it sent the tap, not when it read the token.
- `stamps[].points` is what one accepted tap at that station is worth, not what this user has
  earned there. The user's total is `points`.
- `stamps[].link` is the group's page from the station's passport settings (9.1), or `null`.
  It comes with every stamp slot, earned or not, so the passport has it as soon as a poll shows
  a new stamp, and offers it with a button (section 13).
- `recent_taps` is the user's last 50 stored taps, newest first by when the Event Service
  received them. Statuses other than `accepted` are included so a participant can see "that tap
  didn't count". `station_name` is `null` for a station that isn't a stamp slot.
- The user's tokens are not here. They are on the GeekyKey Service's `/me` (8.4).

**Errors:** `unauthenticated`, and `rate_limited` ([Rate limits](#rate-limits)).

### 8.2 `POST /api/v1/tokens/{uid}/claim` on the GeekyKey Service (`Implemented`)

Claim a token for the current user, from the token page or My tokens' claim-by-code form. The
first claim wins, and a user holds at most 3 tokens.

**Auth:** `gk_session`, any user.

**Request:** no body. `{uid}` is a [Token UID](#token-uid) in any separator style.

**Response `201`** when newly claimed, **`200`** when it is already yours (idempotent):

```json
{ "token": { "uid": "04A1B2C3D4E5F6", "claimed_at": "2026-10-10T08:30:00.000Z" } }
```

**Errors:** `unauthenticated`, `validation_failed` for a `{uid}` that isn't 4 to 10 hex bytes,
`token_taken` (409) when someone else has claimed it, `token_limit_reached` (409) when the user
already holds 3, `claims_unavailable`, and `rate_limited` ([Rate limits](#rate-limits)).

The checks run in this order: a token that is already yours answers `200` whatever your count;
then a user holding 3 gets `token_limit_reached`, even for someone else's token; then
`token_taken`.

- `uid` in the answer is the normalised form.
- A claim that answers `claims_unavailable` may still have been made. The claims stand-in can
  save the claim and then answer too late, or with an error. Then the token is yours, and trying
  again answers `200`.

Taps turned away as `unknown_token` before the claim are not credited afterwards: they were
never stored.

### 8.3 `DELETE /api/v1/tokens/{uid}` on the GeekyKey Service (`Implemented`)

Release a token, for example a lost one, so anyone can claim it again. Releasing deletes the
claim. Taps made with the token before still count.

**Auth:** `gk_session`. An owner releases their own token. A GeekyKey admin can release someone
else's by adding `?owner_id=<user ID>`: the owner the token lookup (8.5) showed when the
page loaded, so a late or double click can't release a newer claim.

**Request:** no body. `{uid}` is a [Token UID](#token-uid) in any separator style.

**Response `204`**.

**Errors:** `unauthenticated`, `validation_failed` for a `{uid}` that isn't 4 to 10 hex bytes or
an `owner_id` that isn't 1 to 128 characters, `forbidden` if someone who isn't a GeekyKey admin
sends `owner_id`, even their own, `not_found` if the token isn't claimed by the current user, or
by `owner_id` when given, `claims_unavailable`, and `rate_limited` ([Rate limits](#rate-limits)).

- A release that answers `claims_unavailable` may still have been made. The claims stand-in can
  delete the claim and then answer too late, or with an error. Then trying again answers
  `not_found`, and a fresh lookup (8.5) says `nobody`.

### 8.4 `GET /api/v1/me` on the GeekyKey Service (`Implemented`)

Everything My tokens needs, and the "Am I logged in?" call for the GeekyKey screens.

**Auth:** `gk_session`, any user.

**Response `200`**

```json
{
  "user": { "id": "dev-user-1", "is_geekykey_admin": false },
  "tokens": [
    { "uid": "04A1B2C3D4E5F6", "claimed_at": "2026-10-10T08:30:00.000Z" }
  ],
  "events": [
    { "id": "showcase", "name": "Capstone Showcase", "url": "https://event.geekshacking.com" }
  ]
}
```

- `user` has no display name, because the GeekyKey Service keeps no users.
- `tokens` lists the user's tokens, oldest claim first.
- `events` lists each Event Service with a public address, for buttons such as "Open Capstone
  Showcase" on My tokens and on the token page. Each button asks for a login link (8.6) and opens
  it. At the showcase there is exactly one.

**Errors:** `unauthenticated`, and `rate_limited` ([Rate limits](#rate-limits)).

### 8.5 `GET /api/v1/tokens/{uid}` on the GeekyKey Service (`Implemented`)

What the token page shows. The page calls it only once someone is logged in. Before that it
shows a login prompt and looks nothing up.

**Auth:** `gk_session`, any user.

**Response `200`**

```json
{ "token": { "uid": "04A1B2C3D4E5F6", "owner": "someone_else", "claimed_at": null, "owner_id": null } }
```

| Field | Meaning |
|---|---|
| `owner` | `nobody`, `you` or `someone_else` |
| `claimed_at` | When you claimed it, if `owner` is `you`. Otherwise `null` |
| `owner_id` | The owner's user ID, only for a GeekyKey admin when `owner` is `someone_else`. Otherwise `null`. A GeekyKey admin passes it to release (8.3) |

| `owner` | The token page shows |
|---|---|
| `nobody` | **Claim** |
| `you` | Your token, with **Release**, and a button for each event from `/me`, such as "Open Capstone Showcase", which opens a login link (8.6) |
| `someone_else` | "This token belongs to someone else", with no name. A GeekyKey admin also sees **Release** |

- `{uid}` is a [Token UID](#token-uid) in any separator style, and `uid` in the answer is the
  normalised form.
- The service first asks who owns the token. When it's you, it then reads your own tokens for
  `claimed_at`. Both reads share the 4 seconds. If the token was released between them, the
  answer is `nobody`.

**Errors:** `unauthenticated`, `validation_failed` for a `{uid}` that isn't 4 to 10 hex bytes,
`claims_unavailable`, and `rate_limited` ([Rate limits](#rate-limits)).

### 8.6 `POST /api/v1/login-links` on the GeekyKey Service (`Implemented`)

A login link to one event's screens, for the current user. The event buttons on the token page
and My tokens call it, then open the `url` it answers. Every user gets one, guests and Google
users alike.

**Auth:** `gk_session`, any user.

**Request**

```json
{ "event_id": "showcase" }
```

`event_id` is an `id` from `events` in `/me` (8.4).

**Response `201`**

```json
{ "url": "https://event.geekshacking.com/#login=eyJ2IjoxLCJzdWIiOi…", "expires_at": "2026-11-18T13:01:00.000Z" }
```

- The link names only the session's own user ID, and the name the session holds, if any. A
  request can't choose either.
- It expires 60 seconds after it's made, and works once (7.4). The screens open it straight away
  and don't keep it.
- The screens open `url` as it is. They never build it, so the event's address and the
  fragment's name belong to the GeekyKey Service.
- It counts toward the user's 60 requests a minute ([Rate limits](#rate-limits)).

**Errors:** `unauthenticated`, `validation_failed`, `not_found` for an `event_id` that isn't in
`events`, and `rate_limited`.

### 8.7 `PATCH /api/v1/me` on the Event Service (`Implemented`)

Sets the name the event shows for the current user: on the passport, the scan log and the
export. The passport asks for it when `has_name` is `false` (8.1), and lets the user change it
later. Anyone can set it, not only a guest. A Google user may not want their full Google name
shown.

**Auth:** `event_session`, any role.

**Request**

```json
{ "display_name": "Alex" }
```

`display_name` is trimmed, then must be 1 to 30 characters, counted as Unicode code points. Any
script is allowed. A name that breaks the rule gets `validation_failed`, with its issue under the
path `["display_name"]`, and leaves the name as it was.

**Response `200`**, with the `user` object from 8.1:

```json
{ "user": { "id": "dev-user-1", "display_name": "Alex", "role": "participant", "has_name": true } }
```

- From now on, logging in (7.2) and login links (7.4) no longer change the name.
- Nothing checks what a name says. Until something shows names on a public screen, only the user
  and the organizers see it.

**Errors:** `unauthenticated`, `validation_failed`, and `rate_limited`
([Rate limits](#rate-limits)).

---

## 9. Organizer endpoints

On the Event Service. All require `event_session` for a user on the Event Service's organizer
list, except the map (9.10), which a user on its map screen list may read too. Anyone else gets
`forbidden`. Organizers also look after their event's stations: 9.7 to 9.9 create them, replace
their keys, and disable and enable them.

### 9.1 `PUT /api/v1/admin/stations/{id}/passport` (`Implemented`)

Add a station to the passport, or change its settings. `{id}` is the station's ID from the
station board.

**Request**

```json
{ "name": "3D Printing Booth", "location": "Hall A", "booth": "A3", "points": 1, "link": "https://example.com/3d-printing" }
```

`location` optional, `booth` optional, `points` optional (default 1, integer 0 or more), `link`
optional.

`booth` sets the station's booth, as 9.12 does. The booth belongs to the station, whatever game
it runs, and `passport.booth` gives the same value. `location` stays the text participants read
in the passport (8.1), which doesn't show the booth.

The Event Service trims `name`, `location` and `booth` and counts them in Unicode code points, as
9.7 counts a label. `name` must then be 1 to 80 code points, and `location` and `booth` at most
80 each. A blank or `null` `location` or `booth` means none, and the answer gives it as `null`.
`points` must also fit a 32-bit integer, so at most 2147483647.

`link` is the group's page, which the passport offers after a stamp there (8.1). The Event Service
trims it too, and a blank or `null` link means none. Otherwise it must be a URL that starts with
`https://`, in any case, and at most 300 code points. A browser reads `https:example.com` on our
own page as a path on our own site, so the `//` is required. The Event Service keeps it as given, without
rewriting it, so the station board's form shows what the organizer typed.

Each request sets `name`, `location`, `points` and `link`. A change that leaves out `location`
or `link` clears it, so the station board's form sends both back with every save. One that
leaves out `points` sets the points back to 1. A request that leaves out `booth`
leaves the station's booth as it is, and one that gives `booth`, even `null`, sets it.

**Response `201`** when added, **`200`** when changed:

```json
{ "passport": { "station_id": "…", "name": "3D Printing Booth", "location": "Hall A", "booth": "A3", "points": 1, "link": "https://example.com/3d-printing", "added_at": "…" } }
```

- A station added to the passport takes the last stamp slot. Changing its settings never moves
  it.
- A station with no game runs the passport from then on (section 4, [Games](#games)), so its
  taps get `accepted` or `cooldown` instead of `no_game`. Taps already stored as `no_game` stay
  as they are. A station whose game is fixed keeps having none. Giving it the passport writes the
  `station_game_changed` line that 9.11 writes, beside this call's own.
- A station that runs another game keeps it. Its settings are saved, and it isn't a stamp slot
  until an organizer sets its game to `passport` (9.11).
- A disabled station can be added or changed too, and its settings count once it is enabled
  (9.9).
- The Event Service writes one log line, `station_added_to_passport` or
  `station_passport_changed`, with the organizer's user ID and the station's ID. A save that
  changes nothing answers `200` and writes none. A change of booth writes the
  `station_booth_changed` line that 9.12 writes, and a save that changes only the booth writes
  only that line.

**Errors:** `unauthenticated`, `forbidden`, `validation_failed`, `not_found` for a station this
Event Service didn't register, and `rate_limited` ([Rate limits](#rate-limits)).

### 9.2 `GET /api/v1/admin/stations` (`Implemented`)

The station board: every station this Event Service has registered, enabled or disabled, with
its game, its booth, its health, its passport settings and its last tap, and the games
organizers can choose from.

**Response `200`**

```json
{
  "games": [
    { "id": "passport", "name": "Passport" }
  ],
  "stations": [
    {
      "id": "…",
      "label": "Reader 3",
      "created_at": "2026-10-01T02:00:00.000Z",
      "disabled_at": null,
      "game": "passport",
      "game_fixed": true,
      "booth": "A3",
      "passport": { "name": "3D Printing Booth", "location": "Hall A", "booth": "A3", "points": 1, "link": "https://example.com/3d-printing", "added_at": "…" },
      "last_seen_at": "2026-10-10T09:00:01.250Z",
      "online": true,
      "firmware_version": "0.3.1",
      "buffered_taps": 0,
      "reader_ok": true,
      "last_tap_at": "2026-10-10T08:58:12.004Z"
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `games` | The games an organizer can set a station to (9.11), each with its `id` and the `name` to show, in the order to show them. The same in every answer until a deploy changes the event's games |
| `label` | The device's name, such as "Reader 3". Its name in the passport is `passport.name` |
| `disabled_at` | When an organizer disabled it, or `null` while it is enabled |
| `game` | The `id` of the game it runs, or `null` for none (section 4, [Games](#games)). With none, its taps get `no_game` |
| `game_fixed` | `true` once a game has counted or held back a tap there, so its game can't change (9.11) |
| `booth` | The booth the map draws it at (9.12), or `null` |
| `passport` | `null` for a station without passport settings. The screen shows it as "Not in the passport", with a button to add its settings (9.1). A station with settings is a stamp slot only while its `game` is `passport` |
| `passport.booth` | The same as `booth`, kept because fields are never removed. Read `booth` |
| `passport.link` | The group's page that 8.1 gives with the station's stamp (9.1), or `null` |
| `last_seen_at`, `online` | When this Event Service last heard from the station, by a tap or a heartbeat, and whether that was within 120 seconds |
| `firmware_version`, `buffered_taps`, `reader_ok` | From its last heartbeat, or `null` |
| `last_tap_at` | When this Event Service last received a stored tap from the station, or `null` |

- A disabled station keeps its slot and its stamps.
- Suggested: stations that are offline, holding saved taps, running no game, or whose reader
  isn't responding go first, in red. So does a station that runs the passport with no settings. A station that is only quiet stays uncoloured. A disabled
  station goes last.

Poll this every 10 to 15 seconds for the station board.

**Errors:** `unauthenticated`, `forbidden`, and `rate_limited` ([Rate limits](#rate-limits)).

### 9.3 `GET /api/v1/admin/taps` (`Implemented`)

The live scan log, newest first.

**Query parameters**

| Name | Default | Notes |
|---|---|---|
| `limit` | 50 | 1 to 200 |
| `before_id` | none | Return taps with `id` lower than this. Cursor for "load more" |
| `station_id` | none | Filter |
| `status` | none | Filter by `accepted`, `cooldown` or `no_game` |

**Response `200`**

```json
{
  "taps": [
    {
      "id": 42,
      "client_tap_id": "tap-000123",
      "station": { "id": "…", "name": "3D Printing Booth" },
      "user": { "id": "dev-user-1", "display_name": "Alex" },
      "status": "accepted",
      "source": "nfc",
      "tapped_at": "2026-10-10T09:00:00.000Z",
      "received_at": "2026-10-10T09:00:01.250Z"
    }
  ],
  "next_before_id": 42
}
```

- `user` is never `null`, but `user.display_name` is `null` for someone who has never logged in
  to this event.
- `station.name` is the station's passport name, or `null` for a station that isn't a stamp slot
  (section 4).
- `next_before_id` is the `id` of the last tap in `taps`, to send back as `before_id` for the
  next page, or `null` when there are no older taps. For a live feed, poll every 5 seconds with
  no cursor and merge by `id`.
- The filters and the cursor apply together. A `station_id` that isn't this Event Service's gives
  an empty list, not `not_found`.

**Errors:** `unauthenticated`, `forbidden`, `validation_failed` for a query outside the table
above, such as a `limit` of 0 or a `status` of `duplicate`, and `rate_limited`
([Rate limits](#rate-limits)).

### 9.4 `POST /api/v1/admin/taps` (`Implemented`)

The QR fallback, for when a tap can't go through a station, such as a reader that dies during
the event. An organizer scans a participant's QR code, or types their user ID, and logs a
tap on their behalf. What the QR code is at the showcase is still open (section 14). It goes through the same pipeline as station taps, so
cooldown and stamps behave identically, but is stored with `source = qr_fallback` for auditing.

**Request**

```json
{ "station_id": "…", "user_id": "dev-user-1" }
```

Both fields are required. The Event Service generates the `client_tap_id`.

**Response `201`**

```json
{ "result": { "id": 43, "status": "accepted" } }
```

- `user_id` is a user ID. It is accepted even if that user has never logged in to this
  event, the same as a station tap by them. The Event Service trims it, then it must be 1 to 128
  characters, as in the hand-off (11.2).
- `status` is `accepted` or `cooldown`, unless an organizer changes the station's game (9.11) at
  the same moment, when it can be `no_game`.
- The `client_tap_id` is a random UUID, and `tapped_at` is `null`, so the cooldown goes by when
  the Event Service received the tap.
- A disabled stamp slot takes a QR fallback tap too, and the tap counts at once, since a disabled
  station keeps its stamp slot (9.9).
- The Event Service writes one log line, `qr_fallback_logged`, with the organizer's user ID, the
  station's ID and the tap's `client_tap_id`.

**Errors:**

- `unauthenticated` and `forbidden`, as for every organizer endpoint.
- `validation_failed` for a missing field, or a `user_id` outside 1 to 128 characters.
- `not_found` for a station that isn't a stamp slot (section 4): one without passport settings,
  one that runs another game, or one this Event Service didn't register.
- `rate_limited` ([Rate limits](#rate-limits)).

### 9.5 `GET /api/v1/admin/stats` (`Implemented`)

**Response `200`**

```json
{
  "total_taps": 412,
  "accepted_taps": 380,
  "unique_participants": 96,
  "stations": [
    { "station_id": "…", "name": "3D Printing Booth", "accepted_taps": 120, "unique_participants": 88 }
  ]
}
```

`total_taps` counts every stored tap: `accepted`, `cooldown` and `no_game`. `stations` lists the
stamp slots (section 4), in the order they were added.

- `accepted_taps` and `unique_participants` count `accepted` taps only, from any game. A
  participant is a user with at least one `accepted` tap, so someone whose taps were all
  `cooldown` or `no_game` isn't counted.
- For a station, `unique_participants` is the users with an `accepted` tap there, which is the
  number of stamps earned there. `name` is its passport name.
- A stamp slot with no taps is listed with zeros, and a disabled one is listed too, since it
  keeps its stamp slot (9.9). A station that isn't a stamp slot isn't listed, but its taps count
  in the totals.

**Errors:** `unauthenticated`, `forbidden`, and `rate_limited` ([Rate limits](#rate-limits)).

### 9.6 `GET /api/v1/admin/export.csv` (`Implemented`)

Stored taps as CSV with `Content-Disposition: attachment`. One row per stored tap, whose
`status` is `accepted`, `cooldown` or `no_game`.

Columns, in order: `tap_id, client_tap_id, station_id, station_name, user_id, display_name,
status, source, tapped_at, received_at`.

`station_name` is empty for a station that isn't a stamp slot (section 4), and `display_name` for
someone who has never logged in to this event.

- The first line is the column names, even when there are no taps. The rows follow, oldest first
  by `tap_id`.
- The file follows RFC 4180. A value with a comma, a double quote or a line break is in double
  quotes, with each double quote inside doubled, and every line ends in CRLF.
- `tapped_at` is empty when the station sent none, as for a QR fallback tap. The Event Service
  writes timestamps as the JSON answers give them.
- The answer's `Content-Type` is `text/csv; charset=utf-8`, and `Content-Disposition` names the
  file `geekykey-taps.csv`.
- Values come as they were typed or sent. The screens escape a value that a spreadsheet could
  run as a formula, and the Event Service doesn't (section 13).

This is the data feed for the Sprint 2 A/B analysis, so it must not be cut from scope. The
analysis needs neither token UIDs nor taps by unclaimed tokens (Joshua, 28 Sep).

**Errors:** `unauthenticated`, `forbidden`, and `rate_limited` ([Rate limits](#rate-limits)).

### 9.7 `POST /api/v1/admin/stations` (`Implemented`)

Create a station for this event.

**Request**

```json
{ "label": "Reader 3" }
```

`label` is trimmed, then must be 1 to 80 characters, counted as Unicode code points, as 8.7
counts a name.

**Response `201`**

```jsonc
{
  "station": { /* the station, as the board lists it (9.2) */ },
  "api_key": "gk_sta_DuY…"
}
```

- `api_key` is returned **only** in this response. The station board must show it with a copy
  button and a warning. There is no endpoint to read it back.
- The station joins this Event Service's registered stations at once, and the GeekyKey Service
  accepts its key within a minute.
- It runs no game until an organizer sets one (9.11), or adds its passport settings (9.1), which
  gives it the passport. Until then its taps get `no_game`.
- The Event Service writes one `station_created` log line, with the organizer's user ID and the
  station's ID, never the key.

**Errors:** `unauthenticated`, `forbidden`, `validation_failed`, and `rate_limited`
([Rate limits](#rate-limits)).

### 9.8 `POST /api/v1/admin/stations/{id}/key` (`Implemented`)

Replace a station's key, keeping its ID, its game, its booth, its passport settings and its
stamps. The old key stops
working within a minute, and Zi Tao enters the new one through the station's setup mode.

**Request:** no body.

**Response `200`**

```jsonc
{
  "station": { /* the station, as the board lists it */ },
  "api_key": "gk_sta_Qm7…"
}
```

As when a station is created, `api_key` is returned only here.

- A disabled station stays disabled, and its new key works once an organizer enables it (9.9).
- The Event Service writes one `station_key_replaced` log line, with the organizer's user ID and
  the station's ID, never the key.

**Errors:** `unauthenticated`, `forbidden`, `not_found` for a station this Event Service didn't
register, and `rate_limited` ([Rate limits](#rate-limits)).

### 9.9 `POST /api/v1/admin/stations/{id}/disable` and `/enable` (`Implemented`)

**Request:** no body.

**Response `200`**

```jsonc
{ "station": { /* the station, as the board lists it */ } }
```

Disabling sets `disabled_at`, and the station drops off this Event Service's registered
stations, so within a minute its key gets `401`, and the station keeps its taps. Enabling
empties `disabled_at`, and the saved taps count once they arrive. Doing either twice changes
nothing. Each change is logged with who made it.

- Either way the station keeps its ID, its key, its game, its booth, its passport settings and
  its stamps.
- Doing it twice answers `200` with the station as it was, so a second disable keeps the first
  `disabled_at`.
- The log line is `station_disabled` or `station_enabled`, with the organizer's user ID and the
  station's ID, and a repeat writes none.

**Errors:** `unauthenticated`, `forbidden`, `not_found` for a station this Event Service didn't
register, and `rate_limited` ([Rate limits](#rate-limits)).

### 9.10 `GET /api/v1/map` (`Implemented`)

What the map on the big screen at our booth draws: each station, with its game, its booth and
its counts.

**Auth:** `event_session`, for a user on the organizer list or the map screen list
([Who calls what](#who-calls-what)). Anyone else signed in gets `forbidden`, and a request with no
session gets `unauthenticated`. It isn't under `/admin`, because a map screen isn't an organizer.

**Response `200`**

```json
{
  "stations": [
    {
      "station_id": "…",
      "game": "passport",
      "name": "3D Printing Booth",
      "booth": "A3",
      "disabled": false,
      "taps": 57,
      "unique_participants": 41,
      "last_tap_at": "2026-10-10T08:58:12.004Z"
    },
    {
      "station_id": "…",
      "game": null,
      "name": null,
      "booth": null,
      "disabled": false,
      "taps": 0,
      "unique_participants": 0,
      "last_tap_at": null
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `game` | The `id` of the game it runs, or `null` (9.2) |
| `name` | Its name in the passport while it's a stamp slot (section 4), or `null` |
| `booth` | Its booth (9.12), or `null` |
| `disabled` | `true` while an organizer has it disabled (9.9) |
| `taps` | How many of its taps its game counted or held back, `accepted` or `cooldown`, from the station and the QR fallback (9.4). `no_game` taps, stored before it ran a game, aren't counted |
| `unique_participants` | The users with an `accepted` tap there. At a stamp slot, that is the number of stamps earned there, as in 9.5 |
| `last_tap_at` | When the Event Service received the newest tap that `taps` counts, or `null` |

- `stations` lists every station this Event Service registered: first the stamp slots, in
  stamp-slot order (section 4) as `stamps` does in 8.1, then the others, oldest first. A
  disabled station is listed too, and one with no taps has zeros and a `null` `last_tap_at`.
- The screen labels each station with its game's name from 9.2's `games`. A station running no
  game is still listed, so an organizer notices it.
- The answer has no user ID, display name or token UID, and fields added later won't either.
- `last_tap_at` isn't the station board's (9.2): this one counts a QR fallback tap and leaves out
  `no_game`.
- A station pulses when its `taps` goes up between two polls. A tap in the cooldown counts, so
  the map pulses even when the tap earned nothing.
- The screen may pulse once for each tap the count went up by. Ours plays up to 3 a poll, one
  after another, so a quick run of taps doesn't look like a single tap.
- The floor plan is the screen's own, a 2D plan first and a 3D model later, both naming the same
  booths. The Event Service stores no coordinates. The screen treats a `booth` its plan doesn't
  name the same as `null`.
- Suggested: a station whose booth is `null` or unknown shows beside the map, so an organizer
  notices and sets its booth (9.12). A disabled station stays on the map, marked, and
  doesn't pulse, even when a QR fallback tap (9.4) raises its `taps`.
- A map screen's `/me` says `participant` (8.1), so `/me` can't tell the screen whether it may
  read the map. The screen reads the map, and `forbidden` means it may not.
- Dual-tap connections, once they're built, add their own fields here, in the change that takes
  them out of section 12.

Poll this every 2 seconds while the map is shown. That uses 30 of the user's 60 requests a minute
([Rate limits](#rate-limits)).

**Errors:** `unauthenticated`, `forbidden`, and `rate_limited` ([Rate limits](#rate-limits)).

### 9.11 `PUT /api/v1/admin/stations/{id}/game` (`Implemented`)

Set the game a station runs, or none (section 4, [Games](#games)). `{id}` is the station's ID
from the station board.

**Request**

```json
{ "game": "passport" }
```

`game` is required: the `id` of one of the games in 9.2's `games`, or `null` for none.

**Response `200`**

```jsonc
{ "station": { /* the station, as the board lists it (9.2) */ } }
```

- Its next tap goes to the new game. A tap already being judged when the change arrives is judged
  by the game before.
- A station that has passport settings and is set to another game keeps them, and stops being a
  stamp slot. Set back to `passport` before its game is fixed, it takes its old slot again,
  since slots follow when the settings were added.
- A station set to `passport` with no settings yet isn't a stamp slot, and its taps get
  `no_game`, until 9.1 adds them.
- Setting the game it already runs answers `200` with the station as it is, even once its game
  is fixed, and writes no log line.
- The Event Service writes one `station_game_changed` log line, with the organizer's user ID, the
  station's ID and the new game's `id`, or `null`.

**Errors:**

- `unauthenticated` and `forbidden`, as for every organizer endpoint.
- `validation_failed` for a missing `game`, or one that isn't in 9.2's `games`.
- `not_found` for a station this Event Service didn't register.
- `station_has_taps` (`409`) once the station's game is fixed (section 4). The station keeps its
  game.
- `rate_limited` ([Rate limits](#rate-limits)).

### 9.12 `PUT /api/v1/admin/stations/{id}/booth` (`Implemented`)

Set the booth a station stands at, so the map (9.10) draws it there. An organizer who moves a
station on the day changes its booth here, with no deploy, whatever game it runs and however many
taps it has.

**Request**

```json
{ "booth": "A3" }
```

`booth` is free text, which the map screen matches to a booth name in its own floor plan. The
Event Service trims it and counts it in code points, as 9.1 does: at most 80, and a blank or
`null` booth means none, given as `null`.

**Response `200`**

```jsonc
{ "station": { /* the station, as the board lists it (9.2) */ } }
```

- A save that changes nothing answers `200` and writes no log line. A change writes one
  `station_booth_changed` line, with the organizer's user ID and the station's ID.
- Stations created before version 0.7 keep the booth their passport settings gave them.

**Errors:** `unauthenticated`, `forbidden`, `validation_failed`, `not_found` for a station this
Event Service didn't register, and `rate_limited` ([Rate limits](#rate-limits)).

---

## 10. GeekyKey admin endpoints

None since version 0.3. The station jobs moved to each Event Service's organizers (9.7 to 9.9).
A GeekyKey admin's one job is releasing someone else's token, which is 8.3 with `owner_id`.

---

## 11. Building an Event Service

For anyone building an Event Service, ours or another team's. The GeekyKey Service checks each
station's key against the stations the Event Services have registered, and hands the station's
taps to the Event Service that registered it, as users. The Event Service decides what they count
for. An Event Service logs its users in itself
([ADR 0002](../docs/adr/0002-each-service-logs-in-through-the-portal.md)): at the showcase through
our Firebase project, as section 7.2 does, so its user IDs match ours
([ADR 0004](../docs/adr/0004-the-showcase-logs-in-through-firebase.md)); after it, through the
Portal.

Every Event Service serves three requests, all called by the GeekyKey Service with the Event
Service key: its registered stations (11.1), the hand-off (11.2) and the heartbeat hand-off
(11.3). An Event Service with a public address also accepts login links (11.9), since the event
buttons on My tokens and the token page open one. It also creates its own stations and issues their keys, in whatever way suits it; ours
does it on the station board (9.7 to 9.9).

Adding an Event Service is a reviewed pull request to the GeekyKey Service's settings: its ID,
its name, its `https://` address, and optionally a public address and name for the buttons on My
tokens and the token page. Its key is set as a secret on both sides.

### 11.1 Registered stations: `GET /geekykey/v1/stations` (`Implemented`)

Which station keys are this Event Service's. The GeekyKey Service keeps a copy of every Event
Service's list in memory, fills it when it's empty, and refreshes it at most once a minute.

**Auth:** `Authorization: Bearer <Event Service key>`.

**Response `200`**

```json
{
  "stations": [
    { "station_id": "ca939e19-8216-4b95-8375-5b54e543c5f6", "key_hash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08" }
  ]
}
```

| Field | Type | Rules |
|---|---|---|
| `station_id` | string | The station's ID, unique across every Event Service. Ours are UUIDs |
| `key_hash` | string | The SHA-256 of the station key, as 64 lower-case hex characters. Never the key itself |

- List enabled stations only. A disabled station drops off, and within a minute its key gets
  `401`.
- Nothing else goes in the list: no label, no location.
- A station ID or key hash that appears twice, in one list or across Event Services, is refused
  and logged, so neither station works until it's fixed. Make keys of 32 random bytes, as ours
  are, with the `gk_sta_` prefix.
- When this call fails, the GeekyKey Service keeps the last list it had from you. While it has
  none, a station whose key isn't on another list gets `503 event_service_unavailable`, not
  `401`, and it asks you again at most once a minute, whatever keys arrive. Filling an empty
  copy counts against the same deadline as a tap (11.5).

**Errors:** `invalid_event_service_key`.

### 11.2 The hand-off: `POST /geekykey/v1/taps` (`Implemented`)

The GeekyKey Service calls this on the Event Service once per station request, with every tap in
it that passed the GeekyKey Service's own checks.

**Auth:** `Authorization: Bearer <Event Service key>`.

**Request**

```json
{
  "station_id": "ca939e19-8216-4b95-8375-5b54e543c5f6",
  "taps": [
    { "client_tap_id": "tap-000123", "user_id": "<user ID>", "tapped_at": "2026-10-10T01:00:00.000Z" },
    { "client_tap_id": "tap-000124", "user_id": "<user ID>", "tapped_at": null }
  ]
}
```

| Field | Type | Rules |
|---|---|---|
| `station_id` | string | One of this Event Service's registered stations. Ours answers `validation_failed` for any other |
| `taps` | array | 1 to 500 items |
| `taps[].client_tap_id` | string | 1 to 128 chars. Unique per station forever |
| `taps[].user_id` | string | 1 to 128 chars, as a Firebase user ID is. The token owner's user ID |
| `taps[].tapped_at` | string or `null` | The station's time for the tap, in UTC with milliseconds. `null` when the station sent none, or it was more than 5 minutes ahead or 7 days behind |

**Response `200`**

```json
{
  "results": [
    { "client_tap_id": "tap-000123", "status": "accepted", "lines": ["Alex: 3 of 6", "Tap counted!"] },
    { "client_tap_id": "tap-000124", "status": "cooldown", "lines": ["Alex: 3 of 6", "Already counted"] }
  ]
}
```

- One result per tap, in request order, with the same `client_tap_id`s.
- `lines` and `complete` are optional, with 6.1's rules. The GeekyKey Service passes them to the
  station unchanged with `accepted` and `cooldown`, and leaves them out with any other status,
  even one of your own. A line that breaks 6.1's rules fails the whole request, as a status that
  isn't snake_case does (11.5). An Event Service that sends neither gets the station's own screen
  for the status.
- `status` is a snake_case string. Ours answers `accepted`, `cooldown`, `no_game` or
  `duplicate`. Another team's may answer statuses of its own, which the GeekyKey Service passes to
  the station unchanged.
- With several games in one Event Service, a tap gets one status: `accepted` if any game counted
  it, otherwise `cooldown` if a game held it back, otherwise `no_game`.

**Errors:** `invalid_event_service_key`, `validation_failed`.

### 11.3 The heartbeat hand-off: `POST /geekykey/v1/heartbeats` (`Implemented`)

The GeekyKey Service passes on each heartbeat a station sends (6.2), after it has answered the
station.

**Auth:** `Authorization: Bearer <Event Service key>`.

**Request**

```json
{ "station_id": "ca939e19-8216-4b95-8375-5b54e543c5f6", "firmware_version": "0.3.1", "buffered_taps": 0, "reader_ok": true }
```

`station_id` is always there. The other three are the station's own, with 6.2's rules, and are
left out when the station left them out. Ours answers `validation_failed` for a `station_id` that
isn't its own.

**Response `204`**, no body.

- The station's answer never depends on yours, and the GeekyKey Service doesn't retry. It gives
  up once what's left of the station request's 4 seconds (11.5) runs out. A lost heartbeat is replaced a minute
  later.
- Use it for the station's health, such as an online light. Ours counts a station heard from, by
  a tap or a heartbeat, within 120 seconds as online.
- Ours stores each field the station sent, and keeps what the last heartbeat said of a field it
  left out.

**Errors:** `invalid_event_service_key`, `validation_failed`.

### 11.4 Dropping replays

Every Event Service must drop replays by station ID and `client_tap_id`: a tap it has already
received answers `duplicate` and changes nothing. Stations resend saved taps, and a hand-off that
failed may still have stored some of its taps (11.5).

### 11.5 The 4-second deadline

The GeekyKey Service gives each station request one deadline of 4 seconds for filling or
refreshing its copy of the registered stations (11.1), finding the tokens' owners and the
hand-off together, so each step gets whatever the ones before it leave. A list more than a
minute old is refreshed before the key is checked against it. The
station waits 5. Provisional until our first deploy measures a cold start: a cold start lands on
the first call that wakes a server, so keep yours warm on event days, or able to answer from
cold within about 3 seconds.

Each of these fails the whole station request with `503 event_service_unavailable`, and the
station keeps every tap in it to resend later:

- no answer within the time left;
- a status other than 2xx;
- a redirect, which is never followed;
- a body the response schema rejects, including results that don't match the request's taps one
  for one.

The GeekyKey Service doesn't retry. An Event Service that stored taps but answered late sees them
again when the station resends, and answers `duplicate`.

### 11.6 The Event Service key

Both sides check it as [Event Service keys](#event-service-keys) in section 3 describes. The
GeekyKey Service sends it on all three requests.

### 11.7 The JSON Schema

The bodies of the three requests and their answers are Zod schemas in `packages/handoff`. Both
our services check against them, and a JSON Schema generated from them with `z.toJSONSchema` is
for other teams, in `packages/handoff/json-schema/`. The registered stations' answer and the
hand-off's two are there, and so is the heartbeat hand-off's request. Its answer has no body.

- The files leave other fields allowed, since fields are only ever added (section 1).
- A JSON Schema can't say that the hand-off's results match its taps one for one. The
  GeekyKey Service checks that too (11.5).

### 11.8 What the hand-off leaves out

- The token's UID. An Event Service sees only users.
- Who owns which token. The GeekyKey Service finds owners itself: from a claims stand-in on our
  own server until the switch after the showcase, then from the Portal. An Event Service never
  builds or calls either.
- Taps the GeekyKey Service turned away as `unknown_token`.
- The source. Every tap in a hand-off comes from a station; our QR fallback lives inside the
  Event Service.
- When the GeekyKey Service received the tap. The Event Service uses its own clock.
- The user's name. An Event Service that needs one takes it from the login, or from a login
  link (11.9).

### 11.9 The login link

What the GeekyKey Service sends an Event Service's screens so they can log a user in (7.4) as the
same user. An Event Service that builds its own screens checks it like this.

**The key.** Each Event Service's login link key is derived from its Event Service key, so neither
side holds a second secret: HKDF with SHA-256, the Event Service key's 32 bytes (decoded from its
hex) as the input key, an empty salt, the info `geekykey login link` in UTF-8, and 32 bytes out.
A link made for one Event Service can't log anyone in to another. Replacing the Event Service key
cancels every link not yet used.

**The link** is two base64url parts, without padding, joined by a `.`: the payload's JSON in
UTF-8, then the HMAC-SHA256 of that first part's characters with the login link key.

```json
{ "v": 1, "sub": "Xb3…", "name": "Alex", "exp": 1795006860, "jti": "9f2c4e…" }
```

| Field | Meaning |
|---|---|
| `v` | Always `1`. Any other value is refused |
| `sub` | The user ID, 1 to 128 characters, as in the hand-off (11.2) |
| `name` | The name from the user's login, at most 100 characters, cut there if longer. `null` when the login had none, as a guest's has none |
| `exp` | When it expires, in seconds since 1970 (UTC), 60 seconds after it was made |
| `jti` | 16 random bytes as 32 lower-case hex characters, so each link can be used once |

The Event Service compares the HMAC in constant time, then checks `v`, `exp` and `jti`, and
answers `invalid_login_link` (401) if any check fails. It never logs a link.

---

## 12. Out of scope for the showcase

Not exposed by the API before the showcase. Listed so nobody builds UI against them.

- Several events at once in one Event Service, or any event CRUD. One Event Service runs one event
  at a time, and a station belongs to one Event Service. Ours runs the grad tea, then the
  showcase, with its data cleared between them.
- Moving a station between Event Services. A reader moved to another event becomes a new station
  there.
- Dual-tap connections, leaderboards, or archetype quests.
- WebSocket or server-sent events. Poll the endpoints above.
- Reading a station key back. Replacing one is in scope, for organizers.
- Removing a station's passport settings. Before the station's game is fixed, an organizer can
  set it to another game instead (9.11), and it keeps its settings but stops being a stamp slot.
- Editing or deleting taps.
- User profile editing, apart from the name the event shows (8.7). A guest can't be turned into
  a Google account.
- Logging in through the Portal (`GET /auth/login` and `GET /auth/callback`). It replaces
  `POST /auth/firebase` after the showcase
  ([ADR 0004](../docs/adr/0004-the-showcase-logs-in-through-firebase.md)).

---

## 13. Screen to endpoint map

**The GeekyKey screens** (`apps/geekykey-web`, `key.geekshacking.com`)

| Screen | Calls |
|---|---|
| Login | Firebase's web SDK, with Google, GeeksHacking's login or as a guest, then `POST /auth/firebase`, in production; `POST /auth/dev-login` in development |
| Token page, `/t/<UID>` | `GET /api/v1/me`, `GET /api/v1/tokens/{uid}`, then `POST /api/v1/tokens/{uid}/claim` or `DELETE /api/v1/tokens/{uid}`, which a GeekyKey admin also uses to release someone else's token; `POST /api/v1/login-links` for the event buttons |
| My tokens, the home page | `GET /api/v1/me`, `DELETE /api/v1/tokens/{uid}`, and `POST /api/v1/tokens/{uid}/claim` for the claim-by-code form; `POST /api/v1/login-links` for the event buttons |

There are no GeekyKey admin screens.

**The Event screens** (`apps/event-web`, `event.geekshacking.com`)

| Screen | Calls |
|---|---|
| Login | Firebase's web SDK, with Google or GeeksHacking's login, then `POST /auth/firebase`, in production; `POST /auth/dev-login` in development. No guest sign-in |
| Arriving from a login link, `/#login=<link>` | `POST /auth/login-link`, then `GET /api/v1/me` |
| Participant dashboard | `GET /api/v1/me` |
| Passport / stamp book | `GET /api/v1/me` (the `stamps` array); `PATCH /api/v1/me` for the name |
| Organizer scan log | `GET /api/v1/admin/taps`, polled |
| Organizer station board | `GET /api/v1/admin/stations`, polled; `PUT /api/v1/admin/stations/{id}/passport`; `PUT /api/v1/admin/stations/{id}/game`; `PUT /api/v1/admin/stations/{id}/booth`; `POST /api/v1/admin/stations`; `POST /api/v1/admin/stations/{id}/key`; `POST /api/v1/admin/stations/{id}/disable`, `/enable` |
| Organizer QR fallback | `POST /api/v1/admin/taps` |
| Organizer summary | `GET /api/v1/admin/stats`, `GET /api/v1/admin/export.csv` |
| Map, on the big screen at our booth | `GET /api/v1/map`, polled every 2 seconds. Logged in as a map screen, or as an organizer |

- On `429`, screens that poll keep showing their last data. The token page, the claim form and My
  tokens say "Too many tries. Wait a minute and try again."
- On `token_limit_reached`, the claim says "You already have 3 tokens. Release one on My tokens
  first."
- On `token_taken`, the claim says "Someone else already claimed this token." The error names
  no owner, so the token page then shows what a fresh lookup (8.5) answers, under that sentence.
  The two can differ: if the token was released in between, the lookup says `nobody`, and the
  sentence still stays, so the user learns they lost the claim.
- On `claims_unavailable`, the token page, the claim form and My tokens say "Couldn't reach
  GeeksHacking. Try again."
- On `invalid_token` or `login_unavailable`, both logins say "Couldn't log you in. Try again."
- The GeekyKey screens' login offers **"Continue as guest"**, with the line "No account needed.
  Keep using this phone and browser." under it. The Event screens' login doesn't offer it.
- When a guest signs out on the GeekyKey screens, they're asked first, because a new guest is a
  new user ID (7.2): **"Sign out of this guest login?"**, with "You can't log back in as this
  guest, so your tokens and stamps stay with it. If you sign out by mistake, ask at the desk to
  release your tokens so you can claim them again." under it, and **Stay signed in** and **Sign
  out**. The screens know a guest from Firebase's `currentUser.isAnonymous`, and ask whenever
  Firebase can't say. A Google or GeeksHacking user signs out without being asked.
- On `station_has_taps`, the station board says "Taps here have already counted, so this
  station's game can't change until the data is cleared." It shows a station whose `game_fixed`
  is `true` with its game, and no way to change it.
- On `invalid_login_link`, the Event screens say "That link has expired. Tap your token again to
  get back in."
- When `has_name` is `false`, the passport asks "What should we call you?", with **Save** and
  **Skip**. Skipping keeps `Guest`, and the passport keeps a way to set the name later. On
  `validation_failed` it says "Use 1 to 30 characters."
- When a poll of `GET /api/v1/me` shows a new stamp whose `link` isn't `null`, the passport
  shows the stamp's `name` with a button, **"Open their page?"**, which opens `link` in a new
  tab. It never opens the page by itself, since a browser opens one only after a press. A stamp
  with no link shows no button.
- Until its endpoints are live, a screen that answers from the screens' own sample data says so
  above its content. With no service behind the screens at all, it says "Demo data. This screen
  shows sample data." Every screen built so far sends every call to its own service, so with the
  service behind it, it shows no notice.
- The organiser's CSV download is the file the service sent, unchanged, unless a value needs
  escaping. The summary says the rule under the Download CSV button: **"A value that a
  spreadsheet could run as a formula gets an apostrophe, so it stays text."** When the file was
  changed, it says **"Some values were escaped, so this file is not the service's own."**

Local setup, from checkpoint 1:

```
mise run db:up    # starts TiDB in Docker, and creates and migrates the local databases
mise run seed     # prints a station key, and creates dev-user-1 and dev-organizer-1
mise run dev      # pnpm dev: the GeekyKey Service on 8000, the Event Service on 8001,
                  # the Event screens on 5173 and the GeekyKey screens on 5174
```

Each service's `pnpm dev` turns on `DEV_AUTH_ENABLED` by itself, so no local settings file is
needed. Then `POST /auth/dev-login` with `{"user_id":"dev-user-1"}` from either set of screens,
and every other call on that service works. The two cookies have different names, so a sign-in
on one set of screens leaves the other's alone.

---

## 14. Open questions

| Question | Owner | Needed by |
|---|---|---|
| What does the QR fallback scan, now that showcase users aren't Portal users? Likely a QR code of the user ID on the passport | Adam with Ethan | Checkpoint 7 |

Closed in 0.5:

- "Does GeeksHacking's login, through Firebase, carry the user's name?": it no longer matters. A
  user whose login has no name is called `Guest`, and the passport asks them for one (8.1, 8.7).

Closed in 0.2:

- "Production origin for CORS": there is no CORS.
- "Does the station firmware persist a tap counter across power loss?": yes. Since its first
  version on 23 Sep, the firmware has saved its counter in flash before each tap.

Closed on 2026-10-01:

- "The Event Service's hostname": `event.geekshacking.com`, chosen by Julian.

Closed on 2026-10-10:

- "The Portal's login details": the showcase logs in through Firebase instead (ADR 0004). The
  Portal's issuer, `https://hackomania-api.geekshacking.com/`, goes inside Firebase as
  GeeksHacking's login.

---

## 15. Changelog

| Date | Change |
|---|---|
| 2026-09-18 | Initial draft. `POST /api/v1/taps` and `GET /api/health` reflect the implemented backend; everything else is proposed. |
| 2026-09-21 | `POST /auth/dev-login` and `POST /auth/logout` are implemented with tests. Shapes are unchanged from the draft; logout moves up from `MVP` because it shares the session cookie helpers with dev-login. |
| 2026-09-25 | `GET /api/v1/me` is implemented with tests. The shape is unchanged from the draft. Section 8.1 now states the order of `stamps` (oldest station first), `recent_taps` (newest arrival first) and `tokens` (oldest pairing first), that `earned_at` is when the backend received the tap, and that `stamps[].points` is the station's points. The example's `earned_at` now matches its tap's `received_at`. Section 4 links to the new `CONTEXT.md` glossary. |
| 2026-09-26 | Fixes to `POST /api/v1/taps`, request and response shapes unchanged. A `tapped_at` more than 5 minutes ahead of the server or 7 days behind it is now ignored (section 6.1), so a clock that never synced (1970) cannot skew the cooldown. A late offline tap is judged against the accepted taps nearest it in time rather than only the newest. Overlapping requests from one station are handled one at a time, so a retry racing its original gets `duplicate` and two taps by one participant cannot both beat the cooldown. Unknown routes now return the `not_found` error body instead of plain text. |
| 2026-09-29 | Version 0.2, rewritten for the move to Cloudflare Workers and TiDB and the split into the GeekyKey Service and the Event Service, as the [migration spec](../.scratch/db-hosting/spec.md) plans. Status tags now name the checkpoint that builds each endpoint, replacing `Sprint 1` and `MVP`. The endpoints are split by service. Pairing and unpairing become claim and release on the GeekyKey Service, with a 3-token limit, and `token_taken` replaces `uid_already_paired`. New: the GeekyKey Service's `/me` and token lookup, the GeekyKey admin endpoints (sections 10.1 to 10.5), passport settings (9.1), the hand-off and the status call (section 11), the heartbeat's `reader_ok`, and the statuses `no_event` and `no_game`. New errors: `invalid_event_service_key`, `token_limit_reached`, `rate_limited` (429), `event_service_unavailable` and `portal_unavailable` (503). No CORS; two cookies, `gk_session` and `event_session`. Base URLs for production. The station board is merged from the status call; the QR fallback takes `user_id` only. **One-off removals,** allowed once because nothing relies on them in production yet: `tokens` from the Event Service's `GET /api/v1/me`, `token_uid` from the tap log and the export, and stored `unknown_token` taps. Two open questions closed. |
| 2026-10-01 | GeeksHacking's hostnames, chosen by Julian: stations and Event Services call `https://key-api.geekshacking.com` (was `geekykey-api`), the GeekyKey screens and the token address are on `key.geekshacking.com` (was `geekykey`), and the Event screens on `event.geekshacking.com` (was the provisional `showcase`). No endpoint or shape changes. |
| 2026-10-07 | Version 0.3 (draft), after the Event Service moved to Google Cloud Run and the GeekyKey Service became a Worker with no database ([ADR 0003](../docs/adr/0003-event-service-on-cloud-run-geekykey-service-without-a-database.md)), as the rewritten [migration spec](../.scratch/db-hosting/spec.md) plans. Each Event Service now registers its own stations and issues their keys, and a station feeds the Event Service that registered it. **New:** the registered stations, `GET /geekykey/v1/stations` (11.1); the heartbeat hand-off, `POST /geekykey/v1/heartbeats`, answering `204` (11.3); and the organizers' endpoints to create a station, replace its key, and disable and enable it (9.7 to 9.9), with the shapes the GeekyKey admin endpoints had, less the link. **Removed,** none of them built: the status call `GET /api/v1/event-service/stations` and its limit of 120 a minute, the GeekyKey admin endpoints (section 10), links, and the status `no_event` (provisional until 8 Oct). The station board (9.2) reads the Event Service's own stations, so it loses `status_known` and `linked` and gains `created_at` and `disabled_at`. Passport settings (9.1) answer `not_found` for a station that isn't this Event Service's. `claims_unavailable` (503) replaces `portal_unavailable`, from checkpoint 3, on station requests and on 8.2 to 8.5. One 4-second deadline for finding owners and the hand-off together replaces the 3-second limit (11.5, provisional). The heartbeat answers without waiting for the Event Service, and a key that can't be checked gets `503`. From checkpoint 2 until checkpoint 4, stations call `https://event-api.geekshacking.com`. The screen table's "no answer" row says `Tap saved` / `Will send later`. The checkpoints follow the rewritten spec, and section 11 is renumbered. |
| 2026-10-10 | Version 0.4 (draft): the showcase logs in through Firebase, not the Portal ([ADR 0004](../docs/adr/0004-the-showcase-logs-in-through-firebase.md)). **New:** `POST /auth/firebase` on both services (7.2), taking the ID token from Firebase's web SDK after a Google or GeeksHacking sign-in, with the errors `invalid_token` (401) and `login_unavailable` (503). **Moved out of scope:** `GET /auth/login` and `GET /auth/callback`, which return after the showcase; logout becomes 7.3. User IDs are Firebase UIDs at the showcase, so "Portal user ID" becomes "user ID" throughout, and another team's Event Service logs in through the same Firebase project. Checked on 10 Oct that a Worker verifies the token in about 1 ms of CPU (BAC-20). Open questions: whether GeeksHacking's login carries a name, and what the QR fallback scans. |
| 2026-10-12 | Housekeeping, no endpoint or shape changes. A reader moved to another event, and a replaced key (9.8), go in through the station's setup mode, not a reflash, as agreed on 8 Oct; `no_event` stays retired, no longer provisional; dev-login is turned on by the committed `apps/backend/dev.env` (7.1), not a gitignored file. |
| 2026-10-13 | The Event Service key is written as 64 lower-case hex characters ([Event Service keys](#event-service-keys)). "Generated like a station key" only ever meant random, but it read as a station key's base64url, whose `-` and `_` some apps split a double-click at; hex is copied between people, chats and dashboards unchanged. No endpoint or shape changes. |
| 2026-10-13 | The claim's checks run in a stated order (8.2): already yours, then the 3-token limit, then `token_taken`, so a user holding 3 hears about the limit even for someone else's token, as the migration spec says. Section 13 sets the `token_taken` sentence, "Someone else already claimed this token.", and keeps it above the token page's fresh lookup even when that lookup says `nobody`. No endpoint or shape changes. |
| 2026-10-13 | Today's backend now finds each token's owner as 6.1's step 2 says, from the claims stand-in within the 4-second deadline, and answers `503 claims_unavailable` when it can't. `unknown_token` taps are logged and no longer stored (6.1, and `tap_status` in section 4). The Event Service's `GET /api/v1/me` no longer returns `tokens` (8.1), one of the removals version 0.2 allowed. The agreed shapes don't change; only the notes on how today's backend still differs do (BAC-31). |
| 2026-10-14 | The hand-off, `POST /geekykey/v1/taps` (11.2), is `Implemented`, inside the one server: today's backend now hands each station's claimed taps to its Event Service through it, with the Event Service key, and answers `503 event_service_unavailable` when the hand-off fails (6.1). Its Zod schemas are in `packages/handoff`, and their JSON Schema in `packages/handoff/json-schema/` (11.7). Two rules added to 11.2: a `user_id` is 1 to 128 characters, as a Firebase user ID is, and ours answers `validation_failed` for a `station_id` that isn't its own. The fields don't change, but a `user_id` over 128 characters is now refused (BAC-32). |
| 2026-10-14 | The registered stations, `GET /geekykey/v1/stations` (11.1), are `Implemented`, inside the one server. Today's backend checks a station's key against its copy of them instead of reading its own stations, so steps 1 to 4 of 6.1 now work as written: `401 invalid_station_key` only when every list is in hand, and `503 event_service_unavailable` while one is missing. Ours leaves out a station whose `disabled_at` is set, though nothing sets it until the organizers' endpoint to disable one (9.9). The answer's Zod schema is in `packages/handoff`, and its JSON Schema in `packages/handoff/json-schema/stations-answer.schema.json` (11.7). 11.1 now says a list that doesn't come back is asked for again at most once a minute, and 6.1's step 4 and 11.5 say filling an empty copy shares the 4-second deadline, as 11.1 already did. No shape changes (BAC-33). |
| 2026-10-15 | The heartbeat, `POST /api/v1/stations/heartbeat` (6.2), and its hand-off, `POST /geekykey/v1/heartbeats` (11.3), are `Implemented`, inside the one server, so every request in section 11 is now built. The heartbeat answers `server_time` once the key is checked, and passes the station's fields to its Event Service within what's left of the 4 seconds. A hand-off that fails is logged and never fails the heartbeat. Until checkpoint 4 the answer leaves once the hand-off is done, since Cloud Run gives the one server a processor only while a request is in progress, and a refresh of the registered stations (11.1) is done before a station's answer leaves, for the same reason. Ours stores them on the station's row with when it last heard from it. Two rules added to 6.2, which 11.3 follows: `firmware_version` is 1 to 64 characters, and `buffered_taps` at most 2147483647, the largest 32-bit integer. The fields don't change, but a heartbeat breaking either rule now gets `400 validation_failed`. As in 11.2, ours answers `validation_failed` to a heartbeat hand-off for a `station_id` that isn't its own. The heartbeat hand-off's JSON Schema is in `packages/handoff/json-schema/heartbeats-request.schema.json` (11.7), and 6.2 now says the key is checked before the body (BAC-34). |
| 2026-10-15 | Passport settings live apart from the station in today's backend, so the Event Service's `GET /api/v1/me` (8.1) and `POST /api/v1/taps` (6.1) are `Implemented`. A tap at a station without passport settings is stored and answered `no_game`. `stamps` lists only stations with passport settings, oldest settings first, and `recent_taps` gives `station_name` as `null` for any other station. `user.role` comes from the Event Service's organizer list, read when it starts, instead of from the user's row. Every station already registered kept its name, location and points as its passport settings, so its taps are still `accepted`. No shape changes (BAC-35). |
| 2026-10-16 | Housekeeping, no endpoint or shape changes. The Event Service's code moved from `apps/backend` to `apps/event-service` ahead of checkpoint 4. The table at the top, 7.1's `dev.env` and section 13's local setup name the new folder. `mise run dev:backend` is now `mise run dev:event-service` (BAC-40). |
| 2026-10-16 | Housekeeping, no endpoint or shape changes. Locally the Event Service now runs on port 8001, as the table at the top already said for checkpoint 4, and the GeekyKey Service on 8000, in `wrangler dev`. Section 13's local setup names the new port, and starts the GeekyKey Service too. Until its own dev-login arrives, the GeekyKey Service on 8000 has no `POST /auth/dev-login` or `POST /auth/logout`. [Event Service keys](#event-service-keys) now states the one exception to `https://`: locally, `http://` to the same machine, as the code already allowed (BAC-41). |
| 2026-10-16 | Each service signs its own users in locally, as sections 2 and 7 already said for checkpoint 4. The Event Service's session cookie is now `event_session`, not `gk_session`; nobody is signed in on production yet, so the rename signs nobody out. The GeekyKey Service has its own `POST /auth/dev-login` (7.1), which signs in any `user_id` and sets `gk_session`, and its own `POST /auth/logout` (7.3). Dev-login exists on each only with `DEV_AUTH_ENABLED=true`, and logout always. The Event Service's dev-login, logout and `GET /api/health` are `Implemented`, and the GeekyKey Service's dev-login no longer "changes at checkpoint 4". Section 13's local setup is one `pnpm dev` at the repo root, which starts all four on 8000, 8001, 5173 and 5174 with no settings file. The status legend's `Implemented` names both services' folders. No shape changes (BAC-42). |
| 2026-10-20 | Housekeeping, no endpoint or shape changes. The Event screens' code moved from `apps/frontend` to `apps/event-web`, and its package to `@geekykey/event-web`. The table at the top and section 13's Event screens heading name the new folder, and the root scripts, the mise tasks and CI follow it (FRO-37). |
| 2026-10-20 | Checkpoint 4 is done: every station calls the GeekyKey Service at `https://key-api.geekshacking.com`, its only production address. `POST /api/v1/taps` (6.1) and `POST /api/v1/stations/heartbeat` (6.2) are gone from the Event Service, which answers them `404 not_found`, and the notes on how they ran inside one server until checkpoint 4 are gone from sections 2, 5, 6, 6.1 and 6.2. The heartbeat's answer no longer waits for its hand-off. The Event Service's routes under `/geekykey/v1` and the claims stand-in's under `/claims-stand-in/v1` don't change. No shape changes (BAC-46). |
| 2026-10-20 | The hand-off's answer schema (11.2) now holds the request's bounds, which the agreement already set: 1 to 500 results, and a `client_tap_id` of 1 to 128 characters. Before, `packages/handoff/json-schema/taps-answer.schema.json` took an answer with no results, so a team checking with it alone could build one the GeekyKey Service refuses. Our Event Service always answered within them, so nothing it sends changes (BAC-49). |
| 2026-10-20 | Our Event Service sends `Cache-Control: no-store` on every response, no longer only under `/api` and `/auth` ([CORS and cookies](#cors-and-cookies)). The registered stations (11.1) carry key hashes and the claims stand-in says who owns which token, so neither should sit in a cache. No shape changes (BAC-51). |
| 2026-10-20 | The Event Service's `POST /auth/firebase` (7.2) is `Implemented`. It checks the ID token against Google's keys for the project `geekykey-b035a`, then sets `event_session` the same way as `POST /auth/dev-login`. The user's row takes the token's `name`; a token with none, or a blank one, keeps a returning user's name and gives a new user `GeeksHacking member`. A body that isn't `application/json` fails validation. The GeekyKey Service's half follows (BAC-55). No shape changes (BAC-52). |
| 2026-10-20 | New error code `service_unavailable` (503), and only the screens' Workers send it. Each set of screens is served by a Worker that passes `/api/*` and `/auth/*` to its service. When that service gives no answer at all, the Worker answers `503 {"error": "service_unavailable"}` with `Cache-Control: no-store`, rather than Cloudflare's own HTML error page, which broke the error body's shape and the `no-store` rule. Until the screens know the code, they treat it by its status, as a bare 503. No other shape changes (BAC-53). |
| 2026-10-21 | Version 0.5 (draft): guests, login links, and a name the user sets (ADR 0005, BAC-54). **New:** a guest sign-in on the GeekyKey screens only, through Firebase's `signInAnonymously`, accepted by `POST /auth/firebase` like any other login (7.2); the GeekyKey screens log a returning user in again while Firebase still has them (7.2); `POST /api/v1/login-links` on the GeekyKey Service (8.6) and `POST /auth/login-link` on the Event Service (7.4), with the error `invalid_login_link` (401), so the event buttons log the user in on the Event screens as the same user; the login link's format and key, derived from the Event Service key (11.9); `PATCH /api/v1/me` on the Event Service (8.7) and `user.has_name` on its `GET /api/v1/me` (8.1). **Changed:** a new user with no name is `Guest`, not `GeeksHacking member`; a name the user set is never replaced by a login; `gk_session` holds the login's name as well as the user ID. Section 12 lets users set their name, and says a guest can't become a Google account; leaderboards stay out of scope. Section 13 sets the wording for "Continue as guest", the name prompt and an expired link. One open question closed. |
| 2026-10-21 | The GeekyKey Service's `POST /auth/firebase` (7.2) is `Implemented`. It checks the ID token with the same code as the Event Service's (`packages/firebase-login`), then sets `gk_session` the same way as `POST /auth/dev-login`. Until the login links, the session holds only the user ID. Its `GET /api/v1/me` (8.4) moves from checkpoint 6 to checkpoint 5 and is `Implemented`, since the GeekyKey screens can't tell whether someone is logged in without it. Its shape doesn't change, so screens built against the mock keep working. `events` lists each Event Service with a public address, which is now an optional `public_url` in the GeekyKey Service's `EVENT_SERVICES` setting. Section 13, and the error table, give `invalid_token` the same sentence as `login_unavailable`, "Couldn't log you in. Try again.", which Ethan approved on 20 Oct. Section 3 tags `POST /auth/firebase` `Implemented` on both services. No shape changes (BAC-55). |
| 2026-10-21 | The Event Service's `PATCH /api/v1/me` (8.7) is `Implemented`, and its `GET /api/v1/me` (8.1) and `POST /auth/firebase` (7.2) no longer change at checkpoint 5. A user can set the name the event shows, trimmed and 1 to 30 code points; `GET /api/v1/me` gives `user.has_name`, `false` while the name is the default, and `true` for a name the user set, even `Guest`; a new user whose login has no name is `Guest`, not `GeeksHacking member`; and a login never replaces a name the user set. Users who already had `GeeksHacking member` become `Guest`, so the passport asks them for a name. 8.7 now says where a refused name's issue goes, and that `rate_limited` waits for checkpoint 7. 7.2 keeps its checkpoint 5 tag, since the GeekyKey Service's half, the name in `gk_session`, waits for BAC-59 (BAC-60). |
| 2026-10-21 | Login links are `Implemented` on both services: the GeekyKey Service's `POST /api/v1/login-links` (8.6) and the Event Service's `POST /auth/login-link` (7.4), with the format and key in 11.9. Both make and read the link with the same code, `packages/login-link`, which reads a link built by hand from 11.9's recipe, so another team's Event Service checking by it agrees. `gk_session` now holds the login's name next to the user ID, so 7.2 is `Implemented` on both services, with no change still to come. A `gk_session` from before, which held only the user ID, no longer reads, and the screens log the user in again as 7.2 says; nobody uses the GeekyKey screens on production yet. The Event Service keeps each used link's `jti` in a new table, `used_login_links`, for a minute past the link's expiry, so a link checked just before it expires can't be used a second time a moment after. 8.6 now says its `rate_limited` waits for the GeekyKey Service's rate limits at checkpoint 6. No shape changes (BAC-59). |
| 2026-10-21 | Section 13 sets the "Demo data" notice's wording, which the screens had written for themselves, and says My tokens offers no Release until 8.3 is live, since its list comes from the service and a Release would still go to the sample data. No endpoint or shape changes (FRO-56). |
| 2026-10-22 | Ethan, the screens owner, approved version 0.5, so it is no longer a draft. No endpoint or shape changes (FRO-60). |
| 2026-10-22 | Section 13 sets the warning a guest sees before signing out on the GeekyKey screens. Signing out ends a guest's Firebase sign-in for good, so their tokens stay claimed and their stamps stay with a user ID nobody can log in as again; a GeekyKey admin at the desk releases the tokens (8.3). A Google or GeeksHacking user isn't asked. No endpoint or shape changes (FRO-62). |
| 2026-10-22 | The GeekyKey Service's token lookup, `GET /api/v1/tokens/{uid}` (8.5), is `Implemented`. It takes `{uid}` in any separator style and answers with the normalised UID. It asks the claims stand-in who owns the token. When the owner is the user, it also reads the user's own tokens for `claimed_at`. Both calls share one 4-second deadline, as on `/me`. When the stand-in doesn't answer properly within it, the lookup answers `503 claims_unavailable`. A token released between the two calls reads as `nobody`, which 8.5 now says. Only a GeekyKey admin gets `owner_id`, and the service checks `GEEKYKEY_ADMINS` on every request. Its `rate_limited` waits for the rate limits later in checkpoint 6. Section 2's `400` row now names the path as well as the body and query, and [Token UID](#token-uid) says a UID in a path is percent-encoded, so one typed with `/` between its bytes still arrives whole. Nothing calls it yet: the GeekyKey screens switch their token calls to the service in FRO-70. No shape changes (BAC-66). |
| 2026-10-22 | Section 13 says My tokens offers no claim-by-code form until 8.2 is live, since its list comes from the service and a claim would still go to the sample data. No endpoint or shape changes (FRO-30). |
| 2026-10-22 | The GeekyKey Service's claim, `POST /api/v1/tokens/{uid}/claim` (8.2), is `Implemented`. It takes `{uid}` in any separator style and answers with the normalised UID. It reads the user's own tokens from the claims stand-in, then asks the stand-in to claim the token, with one 4-second deadline for both calls, and runs 8.2's checks in their stated order. The limit is a new setting, `MAX_TOKENS_PER_USER`, set to 3. Nobody is exempt, GeekyKey admins included. When the stand-in doesn't answer properly in time, the claim answers `503 claims_unavailable`. The stand-in may have saved the claim before its answer went wrong. Then the claim stands, and trying again answers `200`, as 8.2 and section 8's opening now say. 8.2's errors now list `unauthenticated`, which section 2 already implied. They also list `claims_unavailable`, which section 8's opening already gave it. Its `rate_limited` waits for the rate limits later in checkpoint 6. Nothing calls it yet: the GeekyKey screens switch their token calls to the service in FRO-70. No shape changes (BAC-68). |
| 2026-10-22 | The GeekyKey Service's station limit is `Implemented`: each station gets 60 requests a minute, taps and heartbeats together, then `429 rate_limited` with `Retry-After: 60`. [Rate limits](#rate-limits) now says it counts a request by the key it sends, before the key is checked, so a wrong key is counted too and gets `429` once over, and that a request with no key isn't counted. It also says the GeekyKey Service's limits are approximate, since Cloudflare counts them in each data centre. 6.1 and 6.2 point their `rate_limited` at it, and 6.2 says a wrong key gets `401` until it's over the limit. The user limits are still `Checkpoint 6`. No shape changes (BAC-67). |
| 2026-10-22 | The GeekyKey Service's release, `DELETE /api/v1/tokens/{uid}` (8.3), is `Implemented`. It takes `{uid}` in any separator style. An owner releases their own token. A GeekyKey admin releases someone else's by naming the owner in `owner_id`, and the service checks `GEEKYKEY_ADMINS` on every request. The claims stand-in deletes the claim only while that owner still holds it, so a release for an owner who no longer holds the token answers `404 not_found` and leaves any newer claim alone. Every release writes a `token_released` log line with the UID, the owner and who released it, as user IDs. When the stand-in doesn't answer properly within 4 seconds, the release answers `503 claims_unavailable`. The stand-in may have deleted the claim before its answer went wrong, as 8.3 and section 8's opening now say, so that answer's `claims_unavailable` log line names the UID and the owner as well. 8.3's errors now list `unauthenticated`, `validation_failed` and `rate_limited`, which section 2 already implied, and `claims_unavailable`, which section 8's opening already gave it. An `owner_id` must be 1 to 128 characters, as a user ID is in 11.2. Its `rate_limited` waits for the rate limits later in checkpoint 6. `GEEKYKEY_ADMINS` on production lists Adam, for checkpoint 6's proof. Nothing calls it yet: the GeekyKey screens switch their token calls to the service in FRO-70. No shape changes (BAC-69). |
| 2026-10-22 | 7.2's `authDomain` is the page's own address, no longer `geekykey-b035a.firebaseapp.com`, except on `localhost`. Each set of screens' Worker forwards Firebase's sign-in pages, `/__/auth/*` and `/__/firebase/init.json`, to `https://geekykey-b035a.firebaseapp.com`, so Google's sign-in names `event.geekshacking.com` or `key.geekshacking.com`. The services don't change: the ID token's audience is still the project ID. A change within 0.5, which Ethan approves in its pull request. No endpoint or shape changes (FRO-72). |
| 2026-10-22 | The GeekyKey Service's user limits are `Implemented`. Each user gets 60 requests a minute to its API, and 20 token lookups and claims, which count toward the 60 as well. Either one, once passed, answers `429 rate_limited` with `Retry-After: 60`, as the station limit does. [Rate limits](#rate-limits) now says what counts: every `/api/v1` request with a session, by user ID, even one that fails its checks, but not `/auth/*` and not a request with no session, which still gets `401 unauthenticated`. A user over the 20 can still use `/me`, the release and login links. 8.2, 8.3, 8.5 and 8.6 point their `rate_limited` at it instead of at checkpoint 6, and 8.4's errors list `rate_limited`. No shape changes (BAC-70). |
| 2026-10-22 | The GeekyKey screens now send the token lookup, the claim and the release to the GeekyKey Service. Section 13 drops the token page's "Demo data" sentence for a build with the service behind it, and the rule that kept Release and the claim-by-code form off My tokens until 8.2 and 8.3 were live. Only a GeekyKey screens build with no service behind it still shows a notice. No endpoint or shape changes (FRO-70). |
| 2026-10-22 | Section 13 sets what the organiser's CSV download says and which file it hands over. The download is the file the service sent, unchanged, unless a name needed escaping, and only that name changes. The summary says the rule under the Download CSV button, and says when a file was changed that it is not the service's own. No endpoint or shape changes (FRO-48). |
| 2026-10-25 | The Event Service's station board, `GET /api/v1/admin/stations` (9.2), is `Implemented`. It lists every station the Event Service has registered, disabled ones too. A station is `online` while it was last heard from less than 120 seconds ago, as the Event screens' mock already counts it. Its `last_tap_at` is the newest stored tap it sent, of any status. A QR fallback (9.4) doesn't count, since an organizer logs it, so a station whose reader died still shows a stale last tap. 9.2 now lists its errors. Section 9's opening already gave every organizer endpoint `unauthenticated` and `forbidden`, and `rate_limited` waits for the Event Service's rate limits. Nothing calls it yet: the organizer screens switch to the Event Service in FRO-79. No shape changes (BAC-73). |
| 2026-10-25 | Creating a station, `POST /api/v1/admin/stations` (9.7), and replacing its key, `POST /api/v1/admin/stations/{id}/key` (9.8), are `Implemented`. Each answers the station as the board lists it, with its key, which is in that answer only. The registered stations (11.1) carry the new key's hash at once. 9.7's `label` is trimmed, then must be 1 to 80 code points, as 8.7 counts a name. The Event screens' form and mock allow 80 UTF-16 units, so every label they send passes. A replaced key leaves a disabled station disabled, as the mock already does. Each change writes one log line, `station_created` or `station_key_replaced`, with the organizer's user ID and the station's ID. 9.7 and 9.8 now list their errors. Nothing calls them yet: the organizer screens switch to the Event Service in FRO-79. No shape changes (BAC-74). |
| 2026-10-25 | Disabling and enabling a station, `POST /api/v1/admin/stations/{id}/disable` and `/enable` (9.9), are `Implemented`. Each answers the station as the board lists it. A disabled station drops off the registered stations (11.1), and enabling puts it back with the same key. Its passport settings and stamps stay either way. Doing either twice answers `200` with the station as it was, so a second disable keeps the first `disabled_at`, as the Event screens' mock already does. Each change writes one log line, `station_disabled` or `station_enabled`, with the organizer's user ID and the station's ID, and a repeat writes none. 9.9 now lists its errors. Nothing calls them yet: the organizer screens switch to the Event Service in FRO-79. No shape changes (BAC-75). |
| 2026-10-25 | Adding a station to the passport or changing its settings, `PUT /api/v1/admin/stations/{id}/passport` (9.1), is `Implemented`, without the booth, which comes with the map's data. A station added takes the last stamp slot, and a change keeps its `added_at`, so its slot never moves. 9.1 now says how the Event Service checks the body. It trims `name` and `location` and counts them in code points, as 9.7 counts a label: `name` must be 1 to 80, and `location` at most 80. A blank or `null` `location` means none. Every request sets all three fields, so leaving out `location` clears the location, and leaving out `points` sets the points back to 1. The Event screens' mock checks names and locations in UTF-16 units, so every name and location it sends passes. **New limit:** `points` must fit a 32-bit integer, at most 2147483647. The mock and the form have no upper limit, so a larger number passes the mock and gets `validation_failed` from the service. 9.1 now lists every error an organizer endpoint can get, and says a disabled station can be added. Each add or change writes one log line, `station_added_to_passport` or `station_passport_changed`, with the organizer's user ID and the station's ID, and a save that changes nothing writes none. No shape changes. Nothing calls it yet: the organizer screens switch to the Event Service in FRO-79 (BAC-76). |
| 2026-10-25 | The scan log, `GET /api/v1/admin/taps` (9.3), is `Implemented`. It lists stored taps of all three statuses and both sources, newest first by `id`, with no token ID. A tap's `id` always rises, since the taps table uses `AUTO_ID_CACHE=1`, so the cursor and the live feed stay in time order. 9.3 now says that `next_before_id` is the `id` of the last tap in `taps`, as the Event screens' mock already gives it. Its example said `41` after a page ending at tap 42, and by the "lower than" rule that would have skipped tap 41, so it now says `42`. 9.3 also says the filters and the cursor apply together, and that a `station_id` that isn't this Event Service's gives an empty list. A query outside the table, such as a `limit` of 201 or an empty `before_id`, gets `validation_failed`. The mock clamps the limit instead, but the screens always send 50. 9.3 now lists its errors. No shape changes. Nothing calls it yet: the organizer screens switch to the Event Service in FRO-79 (BAC-77). |
| 2026-10-26 | The QR fallback, `POST /api/v1/admin/taps` (9.4), is `Implemented`. It stores the tap through the station taps' pipeline with `source = qr_fallback`, so the cooldown, stamps and points treat it as a station's tap. A station without passport settings, or one this Event Service didn't register, gets `not_found`, so a QR fallback tap is never `no_game`. **New limit:** the Event Service trims `user_id`, which must then be 1 to 128 characters, as in the hand-off. The Event screens' form trims it and allows 128, so every ID it sends passes, but the mock has no upper limit. **New rule:** a disabled station with passport settings takes a QR fallback tap too, and the tap counts at once, as the mock already allows. The `client_tap_id` is a random UUID and `tapped_at` is `null`, as the mock already stores them. Each one writes a `qr_fallback_logged` log line with the organizer's user ID, and the tap's own `tap_stored` line now carries its `source`, so a restore rebuilds it as a QR fallback. 9.4 now lists its errors. No shape changes. Nothing calls it yet: the organizer screens switch to the Event Service in FRO-79 (BAC-78). |
| 2026-10-26 | The stats, `GET /api/v1/admin/stats` (9.5), and the export, `GET /api/v1/admin/export.csv` (9.6), are `Implemented`, with no token ID in either. 9.5 now says that `accepted_taps` and `unique_participants` count `accepted` taps only, as the summary screen's hint says, and that a passport station with no taps, or a disabled one, is listed with its counts. The Event screens' mock lists every station, naming one outside the passport by its label, but the agreement has always listed passport stations only, so the live screen shows fewer rows than the mock. 9.6 now says the rows run oldest first by `tap_id` after a line of column names, and how a value is quoted. **New rule:** every line ends in CRLF, as RFC 4180 has it, where the mock ends lines with a line feed alone. The screens' formula escaping reads both. The file is named `geekykey-taps.csv`, which the screens replace with their own name when they save it. Both now list their errors. No shape changes. Nothing calls them yet: the organizer screens switch to the Event Service in FRO-79 (BAC-79). |
| 2026-10-26 | The Event Service's limit is `Implemented`: each user gets 60 requests a minute to its API, then `429 rate_limited` with `Retry-After: 60`, as on the GeekyKey Service. Each server instance counts in its own memory, so with two running, a user can get up to 120 a minute through. [Rate limits](#rate-limits) now says what counts, matching the GeekyKey Service's user limit: every `/api/v1` request with a session, by user ID, even one that fails its checks. `/auth/*`, the hand-off routes and a request with no session aren't counted. A user's minute starts at their first request, and an organizer's polls of the station board and the scan log use at most 18 of the 60. Each turned-away request writes a `rate_limited` log line with the user's ID. 8.1 now lists `rate_limited`, and 8.7 and 9.1 to 9.9 no longer say it waits for checkpoint 7. The screens already keep their last data on a `429` (section 13). No shape changes (BAC-80). |
| 2026-10-26 | Version 0.6 (draft): the map on the big screen at our booth, as checkpoint 7 of the [migration spec](../.scratch/db-hosting/spec.md) settled on 23 Oct. **New:** `GET /api/v1/map` (9.10), `Checkpoint 7`, giving each passport station in stamp-slot order with its passport name, booth, whether it is disabled, its `accepted` and `cooldown` taps, its unique participants and its last tap's time, and no user ID, name or token UID. Organizers may read it, and so may the users on a new setting of the Event Service, the map screen list ([Who calls what](#who-calls-what)). Anyone else signed in gets `forbidden`. The screen polls it every 2 seconds, which uses 30 of the user's 60 requests a minute. **New field:** `booth`, optional, in passport settings (9.1) and the station board's `passport` (9.2), at checkpoint 7. It is free text, at most 80 code points, matched by the screen to a booth name in its own floor plan, and `location` stays the text participants read. Like `location`, a save that leaves it out clears it. Until it's built, the Event Service ignores `booth` and leaves it out of its answers. A map screen isn't a `role`: its `/me` says `participant`. Section 13 adds the map. Connections stay out of scope until their own change to section 12 (BAC-81). |
| 2026-10-26 | The Event screens now send every organizer call to the Event Service: the station board and its changes (9.1, 9.2, 9.7 to 9.9), the scan log (9.3), the QR fallback (9.4), the stats (9.5) and the export (9.6). Section 13 drops the organiser screens' "Demo data" sentence for a build with the service behind it. Only a build with no service behind it still shows a notice, and a screen built later, such as the map (9.10), follows the same rule until its endpoints are live. No endpoint or shape changes (FRO-79). |
| 2026-10-26 | The map's data, `GET /api/v1/map` (9.10), is `Implemented`, and so is `booth` in passport settings (9.1) and the station board (9.2), so neither changes at checkpoint 7 any more. The Event Service trims `booth` and counts it in code points, as it does `location`: at most 80, with a blank or `null` booth answered as `null`. A save that changes only the booth writes a `station_passport_changed` log line. The map lists each passport station in stamp-slot order, disabled ones too. `taps` counts its `accepted` and `cooldown` taps from the station and the QR fallback, `unique_participants` counts the users with an `accepted` tap there, and `last_tap_at` is the newest of the counted taps. The Event Service's map screen list is its `MAP_SCREENS` setting, user IDs separated by commas and read when it starts, as `ORGANIZERS` is. It starts empty on staging and production. A map screen gets `forbidden` from every organizer endpoint, and its `/me` says `participant`. No shape changes (BAC-84). |
| 2026-10-26 | Ethan, the screens owner, approved version 0.6 in its pull request (#148), so it is no longer a draft. No endpoint or shape changes (BAC-81). |
| 2026-10-26 | 6.1's step 4 and 11.5 say the 4-second deadline also covers refreshing the GeekyKey Service's copy of the registered stations, not only filling an empty one. A station request now waits for a list more than a minute old before its key is checked, so a disabled station's key gets `401` within a minute on every Worker isolate, as 9.9 says, and a new station's key works within a minute, as 9.7 says. Before, a Worker that had sat idle answered once from its old list, and BAC-85's proof saw a disabled key accepted 61.7 seconds after the disable. A refresh that uses up the deadline answers `503 event_service_unavailable`. No shape changes (BAC-87). |
| 2026-10-27 | 9.6 and section 13 say the screens escape any value a spreadsheet could run as a formula, not only a name. A `user_id` typed for a QR fallback and a station's `client_tap_id` are free text too, and the screens already escaped them. Section 13's two sentences under the Download CSV button say "value" where they said "name". No endpoint or shape changes (FRO-82). |
| 2026-10-27 | 6.2 says a station may hold a heartbeat back by at most 30 seconds while it answers taps, so two heartbeats can be up to about 90 seconds apart. Ours waits while a result shows and for 2 seconds after one. No endpoint or shape changes (HAR-19). |
| 2026-10-27 | Our Event Service runs the grad tea on 12 November 2026, then the showcase, one event at a time with its data cleared between them (section 12, and the table at the top). The showcase is on 17 November 2026, not 18 November, as the scope now says. No endpoint or shape changes (BAC-88). |
| 2026-10-28 | Version 0.7, a draft for Ethan's review, with BAC-90's change and BAC-89's together. Each station runs one of the event's games, or none (section 4, "Games"). 9.2 lists the games organizers can choose from, and gives each station its `game` and `game_fixed`. The new 9.11 sets a station's game. The game is fixed once a game has counted or held back a tap there, and a change then answers the new `409 station_has_taps`, with the station board's sentence in section 13. Stamp slots are now the stations that run the passport and have its settings, in 8.1, 9.3, 9.4, 9.5, 9.6 and 9.10, so a station that keeps its settings but runs another game has no passport name in any of them. 9.1 gives a station with no game the passport, so the station board's "add to the passport" still makes a station count. The migration gives every station with passport settings the passport, so taps are judged as before. 9.10 lists every station with its `game`, the stamp slots first, so the map can draw connection points (BAC-90). The booth moves onto the station: 9.2 gives each station's `booth`, and the new 9.12 sets it at any time. 9.1's `booth` sets the same value, and a request that leaves it out no longer clears it. `passport.booth` stays, with the same value, and 9.10's `booth` is the station's. A change of booth, through 9.1 or 9.12, writes a new log line, `station_booth_changed` (BAC-89). No field is removed. |
| 2026-10-28 | Version 0.8, a draft for Ethan's review: a passport station can give the group's page with its stamp (BAC-99). 9.1 takes an optional `link`, trimmed, which must be a URL that starts with `https://`, at most 300 code points. Any other link gets `validation_failed`. A blank or `null` link is none, and a request that leaves it out clears it, as `location` does. 9.2 gives it as `passport.link`, and 8.1 gives it with each stamp as `stamps[].link`, or `null`. Section 13 has the button the passport shows after a new stamp with a link, "Open their page?". A new nullable column holds it, so the version still running keeps working while it deploys. No field is removed. |
| 2026-10-28 | Ethan, the screens owner, approved versions 0.7 and 0.8, so neither is a draft any more. No endpoint or shape changes (BAC-90, BAC-99). |
| 2026-10-30 | 9.10 says the screen may pulse a station once for each new tap rather than once a poll, and that ours plays up to 3 a poll. No endpoint or shape changes (FRO-102). |
| 2026-10-30 | Version 0.9, a draft for Ethan's review: a tap's result can carry what the station's game has the station show (BAC-111). Each item in 6.1's and 11.2's `results` can carry two optional fields: `lines`, one or two lines of 0 to 16 printable ASCII characters, and `complete`, `true` on the tap that finishes the game. Ours gives them with `accepted` and `cooldown` only. The passport's lines are the participant's progress, by the first word of their name while they have one of their own, and the tap that earns the last stamp has `complete`. The GeekyKey Service passes them on unchanged, and a line that breaks the rules fails the request with `503 event_service_unavailable`, as a bad status does. The firmware contract says how the station shows them, and a station that ignores them keeps working. Their JSON Schema is in `packages/handoff/json-schema/taps-answer.schema.json` (11.7). No field is removed. |
| 2026-10-30 | Ethan, the screens owner, approved version 0.9, so it is no longer a draft. No endpoint or shape changes (BAC-111). |
| 2026-10-30 | 6.1 and 11.2 say the GeekyKey Service passes `lines` and `complete` to the station only with `accepted` and `cooldown`, and leaves them out with any other status, even another team's own. Before, it passed them with any status, and only our Event Service kept to the two. No shape changes (BAC-111). |
