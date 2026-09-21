# GeekyKey API Agreement

Contract between the event backend (`apps/backend`) and its clients: the React
frontend (`apps/frontend`) and the ESP32 reader stations.

| | |
|---|---|
| Version | 0.1 (draft) |
| Date | 18 September 2026 |
| Backend owner | Adam |
| Frontend owners | Joshua, Ethan |
| Station firmware owner | Zi Tao |
| Scope | MVP only. See [Out of scope](#10-out-of-scope-for-the-mvp). |

**Status legend used throughout**

| Tag | Meaning |
|---|---|
| `Implemented` | Live in `apps/backend` with tests. Shape is stable; changes need a PR that also edits this file. |
| `Sprint 1` | Committed for Sprint 1 (21 Sep to 4 Oct). Shape is agreed; fields may still be added. |
| `MVP` | Committed before the Sprint 2 A/B test (5 to 18 Oct). Shape is proposed; expect small changes. |

---

## 1. How to use and change this document

- The frontend builds against the shapes here, not against the backend source. If the backend
  differs from this file, the file wins and the backend is fixed.
- Changing an `Implemented` endpoint requires a pull request that edits this file and gets a
  review from both a backend and a frontend owner.
- `Sprint 1` and `MVP` endpoints can be refined in a pull request from either side. Record the
  change in the [changelog](#13-changelog).
- Fields are only ever added, never renamed or removed, within `/api/v1`.

---

## 2. Conventions

### Base URLs

| Environment | Base URL |
|---|---|
| Local backend | `http://localhost:8000` |
| Local frontend (assumed Vite default) | `http://localhost:5173` |
| Production | To be decided after hosting is confirmed with GeeksHacking |

All resource endpoints live under `/api/v1`. Auth endpoints live under `/auth` because they are
browser redirects, not JSON resources. Health is at `/api/health`.

### Wire format

- JSON request and response bodies, `Content-Type: application/json`, UTF-8.
- Keys are `snake_case` in JSON. Internally the backend uses camelCase; the frontend should not
  care.
- IDs are opaque strings. Do not parse them. The only numeric ID is `taps.id`, used as a
  pagination cursor.
- Timestamps are ISO 8601. The backend always **returns** UTC with milliseconds, for example
  `2026-10-10T09:00:00.000Z`. Clients may **send** any ISO 8601 string with an offset; the
  backend normalises it.
- Absent optional fields are omitted in requests and returned as `null` in responses.

### HTTP status codes

| Code | When |
|---|---|
| 200 | Successful read, or a write that is idempotent (taps, pairing an already-paired token) |
| 201 | A new resource was created |
| 204 | Successful delete or logout, no body |
| 400 | Body or query failed validation. Body contains `issues` |
| 401 | Not authenticated, or a station key is missing or invalid |
| 403 | Authenticated but the role is not allowed |
| 404 | Resource does not exist or is not visible to this user |
| 409 | Conflict with existing state, for example a UID paired to someone else |
| 500 | Backend bug. Frontend should show a generic error and log the request ID if present |

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

`error` is a stable snake_case code the frontend can switch on. `issues` is present only for
`validation_failed` and follows Zod's issue format.

| `error` code | HTTP | Meaning |
|---|---|---|
| `validation_failed` | 400 | See `issues` |
| `unauthenticated` | 401 | No valid session cookie |
| `missing_station_key` | 401 | No `Authorization: Bearer` header on a station endpoint |
| `invalid_station_key` | 401 | Station key not recognised |
| `forbidden` | 403 | Role not permitted |
| `not_found` | 404 | |
| `uid_already_paired` | 409 | Token belongs to another user |
| `internal_error` | 500 | |

### CORS and cookies

The frontend runs on a different origin during development, so:

- The backend allows the configured frontend origin with credentials.
- Every frontend request must be sent with `credentials: "include"` (fetch) or
  `withCredentials: true` (axios). Without this the session cookie is not sent and every call
  returns 401.
- The session cookie is `HttpOnly`. The frontend cannot and should not read it.

---

## 3. Roles and authentication

### Three callers

| Caller | Identified by | Typical client |
|---|---|---|
| Participant | Session cookie, `users.role = participant` | Mobile web dashboard |
| Organizer | Session cookie, `users.role = organizer` | Admin dashboard, QR fallback scanner |
| Station | `Authorization: Bearer gk_sta_…` | ESP32 reader, or the mock station script |

The user ID is always taken from the session. It is never accepted in a request body. An
endpoint that "acts on the current user" means the user behind the cookie.

### Browser sessions

A session is an `HttpOnly`, `SameSite=Lax` cookie named `gk_session`. It is set by exactly two
routes and the frontend code is identical whichever one set it:

- `GET /auth/callback` after the GeeksHacking portal OIDC round trip. `MVP`, blocked on the
  portal integration meeting.
- `POST /auth/dev-login` in local development only. `Sprint 1`. This exists so the frontend can
  build every screen before the portal integration lands, without any code that has to be
  removed later.

"Am I logged in?" is answered by calling `GET /api/v1/me`. A 401 means no.

### Station keys

Each physical station has one key, created by an organizer through
`POST /api/v1/admin/stations`. The key is shown once and only its hash is stored. Firmware sends
it on every request as `Authorization: Bearer <key>`. A station never receives any information
about a participant beyond a tap status, in line with the privacy row of the risk assessment.

---

## 4. Shared vocabulary

### Token UID

The NFC tag's hardware UID as hex. The backend normalises on input by stripping anything that
is not a hex digit and upper-casing, so `04:a1:b2:c3:d4:e5:f6` and `04A1B2C3D4E5F6` are the
same token. After normalisation a UID must be 4 to 10 bytes, that is 8 to 20 hex characters.
The backend always returns the normalised form.

### `tap_status`

| Value | Stored | Meaning |
|---|---|---|
| `accepted` | yes | Valid tap. Counts for stamps and points |
| `cooldown` | yes | Same user tapped the same station again inside the cooldown window. Recorded, does not count |
| `unknown_token` | yes | UID not paired to any user, or revoked. Recorded so organizers can see it |
| `duplicate` | no | The `client_tap_id` was already received. Nothing written. Returned only to stations |

The cooldown window is a backend setting, default 300 seconds. The frontend never needs to
compute it.

### `tap_source`

| Value | Meaning |
|---|---|
| `nfc` | From a reader station |
| `qr_fallback` | Entered by an organizer through the admin QR fallback |

### `role`

`participant` or `organizer`.

### Stamps and points

Derived by the backend from accepted taps. The frontend displays them and never calculates them.

- A user has a **stamp** for a station once they have at least one `accepted` tap there.
- **Points** are the sum of `station.points` over the user's accepted taps, so tapping a station
  again after the cooldown earns its points again. This is the simplest rule that keeps the
  showcase interesting and can be changed later without an API change.

---

## 5. Endpoint index

| Method | Path | Caller | Status | Purpose |
|---|---|---|---|---|
| GET | `/api/health` | anyone | `Implemented` | Liveness check |
| POST | `/api/v1/taps` | Station | `Implemented` | Ingest one or many taps |
| POST | `/auth/dev-login` | anyone, dev only | `Sprint 1` | Set a session for a seeded user |
| GET | `/api/v1/me` | Participant, Organizer | `Sprint 1` | Profile, tokens, stamps, points, history |
| POST | `/api/v1/tokens/pair` | Participant | `Sprint 1` | Bind a UID to the current user |
| POST | `/api/v1/admin/stations` | Organizer | `Sprint 1` | Create a station, returns its key once |
| GET | `/api/v1/admin/stations` | Organizer | `Sprint 1` | List stations with online state |
| GET | `/api/v1/admin/taps` | Organizer | `Sprint 1` | Recent taps, newest first |
| DELETE | `/api/v1/tokens/{uid}` | Participant | `MVP` | Unpair a lost token |
| POST | `/api/v1/admin/taps` | Organizer | `MVP` | QR fallback tap |
| POST | `/api/v1/stations/heartbeat` | Station | `MVP` | Online indicator and clock sync |
| GET | `/api/v1/admin/stats` | Organizer | `MVP` | Totals for the dashboard |
| GET | `/api/v1/admin/export.csv` | Organizer | `MVP` | Raw tap export for the A/B analysis |
| GET | `/auth/login` | browser | `MVP` | Start portal OIDC |
| GET | `/auth/callback` | browser | `MVP` | Finish portal OIDC, set cookie |
| POST | `/auth/logout` | browser | `MVP` | Clear cookie |

---

## 6. Station endpoints

### 6.1 `POST /api/v1/taps` — `Implemented`

Ingest one or many taps from the authenticated station. Live scans and offline buffer flushes
use the same call; the only difference is the array length.

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
| `taps[].tapped_at` | string, optional | ISO 8601 device time. Omit if the station has no trustworthy clock |

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

`results` is in the same order as the request. Every item has one of the four
[`tap_status`](#tap_status) values.

**Errors:** `missing_station_key`, `invalid_station_key`, `validation_failed`.

**Firmware contract**

- Remove a tap from the local buffer as soon as **any** status comes back for it, including
  `duplicate` and `unknown_token`. Only retry on a network failure or a 5xx.
- Re-sending a `client_tap_id` is always safe. It returns `duplicate` and writes nothing.
- The cooldown for an offline flush is judged by `tapped_at` when present, so buffered taps can
  be sent in any order. Without `tapped_at` the server receipt time is used, which means every
  tap in a flush by the same user at the same station after the first will be `cooldown`.
  Stations should send `tapped_at` whenever they have had a time sync.
- Suggested feedback mapping: `accepted` green, `cooldown` amber, `unknown_token` red,
  `duplicate` no change.

### 6.2 `POST /api/v1/stations/heartbeat` — `MVP`

Lets the admin dashboard show an online indicator between taps, and gives the station a
reliable clock.

**Auth:** station key.

**Request** (all optional)

```json
{ "firmware_version": "0.3.1", "buffered_taps": 0 }
```

**Response `200`**

```json
{ "station_id": "…", "server_time": "2026-10-10T09:00:00.000Z" }
```

Stations should call this on boot and every 60 seconds. A station is shown as online when its
last request of any kind was within 120 seconds.

---

## 7. Auth endpoints

### 7.1 `POST /auth/dev-login` — `Sprint 1`

Only mounted when the backend runs with `DEV_AUTH_ENABLED=true`. Never enabled in production.

**Request**

```json
{ "user_id": "dev-user-1" }
```

**Response `204`** with `Set-Cookie: gk_session=…`.

**Errors:** `not_found` if the user does not exist.

The seed script creates `dev-user-1` (participant). It will also create `dev-organizer-1`
(organizer) so both views can be developed.

### 7.2 `GET /auth/login?return_to=/passport` — `MVP`

Redirects to the GeeksHacking portal. `return_to` must be a relative path on the frontend
origin. Details depend on the portal integration meeting.

### 7.3 `GET /auth/callback` — `MVP`

Portal redirect target. Sets `gk_session`, then redirects to `return_to`. On first login the
backend creates the local user row from the portal identity.

### 7.4 `POST /auth/logout` — `MVP`

**Response `204`**, clears the cookie.

---

## 8. Participant endpoints

### 8.1 `GET /api/v1/me` — `Sprint 1`

Everything the participant dashboard and passport view need in one call.

**Auth:** session, any role.

**Response `200`**

```json
{
  "user": { "id": "dev-user-1", "display_name": "Alex", "role": "participant" },
  "tokens": [
    { "uid": "04A1B2C3D4E5F6", "paired_at": "2026-10-10T08:30:00.000Z" }
  ],
  "points": 3,
  "stamps": [
    { "station_id": "…", "name": "3D Printing Booth", "location": "Hall A", "points": 1, "earned_at": "2026-10-10T09:00:00.000Z" },
    { "station_id": "…", "name": "Cloud Sponsor",     "location": "Hall B", "points": 2, "earned_at": null }
  ],
  "recent_taps": [
    { "id": 42, "station_id": "…", "station_name": "3D Printing Booth", "status": "accepted", "source": "nfc", "tapped_at": "2026-10-10T09:00:00.000Z", "received_at": "2026-10-10T09:00:01.250Z" }
  ]
}
```

- `stamps` lists **every** station, so the passport can render empty slots. `earned_at` is
  `null` until the user has an accepted tap there.
- `recent_taps` is the user's last 50 taps of any status, newest first. Statuses other than
  `accepted` are included so a participant can see "that tap didn't count".
- `tokens` excludes revoked tokens.

**Errors:** `unauthenticated`.

### 8.2 `POST /api/v1/tokens/pair` — `Sprint 1`

Bind a physical token to the current user. Multiple tokens per user are allowed.

**Auth:** session, participant or organizer.

**Request**

```json
{ "uid": "04:A1:B2:C3:D4:E5:F6" }
```

**Response `201`** when newly paired, **`200`** when already paired to this user (idempotent):

```json
{ "token": { "uid": "04A1B2C3D4E5F6", "paired_at": "2026-10-10T08:30:00.000Z" } }
```

**Errors:** `validation_failed`, `uid_already_paired` (409) when the UID belongs to another
user and is not revoked.

Taps recorded as `unknown_token` before pairing are **not** retroactively credited in the MVP.

### 8.3 `DELETE /api/v1/tokens/{uid}` — `MVP`

Unpair a lost token. The row is kept with `revoked_at` set so history stays intact; the UID can
be paired again by anyone afterwards.

**Auth:** session, must own the token.

**Response `204`**. **Errors:** `not_found` if the UID is not paired to this user.

---

## 9. Organizer endpoints

All require a session with `role = organizer`. A participant session gets `forbidden`.

### 9.1 `POST /api/v1/admin/stations` — `Sprint 1`

**Request**

```json
{ "name": "3D Printing Booth", "location": "Hall A", "points": 1 }
```

`location` optional, `points` optional (default 1, integer 0 or more).

**Response `201`**

```json
{
  "station": { "id": "…", "name": "3D Printing Booth", "location": "Hall A", "points": 1, "created_at": "…", "last_seen_at": null, "online": false },
  "api_key": "gk_sta_DuY…"
}
```

`api_key` is returned **only** in this response. The admin UI must show it with a copy button
and a warning. There is no endpoint to read it back; to rotate, create a new station.

### 9.2 `GET /api/v1/admin/stations` — `Sprint 1`

**Response `200`**

```json
{
  "stations": [
    { "id": "…", "name": "3D Printing Booth", "location": "Hall A", "points": 1, "created_at": "…", "last_seen_at": "2026-10-10T09:00:01.250Z", "online": true }
  ]
}
```

`online` is computed by the backend: `last_seen_at` within the last 120 seconds. Poll this every
10 to 15 seconds for the status board.

### 9.3 `GET /api/v1/admin/taps` — `Sprint 1`

The live scan log, newest first.

**Query parameters**

| Name | Default | Notes |
|---|---|---|
| `limit` | 50 | 1 to 200 |
| `before_id` | none | Return taps with `id` lower than this. Cursor for "load more" |
| `station_id` | none | Filter |
| `status` | none | Filter by `tap_status` (stored values only) |

**Response `200`**

```json
{
  "taps": [
    {
      "id": 42,
      "client_tap_id": "tap-000123",
      "station": { "id": "…", "name": "3D Printing Booth" },
      "user": { "id": "dev-user-1", "display_name": "Alex" },
      "token_uid": "04A1B2C3D4E5F6",
      "status": "accepted",
      "source": "nfc",
      "tapped_at": "2026-10-10T09:00:00.000Z",
      "received_at": "2026-10-10T09:00:01.250Z"
    }
  ],
  "next_before_id": 41
}
```

`user` is `null` for `unknown_token` taps. `next_before_id` is `null` when there are no older
taps. For a live feed, poll every 5 seconds with no cursor and merge by `id`.

### 9.4 `POST /api/v1/admin/taps` — `MVP`

QR fallback. An organizer scans a participant's QR code from the portal and logs a tap on
their behalf. Goes through the same pipeline as station taps, so cooldown and stamps behave
identically, but is stored with `source = qr_fallback` for auditing.

**Request**

```json
{ "station_id": "…", "user_id": "dev-user-1" }
```

Exactly one of `user_id` or `uid` must be given, depending on what the QR encodes. The backend
generates the `client_tap_id`.

**Response `201`**

```json
{ "result": { "id": 43, "status": "accepted" } }
```

**Errors:** `not_found` for an unknown station or user. A `uid` that is unpaired yields
`status: unknown_token` with a 201, same as a station tap.

### 9.5 `GET /api/v1/admin/stats` — `MVP`

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

### 9.6 `GET /api/v1/admin/export.csv` — `MVP`

Raw taps as CSV with `Content-Disposition: attachment`. One row per tap, all statuses.

Columns, in order: `tap_id, client_tap_id, station_id, station_name, user_id, display_name,
token_uid, status, source, tapped_at, received_at`.

This is the data feed for the Sprint 2 A/B analysis, so it must not be cut from scope.

---

## 10. Out of scope for the MVP

Not exposed by the API before the showcase. Listed so nobody builds UI against them.

- Multiple events per deployment, or any event CRUD. One container is one event.
- Dual-tap connections, leaderboards, or archetype quests.
- WebSocket or server-sent events. Poll the endpoints above.
- Station key rotation or reading a key back.
- Editing or deleting taps.
- User profile editing. Display names come from the portal.

---

## 11. Frontend view to endpoint map

| Screen | Calls |
|---|---|
| Login | `GET /auth/login` in production, `POST /auth/dev-login` in development |
| Participant dashboard | `GET /api/v1/me` |
| Passport / stamp book | `GET /api/v1/me` (the `stamps` array) |
| Pair token | `POST /api/v1/tokens/pair`, then refetch `me` |
| Organizer scan log | `GET /api/v1/admin/taps`, polled |
| Organizer station board | `GET /api/v1/admin/stations`, polled |
| Organizer add station | `POST /api/v1/admin/stations` |
| Organizer QR fallback | `POST /api/v1/admin/taps` |
| Organizer summary | `GET /api/v1/admin/stats`, `GET /api/v1/admin/export.csv` |

Local setup for frontend work:

```
cd apps/backend
deno task seed      # prints a station key and creates dev-user-1
DEV_AUTH_ENABLED=true deno task dev
```

Then `POST /auth/dev-login` with `{"user_id":"dev-user-1"}` from the frontend and every other
call works with `credentials: "include"`.

---

## 12. Open questions

| Question | Owner | Needed by |
|---|---|---|
| What does the portal's participant QR code encode: user ID, or something else? Decides the `POST /api/v1/admin/taps` body | Adam with Qing Guan | Before `MVP` QR fallback |
| Portal OIDC details: issuer, client ID, which claims carry display name and role | Adam with Qing Guan | Before `/auth/login` |
| Does the station firmware persist a tap counter across power loss? If not, `client_tap_id` should be a random UUID | Zi Tao | Before first hardware test |
| Production origin for CORS | Adam | Before first deploy |

---

## 13. Changelog

| Date | Change |
|---|---|
| 2026-09-18 | Initial draft. `POST /api/v1/taps` and `GET /api/health` reflect the implemented backend; everything else is proposed. |
