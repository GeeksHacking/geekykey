# GeekyKey API Agreement

Contract between GeekyKey's two services and everything that talks to them: the ESP32 reader
stations, the two sets of screens, and other teams' Event Services. Words such as token, claim,
owner, link and hand-off mean what [`CONTEXT.md`](../CONTEXT.md) says.

| Part | What it does | Code |
|---|---|---|
| GeekyKey Service | What stations and tokens talk to. It knows each station and which event it feeds, finds each token's owner, and hands taps on | `apps/backend`, which becomes `apps/geekykey-service` at checkpoint 4 |
| Event Service | Runs one event's games. Ours runs the capstone showcase, whose first game is the passport | Inside `apps/backend` from checkpoint 3, then `apps/event-service` |
| GeekyKey screens | The token page, My tokens and the GeekyKey admin screens | `apps/geekykey-web`, new |
| Event screens | The dashboard, passport, activity and organizer screens | `apps/frontend`, which becomes `apps/event-web` at checkpoint 4 |

| | |
|---|---|
| Version | 0.2 (draft) |
| Date | 29 September 2026 |
| GeekyKey Service owner | Adam |
| Event Service owner | Adam |
| Screens owner | Ethan |
| Station firmware owner | Zi Tao |
| Scope | Up to the capstone showcase on 18 November 2026. See [Out of scope](#12-out-of-scope-for-the-showcase). |

**Status legend used throughout**

| Tag | Meaning |
|---|---|
| `Implemented` | Live in `apps/backend` with tests, as described here. Changes need a pull request that also edits this file. |
| `Implemented, changes at checkpoint N` | Live today in an older shape. This file describes the shape from checkpoint N, and says what differs until then. |
| `Checkpoint N` | Built at that checkpoint of the migration plan. The shape is agreed; fields may still be added. |

**The checkpoints.** The migration plan builds GeekyKey in eight checkpoints, one after another.
The full plan is section 6 of [the migration spec](../.scratch/db-hosting/spec.md#6-the-migration-plan).

| Checkpoint | What it delivers |
|---|---|
| 1 | Today's backend on Cloudflare Workers and TiDB, unchanged on the wire |
| 2 | The first deploy, at `https://key-api.geekshacking.com` |
| 3 | The GeekyKey Service and the Event Service drawn inside one Worker, talking only through the hand-off |
| 4 | Two Workers, one per service |
| 5 | Login through the Portal, and both sets of screens deployed |
| 6 | The GeekyKey Service's features: claiming, the GeekyKey admin endpoints, the status call, rate limits |
| 7 | The Event Service's features: the station board, passport settings, the tap log, stats, the export, the QR fallback |
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
| Stations and Event Services, to the GeekyKey Service | `http://localhost:8000` | `https://key-api.geekshacking.com` |
| Browsers, for the GeekyKey screens | `http://localhost:5174` | `https://key.geekshacking.com` |
| Browsers, for the Event Service's screens | `http://localhost:5173` | `https://event.geekshacking.com` |

Browsers only ever use their screens' hostname, which forwards `/api/*` and `/auth/*` to its
service: Vite's proxy locally, and a small Worker in front of each set of screens in
production. So the screens call relative paths, such as `/api/v1/me`, and never name a
service's address.

- A real station on the local network uses the laptop's `.local` name, such as
  `http://A-Mac.local:8000`.
- The Event Service has no public address. In production only its screens' Worker and the
  GeekyKey Service reach it, through service bindings. Locally it answers on
  `http://localhost:8001` from checkpoint 4; until then both services run inside one Worker
  on port 8000.

All resource endpoints live under `/api/v1`. Auth endpoints live under `/auth` because they are
browser redirects, not JSON resources. Health is at `/api/health`. The hand-off, which only
services call, lives under `/geekykey/v1`.

### Wire format

- JSON request and response bodies, `Content-Type: application/json`, UTF-8.
- Keys are `snake_case` in JSON. Internally the services use camelCase; the screens should not
  care.
- IDs are opaque strings. Do not parse them. The only numeric ID is `taps.id`, used as a
  pagination cursor.
- User IDs are the Portal's user IDs, the same in both services.
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
| 400 | Body or query failed validation. Body contains `issues` |
| 401 | Not authenticated, or a station key or Event Service key is missing or invalid. A disabled station's key also gets 401 |
| 403 | Authenticated but not allowed: not an organizer, or not a GeekyKey admin |
| 404 | Resource does not exist or is not visible to this user |
| 409 | Conflict with existing state: a token someone else has claimed, or a user who already holds 3 tokens |
| 429 | Too many requests from this caller in the last minute. See [Rate limits](#rate-limits) |
| 500 | A bug in a service. Screens show a generic error and log the request ID if present |
| 503 | A service this one depends on didn't answer: the Event Service during a tap, or, after the showcase, the Portal |

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
| `missing_station_key` | 401 | No `Authorization: Bearer` header on a station endpoint |
| `invalid_station_key` | 401 | Station key not recognised, or its station is disabled |
| `invalid_event_service_key` | 401 | Event Service key missing or not recognised, on the hand-off or the status call |
| `forbidden` | 403 | Not on the organizer list or the GeekyKey admin list, as the endpoint needs |
| `not_found` | 404 | |
| `token_taken` | 409 | Someone else has claimed this token |
| `token_limit_reached` | 409 | The user already holds 3 tokens |
| `rate_limited` | 429 | Sent with `Retry-After: 60` |
| `internal_error` | 500 | |
| `event_service_unavailable` | 503 | The station's Event Service didn't answer in time, or answered wrongly. The station keeps its taps and resends them |
| `portal_unavailable` | 503 | Only from the switch to the Portal's tag APIs, after the showcase. The Portal didn't answer who owns a token |

### Rate limits

`Checkpoint 6` on the GeekyKey Service, `Checkpoint 7` on the Event Service. Each limit counts a
caller's requests over one minute, and once it is passed answers `429` with
`{"error": "rate_limited"}` and `Retry-After: 60`.

| Service | Counts | Limit a minute |
|---|---|---|
| GeekyKey Service | Each station's requests, taps and heartbeats together | 60 |
| GeekyKey Service | Each user's requests to its API | 60 |
| GeekyKey Service | Each user's token lookups and claims, which also count toward the 60 | 20 |
| GeekyKey Service | Each Event Service's status calls | 120 |
| Event Service | Each user's requests to its API | 60 |

### CORS and cookies

No service sends CORS headers, and none are needed: each set of screens reaches its service
through its own hostname, so every request from the screens is same-origin, and `fetch` sends
the session cookie by default.

| Cookie | Set by | Attributes |
|---|---|---|
| `gk_session` | The GeekyKey Service | `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`, and `Secure` outside local development |
| `event_session` | The Event Service, from checkpoint 4 | The same |

- With no `Domain`, each cookie belongs only to the hostname that set it. The screens cannot
  and should not read it.
- Locally both sets of screens run on `localhost`, where cookies ignore the port, so the two
  names keep the services from overwriting each other's session.
- Every `/api/*` and `/auth/*` response carries `Cache-Control: no-store`.

---

## 3. Roles and authentication

### Who calls what

| Caller | Identified by | Talks to |
|---|---|---|
| Participant | `event_session` | The Event Service |
| Organizer | `event_session`, with a Portal user ID on the Event Service's organizer list (not `users.role`) | The Event Service |
| User | `gk_session` | The GeekyKey Service: the token page and My tokens |
| GeekyKey admin | `gk_session`, with a Portal user ID on the GeekyKey Service's admin list | The GeekyKey Service |
| Station | `Authorization: Bearer gk_sta_…` | The GeekyKey Service |
| Event Service | `Authorization: Bearer` with its Event Service key | The GeekyKey Service's status call, and the other way for the hand-off |

- The organizer list and the GeekyKey admin list are settings of their service, changed through
  a reviewed pull request and a deploy. Each is checked on every request, so removing someone
  takes effect at the next deploy. One person can be on both.
- The user ID is always taken from the session, never from a request body, except where an
  endpoint says otherwise: an organizer's QR fallback tap names the participant, and a GeekyKey
  admin's release names the owner. An endpoint that "acts on the current user" means the user
  behind the cookie.

### Browser sessions

Each service sets its own cookie, from exactly two routes, and the screens' code is identical
whichever one set it:

- `GET /auth/callback`, after the round trip through the Portal. `Checkpoint 5`, waiting on
  Qing Guan for the Portal's login details and the two OAuth apps.
- `POST /auth/dev-login`, in local development only. This exists so the screens can be built
  before Portal login lands, without any code that has to be removed later.

"Am I logged in?" is answered by calling that service's `GET /api/v1/me`. A 401 means no.
Someone who uses both sets of screens logs in to each. If the Portal remembers them, the second
login is only a quick redirect.

### Station keys

Each physical station has one key. A GeekyKey admin creates it with
`POST /api/v1/admin/stations`, and can replace it with `POST /api/v1/admin/stations/{id}/key`,
which keeps the station's ID. The key is shown once and only its hash is stored. Firmware sends
it on every request as `Authorization: Bearer <key>`.

- A GeekyKey admin can disable a station and enable it again. A disabled station's key gets
  `401 invalid_station_key`, the same as a wrong key.
- A new, replaced or disabled key takes up to a minute to take effect, because the GeekyKey
  Service keeps its list of key hashes in memory.
- A station never receives any information about a participant beyond a tap status, in line
  with the privacy row of the risk assessment.

### Event Service keys

`Checkpoint 3`. Each Event Service shares one key with the GeekyKey Service. Both directions
send it as `Authorization: Bearer <key>`: the GeekyKey Service on the hand-off, and the Event
Service on the status call.

- It is 32 random bytes, generated like a station key. Nobody picks one.
- Both sides compare it in constant time.
- Neither side ever logs it.
- The hand-off never follows a redirect, because `fetch()` sends `Authorization` on to wherever
  a redirect points, even another domain. Another team's Event Service address must start with
  `https://`.
- To replace one, set the new key on both sides outside the event. Hand-offs fail with
  `503 event_service_unavailable` until both match, and stations keep their taps and resend
  them.

Our Event Service checks the key even though only service bindings reach it, because other
teams copy it, and theirs will be on public addresses.

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
| `no_game` | Event Service | yes | Reached the event, but no game counts taps at that station, for example one without passport settings |
| `duplicate` | Event Service | no | This station already sent this `client_tap_id`. Nothing written. Returned only to stations |
| `unknown_token` | GeekyKey Service | no, only logged | Nobody has claimed this token |
| `no_event` | GeekyKey Service | no, only logged | The station feeds no event, or the tap was timed before its current link started |

- **Stored** means kept in the Event Service's taps, so only `accepted`, `cooldown` and
  `no_game` appear in the tap log, the export and `recent_taps`.
- Another team's Event Service may answer statuses of its own, which the GeekyKey Service
  passes on unchanged. A station treats any status it doesn't know as recorded.
- `no_game` and `no_event` start at checkpoint 3. Until then, today's backend stores
  `unknown_token` taps.

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
`is_geekykey_admin`.

### Stamps and points

Worked out by the Event Service from accepted taps. The screens display them and never calculate
them.

- Only stations with passport settings are stamp slots, in the order their settings were added,
  oldest first, so adding one never moves the others.
- A user has a **stamp** for a station once they have at least one `accepted` tap there.
- **Points** are the sum of the station's points over the user's accepted taps, so tapping a
  station again after the cooldown earns its points again. This is the simplest rule that keeps
  the showcase interesting and can be changed later without an API change.
- A station unlinked later keeps its stamp slot and the stamps already earned there.

---

## 5. Endpoint index

Until checkpoint 4, one Worker built from `apps/backend` serves both tables.

**The GeekyKey Service**

| Method | Path | Caller | Status | Purpose |
|---|---|---|---|---|
| GET | `/api/health` | anyone | `Implemented` | Liveness check |
| POST | `/api/v1/taps` | Station | `Implemented, changes at checkpoint 3` | Taps, one or a batch |
| POST | `/api/v1/stations/heartbeat` | Station | `Checkpoint 3` | Online light, clock, `reader_ok` |
| POST | `/auth/dev-login` | local only | `Implemented, changes at checkpoint 4` | Set `gk_session` for a user |
| GET | `/auth/login` | browser | `Checkpoint 5` | Start the Portal login |
| GET | `/auth/callback` | browser | `Checkpoint 5` | Finish the Portal login, set `gk_session` |
| POST | `/auth/logout` | browser | `Implemented` | Clear `gk_session` |
| GET | `/api/v1/me` | User | `Checkpoint 6` | The user, whether they're a GeekyKey admin, their tokens and the events to link to |
| GET | `/api/v1/tokens/{uid}` | User | `Checkpoint 6` | What the token page shows |
| POST | `/api/v1/tokens/{uid}/claim` | User | `Checkpoint 6` | Claim a token |
| DELETE | `/api/v1/tokens/{uid}` | User, GeekyKey admin | `Checkpoint 6` | Release a token |
| GET | `/api/v1/admin/stations` | GeekyKey admin | `Checkpoint 6` | Every station |
| POST | `/api/v1/admin/stations` | GeekyKey admin | `Checkpoint 6` | Create a station, key shown once |
| POST | `/api/v1/admin/stations/{id}/key` | GeekyKey admin | `Checkpoint 6` | Replace a station's key, new key shown once |
| PUT | `/api/v1/admin/stations/{id}/link` | GeekyKey admin | `Checkpoint 6` | Link a station to an Event Service, or to none |
| POST | `/api/v1/admin/stations/{id}/disable` | GeekyKey admin | `Checkpoint 6` | Disable a station |
| POST | `/api/v1/admin/stations/{id}/enable` | GeekyKey admin | `Checkpoint 6` | Enable it again |
| GET | `/api/v1/event-service/stations` | Event Service | `Checkpoint 6` | The status of the stations linked to it |

**The Event Service**

| Method | Path | Caller | Status | Purpose |
|---|---|---|---|---|
| GET | `/api/health` | anyone | `Checkpoint 4` | Liveness check |
| POST | `/geekykey/v1/taps` | GeekyKey Service | `Checkpoint 3` | The hand-off |
| POST | `/auth/dev-login` | local only | `Checkpoint 4` | Set `event_session` for a seeded user |
| GET | `/auth/login` | browser | `Checkpoint 5` | Start the Portal login |
| GET | `/auth/callback` | browser | `Checkpoint 5` | Finish the Portal login, set `event_session` |
| POST | `/auth/logout` | browser | `Checkpoint 4` | Clear `event_session` |
| GET | `/api/v1/me` | Participant, Organizer | `Implemented, changes at checkpoint 3` | Profile, stamps, points, history |
| PUT | `/api/v1/admin/stations/{id}/passport` | Organizer | `Checkpoint 7` | Add or change a station's passport settings |
| GET | `/api/v1/admin/stations` | Organizer | `Checkpoint 7` | The station board |
| GET | `/api/v1/admin/taps` | Organizer | `Checkpoint 7` | Recent taps, newest first |
| POST | `/api/v1/admin/taps` | Organizer | `Checkpoint 7` | QR fallback tap |
| GET | `/api/v1/admin/stats` | Organizer | `Checkpoint 7` | Totals for the dashboard |
| GET | `/api/v1/admin/export.csv` | Organizer | `Checkpoint 7` | Raw tap export for the A/B analysis |

---

## 6. Station endpoints

On the GeekyKey Service, at `https://key-api.geekshacking.com` in production.

### 6.1 `POST /api/v1/taps` — `Implemented, changes at checkpoint 3`

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
    { "client_tap_id": "tap-000123", "status": "accepted" },
    { "client_tap_id": "tap-000124", "status": "unknown_token" }
  ]
}
```

`results` is in the same order as the request, one per tap, with the same `client_tap_id`s. Every
item has a [`tap_status`](#tap_status).

**How a tap is answered, from checkpoint 3**

1. The GeekyKey Service finds the station from its key. A wrong key, or a disabled station's,
   gets `401`.
2. It checks the station's link. No link, a link to an Event Service no longer in its settings,
   or a tap timed before the link started gets `no_event`. This is checked before the token.
3. A token nobody has claimed gets `unknown_token`.
4. It hands every other tap to the linked Event Service in one call, the hand-off
   (section 11), and passes back the statuses it answers unchanged.
5. If the Event Service doesn't answer properly within 3 seconds, the whole request fails with
   `503 event_service_unavailable`, and the station keeps every tap in it to resend.

Until checkpoint 3, today's backend answers `accepted`, `cooldown`, `unknown_token` or
`duplicate` itself, and stores `unknown_token` taps.

**Errors:** `missing_station_key`, `invalid_station_key`, `validation_failed`,
`event_service_unavailable` (from checkpoint 3), `rate_limited` (from checkpoint 6), and
`portal_unavailable` (after the showcase).

**Firmware contract**

- Remove a tap from the local buffer as soon as **any** status comes back for it, including
  `duplicate`, `unknown_token`, `no_event`, `no_game`, and statuses you don't know.
- Re-sending a `client_tap_id` is always safe. It returns `duplicate` and writes nothing.
- On `401`, keep the taps, show a setup error, and retry at the heartbeat's pace. Once the key
  is fixed, or the station is enabled again, they still count.
- On `429`, any `5xx` including `503 event_service_unavailable`, or no answer, keep the taps and
  retry later.
- On `400`, drop that batch and print it on the serial port. Sending it again would never work,
  and it would block every tap saved after it.
- Resend saved taps at most once a minute, alongside the heartbeat, never in a loop. A new tap
  is still sent at once, with any saved taps in the same request, up to 500.
- Ignore response fields you don't know, and treat a status you don't know as recorded.
- The cooldown for saved taps is judged by `tapped_at` when present, so saved taps can be sent
  in any order, and a tap is compared with the accepted taps nearest it in time on either side,
  including ones already stored. Without `tapped_at` the receipt time is used, which means every
  tap in a flush by the same user at the same station after the first will be `cooldown`.
  Stations should send `tapped_at` whenever they have had a time sync.

**Suggested screen and LED mapping.** Each line is at most 16 characters, and the wording can
change. Show each result for about 2 seconds with its LED on, then go back to "Ready".

| Result | Screen | LED |
|---|---|---|
| `accepted` | `Tap counted!` / `Check your phone` | blue |
| `cooldown` | `Already counted` / `Try again later` | amber |
| `unknown_token` | `Not claimed yet` / `Claim on phone` | red |
| `no_event` | `Not in an event` / `Tell organizer` | red |
| `no_game` | `Not in a game` / `Tell organizer` | red |
| `duplicate` | nothing; it only happens when a saved tap is resent | none |
| any status the station doesn't know | `Tap received` | blue |
| no answer, `503` or `429` | `Not recorded` / `Please tap again`, or `Tap saved` / `Will send later` while it's saved | red |
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

### 6.2 `POST /api/v1/stations/heartbeat` — `Checkpoint 3`

Lets the screens show an online light between taps and whether the reader works, and gives the
station its clock.

**Auth:** station key.

**Request** (all optional)

```json
{ "firmware_version": "0.3.1", "buffered_taps": 0, "reader_ok": true }
```

| Field | Type | Rules |
|---|---|---|
| `firmware_version` | string | Shown to GeekyKey admins and organizers |
| `buffered_taps` | integer, 0 or more | Taps saved on the station and not yet sent |
| `reader_ok` | boolean | `false` when the NFC reader doesn't answer the station's own check. Leave it out if the station doesn't check |

**Response `200`**

```json
{ "station_id": "…", "server_time": "2026-10-10T09:00:00.000Z" }
```

- Stations call this at boot and every 60 seconds. At boot it replaces `/api/health`, because
  it also proves the station key.
- It is the station's clock: set the clock from `server_time` every time, and send `tapped_at`
  only once it has been set.
- Every 60 seconds also keeps the HTTPS connection open, since Cloudflare closes an idle one
  after 400 seconds.
- A station is shown as online when its last request of any kind was within 120 seconds.

**Errors:** `missing_station_key`, `invalid_station_key`, `validation_failed`, `rate_limited`
(from checkpoint 6).

---

## 7. Auth endpoints

Each service has its own set, on its screens' hostname. The GeekyKey Service's set `gk_session`,
the Event Service's set `event_session`. Each service has its own OAuth app on the Portal.

### 7.1 `POST /auth/dev-login` — GeekyKey Service `Implemented, changes at checkpoint 4`, Event Service `Checkpoint 4`

Only mounted when the service runs with `DEV_AUTH_ENABLED=true`, from its gitignored local
settings. Never enabled in production.

**Request**

```json
{ "user_id": "dev-user-1" }
```

**Response `204`** with `Set-Cookie` for that service's cookie.

- **The Event Service** answers `not_found` if the user does not exist. The seed script creates
  `dev-user-1` (participant) and `dev-organizer-1`, who is on the local organizer list, so both
  views can be developed.
- **The GeekyKey Service** signs in any `user_id`, because it keeps no users. `dev-organizer-1`
  is also on its local GeekyKey admin list, so the admin screens can be developed.
- Until checkpoint 4, today's backend has one dev-login, which sets `gk_session` for a seeded
  user and answers `not_found` for anyone else.

### 7.2 `GET /auth/login?return_to=/passport` — `Checkpoint 5`

Redirects to the Portal. `return_to` must be a relative path on the screens' hostname. The token
page logs in with `return_to=/t/<UID>`, so the user lands back on it.

### 7.3 `GET /auth/callback` — `Checkpoint 5`

The Portal's redirect target. It checks `state`, sets the cookie, then redirects to `return_to`.

| Service | Redirect URL | Local |
|---|---|---|
| GeekyKey Service | `https://key.geekshacking.com/auth/callback` | `http://localhost:5174/auth/callback` |
| Event Service | `https://event.geekshacking.com/auth/callback` | `http://localhost:5173/auth/callback` |

On login, the Event Service creates or updates the user's row with their display name from the
Portal. The GeekyKey Service keeps no users: its session holds only the Portal user ID.

### 7.4 `POST /auth/logout` — GeekyKey Service `Implemented`, Event Service `Checkpoint 4`

**Response `204`**, clears that service's cookie.

---

## 8. User endpoints

8.1 is on the Event Service, for participants and organizers. 8.2 to 8.5 are on the GeekyKey
Service, for any logged-in user, and are what the token page and My tokens call.

### 8.1 `GET /api/v1/me` on the Event Service — `Implemented, changes at checkpoint 3`

Everything the participant dashboard and passport view need in one call.

**Auth:** `event_session`, any role.

**Response `200`**

```json
{
  "user": { "id": "dev-user-1", "display_name": "Alex", "role": "participant" },
  "points": 3,
  "stamps": [
    { "station_id": "…", "name": "3D Printing Booth", "location": "Hall A", "points": 1, "earned_at": "2026-10-10T09:00:01.250Z" },
    { "station_id": "…", "name": "Cloud Sponsor",     "location": "Hall B", "points": 2, "earned_at": null }
  ],
  "recent_taps": [
    { "id": 42, "station_id": "…", "station_name": "3D Printing Booth", "status": "accepted", "source": "nfc", "tapped_at": "2026-10-10T09:00:00.000Z", "received_at": "2026-10-10T09:00:01.250Z" }
  ]
}
```

- `user.id` is the Portal user ID. `user.role` is worked out from the organizer list.
- `stamps` lists **every** station with passport settings, so the passport can render empty
  slots. They come in the order their settings were added, oldest first. A station without
  passport settings never appears here, even if the user has tapped it.
- `earned_at` is `null` until the user has an accepted tap at that station. After that it is
  when the Event Service **received** their first accepted tap there. For a station that was
  offline, that is when it sent the tap, not when it read the token.
- `stamps[].points` is what one accepted tap at that station is worth, not what this user has
  earned there. The user's total is `points`.
- `recent_taps` is the user's last 50 stored taps, newest first by when the Event Service
  received them. Statuses other than `accepted` are included so a participant can see "that tap
  didn't count". `station_name` is `null` for a station without passport settings.
- The user's tokens are not here. They are on the GeekyKey Service's `/me` (8.4).

Until checkpoint 3, today's backend also returns `tokens`, takes `role` from `users.role`, and
lists every station in `stamps`, in the order the stations were created.

**Errors:** `unauthenticated`.

### 8.2 `POST /api/v1/tokens/{uid}/claim` on the GeekyKey Service — `Checkpoint 6`

Claim a token for the current user, from the token page or My tokens' claim-by-code form. The
first claim wins, and a user holds at most 3 tokens.

**Auth:** `gk_session`, any user.

**Request:** no body. `{uid}` is a [Token UID](#token-uid) in any separator style.

**Response `201`** when newly claimed, **`200`** when it is already yours (idempotent):

```json
{ "token": { "uid": "04A1B2C3D4E5F6", "claimed_at": "2026-10-10T08:30:00.000Z" } }
```

**Errors:** `validation_failed`, `token_taken` (409) when someone else has claimed it,
`token_limit_reached` (409) when the user already holds 3, and `rate_limited`.

Taps turned away as `unknown_token` before the claim are not credited afterwards: they were
never stored.

### 8.3 `DELETE /api/v1/tokens/{uid}` on the GeekyKey Service — `Checkpoint 6`

Release a token, for example a lost one, so anyone can claim it again. Releasing deletes the
claim. Taps made with the token before still count.

**Auth:** `gk_session`. An owner releases their own token. A GeekyKey admin can release someone
else's by adding `?owner_id=<Portal user ID>`: the owner the token lookup (8.5) showed when the
page loaded, so a late or double click can't release a newer claim.

**Response `204`**.

**Errors:** `not_found` if the token isn't claimed by the current user, or by `owner_id` when
given; `forbidden` if someone who isn't a GeekyKey admin sends `owner_id`.

### 8.4 `GET /api/v1/me` on the GeekyKey Service — `Checkpoint 6`

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
- `events` lists each Event Service with a public address, for links such as "Open Capstone
  Showcase" on My tokens and on the token page. At the showcase there is exactly one.

**Errors:** `unauthenticated`.

### 8.5 `GET /api/v1/tokens/{uid}` on the GeekyKey Service — `Checkpoint 6`

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
| `owner_id` | The owner's Portal user ID, only for a GeekyKey admin when `owner` is `someone_else`. Otherwise `null`. A GeekyKey admin passes it to release (8.3) |

| `owner` | The token page shows |
|---|---|
| `nobody` | **Claim** |
| `you` | Your token, with **Release**, and a link to each event from `/me` |
| `someone_else` | "This token belongs to someone else", with no name. A GeekyKey admin also sees **Release** |

**Errors:** `unauthenticated`, `validation_failed`, `rate_limited`.

---

## 9. Organizer endpoints

On the Event Service. All require `event_session` for a user on the Event Service's organizer
list. Anyone else gets `forbidden`. Creating a station, its key, its link and disabling it
belong to the GeekyKey admins, in section 10.

### 9.1 `PUT /api/v1/admin/stations/{id}/passport` — `Checkpoint 7`

Add a station to the passport, or change its settings. `{id}` is the station's ID from the
station board.

**Request**

```json
{ "name": "3D Printing Booth", "location": "Hall A", "points": 1 }
```

`location` optional, `points` optional (default 1, integer 0 or more).

**Response `201`** when added, **`200`** when changed:

```json
{ "passport": { "station_id": "…", "name": "3D Printing Booth", "location": "Hall A", "points": 1, "added_at": "…" } }
```

- A station added to the passport takes the last stamp slot. Changing its settings never moves
  it.
- From then on, its taps get `accepted` or `cooldown` instead of `no_game`. Taps already stored
  as `no_game` stay as they are.
- The Event Service doesn't check that the station is linked. The station board offers this
  only for the stations on it.

**Errors:** `validation_failed`.

### 9.2 `GET /api/v1/admin/stations` — `Checkpoint 7`

The station board. The Event Service merges the GeekyKey Service's status call (11.5) with its
own passport settings and taps.

**Response `200`**

```json
{
  "status_known": true,
  "stations": [
    {
      "id": "…",
      "label": "Reader 3",
      "linked": true,
      "passport": { "name": "3D Printing Booth", "location": "Hall A", "points": 1, "added_at": "…" },
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

- The board lists every station linked to this event now, and every station with passport
  settings.
- `passport` is `null` for a linked station without passport settings. The screen shows it as
  "Not in the passport", with a button to add its settings (9.1). Its taps get `no_game`.
- `linked` is `false` for a passport station that is no longer linked. It keeps its slot and its
  stamps, and shows as "no longer linked".
- `online` is the GeekyKey Service's: the station's last request was within 120 seconds.
- `reader_ok` is `null` when the station hasn't sent one.
- `last_tap_at` is when this Event Service last received a stored tap from the station, or
  `null`.
- `status_known` is `false` when the status call failed or took more than 3 seconds. Then the
  list holds the passport stations and the stations that have sent a tap here, and `label`,
  `linked`, `last_seen_at`, `online`, `firmware_version`, `buffered_taps` and `reader_ok` are
  all `null`. The screen shows each station's status as unknown, not offline, so nobody restarts
  a healthy station.
- Suggested: stations that are offline, holding saved taps, not in the passport, or whose reader
  isn't responding go first, in red. A station that is only quiet stays uncoloured.

Poll this every 10 to 15 seconds for the station board.

### 9.3 `GET /api/v1/admin/taps` — `Checkpoint 7`

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
  "next_before_id": 41
}
```

- `user` is never `null`, but `user.display_name` is `null` for someone who has never logged in
  to this event.
- `station.name` is the station's passport name, or `null` for a station without passport
  settings.
- `next_before_id` is `null` when there are no older taps. For a live feed, poll every 5 seconds
  with no cursor and merge by `id`.

### 9.4 `POST /api/v1/admin/taps` — `Checkpoint 7`

The QR fallback, for when a tap can't go through a station, such as a reader that dies during
the event. An organizer scans a participant's QR code from the Portal, or types their Portal
user ID, and logs a tap on their behalf. It goes through the same pipeline as station taps, so
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

- `user_id` is a Portal user ID. It is accepted even if that user has never logged in to this
  event, the same as a station tap by them.
- `status` is `accepted` or `cooldown`.

**Errors:** `validation_failed`, and `not_found` for a station without passport settings.

### 9.5 `GET /api/v1/admin/stats` — `Checkpoint 7`

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
passport stations, in the order they were added.

### 9.6 `GET /api/v1/admin/export.csv` — `Checkpoint 7`

Stored taps as CSV with `Content-Disposition: attachment`. One row per stored tap, whose
`status` is `accepted`, `cooldown` or `no_game`.

Columns, in order: `tap_id, client_tap_id, station_id, station_name, user_id, display_name,
status, source, tapped_at, received_at`.

`station_name` is empty for a station without passport settings, and `display_name` for someone
who has never logged in to this event.

This is the data feed for the Sprint 2 A/B analysis, so it must not be cut from scope. The
analysis needs neither token UIDs nor taps by unclaimed tokens (Joshua, 28 Sep).

---

## 10. GeekyKey admin endpoints

On the GeekyKey Service. All require `gk_session` for a user on the GeekyKey Service's admin
list. Anyone else gets `forbidden`. Each change is logged with who made it.

Every endpoint here answers with this station object:

```json
{
  "id": "ca939e19-8216-4b95-8375-5b54e543c5f6",
  "label": "Reader 3",
  "created_at": "2026-10-01T02:00:00.000Z",
  "link": { "event_service_id": "showcase", "event_service_name": "Capstone Showcase", "linked_at": "2026-10-09T23:30:00.000Z" },
  "disabled_at": null,
  "last_seen_at": "2026-10-10T09:00:01.250Z",
  "online": true,
  "firmware_version": "0.3.1",
  "buffered_taps": 0,
  "reader_ok": true
}
```

| Field | Meaning |
|---|---|
| `label` | The device's name, such as "Reader 3". What an event calls it, such as its passport name, is the Event Service's business |
| `link` | Which Event Service the station feeds, and since when. `null` for no link. `event_service_name` is `null` if that Event Service is no longer in the settings, and its taps get `no_event` |
| `disabled_at` | When the station was disabled, or `null` while it is enabled |
| `online` | Its last request of any kind was within 120 seconds |
| `firmware_version`, `buffered_taps`, `reader_ok` | From its last heartbeat, or `null` |

### 10.1 `GET /api/v1/admin/stations` — `Checkpoint 6`

Every station, and the Event Services a station can be linked to.

**Response `200`**

```jsonc
{
  "stations": [
    // one station object, as above, per station
  ],
  "event_services": [ { "id": "showcase", "name": "Capstone Showcase" } ]
}
```

Poll this every 10 to 15 seconds.

### 10.2 `POST /api/v1/admin/stations` — `Checkpoint 6`

**Request**

```json
{ "label": "Reader 3" }
```

**Response `201`**

```jsonc
{
  "station": { /* the station object, with "link": null */ },
  "api_key": "gk_sta_DuY…"
}
```

A new station has no link. `api_key` is returned **only** in this response. The admin screen must
show it with a copy button and a warning. There is no endpoint to read it back.

**Errors:** `validation_failed`.

### 10.3 `POST /api/v1/admin/stations/{id}/key` — `Checkpoint 6`

Replace a station's key, keeping its ID and its link. The old key stops working within a minute,
and Zi Tao reflashes the station with the new one.

**Request:** no body.

**Response `200`**

```jsonc
{
  "station": { /* the station object */ },
  "api_key": "gk_sta_Qm7…"
}
```

As when a station is created, `api_key` is returned only here.

**Errors:** `not_found`.

### 10.4 `PUT /api/v1/admin/stations/{id}/link` — `Checkpoint 6`

Link a station to an Event Service from `event_services`, or unlink it.

**Request**

```json
{ "event_service_id": "showcase" }
```

`{ "event_service_id": null }` unlinks it.

**Response `200`**

```jsonc
{ "station": { /* the station object */ } }
```

- Linking or moving a station sets `linked_at` to now. Taps it saved before then get `no_event`
  when they arrive, so the admin screen warns before a move when `buffered_taps` isn't 0.
- Linking it again to the Event Service it already feeds changes nothing, so its saved taps
  still count.
- Unlinking empties the link.

**Errors:** `validation_failed` for an ID not in `event_services`, `not_found` for the station.

### 10.5 `POST /api/v1/admin/stations/{id}/disable` and `/enable` — `Checkpoint 6`

**Request:** no body.

**Response `200`**

```jsonc
{ "station": { /* the station object */ } }
```

Disabling sets `disabled_at`. Within a minute the station's key gets `401`, and the station
keeps its taps. Enabling empties `disabled_at`, and the saved taps count once they arrive.
Doing either twice changes nothing.

**Errors:** `not_found`.

---

## 11. Building an Event Service

For anyone building an Event Service, ours or another team's. The GeekyKey Service hands each
linked station's taps to its Event Service as users, and the Event Service decides what they
count for. An Event Service logs its users in through the Portal itself
([ADR 0002](../docs/adr/0002-each-service-logs-in-through-the-portal.md)).

Adding an Event Service is a reviewed pull request to the GeekyKey Service's settings: its ID,
its name, its `https://` address, and optionally a public address and name for the links on My
tokens and the token page. Its key is set as a secret on both sides. A GeekyKey admin then links
stations to it.

### 11.1 The hand-off: `POST /geekykey/v1/taps` — `Checkpoint 3`

The GeekyKey Service calls this on the Event Service once per station request, with every tap in
it that passed the GeekyKey Service's own checks.

**Auth:** `Authorization: Bearer <Event Service key>`.

**Request**

```json
{
  "station_id": "ca939e19-8216-4b95-8375-5b54e543c5f6",
  "taps": [
    { "client_tap_id": "tap-000123", "user_id": "<Portal user ID>", "tapped_at": "2026-10-10T01:00:00.000Z" },
    { "client_tap_id": "tap-000124", "user_id": "<Portal user ID>", "tapped_at": null }
  ]
}
```

| Field | Type | Rules |
|---|---|---|
| `station_id` | string | The station's ID on the GeekyKey Service |
| `taps` | array | 1 to 500 items |
| `taps[].client_tap_id` | string | 1 to 128 chars. Unique per station forever |
| `taps[].user_id` | string | The token owner's Portal user ID |
| `taps[].tapped_at` | string or `null` | The station's time for the tap, in UTC with milliseconds. `null` when the station sent none, or it was more than 5 minutes ahead or 7 days behind |

**Response `200`**

```json
{
  "results": [
    { "client_tap_id": "tap-000123", "status": "accepted" },
    { "client_tap_id": "tap-000124", "status": "cooldown" }
  ]
}
```

- One result per tap, in request order, with the same `client_tap_id`s.
- `status` is a snake_case string. Ours answers `accepted`, `cooldown`, `no_game` or
  `duplicate`. Another team's may answer statuses of its own, which the GeekyKey Service passes to
  the station unchanged.
- With several games in one Event Service, a tap gets one status: `accepted` if any game counted
  it, otherwise `cooldown` if a game held it back, otherwise `no_game`.

**Errors:** `invalid_event_service_key`, `validation_failed`.

### 11.2 Dropping replays

Every Event Service must drop replays by station ID and `client_tap_id`: a tap it has already
received answers `duplicate` and changes nothing. Stations resend saved taps, and a hand-off that
failed may still have stored some of its taps (11.3).

### 11.3 The 3-second limit

The GeekyKey Service waits 3 seconds for the answer. Each of these fails the whole station
request with `503 event_service_unavailable`, and the station keeps every tap in it to resend
later:

- no answer within 3 seconds;
- a status other than 2xx;
- a redirect, which is never followed;
- a body the response schema rejects, including results that don't match the request's taps one
  for one.

The GeekyKey Service doesn't retry. An Event Service that stored taps but answered late sees them
again when the station resends, and answers `duplicate`.

### 11.4 The Event Service key

Both sides check it as [Event Service keys](#event-service-keys) in section 3 describes. The
GeekyKey Service sends it on the hand-off, and the Event Service sends it on the status call.

### 11.5 The status call: `GET /api/v1/event-service/stations` — `Checkpoint 6`

On the GeekyKey Service, at `https://key-api.geekshacking.com`. An Event Service calls it
with its key to show its stations' health. Ours calls it over HTTPS too, not through a binding.

**Response `200`**

```json
{
  "stations": [
    {
      "station_id": "ca939e19-8216-4b95-8375-5b54e543c5f6",
      "label": "Reader 3",
      "linked_at": "2026-10-09T23:30:00.000Z",
      "last_seen_at": "2026-10-10T09:00:01.250Z",
      "online": true,
      "firmware_version": "0.3.1",
      "buffered_taps": 0,
      "reader_ok": null
    }
  ]
}
```

- Only the stations linked to the calling Event Service now.
- `reader_ok` is `null` when the station hasn't sent one.
- The GeekyKey Service sends no notice when a link changes. An Event Service learns of a station
  from this call or from its first tap.
- Give it 3 seconds. If it fails, show each station's status as unknown, not offline.

**Errors:** `invalid_event_service_key`, `rate_limited`.

### 11.6 The JSON Schema

The hand-off's request and response are Zod schemas in `packages/handoff`, from checkpoint 3.
Both our services check against them, and a JSON Schema generated from them with
`z.toJSONSchema` is for other teams.

### 11.7 What the hand-off leaves out

- The token's UID. An Event Service sees only users.
- Taps the GeekyKey Service turned away as `unknown_token` or `no_event`.
- The source. Every tap in a hand-off comes from a station; our QR fallback lives inside the
  Event Service.
- When the GeekyKey Service received the tap. The Event Service uses its own clock.
- The user's name. An Event Service that needs one asks the Portal, for example at login.

---

## 12. Out of scope for the showcase

Not exposed by the API before the showcase. Listed so nobody builds UI against them.

- Several events in one Event Service, or any event CRUD. One Event Service runs one event, and a
  station feeds one Event Service at a time.
- Dual-tap connections, leaderboards, or archetype quests.
- WebSocket or server-sent events. Poll the endpoints above.
- Reading a station key back. Replacing one is in scope, for GeekyKey admins.
- Removing a station from the passport.
- Editing or deleting taps.
- User profile editing. Display names come from the Portal.

---

## 13. Screen to endpoint map

**The GeekyKey screens** (`apps/geekykey-web`, `key.geekshacking.com`)

| Screen | Calls |
|---|---|
| Login | `GET /auth/login` in production, `POST /auth/dev-login` in development |
| Token page, `/t/<UID>` | `GET /api/v1/me`, `GET /api/v1/tokens/{uid}`, then `POST /api/v1/tokens/{uid}/claim` or `DELETE /api/v1/tokens/{uid}` |
| My tokens, the home page | `GET /api/v1/me`, `DELETE /api/v1/tokens/{uid}`, and `POST /api/v1/tokens/{uid}/claim` for the claim-by-code form |
| GeekyKey admin stations, `/admin` | `GET /api/v1/admin/stations`, polled |
| GeekyKey admin add station | `POST /api/v1/admin/stations` |
| GeekyKey admin replace key | `POST /api/v1/admin/stations/{id}/key` |
| GeekyKey admin change link | `PUT /api/v1/admin/stations/{id}/link` |
| GeekyKey admin disable or enable | `POST /api/v1/admin/stations/{id}/disable`, `/enable` |

**The Event screens** (`apps/frontend`, which becomes `apps/event-web`, `event.geekshacking.com`)

| Screen | Calls |
|---|---|
| Login | `GET /auth/login` in production, `POST /auth/dev-login` in development |
| Participant dashboard | `GET /api/v1/me` |
| Passport / stamp book | `GET /api/v1/me` (the `stamps` array) |
| Organizer scan log | `GET /api/v1/admin/taps`, polled |
| Organizer station board | `GET /api/v1/admin/stations`, polled, and `PUT /api/v1/admin/stations/{id}/passport` |
| Organizer QR fallback | `POST /api/v1/admin/taps` |
| Organizer summary | `GET /api/v1/admin/stats`, `GET /api/v1/admin/export.csv` |

- On `429`, screens that poll keep showing their last data. The token page, the claim form and My
  tokens say "Too many tries. Wait a minute and try again."
- On `token_limit_reached`, the claim says "You already have 3 tokens. Release one on My tokens
  first."

Local setup, from checkpoint 1:

```
mise run db:up         # starts TiDB in Docker, and creates and migrates the local databases
mise run seed          # prints a station key, and creates dev-user-1 and dev-organizer-1
mise run dev:backend   # the service on http://localhost:8000
```

`mise run dev:backend` turns on `DEV_AUTH_ENABLED` by itself, so no `.dev.vars` is needed. From
checkpoint 4, one `pnpm dev` at the repo root starts both services and both sets of screens. Then
`POST /auth/dev-login` with `{"user_id":"dev-user-1"}` from the screens, and every other call on
that service works.

---

## 14. Open questions

| Question | Owner | Needed by |
|---|---|---|
| What does the Portal's participant QR code encode: user ID, or something else? Decides how the QR fallback scans | Adam with Qing Guan | Checkpoint 7 |
| The Portal's login details: the issuer, each app's client ID, which claim carries the display name, and whether there is a client secret | Adam with Qing Guan | Checkpoint 5 |

Closed in 0.2:

- "Production origin for CORS": there is no CORS.
- "Does the station firmware persist a tap counter across power loss?": yes. Since its first
  version on 23 Sep, the firmware has saved its counter in flash before each tap.

Closed on 2026-10-01:

- "The Event Service's hostname": `event.geekshacking.com`, chosen by Julian.

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
