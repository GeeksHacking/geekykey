# GeekyKey API Agreement

Contract between GeekyKey's two services and everything that talks to them: the ESP32 reader
stations, the two sets of screens, and other teams' Event Services. Words such as token, claim,
owner, registered stations and hand-off mean what [`CONTEXT.md`](../CONTEXT.md) says.

| Part | What it does | Code |
|---|---|---|
| GeekyKey Service | What stations and tokens talk to. It checks each station's key against the stations the Event Services have registered, finds each token's owner, and hands taps on. A Cloudflare Worker with no database | `apps/geekykey-service` |
| Event Service | Runs one event's games, and registers that event's stations. Ours runs the capstone showcase on 17 November 2026, whose games are the passport, connections, team duels and the relay, with participant groups. A server on Google Cloud Run | `apps/event-service` |
| GeekyKey screens | The token page and My tokens | `apps/geekykey-web` |
| Event screens | The dashboard, passport, activity and organizer screens, including the station board, and the map on the big screen at our booth | `apps/event-web` |

| | |
|---|---|
| Version | 0.14 (draft) |
| Date | 14 November 2026 |
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
| 403 | Authenticated but not allowed: not on the organizer list, the map screen list or the GeekyKey admin list, as the endpoint needs. Also an organizer who joins the groups (8.13), or is put in one (9.16) |
| 404 | Resource does not exist or is not visible to this user |
| 409 | Conflict with existing state: a token someone else has claimed, a user who already holds 3 tokens, a name someone else has, or groups that can't be allocated or split as they are |
| 426 | A station asked for its socket (6.3) without asking to upgrade to a WebSocket (BAC-182) |
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
only for `validation_failed` and follows Zod's issue format. `needed` is present only for
`too_few_participants`: a whole number, how many more participants must join.

| `error` code | HTTP | Meaning |
|---|---|---|
| `validation_failed` | 400 | See `issues` |
| `unauthenticated` | 401 | No valid session cookie, or token writer key (10.4) |
| `invalid_token` | 401 | The Firebase ID token sent to log in can't be trusted: not signed by Google, for another Firebase project, or expired. The screens say "Couldn't log you in. Try again." |
| `invalid_login_link` | 401 | The login link sent to log in (7.4, or 7.5 on the GeekyKey Service) has expired, has been used already, or was changed. The Event screens say "That link has expired. Tap your token again to get back in.", and the GeekyKey screens "That link has expired. Open My tokens from the event again." (section 13) |
| `missing_station_key` | 401 | No `Authorization: Bearer` header on a station endpoint |
| `invalid_station_key` | 401 | Station key on no Event Service's registered stations, which leave out disabled stations |
| `invalid_event_service_key` | 401 | Event Service key missing or not recognised, on any request under `/geekykey/v1`, and on a station message to the GeekyKey Service (11.12, BAC-182) |
| `forbidden` | 403 | Not on the organizer list, the map screen list or the GeekyKey admin list, as the endpoint needs. Also an organizer who joins the groups (8.13), or is put in one (9.16) |
| `not_found` | 404 | |
| `token_claimed` | 409 | A GeekyKey admin tried to remove the kind of a claimed token (10.3) |
| `token_taken` | 409 | Someone else has claimed this token |
| `token_limit_reached` | 409 | The user already holds 3 tokens |
| `already_played` | 409 | The user has already played this connection's reaction test (8.11), or this duel's (8.14) |
| `too_late` | 409 | The 2 minutes to play this connection's reaction test have passed (8.11), or this duel's (8.14) |
| `answers_fixed` | 409 | The user's answers in the answers game can't change, because their first connection fixed them (8.7) |
| `name_taken` | 409 | Someone else in the event has this name (8.7), or another group has this group name (9.15). Capitals don't make a name different |
| `no_groups` | 409 | Allocate was pressed with no groups (9.17) |
| `too_few_participants` | 409 | Fewer than 2 participants have joined for each group, on Allocate or a split (9.17). The body also has `needed` |
| `groups_exist` | 409 | A split was asked for while someone is placed in a group (9.17) |
| `upgrade_required` | 426 | A request for a station's socket (6.3) that isn't a WebSocket upgrade (BAC-182) |
| `rate_limited` | 429 | Sent with `Retry-After: 60` |
| `internal_error` | 500 | |
| `event_service_unavailable` | 503 | The station's Event Service didn't answer in time or answered wrongly, or its registered stations couldn't be fetched to check the key. The station keeps its taps and resends them. From 7.5, the Event Service that made a login link didn't mark it used properly in time (11.11), and the GeekyKey screens say what they say for `invalid_login_link` |
| `login_unavailable` | 503 | Google's keys couldn't be fetched to check a Firebase ID token. The token may be fine; the screens say "Couldn't log you in. Try again." |
| `claims_unavailable` | 503 | Who owns a token couldn't be found in time: from the claims stand-in until the switch after the showcase, then from the Portal. A station keeps its taps and resends them; the screens say "Couldn't reach GeeksHacking. Try again." |
| `service_unavailable` | 503 | Sent by the Worker that serves a set of screens, under `/api` and `/auth`, when its service gave no answer at all: it was down, or failed before answering. Any answer the service does give, errors included, passes through unchanged |

### Rate limits

Every limit here is `Implemented`. Each limit counts a caller's requests over one minute, and
once it is passed answers `429` with `{"error": "rate_limited"}` and `Retry-After: 60`.

| Service | Counts | Limit a minute |
|---|---|---|
| GeekyKey Service | Each station's requests, taps and heartbeats together, and the requests that open its socket (6.3) | 60 |
| GeekyKey Service | Each user's requests to its API | 60 |
| GeekyKey Service | Each user's token lookups, claims and meetings (8.8), which also count toward the 60 | 20 |
| Event Service | Each user's requests to its API | 60, counted by each server instance |
| Event Service | Each user's polls of the relay's progress, `GET /api/v1/map/relay` (9.13), which don't count toward the 60 (BAC-184) | 90, counted by each server instance |

- The station limit counts a request by the key it sends, before the key is checked. So a wrong
  key is counted too, and over the limit it gets `429` rather than `401`. A request with no key
  isn't counted, and gets `401 missing_station_key`.
- The GeekyKey Service's user limits count by user ID every `/api/v1` request that has a session:
  `/me`, the token lookup, the claim, the release and login links. A request whose path or body
  fails its check counts too. `/auth/*` isn't counted, since there's no user ID before login. A
  request with no session isn't counted, and gets `401 unauthenticated`.
- A user over the 20 gets `429` from the lookup, the claim and the meeting only, and their other
  calls still answer until they pass the 60.
- The GeekyKey Service's limits are approximate. Cloudflare counts each one separately in each of
  its data centres, so a caller whose requests reach several can sometimes get past it.
- The Event Service's limit counts by user ID every request with a session to its `/api/v1`
  endpoints: `/me`, the name and answers change (8.1 and 8.7) and the organizer
  endpoints (section 9),
  including a participant's, which gets `403`. A request whose path or body fails its check
  counts too. `/auth/*` isn't counted, nor are the hand-off routes, which the GeekyKey Service
  calls with the Event Service key (section 11). A request with no `event_session`, or one that
  fails its signature or has expired, isn't counted, and gets `401 unauthenticated`.
- On the Event Service, a user's minute starts at their first request, and their first request
  after it ends starts a new count. An organizer's screens share one count: the station board
  polled every 10 to 15 seconds (9.2) and the scan log every 5 (9.3) use at most 18 a minute.
  The map, polled every 2 seconds (9.10), uses 30, so an organizer with all three open uses 48.
  The Groups screen, polled every 5 seconds (9.14), uses 12.
- A participant's dashboard polls `/me` every 10 seconds, and their group (8.13) every 5 seconds
  until they're placed, then every 15. While their team duels round is opening or playing, it
  polls `/me` every 3 seconds, which with the group's poll is at most 32 a minute.
- The relay's progress, `GET /api/v1/map/relay` (9.13), has a count of its own, 90 a minute,
  and doesn't count toward the 60 (BAC-184). The map polls it every second,
  which with the map's own 30 would pass the 60. Its count leaves room for those 60 polls, and
  still answers `429` to a screen polling it in a loop.
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
| GeekyKey admin | `gk_session`, with a user ID on the GeekyKey Service's admin list | The GeekyKey Service, to release other people's tokens and manage token kinds (section 10) |
| Token writer | `Authorization: Bearer gk_wri_…` | The GeekyKey Service, only to add to the list of token kinds (10.4) |
| Station | `Authorization: Bearer gk_sta_…` | The GeekyKey Service |
| GeekyKey Service | `Authorization: Bearer` with the Event Service key | Each Event Service, under `/geekykey/v1` |
| Event Service | `Authorization: Bearer` with its Event Service key | The GeekyKey Service, for station messages (11.12, BAC-182) |

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
- `POST /auth/login-link`, on the Event Service, with a login link made by the GeekyKey Service
  (7.4). `Implemented`. And on the GeekyKey Service, with a login link made by an Event Service
  (7.5), at `Checkpoint 7` (BAC-157).
- `POST /auth/dev-login`, in local development only. This exists so the screens can be built
  before the login lands, without any code that has to be removed later.

"Am I logged in?" is answered by calling that service's `GET /api/v1/me`. A 401 means no.

Firebase keeps its sign-in per hostname, so a sign-in on `key.` means nothing on `event.`. A user
reaches the Event screens from the GeekyKey screens' event buttons, which open a login link and
log them in there as the same user, without a second login. A guest can only get there that way:
a guest sign-in on `event.` would be a different guest, so the Event screens don't offer one.

The way back works the same (BAC-157). My tokens on the Event screens asks
the Event Service for a login link (8.12) and opens it on the GeekyKey screens (7.5). So a guest
whose sign-in on `key.` is gone, after a sign-out there, in another browser or after clearing site
data, still sees their own tokens while their Event session lasts.

A sign-out on the Event screens also goes through the GeekyKey screens (FRO-131). Only the
GeekyKey screens can tell a guest and release a token, so when the session came from a login link,
the Event screens log the user out (7.3) and open `/sign-out#user=<user ID>` on the GeekyKey
screens. That page warns a guest and releases their tokens (section 13). It sends anyone else back
to the Event screens' login and changes nothing: a user who isn't a guest, nobody signed in there,
or a different user from the one named. A guest with no sign-in left on `key.` can't release
anything there, so a GeekyKey admin still releases their tokens.

A guest who signs out on the GeekyKey screens is logged out of the Event screens too, so the next
person on a shared phone doesn't find their passport (FRO-144). The GeekyKey
screens open `/sign-out#user=<user ID>` on the Event screens, which log out that user (7.3) and open
the GeekyKey login. They leave a different user's session alone, so a link can't log anyone out. A
Google or GeeksHacking user's Event session stays when they sign out on the GeekyKey screens.

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
stations, the hand-off, the heartbeat hand-off, the meeting hand-off and marking a login link used
(11.11). An Event Service sends the same key the other way, with each station message (11.12,
BAC-182). It is the only request an Event Service makes to the GeekyKey
Service.

- It is 32 random bytes, written as 64 lower-case hex characters, as `openssl rand -hex 32`
  makes them. Nobody picks one.
- The Event Service compares it in constant time, on every request, since its address is
  public. The GeekyKey Service compares a station message's key with each Event Service's key in
  constant time too, and the one it matches says which Event Service sent it.
- Neither side ever logs it.
- The GeekyKey Service never follows a redirect, because `fetch()` sends `Authorization` on to
  wherever a redirect points, even another domain. Every Event Service address must start with
  `https://`. The one exception is local development, where it may be `http://` to the same
  machine, such as `http://localhost:8001`. A deployed GeekyKey Service can't reach that
  address, so the exception never applies in production.
- To replace one, set the new key on both sides outside the event. Hand-offs fail with
  `503 event_service_unavailable` until both match, and stations keep their taps and resend
  them. Station messages fail with `401 invalid_event_service_key` meanwhile, and are lost.

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
| `cooldown` | Event Service | yes | Same user, same station, inside the cooldown after a tap the same game accepted. Recorded, doesn't count |
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
  tap, as `lines` and `complete` (6.1). The passport's are the participant's progress, by name,
  and their next stop.
- The station's own game writes the rest of its screen too (BAC-181). After a
  tap it can give a `countdown` (6.1), which the station counts down itself, and it gives what the
  station shows between taps, as `idle_lines` (6.2 and 11.1). The firmware knows no games. It keeps
  only the screens it has to show alone: no Wi-Fi, a saved tap, a wrong key and setup mode
  ([ADR 0008](../docs/adr/0008-the-server-writes-the-stations-screen.md)).
- A game can also send one of its stations a station message with no tap (11.12), which the
  station shows as it shows a tap's answer (BAC-182). A game must still work
  when a message is dropped, since a station's socket (6.3) can be down.
- Each stored tap records the game that counted it or held it back, and a `no_game` tap records
  none (BAC-183). A game reads only its own taps, so an organizer can
  change a station's game at any time (9.11). A tap another game counted at a passport station
  never becomes a stamp, and a station set back to the passport shows the stamps it had. Taps
  stored before 0.14 record the game their station ran then, since until then a
  station's game couldn't change once a game had counted or held back a tap there.
- The relay runs on two stations, and people from different groups pass a transfer between them
  (BAC-184). Its rules and its record are the Event Service's: it gives no
  points, no stamp and no connection. Its lines are in 6.1, and the map reads its progress
  from 9.13. Its `id` is `relay` and its `name` is "Relay".
- Team duels runs on any station set to it. A tap opens a round or joins the open one, and the
  players' phones show the rest ([Team duels](#team-duels)). Its `id` is `team_duels` and its
  `name` is "Team duels" (BAC-155).
- Stations created before version 0.7 with passport settings run the passport.

### Connections

Added in 0.12, at `Checkpoint 7`. A connection joins two users of different kinds, or, when
organizers choose it, of different groups, and the Event Service keeps it as the connections
game's own record. The rules, from CONTEXT.md:

- A connection joins two users, never two tokens, so nobody connects to themselves, and a pair
  connects once.
- When a connection is made, the Event Service independently rolls an integer from 1 to 6 for
  each person and keeps both rolls with it. The higher roll wins, and equal rolls win for both.
  A pair plays once, and polls and repeat taps never change the rolls. Older connections have
  no dice. The answers and match stay visible, and points, the map and the memory card stay as
  they are (BAC-150; 8.1 and section 13).
- When a connection is made, the pair rolls the dice or plays the **reaction test** (BAC-156),
  and the connection keeps which. Organizers choose on the Groups screen (9.19, BAC-161): at
  random, which a new event starts on, or always the dice, or always the reaction test. A
  change applies to connections made after it. Each
  person waits for a signal on their own phone and taps, and the phone sends how many
  milliseconds the tap took (8.11). The phones don't need to be in sync. Each person plays once,
  within 2 minutes of the connection. The faster time wins, and equal times win for both. A tap
  before the signal, or no play within the 2 minutes, has no time and loses to any time. With no
  time on either side, nobody wins. The phone measures the time, so someone could fake it, which
  is acceptable for a game with a cosmetic prize. A win counts as a dice win does.
- Organizers choose on the Groups screen what the two must have (BAC-140). A new event starts on across token kinds, and the other choice is across groups. The
  Event Service judges each tap and each accept by the choice and the groups at that moment, so
  organizers can change it during a session with no deploy. Connections already made stay when it changes, when
  someone moves group, and after the groups' Reset.
- **Across token kinds.** The two must be of different kinds. Each side's kind is the user's kind
  in 8.1, or, for a user with none yet, the kind of the token named in the meeting (11.10). A
  user with no kind at all connects with nobody. A token's kind can be its colour (HAR-30), so a
  participant can see who they can connect with.
- **Across groups.** The two must be placed in different groups, whatever their tokens' kinds,
  and a token with no kind connects too. Two people in the same group don't connect, and nor
  does anyone who isn't placed in a group: not joined, or waiting. The connection keeps each
  side's kind, or none.
- **The phone's way** (8.8, 8.10, 11.10; BAC-149). A user taps their
  phone on the other's token. That tap, a **half**, sends the owner a **connection request**. The
  owner's dashboard shows the request with the tapper's name, an Accept button and a Decline
  button (section 13), and accepting connects the two. A tap on the token of someone who has
  already sent you a request counts as accepting it, so two taps still connect with no button.
- A request has no time limit. It stays until the owner accepts or declines it, or the event is
  cleared. Tapping again while it waits changes nothing.
- Declining is silent. The tapper isn't told, and tapping again sends a new request.
- The rule runs on the tap and again on accepting, because the groups or the rule may have
  changed. If the two no longer pass, accepting makes no connection, the request goes, and the
  answer is the rule's usual status.
- A connection point, where two tokens are tapped at one station, stays out of scope until its
  own change (section 12).
- **The match.** When an event has the answers game (8.1), a connection keeps the pair's
  `match`: of the questions both answered, the share where they picked the same choice, as a
  whole percent, rounded. It is `null` when no question was answered by both, as in an older
  connection. The connection also keeps which questions they answered the same, which `/me` gives
  2 minutes later (8.1), so the pair talk first.
- A user's first connection fixes their answers, in the same step that works out the match, so
  the match can't change later and stays true for both. After that, a change to an answer gets
  `409 answers_fixed` (8.7).
- The evening-before clear empties connections, connection requests and answers, with the taps.

### Groups

Added in 0.14, at `Checkpoint 7` (BAC-125). Organizers split the participants into groups on the
Groups screen, and each participant sees their own group on their dashboard. The routes are 8.13
and 9.14 to 9.20. The rules:

- A participant is in one group at most. An account on the organizer list is never in one: it
  can't join, it isn't counted or placed, and it reads `not_joined` (8.13).
- **Joining.** A participant joins once (8.13), and joining again changes nothing. Until
  allocation has started, they wait.
- **Allocate** (9.17) shuffles everyone waiting, then places each person in the group with the
  fewest members that still has room. When no group has room, they go to the group with the
  fewest members. The oldest group wins a tie. It never moves anyone already placed, so it can
  be pressed again.
- Allocate is refused with no groups, and when fewer than 2 participants have joined for each
  group. A refusal places nobody and doesn't start allocation.
- The first Allocate that isn't refused starts allocation, and so does a split. From then on
  someone who joins is a **latecomer**, placed as they join by the same rule, without the
  shuffle. A latecomer waits only when there are no groups.
- Once allocation has started, someone waits only when there was no group to put them in, an
  organizer sent them back, or their group was deleted.
- Nothing rebalances by itself. Deleting a group, removing a person or changing a capacity
  changes only what the organizer asked for.
- An organizer's own move may pass a group's capacity. The Groups screen marks any group over
  its capacity, however it got there.
- **A split** (9.17) makes the groups and allocates everyone who has joined, in one step, or
  makes nothing.
- **Reset** (9.17) readies another trial: everyone leaves their group and the waiting list and
  has to join again, and allocation goes back to not started. The groups stay.
- Each member has a `how`: `allocated` by Allocate or a split, `latecomer`, or `organizer` for
  an organizer's own move.
- **Groups reached.** A group has reached another group when one of its members has a
  connection with one of the other's members, as the groups are now. A group with nobody in it
  reaches no group and can't be reached.
- The evening-before clear empties who joined and where they were placed, and keeps the groups.

**The phrase** (BAC-169). Organizers can set one phrase of 2 to 12 words (9.20), and each
participant placed in a group then holds one of its words.

- A participant has their own word and the word of everyone they have a connection with. With
  every word, they have completed the phrase. It gives no points and no avatar piece.
- A word is a place in the phrase, so a phrase that says "the" twice has two words to collect.
- A participant gets their word when they are first placed in a group, and keeps it when they
  move, while they wait and after they are removed, so what others collected from them stays
  collected. Only a different phrase and Reset take words back.
- Words are dealt so a group holds each word about equally often, and so more than one person
  holds each word where the numbers allow. With more than one group, and connections across
  token kinds, a group is kept one word short of the whole phrase, so finishing takes someone
  from another group. Across groups nobody connects inside their own group, so no word is kept
  back. The rule is read when a word is dealt, so after changing the rule, organizers turn the
  phrase off and save it again.
- Nothing is written when two people connect. What each person has collected follows from the
  dealt words and the connections, so connections made before a phrase was set count too.

### Team duels

Added in 0.14, at `Checkpoint 7` (BAC-155). A station game for people standing at one station.
It gives no points, no stamp and no connection.

- A tap at a team duels station opens a **round**, or joins the round open there. A round stays
  open for 30 seconds from its first tap. A joining tap is `accepted`, and the station shows the
  player's name with `joined`, then how many are in and the seconds left (6.1).
- A player whose round hasn't ended gets `cooldown` and `Already in` for another tap, at any
  team duels station. A saved tap that arrives after its round's 30 seconds gets `no_game`.
- When the 30 seconds end, the Event Service makes two teams, `a` and `b`, at most one player
  apart. Each group's players are spread across the two, so a team mixes groups. The teams last
  for that round only.
- Each player gets a **duel** with an opponent on the other team, from another group where that
  is possible. With an odd number of players, one player on the smaller team has two duels.
- The round plays one challenge, by the Groups screen's choice (9.19) when the teams are made:
  the dice, the reaction test, or one of them picked at random for the whole round.
- With the dice, both rolls are made with the teams, and the higher roll wins the duel. Equal
  rolls win it for both. The round ends at once.
- With the reaction test, each player plays each of their duels once (8.14), within 2 minutes
  of the round closing, by the rules of a connection's reaction test
  ([Connections](#connections)). The round ends when every duel has a result.
- A team wins the round when it won at least one duel, and at least as many as the other team.
  So equal counts win for both teams, and a round where no duel was won is won by nobody.
- With one player when the 30 seconds end, no teams are made, and the round ends with
  `nobody_joined`.
- A round makes no connection. Afterwards the dashboard suggests each player taps their
  opponent's token, which is an ordinary connection request under the usual rule.
- `round_wins` in `/me` (8.1) counts the rounds the user's team has won. The dashboard's avatar
  gains a piece for a win.
- Nothing runs when a round closes. The teams are made, and a round is ended, by the next tap
  at the station or the next read of `/me` by one of its players.

### Stamps and points

Worked out by the Event Service from accepted taps. The screens display them and never calculate
them.

- Only stations that run the passport and have passport settings are **stamp slots**, in the
  order their settings were added, oldest first, so adding one never moves the others. A
  station that has settings but runs another game keeps them, and isn't a stamp slot.
- A user has a **stamp** for a station once they have at least one `accepted` tap there that the
  passport counted ([Games](#games)). Another game's accepted taps there don't count.
- **Points** are the sum of the station's points over the user's accepted taps that the passport
  counted, so tapping a station again after the cooldown earns its points again, plus 1 for each connection
  ([Connections](#connections)), whatever its match, from 0.13. This is the simplest rule that
  keeps the showcase interesting and can be changed later without an API change.
- A station disabled later keeps its stamp slot and the stamps already earned there.

---

## 5. Endpoint index

**The GeekyKey Service**

| Method | Path | Caller | Status | Purpose |
|---|---|---|---|---|
| GET | `/api/health` | anyone | `Implemented` | Liveness check |
| POST | `/api/v1/taps` | Station | `Implemented` | Taps, one or a batch |
| POST | `/api/v1/stations/heartbeat` | Station | `Implemented` | Online light, clock, `reader_ok` |
| GET | `/api/v1/stations/socket` | Station | `Checkpoint 8` | The station's WebSocket, which carries station messages (BAC-182) |
| POST | `/api/v1/station-messages` | Event Service | `Checkpoint 8` | Send one of its stations a station message (BAC-182) |
| POST | `/auth/dev-login` | local only | `Implemented` | Set `gk_session` for any user ID |
| POST | `/auth/firebase` | browser | `Implemented` | Log in with a Firebase ID token, set `gk_session` |
| POST | `/auth/login-link` | browser | `Checkpoint 7` | Log in with a login link from an Event Service's screens, set `gk_session` |
| POST | `/auth/logout` | browser | `Implemented` | Clear `gk_session` |
| GET | `/api/v1/me` | User | `Implemented` | The user, whether they're a GeekyKey admin, their tokens and the events to link to |
| GET | `/api/v1/tokens/{uid}` | User | `Implemented` | What the token page shows |
| POST | `/api/v1/tokens/{uid}/claim` | User | `Implemented` | Claim a token |
| DELETE | `/api/v1/tokens/{uid}` | User, GeekyKey admin | `Implemented` | Release a token |
| GET | `/api/v1/admin/token-kinds` | GeekyKey admin, organiser | `Checkpoint 7` | Totals by kind |
| POST | `/api/v1/admin/token-kinds` | GeekyKey admin | `Checkpoint 7` | Load token kinds |
| POST | `/api/v1/token-writer/tokens` | Token writer | `Checkpoint 8` | Upload token kinds as they are written (10.4) |
| GET | `/api/v1/admin/token-kinds/tokens` | GeekyKey admin | `Checkpoint 7` | Every UID, kind and current claim |
| DELETE | `/api/v1/admin/token-kinds/{uid}` | GeekyKey admin | `Checkpoint 7` | Remove an unclaimed UID from the kinds list |
| POST | `/api/v1/login-links` | User | `Implemented` | A login link to one event's screens |
| POST | `/api/v1/tokens/{uid}/meet` | User | `Implemented` | The user tapped someone else's token, which sends a connection request or accepts theirs |

**The Event Service**

| Method | Path | Caller | Status | Purpose |
|---|---|---|---|---|
| GET | `/api/health` | anyone | `Implemented` | Liveness check |
| GET | `/geekykey/v1/stations` | GeekyKey Service | `Implemented` | Its registered stations |
| POST | `/geekykey/v1/taps` | GeekyKey Service | `Implemented` | The hand-off |
| POST | `/geekykey/v1/heartbeats` | GeekyKey Service | `Implemented` | The heartbeat hand-off |
| POST | `/geekykey/v1/meetings` | GeekyKey Service | `Implemented` | The meeting hand-off: a tap that sends a connection request or accepts one |
| POST | `/geekykey/v1/used-login-links` | GeekyKey Service | `Checkpoint 7` | Mark a login link to the GeekyKey screens used, so it works once |
| POST | `/auth/dev-login` | local only | `Implemented` | Set `event_session` for a seeded user |
| POST | `/auth/firebase` | browser | `Implemented` | Log in with a Firebase ID token, set `event_session` |
| POST | `/auth/login-link` | browser | `Implemented` | Log in with a login link, set `event_session` |
| POST | `/auth/logout` | browser | `Implemented` | Clear `event_session` |
| GET | `/api/v1/me` | Participant, Organizer | `Implemented` | Profile, stamps, points, history |
| PATCH | `/api/v1/me` | Participant, Organizer | `Implemented` | Set the name the event shows, and the user's answers |
| POST | `/api/v1/login-links` | Participant, Organizer | `Checkpoint 7` | A login link to the GeekyKey screens, for My tokens |
| POST | `/api/v1/me/connection-requests/{id}/accept` | Participant, Organizer | `Checkpoint 7` | Accept a connection request |
| POST | `/api/v1/me/connection-requests/{id}/decline` | Participant, Organizer | `Checkpoint 7` | Decline a connection request |
| POST | `/api/v1/me/connections/{id}/reaction` | Participant, Organizer | `Checkpoint 7` | Play a connection's reaction test |
| GET | `/api/v1/me/group` | Participant, Organizer | `Checkpoint 7` | The user's own group, or whether they wait |
| POST | `/api/v1/me/group` | Participant | `Checkpoint 7` | Join the groups |
| POST | `/api/v1/me/duels/{id}/reaction` | Participant, Organizer | `Checkpoint 7` | Play a duel's reaction test, in a team duels round |
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
| GET | `/api/v1/admin/export.csv` | Organizer | `Implemented` | Raw tap export for Joshua's analysis |
| GET | `/api/v1/admin/groups` | Organizer | `Checkpoint 7` | The groups board |
| POST | `/api/v1/admin/groups` | Organizer | `Checkpoint 7` | Make a group |
| PUT | `/api/v1/admin/groups/{id}` | Organizer | `Checkpoint 7` | Set a group's fields |
| DELETE | `/api/v1/admin/groups/{id}` | Organizer | `Checkpoint 7` | Delete a group, sending its members back to waiting |
| PUT | `/api/v1/admin/groups/members/{user_id}` | Organizer | `Checkpoint 7` | Put someone in a group, or back to waiting |
| DELETE | `/api/v1/admin/groups/members/{user_id}` | Organizer | `Checkpoint 7` | Take someone off the board |
| POST | `/api/v1/admin/groups/allocate` | Organizer | `Checkpoint 7` | Place everyone waiting |
| POST | `/api/v1/admin/groups/split` | Organizer | `Checkpoint 7` | Make the groups and place everyone, in one step |
| POST | `/api/v1/admin/groups/reset` | Organizer | `Checkpoint 7` | Empty the groups for another trial |
| GET | `/api/v1/admin/groups/export.csv` | Organizer | `Checkpoint 7` | Each person's group and times, for the report |
| PUT | `/api/v1/admin/connections/rule` | Organizer | `Checkpoint 7` | What two people need to connect |
| PUT | `/api/v1/admin/connections/challenge` | Organizer | `Checkpoint 7` | What a new connection plays |
| PUT | `/api/v1/admin/groups/phrase` | Organizer | `Checkpoint 7` | Set the phrase, or turn it off |
| GET | `/api/v1/map` | Organizer, map screen | `Implemented` | Each station's game, booth and counts, for the map |
| GET | `/api/v1/map/relay` | Organizer, map screen | `Checkpoint 8` | The relay's progress, for the map (BAC-184) |

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
    { "client_tap_id": "tap-000123", "status": "accepted", "lines": ["Alex: 3 of 6", "Next: B3"] },
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
| `results[].countdown` | object, optional | A screen that counts down, written by the station's game (BAC-181). Only with `accepted` and `cooldown`. Ours gives it with `lines` |
| `results[].countdown.seconds` | integer | 1 to 99. Seconds to count down, from when the answer was made, so a station with a wrong clock still counts correctly |
| `results[].countdown.lines` | array of strings | 1 or 2 lines, with `lines`' rules, except that `{s}` may appear once across them and counts as 2 characters. The station puts the seconds left in its place |
| `results[].countdown.ending` | array of strings | 1 or 2 lines, with `lines`' rules, that the station shows when the count reaches zero |

- The passport's lines are the participant's progress, and their next stop (8.1): `Alex: 3 of 6`
  and `Next: B3`, with the booth's accents taken off and as much of it as fits. Without a next
  stop, or with a booth the screen can't show, such as one in Chinese characters, the second line
  says what happened: `Tap counted!`, or `Already counted` in the cooldown. The tap that earns the
  last stamp says `Alex: 6 of 6` and `All 6 done!`, with `complete`. The wording can change.
- The name is the first word of the name the event shows, only while the participant has a name of
  their own (`user.has_name` in 8.1), with accents taken off and cut to fit. Without one, the line
  is `3 of 6 stamps`. That includes a name the screen can't show, such as one in Chinese
  characters, and a participant who has never logged in to the event.
- No token UID or user ID is ever in a line, and no log line prints them.
- A saved tap sent later gets them too, but the station doesn't show them, since the participant has
  gone.

**A countdown** (BAC-181). A result can also give a screen that ticks,
which the station counts down itself, so the screen moves without hearing from the server again:

```json
{ "client_tap_id": "tap-000123", "status": "accepted",
  "lines": ["Alex joined", "3 in, 27s left"],
  "countdown": { "seconds": 27,
                 "lines": ["Team duels", "3 in, {s}s left"],
                 "ending": ["Round started!", "Check your phone"] } }
```

- `lines` stays the plain snapshot, which a station that doesn't know `countdown` shows. So `{s}`
  never goes in `lines`.
- Team duels gives a countdown to a tap while its round is open, `accepted` or `cooldown`, counting
  down to the round's start: `Team duels` and `3 in, {s}s left`, then `Round started!` and
  `Check your phone`. `seconds` is what the round has left, rounded up, as in `lines`. With more
  players than the line holds, the second line is `{s}s left`. A tap while a round is playing gets
  `Already in` and `Still playing`, with no countdown, and so does a round more than 99 seconds
  from its start, which a station whose clock is ahead can open. The wording can change.
- The passport gives none.

**The relay's lines** (BAC-184). The relay runs on the two stations whose
game is `relay`. The first tap at either one starts a game, and that station calls a group to the
other station. Someone from that group taps there within 20 seconds to complete a transfer, and
their station then calls the next group back. A game is 3 transfers with two groups playing, or 4
with three or more, and it ends at its last transfer or after 2 minutes with no tap.
In the table, `Blue` is a group's name and `B` a station's booth.

| The tap | Status | `lines` | `countdown` |
|---|---|---|---|
| Starts a game, or calls again at the station whose call was missed | `accepted` | `Sent!` / `Blue to B` | `Blue to B` / `{s}s left`, ending `Missed it` / `Tap again` |
| Completes a transfer, and calls the next group back | `accepted` | `Got it!` / `Green to A` | `Green to A` / `{s}s left`, ending `Missed it` / `Tap again` |
| Completes the game's last transfer | `accepted`, with `complete` | `Relay done!` / `4 of 4` | none |
| At the calling station while its call is open | `cooldown` | `Still waiting` / `Blue to B` | as the call's |
| At the waiting station from another group, which includes the group that just tapped | `cooldown` | `Not you` / `Ask at A` | none |
| At the waiting station after the call's 20 seconds | `cooldown` | `Too late` / `Ask at A` | none |
| By someone in no group | `cooldown` | `Join a group` / `on your phone` | none |
| Fewer than two groups have members | `cooldown` | `Need 2 groups` / `Tell organizer` | none |
| Not exactly two stations run the relay | `cooldown` | `Relay needs` / `2 stations` | none |

- The calling station names a group other than the tapper's. With two groups that is always the
  other one. With three or more, the Event Service picks one of the others at random.
- A call missed after its 20 seconds loses that transfer only, and it doesn't count toward the 3
  or 4. The game goes on: the next tap at the calling station, by anyone in a group, calls again.
- Only taps marked `accepted` move the game. A `cooldown` tap changes nothing else, but it still
  counts as a tap for the 2 minutes.
- A group's name goes through the screen's rules (6.1's names): its accents taken off, and cut
  before the booth is, keeping at least its first letter. So a booth of up to 11 characters stays
  whole, and a longer one is cut to 11. A name the screen can't show is `Group 2`, its place in
  the event's list of groups. A station with no booth, or one the screen can't show, is `other`.
  A `{s}` in either shows as `(s)`, since `{s}` never goes in `lines`.
- The relay judges a tap by when the Event Service received it, or, when it waited for the other
  station's tap to be judged first, by that tap's time, so it never answers a call made after it.
  A saved tap made more than 20 seconds before it arrived gets `no_game`, since the game has
  moved on.
- Each new call also sends the waiting station a station message (6.3, 11.12), once the tap is
  stored and without holding up the tap's answer: `Need Blue` / `Tap here`, counting down `Need Blue` /
  `{s}s left` to `Missed it`, with `beep`. The game's last transfer sends the other station
  `Relay done!` / `4 of 4`, with `beep`. A dropped message changes nothing, since each tap's own
  answer says what to do.
- The wording can change.

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
- For a live tap with `countdown` (BAC-181), show `countdown.lines` in place
  of `lines`, with `{s}` replaced by the seconds left, and count down once a second from
  `countdown.seconds`, starting when the answer arrives. Keep the status's LED and sound as for
  `lines`. At zero, show `countdown.ending` for about 2 seconds, then go back to the idle screen.
  Cut each line to 16 characters once `{s}` is replaced, in case.
- Another result during a countdown, such as an unknown token or a tap saved with no Wi-Fi,
  shows for its usual 2 seconds. Then the countdown comes back, still counting from when its
  own answer arrived. Only a new answer with its own `countdown`, or a station message (6.3),
  replaces the one running (HAR-50).
- If the count reaches zero while another result shows, show `countdown.ending` once that
  result ends, up to about 2 seconds late. A reader error covers the countdown, and the count
  goes on underneath.
- The cooldown for saved taps is judged by `tapped_at` when present, so saved taps can be sent
  in any order, and a tap is compared with the taps the same game accepted nearest it in time on
  either side, including ones already stored. Without `tapped_at` the receipt time is used, which means every
  tap in a flush by the same user at the same station after the first will be `cooldown`.
  Stations should send `tapped_at` whenever they have had a time sync.

**Suggested screen and LED mapping.** Each line is at most 16 characters, and the wording can
change. Show each result for about 2 seconds with its LED on, then go back to the idle screen:
`Ready` / `Tap a tag`, or the heartbeat's `idle_lines` (6.2). A countdown shows for as long as it
counts, and its `ending` for about 2 seconds.

| Result | Screen | LED |
|---|---|---|
| any result with `countdown`, for a live tap | `countdown.lines` with the seconds left, then `countdown.ending` at zero | the status's |
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
{ "station_id": "…", "server_time": "2026-10-10T09:00:00.000Z", "idle_lines": ["Team duels", "Tap to join"] }
```

| Field | Type | Rules |
|---|---|---|
| `station_id` | string | The station's ID |
| `server_time` | string | The server's time, in UTC with milliseconds |
| `idle_lines` | array of strings, optional | What the station shows between taps, its idle screen, from the station's game: 1 or 2 lines with 6.1's `lines` rules. Left out for a station whose game gives none, such as a station with no game (BAC-181) |

- Stations call this at boot and every 60 seconds. At boot it replaces `/api/health`, because
  it also proves the station key.
- A station may hold a heartbeat back while it answers taps, since a tap read during a heartbeat
  is lost, but by at most 30 seconds. So two heartbeats can be up to about 90 seconds apart, and
  the taps meanwhile keep the station online.
- It is the station's clock: set the clock from `server_time` every time, and send `tapped_at`
  only once it has been set.
- It gives the idle screen (BAC-181). Show `idle_lines[0]` and
  `idle_lines[1]`, or a blank second line, in place of `Ready` / `Tap a tag`, and keep them until
  the next heartbeat's answer. An answer without `idle_lines` goes back to `Ready` / `Tap a tag`.
  With no answer, keep the last. The station's own screens, such as no Wi-Fi, a setup error or a
  reader error, still come first.
- The GeekyKey Service takes `idle_lines` from its copy of the registered stations (11.1), which
  is at most a minute old. So a change of the station's game reaches the idle screen within about
  two minutes: up to one for the copy, and up to one for the next heartbeat. Ours gives
  `Passport` / `Tap your token`, `Team duels` / `Tap to join` and `Relay` / `Tap to start`
  (BAC-184). The wording can change.
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

### 6.3 `GET /api/v1/stations/socket` (`Checkpoint 8`)

Added in 0.14 (BAC-182, [ADR 0009](../docs/adr/0009-the-geekykey-service-carries-station-messages-in-a-durable-object.md)).
The station's WebSocket, which it holds open so its Event Service can send it a station message
(11.12) with no tap. Taps and heartbeats stay on HTTP.

**Auth:** station key, in `Authorization: Bearer <key>` on the request that opens the socket.

**Request:** a WebSocket upgrade, with no body.

**Response `101`**, and the socket is open. The key is checked as for a heartbeat (6.2), before
the upgrade: a wrong or disabled key gets `401 invalid_station_key`, and the request counts
against the station's 60 a minute.

**Messages to the station** are text frames, each one JSON object:

```json
{ "type": "station_message", "lines": ["Blue to B", "Tap here"],
  "countdown": { "seconds": 20, "lines": ["Blue to B", "{s}s left"], "ending": ["Missed it", ""] },
  "beep": true }
```

| Field | Type | Rules |
|---|---|---|
| `type` | string | `station_message`. Ignore a frame whose `type` you don't know |
| `lines` | array of strings | 1 or 2 lines, with 6.1's `lines` rules |
| `countdown` | object, optional | With 6.1's `countdown` rules |
| `beep` | boolean, optional | `true` for one attention beep when the station shows the message. Left out means `false` |

- The GeekyKey Service sends a message only to the station it names, and only while its socket is
  open. A message sent while a station has no socket is dropped, and is never sent later.
- A station has one socket. Opening a second closes the first with code `4000`, so a station that
  reconnected after a dropped Wi-Fi never leaves a stale one taking its messages.
- Send the text `ping` every 30 seconds. The GeekyKey Service answers `pong`. Anything else the
  station sends is ignored. A station that gets no `pong` within 15 seconds of its `ping` closes
  the socket and opens it again (HAR-51).
- A disabled station's socket stays open until it closes. It gets no messages once the GeekyKey
  Service's copy of the registered stations leaves it out, since an Event Service can only send
  one to a station on its own list (11.12).

**Errors**, before the upgrade: `missing_station_key`, `invalid_station_key`,
`event_service_unavailable` when the key can't be checked, `upgrade_required` (426) for a request
that isn't a WebSocket upgrade, and `rate_limited`
([Rate limits](#rate-limits)).

**Firmware contract**

- Open the socket once a heartbeat has set the clock, and keep it open. When it closes, or fails to
  open, try again after 5 seconds, then 10, 20 and so on up to a minute. A `401` means the key is
  wrong, so retry at the heartbeat's pace and show what 6.1 shows for a `401`.
- A station message is shown as a live tap's answer is (6.1). With a `countdown`, show its `lines`
  in place of `lines` and count down, then its `ending` for about 2 seconds at zero. Without one,
  show `lines` for about 2 seconds. Then go back to the idle screen. With `beep: true`, play one
  short attention beep when the message shows, and leave the LED as it is. A tap's answer, or a
  newer message, replaces it. The station's own screens, such as no Wi-Fi, a setup error or a
  reader error, still come first.
- A tap's answer wins for its first 2 seconds (HAR-51). A message that arrives in that time
  waits, and only the newest one is kept. When the 2 seconds end, the station shows it and plays
  its beep then, with its countdown counted from when it arrived. After those 2 seconds a
  message replaces a tap's running countdown, which the relay needs.
- A message also waits while a heartbeat is overdue, so a stream of messages can't hold the
  heartbeat back past 6.2's 30 seconds.
- A frame that isn't JSON, or breaks the rules above, is ignored and printed on the serial port.
- Everything still works without the socket. A station whose socket is down shows each tap's
  answer, and the heartbeat's idle screen, as before.
- The security rules for firmware (6.1) apply: `wss://` in production with the same certificates,
  `ws://` only to a `.local` address, no redirects, and never print the key.

---

## 7. Auth endpoints

Each service has its own set, on its screens' hostname. The GeekyKey Service's set `gk_session`,
the Event Service's set `event_session`. Both accept logins from the same Firebase project,
`geekykey-b035a`, so a user has the same ID in both. The Event Service also accepts login links
from the GeekyKey Service (7.4), and the GeekyKey Service accepts them from an Event Service
(7.5). Both carry that same ID.

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
- Its `kind`, when it has one, becomes the user's kind as 8.1 says: only if they have none yet.
- It replaces any `event_session` the browser already has, so the link's user wins. On a phone a
  family shares, the token tapped last is the one being looked at.
- A link that fails leaves the existing session as it was.

**Errors:** `validation_failed`; `invalid_login_link` (401).

### 7.5 `POST /auth/login-link` on the GeekyKey Service (`Checkpoint 7`)

Added in 0.14 (BAC-157). Logs the user in with a login link from an Event Service
(8.12), so someone logged in on the Event screens is logged in on the GeekyKey screens as the same
user. It's the reverse of 7.4, for a guest whose sign-in on the GeekyKey screens is gone: without
it, the GeekyKey login offers "Continue as guest", which makes a new guest who owns none of their
tokens. The link's format is in 11.9.

**The screens' side.** My tokens on the Event screens opens `/#login=<link>` on the GeekyKey
screens, as 8.12 says. On arrival, the GeekyKey screens:

1. read the link from the fragment, and remove the fragment with `history.replaceState`;
2. send it here, before anything reads `GET /api/v1/me`, so neither the session the browser had
   nor Firebase's saved sign-in (7.2) is used over it;
3. then call `GET /api/v1/me` as usual.

**Request**, as `application/json`, for the same reason as 7.2:

```json
{ "login_link": "eyJ2IjoxLCJzdWIiOi…" }
```

**Response `204`** with `Set-Cookie` for `gk_session`.

- The link must be signed with the login link key for the GeekyKey screens (11.9) of an Event
  Service whose entry in the GeekyKey Service's settings says `"login_links_to_geekykey": true`,
  and unexpired. A link that fails these checks asks no Event Service.
- The GeekyKey Service keeps no database, so it asks the Event Service that made the link to mark
  it used (11.11), within 4 seconds. Only the link's first use logs anyone in.
- Its `sub` becomes the user ID, and its `name` the name the session holds, which a login link
  to an event (8.6) then carries.
- It replaces any `gk_session` the browser already has, so the link's user wins, as in 7.4.
- A link that fails leaves the existing session as it was.
- Nothing logs the link. A failed 11.11 writes the log line `login_link_unavailable`, with the
  Event Service's ID, the user ID and why, and never the link.

**Errors:** `validation_failed`; `invalid_login_link` (401) for a link that fails the checks or
was used before; `event_service_unavailable` (503) when the Event Service didn't mark it used
properly in time, so the link may be fine.

---

## 8. User endpoints

8.1, 8.7 and 8.10 to 8.12 are on the Event Service, for participants and organizers. 8.2 to 8.6 and 8.8
are on the GeekyKey Service, for any logged-in user, and are what the token page and My tokens
call. Each of
8.2 to 8.5 and 8.8, and 8.6 when it names a token, answers `503 claims_unavailable` when the claims
stand-in, or after the switch the Portal, doesn't answer properly within 4 seconds. The screens say "Couldn't reach GeeksHacking. Try
again." Nothing changes, with one exception each in 8.2 and 8.3: the claim or the release may
already have been made.

### 8.1 `GET /api/v1/me` on the Event Service (`Implemented`)

Everything the participant dashboard and passport view need in one call.

Before showing any participant screen, the screens require `user.has_name` and an answer to
every question in the event's `questions` (BAC-144). This uses `questions` and `user.answers`,
where each question ID maps to its chosen choice ID. With `questions: null` or an empty list, only the name is needed.
Organizers keep their current flow. No skip remembered by the browser bypasses this check.

**Auth:** `event_session`, any role.

**Response `200`**

```json
{
  "user": { "id": "dev-user-1", "display_name": "Alex", "role": "participant", "has_name": true, "kind": "R", "answers": { "drink": "tea", "hours": "night_owl" }, "bio": "Building a robot arm", "avatar": { "character": "dress", "skin": "warm", "hair": "auburn", "suit": "emerald" }, "contact_line": "@alex on Telegram" },
  "questions": [
    { "id": "drink", "text": "Tea or coffee?", "choices": [ { "id": "tea", "text": "Tea" }, { "id": "coffee", "text": "Coffee" } ] },
    { "id": "hours", "text": "Night owl or early bird?", "choices": [ { "id": "night_owl", "text": "Night owl" }, { "id": "early_bird", "text": "Early bird" } ] }
  ],
  "points": 4,
  "stamps": [
    { "station_id": "…", "name": "3D Printing Booth", "location": "Hall A", "points": 1, "link": "https://example.com/3d-printing", "earned_at": "2026-10-10T09:00:01.250Z" },
    { "station_id": "…", "name": "Cloud Sponsor",     "location": "Hall B", "points": 2, "link": null, "earned_at": null }
  ],
  "recent_taps": [
    { "id": 42, "station_id": "…", "station_name": "3D Printing Booth", "status": "accepted", "source": "nfc", "tapped_at": "2026-10-10T09:00:00.000Z", "received_at": "2026-10-10T09:00:01.250Z" }
  ],
  "next_stop": { "station_id": "…", "name": "Cloud Sponsor", "booth": "B3" },
  "connection_requests": [
    { "id": "6f1c2a9e-5b7d-4c11-9a3e-2d8f0b4e7a15", "display_name": "Mei Lin", "bio": "Sensors and sourdough", "avatar": { "character": "dress", "skin": "warm", "hair": "auburn", "suit": "emerald" }, "requested_at": "2026-11-12T08:12:00.000Z" }
  ],
  "connections": [
    { "id": "0b7e4d2c-1f9a-4c3e-8a5d-6e2f1b9c7d40", "connected_at": "2026-11-12T08:12:30.000Z", "display_name": "Mei Lin", "bio": "Sensors and sourdough", "avatar": { "character": "dress", "skin": "warm", "hair": "auburn", "suit": "emerald" }, "contact_line": "@meilin on Telegram", "kind": "B", "match": 50, "shared": null, "shared_at": "2026-11-12T08:14:30.000Z" }
  ],
  "round_wins": 0,
  "round": null
}
```

- `user.id` is the user's ID from the login (section 2). `user.role` is worked out from the
  organizer list.
- `user.has_name` is `false` while `display_name` is the default, `Guest`, because neither a
  login nor the user has given a name. Then participant setup asks "What should we call you?" (8.7).
  A name the user sets counts, even `Guest`.
- `user.kind` is the user's kind (ADR 0006), the first one the GeekyKey Service gave: in a tap's
  hand-off (11.2) or in a login link (11.9), from the kind of the user's token. A later one, from
  another token, doesn't change it. `null` until one comes. Ours are one capital letter, which the
  token writer wrote into the token's address, and the screens decide what each one shows.
- `stamps` lists **every** stamp slot (section 4), so the passport can render empty slots. They
  come in the order their settings were added, oldest first. A station that isn't a stamp slot
  never appears here, even if it has passport settings or the user has tapped it.
- `earned_at` is `null` until the user has an accepted tap at that station that the passport
  counted (section 4). After that it is when the Event Service **received** their first such tap
  there. For a station that was
  offline, that is when it sent the tap, not when it read the token.
- `stamps[].points` is what one accepted tap at that station is worth, not what this user has
  earned there. The user's total is `points`.
- `stamps[].link` is the group's page from the station's passport settings (9.1), or `null`.
  It comes with every stamp slot, earned or not, so the passport has it as soon as a poll shows
  a new stamp, and offers it with a button (section 13).
- `recent_taps` is the user's last 50 stored taps, newest first by when the Event Service
  received them. Statuses other than `accepted` are included so a participant can see "that tap
  didn't count". `station_name` is `null` for a station that isn't a stamp slot.
- `next_stop` is where a station sends the participant next (6.1), worked out again at each poll,
  or `null` when there is nowhere. It is the empty slot whose station has the fewest taps made in
  the last 10 minutes, counting the passport's `accepted` and `cooldown` taps there, not another
  game's (section 4, [Games](#games)). A tap counts by its `tapped_at` (6.1),
  or by when it arrived when it has none, so the taps a station saved while offline and sends
  later don't make its booth look busy. Between slots with as many, it is the one listed first in
  `stamps`. A disabled station, and one with no booth (9.12), is never the
  next stop, so a participant whose only empty slots are there gets `null`. `name` is its name in
  the passport and `booth` its booth. It follows the crowd, so it can change between polls, and
  two participants at one station can get different ones. A booth the station's screen can't
  show still comes here, though the station then says what happened instead (6.1).
- `questions` is the answers game's list of questions, the same for every user, in the order the
  passport asks them, or `null` when the event has no answers game. Each has an `id`, its `text`
  and 2 to 4 `choices`, each with an `id` and its `text`, in the order to show them. The list is
  code in the Event Service, so it changes only with a deploy. The IDs stay the same when a
  question or choice is reworded, so a reworded one keeps everyone's answers. Added in 0.13.
- `user.answers` maps each question the user has answered to the choice they picked, by ID
  (8.7). It leaves out the questions they haven't answered, so it is `{}` until they answer one,
  and always `{}` without an answers game. An answer to a question or choice taken off the list
  is left out too. While a question isn't in `answers`, the passport asks it (section 13). Added
  in 0.13, replacing 0.12's `user.question` and `user.answer`, which were never built.
- `connection_requests` lists the requests waiting for the user to accept or decline
  ([Connections](#connections)), newest first (BAC-149). `id` is the
  request's own, for 8.10, because this answer never gives another person's user ID.
  `display_name` is the tapper's current event name, so a name they change shows at the next poll,
  or `Guest` when they have none. `bio` is the tapper's current bio, or `null` when they have none,
  so the user can see who's asking before they accept. A screen reads a missing one as `null`
  (BAC-151). `requested_at` is when the tap reached the Event Service. The
  list is empty without a connections game, and a screen reads a missing list as empty, so it
  works with an Event Service from before it.
- `user.bio` and `user.contact_line` are what the user wrote (8.7), or `null` for none (BAC-147). A screen reads a missing one as `null`, so it works with an Event
  Service from before them.
- For the next version, after 0.14 (BAC-191), `user.avatar` is the user's saved look (8.7),
  or `null` when they have saved none. Each item in `connections` and `connection_requests`
  gives the other person's current `avatar`, or `null` for none, so edits and clears show at
  the next poll. A screen reads a missing `avatar` as `null`, so it works with an Event Service
  from before it. For a value it doesn't know, a screen draws its default for that part.
  Another person's avatar shows their look without earned pieces (8.7).
- `connections` lists the user's connections ([Connections](#connections)), newest first. Each
  gives when it was made and the other person's `kind`, and never their user ID or answers.
  `kind` is `null` when they had none, which only a connection across groups allows.
  Without a connections game it is an empty list. Added in 0.12, with these fields from 0.13:
  - `match` is the pair's match as a whole percent, from 0 to 100, kept from when they connected.
    It is `null` when no question was answered by both, or the event has no answers game.
  - `shared` lists the IDs of the questions both answered the same, in the order of `questions`.
    It is `null` until `shared_at`, and may be an empty list after it.
  - `shared_at` is 2 minutes after `connected_at`, so the passport knows when `shared` will come.
    It shows "Show what we share" once a poll gives `shared` (section 13).
- `points` adds 1 for each connection, whatever its match, to the passport's points (section 4,
  "Stamps and points").
- Each connection's `display_name`, `bio` and `contact_line` are the other person's current ones,
  so an edit shows at the next poll and clearing one hides it, while the rest of the connection
  stays as it was made. `display_name` is `null` when they have never logged in to this Event
  Service, and the screens show `Guest` (BAC-136). `bio` and `contact_line` are `null` when they
  have none. This list is the only answer that gives another person's contact line, so nobody gets
  one before the two connect. A screen reads a missing one as `null` (BAC-147).
- The user's tokens are not here. They are on the GeekyKey Service's `/me` (8.4).

**Dice (BAC-150).** Each connection also gives
`dice`: `{ "your_roll": 5, "their_roll": 2, "result": "win" }`, or `null` for a connection made
before dice. Each roll is an integer from 1 to 6, chosen independently by the Event Service when
the connection is made and stored with it. Accepting with the button or tapping back uses the
same rule. Each pair plays once. Polling or tapping again never changes the rolls.
`your_roll` is the current user's roll and `their_roll` is the other person's. `result` is `win`
when `your_roll` is greater than or equal to `their_roll`, and `loss` otherwise. Equal rolls win
for both people. Both see the same rolls from their own side, with no other person's user ID.
A screen reads a missing `dice` as `null`, so it works with an Event Service from before dice.
The answers, match, points, map and memory card stay as they are.

**Reaction test (BAC-156).** Each connection also gives its own `id`, the
same for both people and never a user ID, for 8.11. Connections made before it get one too. Each
connection also gives `reaction`, which is `null` unless the pair got the reaction test
([Connections](#connections)). A reaction connection has `dice: null`.

```json
"reaction": { "play_by": "2026-11-12T08:14:30.000Z", "your_play": "played", "your_ms": 312, "their_play": "played", "their_ms": 287, "result": "loss" }
```

- `play_by` is 2 minutes after `connected_at`. Each person plays before it, or loses.
- `your_play` is `not_played` until the user plays and while `play_by` hasn't passed, `played`
  with a time, `early` for a tap before the signal, or `missed` once `play_by` passes with no play.
  `your_ms` is the user's time in milliseconds, an integer from 1 to 120000, or `null` with no time.
- `their_play` and `their_ms` are the same for the other person, except that until `result`
  comes, an early tap shows as `played` and `their_ms` is `null`, so nobody learns the time to
  beat before they play.
- `result` is `null` until both have played or `play_by` has passed. Then it's `win` when the
  user's time is less than or equal to the other's, or the user has a time and the other doesn't,
  and `loss` otherwise. Equal times win for both. With no time on either side, both get `loss`,
  and the screens say nobody wins.
- A screen reads a missing `id` or `reaction` as `null`, so it works with an Event Service from
  before them. An older Event Service gives every new connection dice.

**Team duels (BAC-155).** `round_wins` is how many rounds the user's team has won
([Team duels](#team-duels)), and `round` is the latest round the user is in, or `null` for
none. Without a team duels game they are `0` and `null`, and a screen reads a missing one the
same way.

```jsonc
"round": {
  "id": "…",
  "state": "playing",          // "opening" | "playing" | "ended"
  "closes_at": "2026-11-12T08:14:30.000Z",
  "players": 3,
  "challenge": "dice",         // null while opening, then "dice" | "reaction"
  "team": "a",                 // null while opening, and with one player
  "teammates": ["Sam"],
  "duels": [
    { "id": "…", "opponent": "Jo",
      "dice": { "your_roll": 5, "their_roll": 2, "result": "win" },
      "reaction": null }
  ],
  "result": null               // { "outcome": "win", "your_team_wins": 2, "their_team_wins": 1 }
}
```

- `state` is `opening` until `closes_at`, when the round stops taking players, `playing` while a
  duel has no result, and `ended` after.
- `players` is how many have joined. `teammates` are the names of the others on the user's
  team, and `duels` are the user's own: one, or two for the odd player.
- A duel's `opponent` is the other player's name, `dice` is as a connection's above, and
  `reaction` is a connection's `reaction` object, with `play_by` 2 minutes after `closes_at`. A
  dice round has `reaction: null`, and a reaction round `dice: null`. A duel's `id` is for 8.14.
- `result` is `null` until the round ends. `outcome` is `win` or `loss` for the user's team,
  or `nobody_joined` for a round with one player. `your_team_wins` and `their_team_wins` count
  the duels each team won. Equal counts above 0 are a `win` for both teams, and 0 to 0 is a
  `loss` for both, which the screens word as nobody winning.
- `/me` gives no other user's ID, and names only the round's own players. A player who has
  never logged in shows as `Guest`.
- The dashboard polls `/me` every 3 seconds while `state` is `opening` or `playing`
  ([Rate limits](#rate-limits)).

**The phrase (BAC-169).** While a phrase is set ([Groups](#groups)), a participant placed in a
group who holds a word also gets `phrase`, and each of their connections gets `word`:

```json
"phrase": { "words": ["make", null, "people", null], "your_word": 0 }
```

- `words` is the whole phrase in order: a word's text when the user has it, and `null` when
  they don't yet. `your_word` is the place of the user's own word in `words`, counted from 0.
- Each connection's `word` is `{ "text": "people", "already_had": false }`: the word the other
  person holds, and whether the user had it before that connection, counting connections oldest
  first. It is `null` when the other person holds no word.
- For anyone else, and with no phrase set, the answer has no `phrase` and no connection has a
  `word`, as before 0.14.

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
page loaded, so a late or double click can't release a newer claim. On the Token kinds screen it
is the owner the list (10.2) showed (FRO-145).

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
| `someone_else` | "This token belongs to someone else". This lookup gives no name or bio, and the meeting's answer (8.8) can give the owner's (BAC-143 and BAC-151). A GeekyKey admin also sees **Release** |

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
{ "event_id": "showcase", "uid": "04A1B2C3D4E5F6" }
```

`event_id` is an `id` from `events` in `/me` (8.4). `uid` is optional: the token page sends its
token's UID, in any separator style ([Token UID](#token-uid)), and My tokens sends none.

**Response `201`**

```json
{ "url": "https://event.geekshacking.com/#login=eyJ2IjoxLCJzdWIiOi…", "expires_at": "2026-11-18T13:01:00.000Z" }
```

- The link names only the session's own user ID, and the name the session holds, if any. A
  request can't choose either.
- With a `uid`, the link also carries that token's kind (11.9), but only while the session's user
  owns the token, so nobody takes on a kind by naming someone else's token. A token with no kind,
  someone else's, nobody's, or no `uid` at all gives a link with no kind. Only a request with a
  `uid` asks the claims stand-in, so only it can get `claims_unavailable`.
- The account menu's Event screens action sends no `uid`, as My tokens does, so its link carries
  no kind (FRO-151). The user's kind in the event (8.1) is the first one either service gave, so
  for someone with several tokens the first tap or token page sets it.
- It expires 60 seconds after it's made, and works once (7.4). The screens open it straight away
  and don't keep it.
- The screens open `url` as it is. They never build it, so the event's address and the
  fragment's name belong to the GeekyKey Service.
- It counts toward the user's 60 requests a minute ([Rate limits](#rate-limits)).

**Errors:** `unauthenticated`, `validation_failed`, `not_found` for an `event_id` that isn't in
`events`, `rate_limited`, and `claims_unavailable` (503) for a request with a `uid`.

### 8.7 `PATCH /api/v1/me` on the Event Service (`Implemented`)

Sets the name the event shows for the current user: on the passport, the scan log and the
export. From 0.13 it also sets some or all of the user's answers in the answers game, and it
sets the user's bio and contact line (BAC-147). Participant setup asks for the name when `has_name` is `false` (8.1), and the dashboard and passport let the user change it
later. Anyone can set it, not only a guest. A Google user may not want their full Google name
shown.

For the next version, after 0.14, it also sets the user's avatar look (BAC-191).

**Auth:** `event_session`, any role.

**Request**

```json
{ "display_name": "Alex", "answers": { "drink": "tea" }, "bio": "Building a robot arm", "avatar": { "character": "dress", "skin": "warm", "hair": "auburn", "suit": "emerald" }, "contact_line": "@alex on Telegram" }
```

Every field is optional, and a request needs at least one of `display_name`, `answers`, `bio`,
`contact_line` or `avatar` (BAC-191).

`display_name` is trimmed, then must be 1 to 30 characters, counted as Unicode code points. Any
script is allowed. A name that breaks the rule gets `validation_failed`, with its issue under the
path `["display_name"]`, and leaves the name as it was.

A name someone else in the event has gets `409 name_taken` and leaves the name as it was (BAC-145). Names are compared after trimming, and names that differ only in
capitals are the same, as group names are. The default `Guest` doesn't count while `has_name` is
`false`, since nobody chose it. Saving your own current name again works, with different capitals
too. Of two saves of one name at once, one gets it.

The check runs only when a name is saved, so duplicates from before it stay until one of those
people changes their name. A name that comes from a login isn't checked. It still counts when
someone else saves it.

`answers` maps question IDs to choice IDs, from `questions` in 8.1. It sets the answers it names
and keeps the user's others, so a screen can send one answer at a time, as each choice is tapped.
A question it names that isn't on the list, or a choice that isn't one of the question's, gets
`validation_failed`, with its issue under `["answers", "<question ID>"]`. Without an answers game
every question is unknown, so only an empty `answers` passes. Answers can't be removed, only
changed. A user can change their answers until their first connection fixes them
([Connections](#connections)).

`bio` and `contact_line` are each a string or `null`. A string is trimmed, then must be at most 160
code points for `bio` and 80 for `contact_line`, with its issue under `["bio"]` or
`["contact_line"]`. A blank string or `null` clears it, and `GET` then gives `null`. The contact
line is free text, such as a Telegram handle (BAC-147).

`avatar` is the whole look, an object with exactly four keys: `character`, `skin`, `hair` and
`suit`. Each value is a string of 1 to 24 characters, made of lowercase letters `a` to `z`,
digits `0` to `9` and hyphens. A wrong shape, an extra or missing key, or a value that breaks
the rule gets `400 validation_failed`, with its issue under `["avatar"]`, or under the key for
one value, such as `["avatar", "skin"]`. `null` clears the look, and `GET` then gives `null`.
The Event Service checks no list of colours, so a new colour needs no Event Service deploy. A screen that meets a value it doesn't know draws its default for that part (BAC-191).

The Event Service keeps the look per event. The evening-before clear removes it with the user,
as it does the bio (BAC-191).

BAC-144 keeps that lock on existing answers. A user
whose older connection fixed incomplete answers can fill a missing question, including a question
added later, but cannot change an answer already on the current list. A mixed request that also
tries to change a fixed answer still answers `409 answers_fixed` and changes nothing. A past
connection keeps its stored match, including `null` for an older connection.

A request where any field breaks its rule, or whose name is taken, changes nothing.

**Response `200`**, with the `user` object from 8.1:

```json
{ "user": { "id": "dev-user-1", "display_name": "Alex", "role": "participant", "has_name": true, "kind": "R", "answers": { "drink": "tea", "hours": "night_owl" }, "bio": "Building a robot arm", "avatar": { "character": "dress", "skin": "warm", "hair": "auburn", "suit": "emerald" }, "contact_line": "@alex on Telegram" } }
```

- From now on, logging in (7.2) and login links (7.4) no longer change the name.
- Nothing checks what a name says. A station's screen greets the user by its first word (6.1). On
  phones, the user's name shows to the organizers, to the user's group, to anyone who taps the
  user's token, before the two connect, and to anyone whose token the user taps (8.8, BAC-143).
- `user.answers` is all the user's answers after the change, as 8.1 gives them.
- Answers show only on the user's own phone. `/me` never gives another person's answers, only
  the questions a pair answered the same (8.1), and the map (9.10) gives none.
- Nothing checks what a bio or a contact line says either. A contact line shows only to the user
  and to the people they have connected with, in `connections` (8.1). A bio shows to them too, and
  also to anyone who taps the user's token, before the two connect (8.8), and to anyone whose token
  the user taps, in a connection request (8.1), because viewing a profile needs no accepting. The
  organizers' screens, the export, the map and the memory card never show either one (BAC-147, and BAC-151).
- `user.avatar` is the saved look after the change, or `null` when cleared. An avatar shows to
  the same people as a bio. The organizers' screens, the export and the map get none. Another
  person's avatar shows their look without earned pieces. Only the screens count the connections
  and wins that earn pieces today (BAC-191).

An Event Service from before `avatar` refuses a PATCH whose only field is `avatar` with
`400 validation_failed`. Deploy both services before the screens that send it (BAC-191).

**Errors:** `unauthenticated`, `validation_failed`, `answers_fixed`, `name_taken` (BAC-145), and `rate_limited`
([Rate limits](#rate-limits)).

### 8.8 `POST /api/v1/tokens/{uid}/meet` on the GeekyKey Service (`Implemented`)

The current user tapped their phone on someone else's token: one half of a connection, which
sends the owner a connection request or accepts theirs ([Connections](#connections)). The token
page calls it by itself once its lookup (8.5) answers `someone_else`, except for a GeekyKey admin,
who may be holding a lost token, and except when the browser says the page load is a reload or a
move back or forward, which isn't a tap (BAC-149). Then the page
shows only the sentence that the token belongs to someone else.

**Auth:** `gk_session`, any user.

**Request:** no body. `{uid}` is a [Token UID](#token-uid) in any separator style.

**Response `200`**

```json
{ "meetings": [ { "event_id": "showcase", "status": "waiting", "owner_name": "Sam", "owner_bio": "Building a robot arm", "owner_avatar": { "character": "dress", "skin": "warm", "hair": "auburn", "suit": "emerald" } } ] }
```

- The GeekyKey Service asks the claims stand-in for the user's tokens, then for who owns the
  tapped token and both tokens' kinds. It then hands the half to each Event Service whose entry in
  its settings takes meetings (11.10), all at once. One 4-second deadline covers the claims calls
  and every hand-off.
- `user_kind` in the hand-off is the kind of the user's own token claimed first, or `null` when
  they hold none, or released it between the two calls to the claims stand-in.
- `meetings` has one item for each Event Service that takes meetings, in the order of `events` in
  `/me` (8.4), and is empty when none takes them.
- `status` is the Event Service's answer (11.10): `waiting`, `connected`, `already_connected` or
  `same_kind`, `no_kind` (BAC-135), or `answers_needed` (BAC-144). Section 13 has what the token page shows for each. A tap makes one request at most,
  so `waiting` can come again for the same pair.
- `owner_name` is the Event Service's answer too (11.10): the owner's current name, or `null`. The
  GeekyKey Service passes it on and stores no names. The answer gives no user ID, token UID or
  answers. A screen that gets no `owner_name` reads it as `null` (BAC-143).
- `owner_bio` comes the same way: the owner's current bio from the same answer (11.10), or `null`.
  The GeekyKey Service passes it on and stores no bios. The answer never gives a contact line. A
  screen that gets no `owner_bio` reads it as `null` (BAC-151).
- For the next version, after 0.14 (BAC-191), `owner_avatar` is the owner's current saved look
  from the same answer (11.10), for every status, or `null` when they have saved none. The
  GeekyKey Service passes it on and stores no looks. A screen that gets no `owner_avatar` reads
  it as `null`, and draws its default for any part whose value it doesn't know. A look the
  GeekyKey Service can't read becomes `null` under 11.10's rules, without making the meeting
  `unavailable`.
- An Event Service that doesn't answer in time, or answers wrongly, gets the status
  `unavailable` in its item, with `owner_name`, `owner_bio` and `owner_avatar` `null`, and the
  GeekyKey Service logs `meeting_handoff_failed`. The other items are unaffected. Nothing is
  retried. Tapping the token again sends the half again, which does no harm.
- An Event Service that answers `404`, as one from before 0.12 does, doesn't take meetings, and
  is left out of `meetings`.

**Errors:** `unauthenticated`, `validation_failed`, `not_found` for a token that isn't someone
else's (nobody's, or the user's own), `claims_unavailable`, and `rate_limited`
([Rate limits](#rate-limits)).

### 8.9 Removed

The hunt, `GET /api/v1/hunt` and `POST /api/v1/hunt/skip`, was never built, and BAC-121 was canceled
on 4 November 2026. This number stays empty so that 8.10 and 8.11 keep theirs. A tap on the user's
token now reaches them as a connection request (8.1), so `tapped_you` went with it (BAC-149, FRO-116).

### 8.10 `POST /api/v1/me/connection-requests/{id}/accept` and `/decline` on the Event Service (`Checkpoint 7`)

Added in 0.14 (BAC-149). The user answers a connection request that waits for them
(8.1, [Connections](#connections)). Only that user can answer it.

**Auth:** `event_session`, any role.

**Request:** no body. `{id}` is an `id` from `connection_requests` in `/me` (8.1).

**Response to `accept`, `200`**

```json
{ "status": "connected" }
```

| `status` | Meaning |
|---|---|
| `answers_needed` | Either person still needs their name or an answer. The request stays, and no connection is made (BAC-144) |
| `connected` | The two are connected, and both see the reveal at their next read of `/me` |
| `already_connected` | Another accept or a tap back made the connection just before this one |
| `same_kind` | Across token kinds, both have a kind and the two kinds are equal. There's no connection, and the request has gone |
| `no_kind` | Across token kinds, either person has no kind. There's no connection, and the request has gone (BAC-135) |
| `same_group` | Across groups, the two are in one group. There's no connection, and the request has gone |
| `no_group` | Across groups, either isn't in a group. There's no connection, and the request has gone |

The Event Service fixes both people's answers and works out the match when it makes the
connection, as it does for a tap back. Before checking kinds and groups, it checks the person
accepting has finished setup. Before completing the connection, it also checks the sender, since
an older request may have been sent before setup was required. The same sender check applies to
a tap back. This is the exception Adam approved on 6 Nov to BAC-144's tapper-only rule.
Organizers remain exempt from setup. A request not waiting for this user still answers `not_found`.

**Response to `decline`, `204`**, with no body. The tapper isn't told.

**Errors:** `unauthenticated`, `not_found` for a request that doesn't wait for this user, which
includes one already answered, and `rate_limited` ([Rate limits](#rate-limits)).

### 8.11 `POST /api/v1/me/connections/{id}/reaction` on the Event Service (`Checkpoint 7`)

Added in 0.14 (BAC-156). The user plays a connection's reaction test once
([Connections](#connections)). The phone shows how to play, waits a random time once the user is
ready, shows the signal, and sends how long the tap took. The Event Service keeps the first play
and refuses any other.

**Auth:** `event_session`, any role.

**Request:** `{id}` is a connection's `id` from `/me` (8.1). The body is the time from the signal
to the tap, in whole milliseconds from 1 to 120000:

```json
{ "ms": 312 }
```

or, for a tap before the signal, which counts as a loss:

```json
{ "early": true }
```

**Response `200`:** the connection's `reaction` from the user's side, as in 8.1.

```json
{ "reaction": { "play_by": "2026-11-12T08:14:30.000Z", "your_play": "played", "your_ms": 312, "their_play": "not_played", "their_ms": null, "result": null } }
```

**Errors:** `unauthenticated`, `validation_failed` for any other body, `not_found` for a
connection that isn't the user's or has no reaction test, `already_played` (409) once the user has
played, even after `play_by`, `too_late` (409) once `play_by` has passed without their play, and
`rate_limited` ([Rate limits](#rate-limits)).

### 8.12 `POST /api/v1/login-links` on the Event Service (`Checkpoint 7`)

Added in 0.14 (BAC-157). A login link to the GeekyKey screens, for the current user,
the reverse of 8.6. My tokens on the Event screens calls it, then opens the GeekyKey screens at
`/#login=<login_link>` (7.5). Every user gets one, guests and Google users alike.

**Auth:** `event_session`, any participant or organizer.

**Request:** no body.

**Response `201`**

```json
{ "login_link": "eyJ2IjoxLCJzdWIiOi…", "expires_at": "2026-11-18T13:01:00.000Z" }
```

- The link names only the session's own user ID, never anything from the request. Its `name` is
  the name the user's login gave them, while they still have it. It's `null` once they set their
  own name (8.7), and for a user with the default name `Guest`. Its `kind` is always `null`.
- It expires 60 seconds after it's made, and works once (7.5 and 11.11). The screens open it
  straight away and don't keep it.
- The answer is the link, not an address, because the Event Service doesn't know where the
  GeekyKey screens are. The Event screens put it in the fragment of their own address for them,
  `https://key.geekshacking.com/`, which never reaches a server or a log.
- When the call fails, My tokens opens the GeekyKey screens at `/` without a link, where the
  user's session there, Firebase's saved sign-in or the login takes over, as before. So does My
  tokens opened in a new tab or window, which keeps the plain address.
- Nothing logs the link.

**Errors:** `unauthenticated`, and `rate_limited` ([Rate limits](#rate-limits)).

### 8.13 `GET` and `POST /api/v1/me/group` on the Event Service (`Checkpoint 7`)

Added in 0.14 (BAC-125). The user's own group ([Groups](#groups)), for the dashboard's group
card. `GET` reads it, and `POST` joins the groups first.

**Auth:** `event_session`. `GET` takes any role. `POST` takes a participant, and an organizer
gets `403 forbidden`, since an organizer account is never in a group.

**Request:** no body.

**Response `200`**, from both:

```json
{
  "status": "placed",
  "allocation_started": true,
  "group": {
    "id": "…", "name": "Group 1", "tags": ["Mixer"], "location": "Table 3",
    "members": [ { "display_name": "Alex" }, { "display_name": "Mei Lin" } ],
    "other_groups": [ { "name": "Group 2", "reached": true }, { "name": "Group 3", "reached": false } ]
  }
}
```

- `status` is `not_joined`, `waiting`, for someone who has joined and has no group, or
  `placed`. An organizer always reads `not_joined`.
- `allocation_started` says whether allocation has started, so the card can tell someone
  waiting whether a group will come by itself.
- `group` is `null` unless `status` is `placed`. `tags` is a list, empty for none, and
  `location` is `null` for none. `members` is everyone in the group, the user included, by
  name only, oldest join first.
- `other_groups` is every other group with someone in it, oldest first, with whether the
  user's group has reached it ([Groups](#groups)) (BAC-167). It gives names only, never
  members. A screen that gets none shows no list, so it works with an Event Service from before
  it.
- The answer never gives a user ID, or another group's members.
- `POST` joins the user, and answers as `GET` does. Someone who has joined keeps their place. A
  join after allocation has started places the participant at once and answers `placed`, or
  `waiting` when there are no groups. Their `how` is then `latecomer`, and their `placed_at`
  equals their `joined_at` (9.14).
- The dashboard sends the join once when the user arrives through a login link, and otherwise
  shows a Join button while `status` is `not_joined`, so someone looking from home isn't counted
  as present (section 13).

**Errors:** `unauthenticated`, `forbidden` for an organizer's `POST`, and `rate_limited`
([Rate limits](#rate-limits)).

### 8.14 `POST /api/v1/me/duels/{id}/reaction` on the Event Service (`Checkpoint 7`)

Added in 0.14 (BAC-155). The user plays one of their duels in a team duels round whose
challenge is the reaction test ([Team duels](#team-duels)). `{id}` is a duel's `id` from
`round.duels` in `/me` (8.1). The body, the answer and the play's rules are 8.11's, and
`play_by` is 2 minutes after the round's `closes_at`.

**Auth:** `event_session`, any role.

**Errors:** `unauthenticated`, `validation_failed`, `not_found` for a duel that isn't the
user's or whose round doesn't play the reaction test, `already_played` (409), `too_late` (409),
and `rate_limited` ([Rate limits](#rate-limits)).

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
  as they are. Giving it the passport writes the `station_game_changed` line that 9.11 writes,
  beside this call's own.
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
      "game_fixed": false,
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
| `game_fixed` | Always `false` from 0.14, since a station's game can change at any time (9.11). Kept for one version so the screens don't break, then removed. Don't read it |
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
- For a station, `accepted_taps` and `unique_participants` count only the `accepted` taps the
  passport counted there, so `unique_participants` is the number of stamps earned there. Another
  game's taps there, from before the station changed to the passport, count only in the totals.
  `name` is its passport name.
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

This is the data feed for Joshua's analysis of the event's taps, so it must not be cut from scope. The
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
  ],
  "connections": {
    "count": 3,
    "links": [[1, 2], [1, 3], [2, 4]]
  }
}
```

| Field | Meaning |
|---|---|
| `game` | The `id` of the game it runs, or `null` (9.2) |
| `name` | Its name in the passport while it's a stamp slot (section 4), or `null` |
| `booth` | Its booth (9.12), or `null` |
| `disabled` | `true` while an organizer has it disabled (9.9) |
| `taps` | How many of its taps a game counted or held back, `accepted` or `cooldown`, from the station and the QR fallback (9.4), whichever game it ran then, so the count never drops when its game changes. `no_game` taps, stored before it ran a game, aren't counted |
| `unique_participants` | The users with an `accepted` tap there that the game it runs now counted. At a stamp slot, that is the number of stamps earned there, as in 9.5 |
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
- `connections` is added in 0.12 ([Connections](#connections)). `count` is how many connections
  the event has. `links` gives each one as two numbers, the smaller first, oldest connection
  first. Each number stands for a user, numbered from 1 in the order they first connected, so the
  screen keeps its layout between polls and draws an anonymous web. When both users in one
  connection are new, the one with the smaller user ID gets the lower number. The numbers aren't
  user IDs, and nothing here links one to a user. The screen doesn't mark which link is new.
  Without a connections game, the answer leaves `connections` out, and the screen draws no web.

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

- An organizer can change it at any time, however many taps the station has (section 4,
  [Games](#games)). Its next tap goes to the new game. A tap already being judged when the
  change arrives is judged by the game before.
- A station that has passport settings and is set to another game keeps them, and stops being a
  stamp slot. Set back to `passport`, it takes its old slot again, since slots follow when the
  settings were added, and shows the stamps earned there before, since those taps still record
  the passport.
- A station set to `passport` with no settings yet isn't a stamp slot, and its taps get
  `no_game`, until 9.1 adds them.
- Setting the game it already runs answers `200` with the station as it is, and writes no log
  line.
- The Event Service writes one `station_game_changed` log line, with the organizer's user ID, the
  station's ID and the new game's `id`, or `null`.

**Errors:**

- `unauthenticated` and `forbidden`, as for every organizer endpoint.
- `validation_failed` for a missing `game`, or one that isn't in 9.2's `games`.
- `not_found` for a station this Event Service didn't register.
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

### 9.13 `GET /api/v1/map/relay` (`Checkpoint 8`)

Added in 0.14 (BAC-184). What the map draws of the relay (6.1): its two stations, the
call a station is waiting on, and how far the game has got. It's apart from 9.10 so the map can ask
for it every second.

**Auth:** as 9.10's, for a user on the organizer list or the map screen list. It has a limit of
its own, 90 a minute, and doesn't count toward the user's 60 ([Rate limits](#rate-limits)).

**Response `200`**

```json
{
  "relay": {
    "stations": ["ca939e19-8216-4b95-8375-5b54e543c5f6", "5d0b1f0e-31a4-4f43-9a52-0c7a1e2b9f11"],
    "game": {
      "started_at": "2026-11-17T06:00:00.000Z",
      "transfers": 2,
      "transfers_needed": 4,
      "calling_station_id": "ca939e19-8216-4b95-8375-5b54e543c5f6",
      "waiting_station_id": "5d0b1f0e-31a4-4f43-9a52-0c7a1e2b9f11",
      "waiting_until": "2026-11-17T06:01:12.000Z",
      "ended_at": null,
      "complete": false
    }
  }
}
```

| Field | Meaning |
|---|---|
| `relay` | `null` for an event without the relay |
| `relay.stations` | The enabled stations whose game is `relay`, oldest first. The relay plays only with exactly two |
| `relay.game` | The latest game, running or ended, or `null` before the first |
| `game.transfers` | The transfers completed so far. A missed call doesn't count |
| `game.transfers_needed` | 3 with two groups playing, 4 with three or more, fixed when the game started |
| `game.calling_station_id`, `game.waiting_station_id` | The station that made the open call and the one waiting for the group it named, or `null` while no call is open, such as after a missed call or once the game has ended |
| `game.waiting_until` | When the open call's 20 seconds end, or `null` with no open call |
| `game.ended_at` | When it ended, or `null` while it runs. A game nobody has tapped for 2 minutes is shown ended 2 minutes after its last tap, before any tap stores that |
| `game.complete` | `true` once it has ended at its last transfer |

- The answer has no user ID, display name, group or token UID, and fields added later won't
  either. The map draws the transfer between the two stations' booths from 9.10.
- Poll this every second while the map is shown.

**Errors:** `unauthenticated` and `forbidden`, as 9.10's, and `rate_limited` past its own 90 a
minute ([Rate limits](#rate-limits)).

### 9.14 `GET /api/v1/admin/groups` (`Checkpoint 7`)

Added in 0.14 (BAC-125). The groups board: everything the Groups screen shows
([Groups](#groups)). The screen polls it every 5 seconds.

**Response `200`**

```json
{
  "allocation_started_at": "2026-11-12T08:05:00.000Z",
  "connect_across": "groups",
  "challenge": "random",
  "phrase": { "text": "make something people want", "completed_count": 2 },
  "joined_count": 3,
  "groups": [
    { "id": "…", "name": "Group 1", "tags": ["Mixer"], "location": "Table 3", "capacity": 4,
      "members": [
        { "user_id": "dev-user-1", "display_name": "Alex", "joined_at": "2026-11-12T08:01:10.000Z", "placed_at": "2026-11-12T08:05:00.000Z", "how": "allocated" },
        { "user_id": "dev-user-2", "display_name": "Mei Lin", "joined_at": "2026-11-12T08:09:30.000Z", "placed_at": "2026-11-12T08:09:30.000Z", "how": "latecomer" }
      ],
      "reached_group_ids": [] }
  ],
  "waiting": [
    { "user_id": "dev-user-9", "display_name": "Sam", "joined_at": "2026-11-12T08:02:00.000Z" }
  ]
}
```

| Field | Meaning |
|---|---|
| `allocation_started_at` | When allocation started, or `null` while it hasn't |
| `connect_across` | What two people need to connect, `token_kinds` or `groups` (9.19) |
| `challenge` | What a new connection plays, `random`, `dice` or `reaction` (9.19). A screen that gets none offers no choice, so it works with an Event Service from before it |
| `phrase` | `null` with no phrase set. Otherwise its `text`, with one space between words, and `completed_count`: how many participants in a group now have every word (9.20). A screen that gets no `phrase` key shows no setting |
| `joined_count` | How many participants have joined: everyone in a group, and everyone waiting |
| `groups` | Every group, oldest first |
| `groups[].capacity` | The most people it has room for, or `null` for any number. Allocate fills every group with room before any goes over |
| `groups[].members` | Who is in it, oldest join first. `placed_at` is when they were put in this group, and `how` is `allocated`, `latecomer` or `organizer` (section 4) |
| `groups[].reached_group_ids` | The IDs of the other groups it has reached, in the board's order (BAC-167). A screen that gets none shows nothing about it |
| `waiting` | Everyone who has joined and has no group, oldest join first |

- Organizer accounts are left out everywhere: of `joined_count`, of each group and of `waiting`.
- Every route below that answers "with the board" answers with this body as it is after the
  change.

**Errors:** `unauthenticated`, `forbidden`, and `rate_limited` ([Rate limits](#rate-limits)).

### 9.15 `POST /api/v1/admin/groups`, and `PUT` and `DELETE /api/v1/admin/groups/{id}` (`Checkpoint 7`)

Added in 0.14 (BAC-128 and BAC-132). Make a group, set its fields, or delete it.

**Request**, for `POST` and `PUT`:

```json
{ "name": "Group 1", "tags": ["Mixer", "Year 1"], "location": "Table 3", "capacity": 4 }
```

| Field | Rules |
|---|---|
| `name` | Required. Trimmed, then 1 to 80 characters, counted as Unicode code points |
| `tags` | Optional, at most 5, each trimmed, then 1 to 80 characters. Left out means none. They are shown and change nothing about allocation |
| `location` | Optional. Trimmed, then at most 80 characters. Blank, `null` or left out means none |
| `capacity` | Optional. A whole number above 0, or `null` or left out for any number |

- A field left out is none, so a `PUT` sets every field, and the screen sends them all.
- `POST` answers `201` with the group, as the board lists it (9.14), with no members.
- `PUT` answers `200` with the group, as the board lists it. It moves nobody, even when the
  capacity drops below the group's size.
- `DELETE` answers `204`. The group's members go back to waiting, to be placed at the next
  Allocate, and nobody else moves.
- A name another group has gets `409 name_taken`, and changes nothing. Capitals don't make a
  name different, so "Team A" and "team a" are one name.
- Each writes a log line, `group_created`, `group_changed` or `group_deleted`, with the
  organizer's user ID and the group's ID.

**Errors:** `unauthenticated`, `forbidden`, `validation_failed`, `not_found` for a `PUT` or
`DELETE` of a group that doesn't exist, `name_taken`, and `rate_limited`
([Rate limits](#rate-limits)).

### 9.16 `PUT` and `DELETE /api/v1/admin/groups/members/{user_id}` (`Checkpoint 7`)

Added in 0.14 (BAC-132). An organizer's own move of one person. `{user_id}` is from the board.

**Request**, for `PUT`:

```json
{ "group_id": "…" }
```

`group_id` is required: a group's ID, or `null` to send the person back to waiting.

- `PUT` answers `200` with the board (9.14), so the screen needs no second read. The move may
  pass the group's capacity. Their `how` becomes `organizer` and their `placed_at` the time of
  the move, or both `null` for waiting. Putting someone where they already are changes nothing.
- A `PUT` for a user who hasn't joined joins them now, with the time of the move as their
  `joined_at`.
- `DELETE` answers `204` and takes the person off the board, as someone who has left, so they
  stop counting toward a group's size. They can join again, as a latecomer once allocation has
  started.
- A `PUT` that names an account on the organizer list gets `403 forbidden`, since an organizer
  is never placed. The Groups screen can't send one, because the board never lists an organizer.
- Each writes a log line, `group_member_moved` or `group_member_removed`.

**Errors:** `unauthenticated`, `forbidden`, `validation_failed`, `not_found` for a `PUT` whose
user or group doesn't exist and for a `DELETE` of someone who hasn't joined, and `rate_limited`
([Rate limits](#rate-limits)).

### 9.17 `POST /api/v1/admin/groups/allocate`, `/split` and `/reset` (`Checkpoint 7`)

Added in 0.14 (BAC-130, BAC-133 and BAC-138). The Groups screen's three presses
([Groups](#groups)).

**Allocate** takes no body. It places everyone waiting, and answers `200` with the board
(9.14). It answers `409 no_groups` with no groups, and `409 too_few_participants` when fewer
than 2 participants have joined for each group:

```json
{ "error": "too_few_participants", "needed": 1 }
```

`needed` is how many more must join. A refusal places nobody and doesn't start allocation.
Later arrivals and an organizer's own moves are never refused this way.

**Split** makes the groups and allocates everyone who has joined, in one step:

```json
{ "people_per_group": 4, "locations": ["Table 1", "Table 2", null] }
```

| Field | Rules |
|---|---|
| `people_per_group` | A whole number, 2 or more. Each group gets it as its capacity |
| `group_count` | A whole number, 1 or more. The groups get no capacity |
| `locations` | Optional. One for each group, in order, each with a group's location rule (9.15). `null`, blank or missing is none, and any past the last group go unused |

- Send exactly one of `people_per_group` and `group_count`. Both, or neither, gets
  `validation_failed`.
- By people per group, the number of groups is the smaller of two numbers: the joined
  participants divided by the people per group, rounded up, and the joined participants divided
  by 2, rounded down. So nobody goes over the number entered where that's possible, and nobody
  is alone in a group. 5 joined at 2 a group gives groups of 3 and 2, and 3 joined at 2 a group
  gives one group of 3.
- By number of groups, everyone is split evenly. 10 joined with 3 groups gives 4, 3 and 3.
- The groups are named "Group 1", "Group 2" and so on, with no tags.
- It answers `201` with the board (9.14), since it makes groups. Allocate answers `200` with
  the same body.
- Groups that exist with nobody placed in any, as after a Reset, are replaced.
- With anyone placed in a group, it answers `409 groups_exist`, so it can't overwrite a board in
  use. When fewer than 2 participants have joined for each group it would make, it answers
  `409 too_few_participants` with `needed`. Either way nothing is made or changed.
- Two splits at once make one set of groups: one answers `201`, and the other `groups_exist`.

**Reset** takes no body, and answers `200` with the board. Everyone leaves their group and the
waiting list, allocation goes back to not started, and every word of the phrase is taken back.
The groups, the connection rule, the challenge and the phrase stay. Connections already made
stay too.

Each writes a log line: `groups_allocated`, `groups_split` with how many groups, or
`groups_reset`.

**Errors:** `unauthenticated`, `forbidden`, `validation_failed` for a split, `no_groups` for
Allocate, `too_few_participants` for Allocate and a split, `groups_exist` for a split, and
`rate_limited` ([Rate limits](#rate-limits)).

### 9.18 `GET /api/v1/admin/groups/export.csv` (`Checkpoint 7`)

Added in 0.14 (BAC-134). Everyone who has joined the groups, as a file, so the report can
measure the time from joining to being placed. A Reset empties it, so the Groups screen says to
download it first.

**Response `200`**, with `Content-Type: text/csv; charset=utf-8` and
`Content-Disposition: attachment; filename="geekykey-groups.csv"`.

Columns, in order: `user_id, display_name, group_name, joined_at, placed_at, how`.

- One row for each person who has joined, oldest join first.
- `group_name`, `placed_at` and `how` are empty for someone waiting.
- Times are UTC ISO timestamps, and values are escaped as in 9.6.

**Errors:** `unauthenticated`, `forbidden`, and `rate_limited` ([Rate limits](#rate-limits)).

### 9.19 `PUT /api/v1/admin/connections/rule` and `/challenge` (`Checkpoint 7`)

Added in 0.14 (BAC-140 and BAC-161). The Groups screen's two settings for connections
([Connections](#connections)). Each is one setting for the whole event, kept in the database,
so every server instance reads the same one and a restart keeps it.

**The rule.** The body and the `200` answer are both:

```json
{ "connect_across": "groups" }
```

`connect_across` is `token_kinds`, which a new event starts on, or `groups`. Each tap and each
accept is judged by the rule at that moment, and connections already made stay.

**The challenge.** The body and the `200` answer are both:

```json
{ "challenge": "dice" }
```

`challenge` is `random`, which a new event starts on, `dice` or `reaction`. A connection plays
what the setting says when it's made, and connections already made keep theirs. A team duels
round reads it when its teams are made ([Team duels](#team-duels)).

Each writes a log line, `connection_rule_changed` or `connection_challenge_changed`. The board
(9.14) gives both settings.

**Errors:** `unauthenticated`, `forbidden`, `validation_failed` for any other value, and
`rate_limited` ([Rate limits](#rate-limits)).

### 9.20 `PUT /api/v1/admin/groups/phrase` (`Checkpoint 7`)

Added in 0.14 (BAC-169). Set the phrase, or turn it off ([Groups](#groups)).

**Request**

```json
{ "phrase": "make something people want" }
```

- `phrase` is text of 2 to 12 words, each at most 20 characters, counted as Unicode code
  points. Any run of spaces or line breaks separates two words, and punctuation stays on its
  word. `null` or blank text turns the phrase off.
- It answers `200` with the board (9.14).
- A phrase that differs from the one set takes every word back and deals them again to everyone
  placed. What each person has collected is then counted again from the connections they
  already have. The same phrase again changes nothing.
- It writes a `phrase_changed` log line with the organizer's user ID and the number of words,
  never the words.

**Errors:** `unauthenticated`, `forbidden`, `validation_failed` for a phrase outside the limits,
and `rate_limited` ([Rate limits](#rate-limits)).

---

## 10. GeekyKey admin endpoints

The station jobs moved to each Event Service's organizers in version 0.3 (9.7 to 9.9).
A GeekyKey admin releases someone else's token through 8.3 with `owner_id`, and manages
GeekyKey's list of token kinds below. Station jobs remain with each Event Service.

Added in 0.14 (BAC-139, BAC-152 and HAR-31).

### 10.1 Totals and loading: `GET` and `POST /api/v1/admin/token-kinds`

**Auth:** `gk_session`. GET allows a GeekyKey admin or a user in `TOKEN_KIND_VIEWERS`, the
organisers copied from the Event Services' settings. POST allows only a GeekyKey admin.
`GET /api/v1/me` (8.4) adds optional `user.can_view_token_kinds`, true for either list;
an older service omits it, meaning false. Admin status remains `user.is_geekykey_admin`.

GET answers `200` with `{ "kinds": [{ "kind": "E", "tokens": 12 }] }`, sorted by kind.
These totals count only UIDs on the kinds list, including claimed ones.
POST takes `{ "tokens": [{ "uid": "04A1B2C3D4E5F6", "kind": "E" }] }`, from 1 to 500
entries. UIDs follow section 4, and a loaded kind is one capital letter. A repeated UID
takes its last kind. The response is `200` with `{ "new": 1, "changed": 0, "unchanged": 0 }`.
Loading removes nothing and leaves each token's `written_at` alone (10.4). Each load logs
`token_kinds_loaded` with `loaded_by` and the counts.

**Errors:** `unauthenticated`, `forbidden`, `validation_failed` (POST), `rate_limited`,
`claims_unavailable`. A load whose reply is lost may still have happened.

### 10.2 Every token: `GET /api/v1/admin/token-kinds/tokens`

**Auth:** `gk_session`, GeekyKey admins only, checked before reading or validating the request.
An organiser without GeekyKey admin access gets `403 forbidden` and no UIDs or owner IDs.

Answers `200` with `{ "tokens": [...] }`, every UID on the kinds list or currently claimed,
once each, in ascending UID order. There is no server pagination or filtering; the screen
searches by UID, filters by kind (including no kind) and by ownership,
sorts by UID or kind (FRO-145), and pages 50 rows at a time.
Each item has `uid`, `kind` (string or null), `owner_id` (string or null) and `claimed_at`
(UTC ISO timestamp or null). An unclaimed token has null for both claim fields. A claimed
token without a kind is included with `kind: null`. A previously loaded kind may have up
to 32 characters, as in 11.2; loading still takes one capital letter.

**Errors:** `unauthenticated`, `forbidden`, `rate_limited`, `claims_unavailable`.
The list has the same 4-second claims deadline as other GeekyKey screen requests.

### 10.3 Remove a kind: `DELETE /api/v1/admin/token-kinds/{uid}`

**Auth:** `gk_session`, GeekyKey admins only, checked before path validation.
UIDs follow section 4, including normalisation and percent-encoding path separators.
No request body. Success is `204` with no body. Only the kinds-list entry is removed;
this never releases a claim. The UID can be loaded again through 10.1.

A currently claimed UID answers `409 token_claimed`, including one with no kind.
A UID with no claim and no kind answers `404 not_found`. The claims stand-in checks the
claim and removes the kind in one transaction, serialised with claiming the same token.
Each successful removal logs `token_kind_removed` with `removed_by` (the admin's user ID)
and `uid`. A lost reply can mean the removal happened; refresh before trying again.

**Errors:** `unauthenticated`, `forbidden`, `validation_failed`, `not_found`, `token_claimed`,
`rate_limited`, `claims_unavailable`.

### 10.4 The token writer: `POST /api/v1/token-writer/tokens`

Added in 0.14 (HAR-31). The writer uploads each token's kind as it
writes it. The same kinds list feeds the totals in 10.1; the paste load there still works.

**Auth:** `Authorization: Bearer gk_wri_<64 lower-case hex>`, separate from station keys.
The Worker keeps only its SHA-256 in the optional secret `TOKEN_WRITER_KEY_HASH` and compares
in constant time, before reading the body. An absent or malformed secret, missing header or
wrong key answers `401 unauthenticated`. A session cookie or station key grants no access;
the writer key grants access to no other route.

**Request:**

```json
{ "tokens": [{ "uid": "04E45150324189", "kind": "E", "written_ago_ms": 1234 }] }
```

From 1 to 50 entries. UIDs follow section 4, `kind` is one capital letter A-Z, and
`written_ago_ms` is an integer from 0 to 604800000 (7 days), measured on the writer's timer.
The writer needs no clock. The server sets `written_at` to request arrival time minus that
age, in UTC with millisecond precision. Within a request, a repeated UID keeps the later
write, or the later array entry on a tie, and is counted once.

A write applies when the UID is new, has no `written_at`, or has a strictly earlier one.
It sets both kind and write time. An equal or earlier write counts as `outdated` and changes
nothing, so an old upload arriving late cannot undo a newer write. The whole load applies
or none does. A paste load (10.1) sets the kind and preserves any existing write time;
a new paste-only row has none.

**Response `200`:** `{ "new": 1, "changed": 0, "unchanged": 0, "outdated": 0 }`.
An applied write of the same kind counts as `unchanged` but advances its write time.
Each upload logs `token_kinds_uploaded` with the counts and never the key.

**Errors:** `validation_failed` (400), `unauthenticated` (401), `rate_limited` (429),
`claims_unavailable` (503). The writer key has its own limit of 60 requests a minute,
separate from users and stations, with `Retry-After: 60`. The claims deadline is 4 seconds;
an upload whose reply is lost may still have happened.

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
buttons on My tokens and the token page open one. One whose entry says
`"login_links_to_geekykey": true` can also make login links to the GeekyKey screens (7.5), and
marks them used when asked (11.11). One that plays connections can also take
meetings (11.10), if its entry in the GeekyKey Service's settings says so. It also creates its own stations and issues their keys, in whatever way suits it; ours
does it on the station board (9.7 to 9.9). Any Event Service can send its stations station
messages (11.12), and no game needs them.

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
    { "station_id": "ca939e19-8216-4b95-8375-5b54e543c5f6", "key_hash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", "idle_lines": ["Passport", "Tap your token"] }
  ]
}
```

| Field | Type | Rules |
|---|---|---|
| `station_id` | string | The station's ID, unique across every Event Service. Ours are UUIDs |
| `key_hash` | string | The SHA-256 of the station key, as 64 lower-case hex characters. Never the key itself |
| `idle_lines` | array of strings, optional | What the station shows between taps, from its game: 1 or 2 lines with 6.1's `lines` rules. The GeekyKey Service gives them to the station in the heartbeat's answer (6.2). Leave it out for a station whose game gives none. An Event Service from before it leaves it out for every station, which keeps each on `Ready` / `Tap a tag` (BAC-181) |

- List enabled stations only. A disabled station drops off, and within a minute its key gets
  `401`.
- Nothing else goes in the list: no label, no location. `idle_lines` is the one exception, since
  the GeekyKey Service answers a heartbeat before it hands it to you (11.3).
- An `idle_lines` that breaks 6.1's rules is left out and logged, and the rest of the list still
  counts. Its station keeps its key and its own idle screen, so a bad text never turns a station
  away, or keeps a disabled one working on the last list.
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
    { "client_tap_id": "tap-000123", "user_id": "<user ID>", "tapped_at": "2026-10-10T01:00:00.000Z", "kind": "E" },
    { "client_tap_id": "tap-000124", "user_id": "<user ID>", "tapped_at": null, "kind": null }
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
| `taps[].kind` | string or `null`, optional | The tapped token's kind, 1 to 32 characters, from GeekyKey's list of token kinds (ADR 0006). `null` for a token with none. Ours sends it on every tap, and a GeekyKey Service from before kinds leaves it out |

**Response `200`**

```json
{
  "results": [
    { "client_tap_id": "tap-000123", "status": "accepted", "lines": ["Alex: 3 of 6", "Next: B3"] },
    { "client_tap_id": "tap-000124", "status": "cooldown", "lines": ["Alex: 3 of 6", "Next: B3"] }
  ]
}
```

- One result per tap, in request order, with the same `client_tap_id`s.
- `lines` and `complete` are optional, with 6.1's rules. The GeekyKey Service passes them to the
  station unchanged with `accepted` and `cooldown`, and leaves them out with any other status,
  even one of your own. A line that breaks 6.1's rules fails the whole request, as a status that
  isn't snake_case does (11.5). An Event Service that sends neither gets the station's own screen
  for the status.
- `countdown` is optional too, with 6.1's rules, and passes to the station the same way, only with
  `accepted` and `cooldown` (BAC-181). One that breaks them fails the whole
  request as a bad line does. A GeekyKey Service from before it drops it, and the station shows
  `lines`.
- `status` is a snake_case string. Ours answers `accepted`, `cooldown`, `no_game` or
  `duplicate`. Another team's may answer statuses of its own, which the GeekyKey Service passes to
  the station unchanged.
- `kind` belongs to the token, and the user can hold tokens of more than one kind. Ours keeps the
  first kind it sees for each user, and gives it in 8.1. Another Event Service can use it as it
  likes, or ignore it.
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
GeekyKey Service sends it on every request under `/geekykey/v1`.

### 11.7 The JSON Schema

The bodies of the three requests and their answers are Zod schemas in `packages/handoff`. Both
our services check against them, and a JSON Schema generated from them with `z.toJSONSchema` is
for other teams, in `packages/handoff/json-schema/`. The registered stations' answer and the
hand-off's two are there, and so is the heartbeat hand-off's request. Its answer has no body.

- A station message's request and answer are there too (11.12): `station-messages-request.schema.json`
  and `station-messages-answer.schema.json` (BAC-182).
- The files leave other fields allowed, since fields are only ever added (section 1).
- A JSON Schema can't say that the hand-off's results match its taps one for one, or that `{s}`
  appears at most once across a countdown's lines. The GeekyKey Service checks both (11.5).

### 11.8 What the hand-off leaves out

- The token's UID. An Event Service sees only users, and the token's kind (11.2), never which token
  it came from.
- Who owns which token. The GeekyKey Service finds owners itself: from a claims stand-in on our
  own server until the switch after the showcase, then from the Portal. An Event Service never
  builds or calls either.
- Taps the GeekyKey Service turned away as `unknown_token`.
- The source. Every tap in a hand-off comes from a station; our QR fallback lives inside the
  Event Service.
- When the GeekyKey Service received the tap. The Event Service uses its own clock.
- The user's name. An Event Service that needs one takes it from the login, or from a login
  link (11.9). Names go the other way only in the meeting hand-off's answer (11.10).

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
{ "v": 1, "sub": "Xb3…", "name": "Alex", "exp": 1795006860, "jti": "9f2c4e…", "kind": "E" }
```

| Field | Meaning |
|---|---|
| `v` | Always `1`. Any other value is refused |
| `sub` | The user ID, 1 to 128 characters, as in the hand-off (11.2) |
| `name` | The name from the user's login, at most 100 characters, cut there if longer. `null` when the login had none, as a guest's has none |
| `exp` | When it expires, in seconds since 1970 (UTC), 60 seconds after it was made |
| `jti` | 16 random bytes as 32 lower-case hex characters, so each link can be used once |
| `kind` | The kind of the token whose page made the link, with 11.2's rules, while the user owns that token (8.6). `null` otherwise. Optional: a link from a GeekyKey Service before kinds leaves it out, which means `null` |

The Event Service compares the HMAC in constant time, then checks `v`, `exp` and `jti`, and
answers `invalid_login_link` (401) if any check fails. It never logs a link.

**The other way** (BAC-157). A login link to the GeekyKey screens (7.5 and
8.12) has the same format, and the Event Service makes it. Its key is derived the same way, with
the info `geekykey login link to geekykey` in place of `geekykey login link`, so a link made for
one service's screens never logs anyone in on the other's. Its `kind` is always `null`. The
GeekyKey Service compares the HMAC with each trusted Event Service's key in turn, then checks `v`
and `exp`, and has the Event Service that made it check `jti` (11.11).

Such a link can name any user, so the GeekyKey Service accepts one only from an Event Service whose
entry in its settings says `"login_links_to_geekykey": true`. An entry that leaves it out is
`false`. At the showcase, ours is the only one, and says `true`.

### 11.10 The meeting hand-off: `POST /geekykey/v1/meetings` (`Implemented`)

Added in 0.12. The GeekyKey Service calls this when a user taps their phone on someone else's
token (8.8), on each Event Service whose entry in its settings takes meetings. Ours does: its
entry in `EVENT_SERVICES` says `"meetings": true`, and an entry that leaves it out takes none.

**Auth:** `Authorization: Bearer <Event Service key>`.

**Request**

```json
{ "user_id": "<the tapper's user ID>", "user_kind": "E", "owner_id": "<the owner's user ID>", "owner_kind": "B" }
```

| Field | Type | Rules |
|---|---|---|
| `user_id` | string | 1 to 128 chars. The user who tapped |
| `user_kind` | string or `null` | The kind of the tapper's own token claimed first, with 11.2's rules, or `null` |
| `owner_id` | string | 1 to 128 chars, never the same as `user_id`, which gets `validation_failed` with its issue under `["owner_id"]`. The owner of the token tapped |
| `owner_kind` | string or `null` | The tapped token's kind, with 11.2's rules, or `null` |

**Response `200`**

```json
{ "status": "waiting", "owner_name": "Sam", "owner_bio": "Building a robot arm", "owner_avatar": { "character": "dress", "skin": "warm", "hair": "auburn", "suit": "emerald" } }
```

`owner_name` is the owner's current name, a string of at least 1 character, for every `status`. It
is `null` when they have no name of their own (`has_name` in 8.1 would be `false`) or this Event
Service has never seen them. The token page shows it so that two people notice they hold each
other's tokens (BAC-143).

`owner_bio` is the owner's current bio (8.7), a string of at least 1 character, for every `status`.
It is `null` when they have none or this Event Service has never seen them. It doesn't depend on
`owner_name`, so an owner with no name of their own can still have one. The token page shows it
under their name, and the answer never gives a contact line (BAC-151).

For the next version, after 0.14 (BAC-191), `owner_avatar` is the owner's current saved look
(8.7), for every `status`. It is `null` when they have saved none or this Event Service has
never seen them. The GeekyKey Service passes it on and stores no looks.

| `status` | Meaning |
|---|---|
| `answers_needed` | The tapper has no name or has not answered every question, or a tap back would complete an older request whose sender has not finished. No new half is kept, no request is sent, and no connection is made. An existing request stays (BAC-144) |
| `waiting` | The owner has a connection request from the user, which waits until they answer it. A request already waiting stays as it is |
| `connected` | The user had a request from the owner, so this tap accepted it, and the two are connected |
| `already_connected` | The two were connected before. Nothing changes |
| `same_kind` | Across token kinds, both have a kind and the two kinds are equal ([Connections](#connections)), so no request is sent |
| `no_kind` | Across token kinds, either person has no kind, so no request is sent (BAC-135) |

- The participant's name and every answer are checked before kinds and groups. An event without
  an answers game needs only the name. Organizers keep their existing behaviour. Only the tapper
  is checked when sending a request; the owner can finish setup before accepting it (BAC-144).
- When the rule refuses the tap (`same_kind` or `no_kind` above, and BAC-140's `same_group` and `no_group`), a
  request already waiting from the owner goes too, because a tap back counts as accepting it. A
  request the user sent stays.
- Ours uses its own kind for each user (8.1) when it has one, and the hand-off's otherwise, which
  then becomes the user's kind as a tap's does (11.2).
- A user it hasn't seen yet is added, as a tap's user is.
- The 4-second deadline and the failures in 11.5 apply, with `unavailable` given to the token
  page (8.8) instead of a station's `503`. The GeekyKey Service doesn't retry.
- It works with either service's previous version: a GeekyKey Service from before 0.12 never
  calls it, and an Event Service from before answers `404`, which 8.8 reads as no meetings. The
  statuses don't change with connection requests (BAC-149): `waiting` only comes to mean a request
  rather than a half that expires. A GeekyKey Service from before `owner_name` ignores the field.
  A GeekyKey Service that knows the field reads an answer without it as `null`. `owner_bio` works
  the same way (BAC-151).
  A GeekyKey Service from before `owner_avatar` ignores it. One that knows it reads a missing
  field as `null`. It drops unknown keys inside the look before checking its four required
  values against 8.7's rules. A wrong shape or value then reads as `null` too, so a bad look
  never makes a meeting `unavailable` (BAC-191).
  A GeekyKey Service from before `answers_needed` treats that unknown status as a malformed
  answer and gives `unavailable`, with no half kept by the Event Service. An older Event Service
  still gives its existing statuses, which the new GeekyKey Service accepts (BAC-144).
- `no_kind` separates a missing kind from two equal kinds (BAC-135). Setup is still checked first,
  and across groups a missing kind doesn't refuse a connection. A GeekyKey Service from before
  this status treats it as a malformed answer and gives `unavailable`. A screen from before it
  shows its existing failure message rather than making a connection. Deploy the screens before
  the GeekyKey Service to show the specific sentence. An older Event Service still gives
  `same_kind` for a missing kind, which the new GeekyKey Service and screens accept.
- Like the tap hand-off, it leaves out the token's UID (11.8).
- Its JSON Schemas join the others in `packages/handoff/json-schema/` (11.7).

**Errors:** `invalid_event_service_key`, `validation_failed`.

### 11.11 Marking a login link used: `POST /geekykey/v1/used-login-links` (`Checkpoint 7`)

Added in 0.14 (BAC-157). The GeekyKey Service calls this when a login link to its
screens (7.5), made by this Event Service, checks out there. The GeekyKey Service keeps no
database, so the Event Service keeps each link's `jti` until it expires, and a link works once.

**Request**, with the Event Service key:

```json
{ "jti": "9f2c4e00000000000000000000000000", "expires_at": "2026-11-18T13:01:00.000Z" }
```

**Response `200`**

```json
{ "first_use": true }
```

- `first_use` is `true` the first time a `jti` is marked, and `false` every time after. Of two
  requests for the same `jti` at once, one gets `true`.
- `expires_at` is the link's `exp`, so the Event Service can forget the `jti` once the link can no
  longer be used.
- Our Event Service keeps these in the same table as the `jti`s of links to its own screens (7.4).
  Each `jti` is 16 random bytes, so the two never meet.
- An Event Service from before BAC-157 answers `404 not_found`, and the GeekyKey Service answers
  the screens `event_service_unavailable`. Deploy the GeekyKey Service before the Event Service
  starts making these links, or My tokens opens links nothing can check.

**Errors:** `validation_failed`; `invalid_event_service_key` (401).

### 11.12 Sending a station message: `POST /api/v1/station-messages` on the GeekyKey Service (`Checkpoint 8`)

Added in 0.14 (BAC-182). The one request an Event Service makes to the GeekyKey
Service: send one of its own stations a station message, which the station shows with no tap. The
GeekyKey Service passes it down the station's socket (6.3), and keeps nothing.

**Auth:** `Authorization: Bearer <Event Service key>`: the sender's own key, which the GeekyKey
Service compares with each Event Service's in constant time. The one it matches is the sender.

**Request**

```json
{ "station_id": "ca939e19-8216-4b95-8375-5b54e543c5f6",
  "lines": ["Blue to B", "Tap here"],
  "countdown": { "seconds": 20, "lines": ["Blue to B", "{s}s left"], "ending": ["Missed it", ""] },
  "beep": true }
```

| Field | Type | Rules |
|---|---|---|
| `station_id` | string | One of the sender's registered stations (11.1) |
| `lines` | array of strings | 1 or 2 lines, with 6.1's `lines` rules |
| `countdown` | object, optional | With 6.1's `countdown` rules |
| `beep` | boolean, optional | `true` for one attention beep. Left out means `false` |

**Response `200`**

```json
{ "delivered": true }
```

- `delivered` is `false` when the station had no socket open, or its socket couldn't take the
  message in time. The message is dropped, not kept for later. A game must work without it, as the
  heartbeat's `idle_lines` and each tap's answer still reach the station.
- `true` means the GeekyKey Service sent it down the socket. It doesn't mean the station showed it.
- A `station_id` that isn't on the sender's registered stations gets `validation_failed`, as the
  hand-off answers one that isn't the Event Service's own (11.2). That includes another Event
  Service's station and a disabled one. The GeekyKey Service checks against its copy of the
  registered stations, refreshed at most a minute before. While your list can't be fetched, it
  keeps the last one it had (11.1), so a station disabled since then still gets messages until a
  fetch succeeds.
- A line that breaks 6.1's rules gets `validation_failed`, as a bad line fails a tap's hand-off.
- There is no retry and no queue. Ours waits at most 2 seconds for the answer, and never makes a
  tap's answer wait for it.
- Neither side logs the key or the message's lines.

**Errors:** `validation_failed`; `invalid_event_service_key` (401); `event_service_unavailable`
(503) while the sender's registered stations can't be fetched to check the station.

---

## 12. Out of scope for the showcase

Not exposed by the API before the showcase. Listed so nobody builds UI against them.

- Several events at once in one Event Service, or any event CRUD. One Event Service runs one event
  at a time, and a station belongs to one Event Service. Ours runs the showcase.
- Moving a station between Event Services. A reader moved to another event becomes a new station
  there.
- Connections at a connection point, where two tokens are tapped at one station. Connections by
  phone are in scope ([Connections](#connections)).
- Leaderboards.
- WebSocket or server-sent events. Poll the endpoints above.
- Reading a station key back. Replacing one is in scope, for organizers.
- Removing a station's passport settings. An organizer can set the station to another game
  instead (9.11), and it keeps its settings but stops being a stamp slot.
- Editing or deleting taps.
- User profile editing, apart from the name the event shows, the bio and the contact line (8.7).
  A guest can't be turned into a Google account.
- Logging in through the Portal (`GET /auth/login` and `GET /auth/callback`). It replaces
  `POST /auth/firebase` after the showcase
  ([ADR 0004](../docs/adr/0004-the-showcase-logs-in-through-firebase.md)).

---

## 13. Screen to endpoint map

**The GeekyKey screens** (`apps/geekykey-web`, `key.geekshacking.com`)

| Screen | Calls |
|---|---|
| Login | Firebase's web SDK, with Google, GeeksHacking's login or as a guest, then `POST /auth/firebase`, in production; `POST /auth/dev-login` in development |
| Token page, `/t/<UID>` | `GET /api/v1/me`, `GET /api/v1/tokens/{uid}`, then `POST /api/v1/tokens/{uid}/claim` or `DELETE /api/v1/tokens/{uid}`, which a GeekyKey admin also uses to release someone else's token; `POST /api/v1/login-links` with the token's `uid` for the event buttons; `POST /api/v1/tokens/{uid}/meet` once the lookup answers `someone_else` |
| My tokens, the home page | `GET /api/v1/me`, `DELETE /api/v1/tokens/{uid}`, and `POST /api/v1/tokens/{uid}/claim` for the claim-by-code form; `POST /api/v1/login-links` for the event buttons |
| Arriving from the Event screens' My tokens, `/#login=<link>` | `POST /auth/login-link`, then `GET /api/v1/me` (7.5, BAC-157) |
| Signing out from the Event screens, `/sign-out#user=<user ID>` | `GET /api/v1/me`, then for a guest `DELETE /api/v1/tokens/{uid}` for each token and `POST /auth/logout`, or `POST /api/v1/login-links` if they stay (section 3, "Browser sessions") |

The GeekyKey admin screen is Token kinds at `/admin/token-kinds`, described in section 10.
Organisers can open it for totals only.

**The Event screens** (`apps/event-web`, `event.geekshacking.com`)

| Screen | Calls |
|---|---|
| Login | Firebase's web SDK, with Google or GeeksHacking's login, then `POST /auth/firebase`, in production; `POST /auth/dev-login` in development. No guest sign-in |
| Arriving from a login link, `/#login=<link>` | `POST /auth/login-link`, then `GET /api/v1/me` |
| My tokens, in the place menu | `POST /api/v1/login-links`, then opens the GeekyKey screens at `/#login=<link>`, or at `/` when that fails (8.12, BAC-157) |
| Signing out after arriving from a login link | `POST /auth/logout`, then opens `/sign-out#user=<user ID>` on the GeekyKey screens (section 3, "Browser sessions") |
| A guest who signed out on the GeekyKey screens, `/sign-out#user=<user ID>` | `GET /api/v1/me`, then `POST /auth/logout` when it names that user, then opens the GeekyKey login (section 3, "Browser sessions") |
| Participant dashboard | `GET /api/v1/me`, with `connection_requests`, `round` and `phrase`; `POST /api/v1/me/connection-requests/{id}/accept` and `/decline`; `PATCH /api/v1/me` for the bio and the contact line; `GET /api/v1/me/group`, polled, and `POST /api/v1/me/group` for the group card; `POST /api/v1/me/duels/{id}/reaction` |
| Passport / stamp book | `GET /api/v1/me` (the `stamps` array, and `connections` for the reveal); `PATCH /api/v1/me` for the name and the answers |
| Organizer scan log | `GET /api/v1/admin/taps`, polled |
| Organizer station board | `GET /api/v1/admin/stations`, polled; `PUT /api/v1/admin/stations/{id}/passport`; `PUT /api/v1/admin/stations/{id}/game`; `PUT /api/v1/admin/stations/{id}/booth`; `POST /api/v1/admin/stations`; `POST /api/v1/admin/stations/{id}/key`; `POST /api/v1/admin/stations/{id}/disable`, `/enable` |
| Organizer Groups screen | `GET /api/v1/admin/groups`, polled every 5 seconds; `POST /api/v1/admin/groups`; `PUT` and `DELETE /api/v1/admin/groups/{id}`; `PUT` and `DELETE /api/v1/admin/groups/members/{user_id}`; `POST /api/v1/admin/groups/allocate`, `/split` and `/reset`; `PUT /api/v1/admin/connections/rule` and `/challenge`; `PUT /api/v1/admin/groups/phrase`; `GET /api/v1/admin/groups/export.csv` |
| Organizer QR fallback | `POST /api/v1/admin/taps` |
| Organizer summary | `GET /api/v1/admin/stats`, `GET /api/v1/admin/export.csv` |
| Map, on the big screen at our booth | `GET /api/v1/map`, polled every 2 seconds, and `GET /api/v1/map/relay`, every second (BAC-184). Logged in as a map screen, or as an organizer |

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
- The Event screens' login tells a guest who arrived without a login link where to go: "Signed in
  as a guest? Open GeekyKey and tap your event button." sits under the sign-in buttons, and
  **Open GeekyKey** links to `https://key.geekshacking.com/`, where the guest's sign-in and the
  event button are. The GeekyKey screens' login doesn't show the line (FRO-90).
- The GeekyKey screens' login offers **"Continue as guest"**, with the line "No account needed.
  Keep using this phone and browser." under it. The Event screens' login doesn't offer it.
- When a guest signs out, on the GeekyKey screens or through `/sign-out`, they're warned first,
  because a new guest is a new user ID (7.2) and only a GeekyKey admin could release their tokens
  afterwards: **"Sign out of this guest login?"**, with "You can't log back in as this guest, and
  your tokens will be released so anyone can claim them. Your connections and points stay as they
  are." under it, or "You can't log back in as this guest. Your connections and points stay as they
  are." when they hold no tokens, and **Stay signed in** and **Sign out** (FRO-131).
- **Sign out** there reads a fresh `/me` (8.4) and releases each token (8.3), counting `not_found`
  as released, then signs out. If a release fails, the guest stays signed in, and the warning says
  "Couldn't release your tokens, so you're still signed in." above that error's own sentence. Some
  tokens may have gone by then, and pressing **Sign out** again releases the rest. If the fresh
  `/me` names a different user from the one warned, it releases nothing.
- **Stay signed in** closes the warning on the GeekyKey screens. On `/sign-out`, where the Event
  screens have already logged the user out, it opens a login link (8.6) back to the event, or My
  tokens if that fails.
- The screens know a guest from Firebase's `currentUser.isAnonymous`, when its `uid` is the session's
  user ID. When Firebase can't say, they
  release nothing and say "Couldn't check your login. Try again.", so a Google user can't lose a
  token that way. A Google or GeeksHacking user signs out without being asked and keeps their tokens.
- When the Event screens' `/sign-out` can't log the user out, it says **"Couldn't log you out of the
  event"** above that error's own sentence, with **Try again** and **Back to GeekyKey** (FRO-144).
- On `invalid_login_link`, the Event screens say "That link has expired. Tap your token again to
  get back in."
- When `POST /auth/login-link` fails on the GeekyKey screens, whatever the error, they say "That
  link has expired. Open My tokens from the event again." above whatever the session they had
  shows: the login, or My tokens (BAC-157).
- Participants finish setup before the dashboard, passport, activity or group card can render
  (BAC-144). Setup is headed **"Your name and answers"**, or **"Your name"** without questions. When `has_name` is `false`, setup asks **"What should
  we call you?"**, with **Save** and no Skip. On `validation_failed` it says **"Use 1 to 30
  characters."** On `name_taken`, here and wherever the name changes, it says **"Someone already
  has this name. Try another."** under the field and keeps what was typed (BAC-145). Under the field it says **"The organisers, your group, and anyone who taps your
  token or whose token you tap see it. Anyone who taps your token or whose token you tap also sees
  your bio."** (BAC-143, FRO-127 and BAC-151).
- After the name, setup asks every unanswered question in the event's order, one at a time,
  with each choice as a button and no Skip. It says **"Your answers"**, **"Question {n} of
  {total}"** and **"Answer all {total} to get your match when you connect."** Saving the last
  answer opens the event. Someone who skipped before sees setup on their next visit. Someone
  who finished opens the dashboard directly. With no answers game, setup asks only for the
  name. Organizers see no new step. The dashboard and passport keep **Change name** and the
  answers summary; answers can be changed until the first connection, as Adam confirmed for
  BAC-144. The name can always be changed. Someone whose older connection fixed incomplete
  answers is asked only for the missing answers, and can fill them without changing past matches.
- When `connections` gains an item, the passport shows the reveal: **"{match}% match!"**, then
  **"Talk to find out which answers you share."** When `match` is `null` it says **"You're
  connected!"** instead. The list of connections shows **"{match}% match"**, or **"Connected"** when
  `match` is `null`.
- Once a connection's `shared` isn't `null`, it gets a **"Show what we share"** button, which
  lists each shared question with the choice both picked, from `questions`.
- On `answers_fixed`, a screen says **"You've connected, so your answers are set."**
- The reveal and the list of connections show the other person's `display_name`, or **Guest** for
  `null`, then their `bio`, then **"Contact: {contact_line}"**. A field that's `null` takes no line
  (BAC-136 and BAC-147).
- The reveal and the list of connections also show **"You rolled {your_roll}. They rolled
  {their_roll}."**, then **"You win!"** for `win` or **"They win!"** for `loss`. Equal rolls say
  **"You both win!"**. A connection with no `dice` shows no roll or result. The answers and match
  stay visible (BAC-150).
- For a connection with `reaction` (BAC-156), the reveal says how to
  play before anything starts: **"Reaction test"**, **"When the box turns green, tap it as fast
  as you can. Tap before then and you lose. The faster of you wins."** and **"Time left to play:
  {m}:{ss}."**, with an **I'm ready** button. The time counts down while the test is visible,
  including while waiting for green and tapping, and is recomputed when the page returns to the
  foreground. Nothing is timed until it's pressed. Then the box says **"Wait for green…"**, and
  after a random wait of 1.5 to 4 seconds it turns green and says **"Tap!"**. A tap sends the time
  (8.11). At zero the test says **"Checking the result..."** and reads `/me` again; if that read
  fails, it says **"Couldn't check the result. Try again."** with a **Try again** button. After
  playing, before the result, it says **"You took {your_ms} ms."**, or **"Too soon! You tapped
  before green."** for an early tap, then **"Waiting for them to play."**, in the reveal and the
  list. A failed send says **"Couldn't send your result. Try again."** with a **Send again** button
  that sends the same play. A refused play reads `/me` again instead, with **"Checking the
  result..."** while it waits. The list offers the same test, from its instructions, for a
  connection whose test is still to play and that isn't in the reveal, so dismissing the reveal or
  making a newer connection doesn't take the test away.
- Once `result` comes, the reveal and the list say, for the user, **"You took {your_ms} ms."**,
  **"You tapped too soon."** or **"You didn't play in time."**, and for the other person
  **"They took {their_ms} ms."**, **"They tapped too soon."** or **"They didn't play in time."**
  Then **"You win!"** or **"They win!"**, **"You both win!"** for equal times, or **"Nobody
  wins."** when neither has a time. Before the result, a list row with nothing to play says
  **"Reaction test in progress."** (BAC-156).
- The dashboard shows **"Your profile"**, with the user's `bio`, **"Contact: {contact_line}"** and an
  **Change profile** button, or **"No bio or contact line yet. Add them so people you connect with
  can reach you."** with neither. Change profile opens a form headed **"What people see about you."**, with **Bio**, which has **"Anyone who taps your token
  or whose token you tap sees this."** under it, **Contact line**, which has **"People you connect
  with see this."** under it, and **Save** (BAC-151). The contact line's placeholder is
  "@yourhandle on Telegram". Leaving one blank clears it. On `validation_failed` it says "Use at most
  160 characters." or "Use at most 80 characters." under that field. An event with no connections game
  shows none of this (BAC-147).
- While `connection_requests` isn't empty, the dashboard lists each one under **"Connection
  requests"** as **"{display_name} wants to connect."**, then their `bio`, which takes no line when
  it's `null` (BAC-151), with **Accept** and **Decline** buttons,
  and reads `/me` again after a press (BAC-149). On a `same_kind`
  answer it says **"You have the same token kind. Find someone with a different kind."**; on
  `no_kind`, **"This token can't connect yet. Ask an organizer."** (BAC-135); on
  `same_group`, **"You're in the same group. Find someone from another group."**,
  and on `no_group` **"You both need to be in a group to connect. Ask an organiser."**, each with
  **Dismiss**. On `not_found` it says nothing, since the read takes the request away. Declining
  says nothing. On `answers_needed`, it says **"You both need to finish your names and answers
  in the event before connecting."**, with **Dismiss**; the request stays for a retry after setup
  (BAC-144).
- After the meeting call (8.8), when an item's `owner_name` isn't `null`, the token page replaces "This token belongs to someone else" with **"This token
  belongs to {owner_name}."** and **"If you're carrying this token, it isn't yours. Swap it back
  with {owner_name}."** (BAC-143). When an item's `owner_bio` isn't
  `null`, the bio goes straight under "This token belongs to {owner_name}." or "This token belongs
  to someone else", and when it's `null` it takes no line. The name and the bio come from one item:
  the first with a name, or the first with a bio when none has a name (BAC-151). Under those sentences, it shows: for `waiting`, **"Request sent. Ask them to open their dashboard and accept."** (BAC-149); for `connected`,
  **"You're connected!"**; for `already_connected`, **"You're already connected."**; for
  `answers_needed`, **"You both need to finish your names and answers in the event before connecting."**; for
  `same_kind`, **"You have the same token kind. Find someone with a different kind."**; for
  `no_kind`, **"This token can't connect yet. Ask an organizer."** (BAC-135); for
  `same_group`, **"You're in the same group. Find someone from another group."**; for `no_group`,
  **"You both need to be in a group to connect. Open the event to join a group, then tap again."**
  (FRO-146); and for `unavailable`, **"Couldn't connect. Tap their token again."** With `waiting`,
  `connected`, `already_connected` or `answers_needed`, it offers the event's button, which opens
  the dashboard through a login link (8.6), where the reveal comes or setup is finished. `no_group`
  offers it too, because opening the event joins the participant, and a latecomer is placed at once.
  Under `waiting`, `connected` and `already_connected`, it says what that button opens:
  **"Open the event to see your connection once they accept."**, **"Open the event to play your
  challenge."**, and **"Open the event to see your connection."** (FRO-169).
- When a poll of `GET /api/v1/me` shows a new stamp whose `link` isn't `null`, the passport
  shows the stamp's `name` with a button, **"Open their page?"**, which opens `link` in a new
  tab. It never opens the page by itself, since a browser opens one only after a press. A stamp
  with no link shows no button.
- Until its endpoints are live, a screen that answers from the screens' own sample data says so
  above its content. With no service behind the screens at all, it says "Demo data. This screen
  shows sample data." Every screen built so far sends every call to its own service, so with the
  service behind it, it shows no notice.
- Until their first tap, the dashboard says how to start. For an event with the answers game it
  says **"Tap someone's token with your phone to connect."**, and otherwise **"Tap your token at
  any station to start collecting stamps"** (FRO-138).
- Under the dashboard's avatar, a line says **"Loading your avatar in 3D..."**, then **"Drag to
  turn"**. Where 3D can't run it says **"3D isn't available in this browser."**, and when it
  fails to load, **"3D couldn't load. Your avatar is still here."** (FRO-164).
- The station board's game select is labelled **Game**, lists each of 9.2's `games` by name and
  **No game**, and says **"Game saved."** after a change (9.11).
- The organiser's CSV download is the file the service sent, unchanged, unless a value needs
  escaping. The summary and the Groups screen say the rule under the Download CSV button: **"A value that a
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

### Token kinds screen

Only GeekyKey admins see the "Every token" list, with "UID", "Kind", "Owner ID" and
"Claimed" columns. An unclaimed token says "Unclaimed" and "Not claimed". A missing kind
says "No kind". Controls say "Search by UID", "Filter by kind", "All kinds", "Refresh",
"Previous" and "Next". No matches says "No tokens match. Clear the search or choose another kind."
Above the list: "Includes claimed tokens with no kind. Release a claimed token before removing its kind."

"Remove" opens "Remove this UID from the kinds list?", names the UID and says
"This removes its kind. You can load the UID again from the token writer's log. A claimed token must be released first."
The buttons say "Cancel" and "Remove" ("Removing" while pending).
`token_claimed` says "This token is claimed. Release it first, then remove it from the kinds list."
A lost removal reply says to check the refreshed list before trying again. The list and totals
refresh after a load or removal, including a failed request whose reply may have been lost.
Organisers retain the totals from 10.1 and see no token list or removal controls.

Since FRO-145, each claimed token, including one with no kind, also has
"Release", which releases it through 8.3 with the `owner_id` the list showed. It opens
"Release this token?", which names the UID and the "Owner ID" and says "Anyone will be able to
claim it again. Its kind, earlier taps, connections and points stay." The buttons say "Cancel"
and "Release token" ("Releasing" while pending). `not_found` says "Someone else has claimed this
token now, or it has already been released." A reply that may have been lost adds "The release
may have gone through." After a failed release the list refreshes, the dialog says "The
refreshed list shows it unclaimed.", "The refreshed list shows it claimed by <owner ID>." or
"The refreshed list no longer shows this token." ("Refreshing the list." until it answers, and "Couldn't check the list. Refresh it before
releasing again." if that read fails), and
offers only "Close", so another release
starts from a new confirmation. If the list shows a new owner while the dialog is open, it
says "This token's owner has changed since you opened this. Close it and check the list." A
release is never retried by itself. A success shows "Released <UID>. Anyone can claim it now."
The list also has "Sort by" with "UID, A to Z", "UID, Z to A", "Kind, A to Z" and "Kind, Z to A";
kind sorting breaks ties by UID and puts "No kind" last either way. "Ownership" offers "All",
"Claimed" and "Unclaimed". Filters and sorting combine and return to the first page. The count
says "<n> tokens found" ("1 token found" for one), or "<n> of <total> tokens found" while a
filter is set, and "Clear
filters" resets the search, kind and ownership. With an ownership filter set, no matches says
"No tokens match. Clear the search, choose another kind or show all owners." Paging shows only
when there is more than one page. The last column is "Actions".

### Groups screen

Added in 0.14. The organizers' screen at `/admin/groups`, over 9.14 to 9.20.

- It is headed **Groups**, with: "Press Make groups to split everyone who has joined, by people
  per group or by number of groups, or to make each group by hand. Allocate places anyone
  waiting. Move anyone from their menu, or with a mouse, drag them to another group or to
  Waiting. Tick people who are waiting to move them to one group together. Reset empties the
  groups for another trial. Refreshes every 5 seconds."
- The header has **Make groups**, **Allocate** and **Reset**. Allocate shows only while there
  are groups and someone is waiting. Above the board it says **"{n} joined, {n} waiting"**.
- With no groups: **"No groups yet"** and "Once people have joined, press Make groups to split
  them into groups at once. Or use it to make each group by hand, then press Allocate."
- When the board can't be read again, it keeps the last one and says **"Group updates are
  delayed."**
- **Each group** shows its name, then **"{n} of {capacity}"**, or **"{n} in it"** with no
  capacity, its location and its tags. It says **"Over capacity"** past its capacity, and
  **"Fewer than 2 members"** once allocation has started. An empty one says **"Nobody here
  yet."** Last comes **"Reached every other group"**, **"Reached no other group yet"** or
  **"Reached {names}"**, which shows only when the group and another group have members.
- **Each person** shows their name, **"Joined {time}"**, and in a group **"Placed {time}"** and
  how: **"Allocated"**, **"Latecomer"** or **"Moved by an organiser"**. Their menu has **"Move
  to {group}"** for each other group, **"Send back to waiting"** and **"Remove"**. A move or
  removal that fails says why on their row.
- **Waiting** lists everyone with no group, or says **"Nobody is waiting."** Each has a tick
  box. Under the list it says **"Tick people to move them to a group together."**, **"{n}
  ticked"**, or **"Make a group to move people to."** with no groups, beside **Move ticked**,
  which offers **"Move to {group}"**. Anyone it couldn't place is named: **"Not placed:
  {names}. {reason}"**
- A group's menu has **"Edit group…"** and **"Delete group…"**. Deleting asks **"Delete
  {name}?"**, with **"Nobody is in it."**, or **"Its 1 member goes back to the waiting list.
  Press Allocate to place them again."** ("Its {n} members go" for more), and **Cancel** and
  **Delete**.
- Reset asks **"Reset the groups?"**, with "Everyone leaves their group and has to join again,
  and Allocate starts over. The groups stay as they are. Download the CSV first to keep this
  trial's times.", and **Cancel** and **Reset**.
- **Make groups** opens a dialog with three ways: **"By people per group"**, which it starts
  on, **"By number of groups"** and **"By hand"**. The first two say "Makes the groups and
  places everyone who has joined, in one step." By hand says "Participants see its name, tags
  and location when they're placed."
- By people per group, the field is **"People per group"**, with "People per group is each
  group's capacity. The number of groups comes from how many have joined when you press
  Split." By number of groups it is **"Number of groups"**, with "Everyone who has joined is
  split evenly between them. The groups have no capacity." A number that won't do says
  **"Enter a whole number, 2 or more."**, or "1 or more" for the number of groups.
- Under the number, a line says what a press would make: **"Nobody has joined yet."**, **"1
  has joined."** or **"{n} have joined."**, then **"A split needs at least 2."**, **"{n} groups
  need at least {n}."**, **"This makes {n} groups of {n}."** or **"This makes {n} groups: {n}
  of {n} and {n} of {n}."** While anyone is in a group it says only how many have joined.
- **Locations** says "Optional. Where each group's members go.", with a field **"Group {n}
  location"** for each group the line shows, up to 30. Past 30 it adds "Only the first 30 have
  a field here. Set the rest from each group's menu afterwards."
- With empty groups there, the dialog warns **"This replaces the {n} empty groups, including
  their names and locations."**, or "This replaces the empty group, including its name and
  location." for one. The button says **Split**.
- By hand, and **Edit group**, is the group form: **Name**; **Tags**, with "Optional. Up to 5,
  separated by commas, such as Mixer, Year 1."; **Location**, with "Optional. Where its members
  go."; and **Capacity**, with "Optional. Allocate fills every group with room before any goes
  over. Leave it empty for any number." The button says **Create group**, or **Save** for an
  edit. Its checks say **"Give the group a name."**, **"Keep it under 80 characters."**, **"Use
  at most 5 tags."**, **"Keep each tag under 80 characters."** and **"Enter a whole number
  above 0, or leave it empty."**
- On `name_taken` the form says **"Another group has this name. Choose a different one."**
  under the name.
- On `no_groups`, Allocate says **"Make groups first, then press Allocate."**
- On `too_few_participants`, Allocate says **"Each group needs at least 2 people. Wait for
  {needed} more people to join, then press Allocate again."**, with "1 more person" for one.
  The Make groups dialog says the same sentence ending **"then press Split again."**, because
  pressing Allocate after a refused split would find no groups.
- On `groups_exist`, the dialog says **"People are in groups already, so nothing changed. Press
  Reset to empty the groups, then make groups again."**
- **Connections** has two choices: **"Connect across token kinds"**, with "Two people connect
  when their tokens are of different kinds.", and **"Connect across groups"**, with "Two people
  connect when they are in different groups, whatever their tokens." A refused change says
  **"Couldn't change what connections need."**, then the reason.
- **Challenge** says "What each new connection plays. Connections already made keep theirs.",
  with **Random**, "Each new connection gets the dice or the reaction test, picked at random.";
  **Dice**, "Each new connection rolls the dice."; and **Reaction**, "Each new connection plays
  the reaction test." A refused change says **"Couldn't change the challenge."**, then the
  reason.
- **Phrase** says "Each person in a group holds one word, and a connection gives both people
  the other's word. Finishing takes people from other groups." Its status is **"On. {n} of {m}
  people in groups have completed it."** or **"Off. Save a phrase to start."** The field
  counts **"{n} words"**, with "2 to 12 words, each up to 20 characters." under it, and the
  buttons are **Save phrase** and **Turn off**.
- A phrase that won't do says **"Use 2 to 12 words."** or **"Use at most 20 characters in each
  word."** A refused save says **"Couldn't save the phrase."**, then the reason. While the field
  differs from the phrase set, it says **"Not saved yet. People still see {phrase}."**
- With a phrase set it also says: "A different phrase gives everyone a new word, and what each
  person has collected is counted again from the connections they already have. Turn off takes
  the phrase off everyone's phone. Words are dealt for the connection rule at the time, so
  after changing the rule, turn the phrase off and save it again."
- Across groups, with exactly two groups that have members, a phrase of more than 2 words and
  a group smaller than the phrase, it warns: "With two groups that connect only with each
  other, each group needs at least {n} people, one for each word, or some people can't finish.
  Use a shorter phrase, or make a third group."
- The CSV download follows the summary's rule above, and saves `geekykey-groups.csv`.

### Group card, phrase and team duels on the dashboard

Added in 0.14. What a participant sees of 8.13 and of `round` and `phrase` in 8.1.

- **The group card.** Not joined, it is headed **Groups** and says **"Press Join when you're at
  the event, and you'll be put in a group."**, with a **Join** button. Arriving through a login
  link joins without the button.
- Waiting, it says **"You're waiting for a group."**, then **"It will show here. You don't need
  to do anything else."** before allocation has started, or **"Ask an organiser to put you in
  one."** after.
- Placed, it is headed **Your group** and shows the group's name, location, tags and members'
  names. Under **Other groups**, each other group says **Reached** or **Not yet**, then **"Your
  group has reached every other group."** or **"Connect with someone from each group to reach
  it."**
- A card that can't load says **"Your group couldn't be loaded."**, and one whose polls fail
  keeps what it had and says **"Your group's updates are delayed."**
- **The phrase card** is headed **Phrase**, with **"{n} of {total} words"**, and says
  **"Complete the phrase"** or **"You completed the phrase!"**. It shows each word, with a blank
  for one not found yet, and **"Your word is {word}."** Until it is complete it says: "A blank
  is a word you haven't found yet. Tap someone's token with your phone, and when they accept,
  you each get the other's word. Different people hold different words, so meet people from
  other groups too."
- With a phrase, each connection and the reveal say **"Gave you the word {word}."**, **"Their
  word is {word}, which you already had."** or **"You're connected, but they hold no word of
  the phrase."**
- **The team duels card**, while a round is opening, says **"You're in!"**, **"Teams in
  {n}s"**, then **"Making the teams…"** at zero, **"{n} players joined"** ("1 player joined"
  for one), and "Others can tap the station to join. Teams are made automatically, then you get
  an opponent. No need to tap again."
- While it plays: **"Play your duels"**, **"Your team: A"** or **"Your team: B"**, **"Your
  teammates: {names}."** or **"You're on this team on your own."**, **"Teams are mixed for this
  round only."**, and for each duel **"Opponent: {opponent}"**. A dice round says **"The dice
  were rolled for you."** A reaction round shows the reaction test as a connection does, with
  **"{n}s left to play"**, then **"Time is up. Waiting for the result."** The odd player sees
  **"You have two duels because the numbers are odd. {n} of {total} played."**
- When it ends: **"Your team won!"**, **"Your team lost."**, **"Both teams won!"** or **"Nobody
  won this round."**, then **"Your team: {n} duel wins. Other team: {n} duel wins."** ("win" for
  one). Equal counts add **"The teams won the same number of duels."**, or **"No duel was
  won."** at 0 to 0. A win adds **"Your team's win earned an avatar piece."** Each duel is
  headed **"Your duel"**, and offers **"Connect with {opponent}"**: "Tap your phone on
  {opponent}'s token to send a connection request. When they accept, the usual connection rules
  apply." Last, **"Tap the station to start another round."**, and a **Dismiss** button.
- A round with one player says **"Nobody else joined."** and **"Find someone to play with, then
  tap the station again."**
- Away from the dashboard, the passport and activity say **"You're in a team duels round. Open
  the dashboard to play."**, or **"Your team duels result is ready. Open the dashboard."**

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
| 2026-10-30 | Version 0.10: each token has a kind (ADR 0006, BAC-113). The token writer writes it into the token's address, and GeekyKey keeps a list of them beside the claims stand-in, which games trust instead of the address. **New, all optional:** `kind` on each tap in the hand-off (11.2), the kind of the token tapped, or `null` for a token with none; `kind` in the login link's payload (11.9); `uid` in the request for a login link (8.6), so the token page's link carries its token's kind while the user owns it; and `user.kind` on the Event Service's `GET /api/v1/me` (8.1), the first kind either one gave, which `PATCH /api/v1/me` (8.7) answers with too. 8.6 answers `claims_unavailable` when it names a token and the claims stand-in doesn't answer, as section 8's opening now says. 7.4 says a link's kind becomes the user's, and 11.8 that an Event Service sees a token's kind but never its UID. Section 12 drops "archetype quests". A service from before kinds leaves the new fields out, and the other reads that as no kind, so either service can be rolled back alone. The hand-off's JSON Schema is in `packages/handoff/json-schema/taps-request.schema.json` (11.7). |
| 2026-10-30 | Ethan, the screens owner, approved version 0.10, so it is no longer a draft. No endpoint or shape changes (BAC-113). |
| 2026-10-30 | Version 0.11, a draft for Ethan's review: after a passport tap, the station names the participant's next stop, and the passport gives the same one (BAC-98). **New, optional:** `next_stop` on the Event Service's `GET /api/v1/me` (8.1), the stamp slot without the participant's stamp that had the fewest taps made in the last 10 minutes, with its `station_id`, `name` and `booth`, or `null`. A disabled station and one with no booth are never the next stop, and a tie goes to the earlier slot. The passport's second line for the station (6.1) is now `Next: B3` while there is a next stop, in place of `Tap counted!` or `Already counted`, which it still says without one. The shape of `lines` is unchanged. Nothing is removed. |
| 2026-11-02 | Version 0.12, a draft for Ethan's review: connections by phone, and the answers game on top (BAC-116, and the migration spec's section 6, "The answers game"). Two users connect when each taps their phone on the other's token within 2 minutes ([Connections](#connections), in section 4). **New, at `Checkpoint 7`:** `POST /api/v1/tokens/{uid}/meet` on the GeekyKey Service (8.8), which the token page calls once its lookup says `someone_else`; the meeting hand-off, `POST /geekykey/v1/meetings` (11.10), taken by an Event Service whose entry in the GeekyKey Service's settings says so; and `GET /api/v1/hunt` and `POST /api/v1/hunt/skip` on the Event Service (8.9), with the new `409 skip_locked`. **New fields, at `Checkpoint 7`:** `user.question`, `user.answer` and `connections` in the Event Service's `/me` (8.1); `answer` in `PATCH /api/v1/me` (8.7), where `display_name` becomes optional; and `connections`, a count and anonymous links, in the map's data (9.10). The meeting counts toward the GeekyKey Service's 20 lookups a minute. Section 12 keeps connection points out of scope and lets connections by phone in. Section 13 adds the hunt's, the reveal's and the token page's sentences. No field is removed, and each service works with the other's previous version. |
| 2026-11-05 | A draft for the next version, for Ethan's review: the other person accepts a connection with a button (BAC-149, from the 5 Nov meeting with Julian). A tap on someone's token sends them a connection request with no time limit, a tap back still connects, and the 2 minute limit on a half goes. **New:** `connection_requests` in `/me` (8.1) and 8.10's accept and decline, both at `Checkpoint 7`. **Changed:** what `waiting` means in 8.8 and 11.10, and section 13's `waiting` sentence, which also gets the event's button. No status is added, so either service works with the other's previous version. |
| 2026-11-05 | For the next version, which Ethan approved: tapping a token says whose it is, so people notice when tokens are swapped (BAC-143, from the 5 Nov trial). **New, at `Checkpoint 7`:** `owner_name` in the meeting hand-off's answer (11.10) and in each item of 8.8's answer, the owner's current name or `null`. **Changed:** 8.7 says who sees a name, 8.5's row says only the lookup gives no name, and section 13 adds the token page's two sentences and the name prompt's line, which also covers FRO-127. No field is removed, and either service works with the other's previous version. |
| 2026-11-05 | For the next version, whose fields Ethan approved: participants write a bio and a contact line, and people they connect with see both (BAC-147, from the 5 Nov meeting with Julian). **New, at `Checkpoint 7`:** `bio` and `contact_line` in 8.1's `user` and in 8.7's request and answer, and in each item of `connections`, which also gains `display_name` from BAC-136, all three the other person's current values. **Changed:** 8.1 no longer says a connection gives no name, 8.7 says who sees them, and section 13 adds the dashboard's profile and what the reveal and the list show. No field is removed. A screen reads a missing one as `null`, so it works with an Event Service from before them, and the Event Service goes first, since an older one refuses a request with only these two. Ethan's approval covers the fields and the ticket's rules. Section 13 marks the wording the ticket didn't set as a draft for him. |
| 2026-11-06 | For the next version, which Ethan approved, as Adam confirmed on 6 Nov: each new connection keeps a die roll for each person (BAC-150). **New, at `Checkpoint 7`:** `connections[].dice` in 8.1, with `your_roll`, `their_roll` and `result` (`win` or `loss`), or `null` for an older connection. Section 4 records that the Event Service rolls independently from 1 to 6 once per pair, keeps the rolls, and gives both people a win on equal rolls. Section 13 adds the roll sentence and the win, loss and tie sentences for the reveal and the list. Ethan approved the fields and all four sentences. No field is removed, and a screen reads missing dice as `null` to work with the previous Event Service. |
| 2026-11-06 | For the next version, approved as Adam reported: participants give a name and every answer before opening the event (BAC-144). 8.1 and section 13 require setup without Skip and keep organizers on their current flow. 8.8 and 11.10 add `answers_needed`, checked before kinds and groups, with no half kept. The token page says "You both need to finish your names and answers in the event before connecting." and offers the event button. Older GeekyKey Services give `unavailable` for the new status. Names remain editable, and answers keep their first-connection lock, as Adam confirmed on 6 Nov. Adam also approved filling missing locked answers and checking an older request's sender before a tap back or accept completes it; 8.7 and 8.10 record those cases, and past matches stay unchanged. |
| 2026-11-06 | For the next version, approved as Adam reported: two participants can't have the same name, since organisers call names out (BAC-145, from the 5 Nov trial). **New:** `409 name_taken` from 8.7 for a name someone else has, compared after trimming and whatever its capitals, with the default `Guest` not counting. Section 13 adds its sentence. No field changes. Names already the same stay until one person changes theirs. An older Event Service never refuses a name. A screen from before this shows the Groups screen's sentence for the code, so the screens deploy with the Event Service. |
| 2026-11-06 | For the next version: a reaction test as a second game when people connect (BAC-156, from the 5 Nov meeting with Julian). **New, at `Checkpoint 7`:** `connections[].id` and `connections[].reaction` in 8.1, the play at 8.11, and the errors `already_played` and `too_late`. Section 4 records that the Event Service picks the dice or the reaction test at random for each new connection, and how the faster time wins. Section 13 adds how the reveal explains the test before it starts, and the result sentences, as a draft for Ethan. No field is removed. A screen reads a missing `id` or `reaction` as `null`, and an older Event Service gives every connection dice, so either side works with the other's previous version. |
| 2026-11-06 | For the next version: tapping a token, and a connection request, show the person's bio (BAC-151, from the 5 Nov trial notes and the meeting with Julian). **New, at `Checkpoint 7`:** `owner_bio` in the meeting hand-off's answer (11.10) and in each item of 8.8's answer, and `bio` in each item of `connection_requests` (8.1), each the person's current bio or `null`. **Changed:** 8.7 says who sees a bio, 8.5's row says the lookup gives no bio either, and section 13 adds the bio on the token page and in a request, adds a second sentence to the name prompt's line, and changes the sentence under Bio and the profile form's heading. The contact line still shows only after the two connect. No field is removed, and either service works with the other's previous version, since a missing bio reads as `null`. |
| 2026-11-06 | For the next version: a guest who signs out releases their tokens, after a warning, so a token can't stay stuck with a login nobody can use again (FRO-131, from the 5 Nov meeting). Section 13 replaces the warning FRO-62 set, which said the tokens stay with the guest, and Ethan approved the new wording, as Adam reported. A failed release keeps the guest signed in and says why. When Firebase can't say whether the user is a guest, the screens used to ask, and now they release nothing and say so, because going ahead now releases tokens. Section 3 has the Event screens send a user whose session came from a login link to a new `/sign-out` page on the GeekyKey screens. No service changes, and no endpoint or field changes: the page uses 7.3, 8.3, 8.4 and 8.6. Connections, points and earlier taps don't change, as 8.3 already says of taps. |
| 2026-11-06 | For the next version: a guest who signs out on the GeekyKey screens is logged out of the Event screens too, so the next person on a shared phone doesn't find their passport (FRO-144). Section 3 has the GeekyKey screens open a new `/sign-out` page on the Event screens, which logs out only the user the address names, then opens the GeekyKey login. Section 13 adds the sentence for a failed log out, which Ethan hasn't seen. A Google or GeeksHacking user's Event session stays. No service changes, and no endpoint or field changes: the page uses 7.3 and 8.1. |
| 2026-11-06 | For the next version: the agreement follows the decisions of 3 and 4 November (BAC-126). The grad tea was scrapped on 3 November, so the opening and sections 4 and 12 no longer plan for it. The hunt was canceled on 4 November (BAC-121), so 8.9 is empty, and `GET /api/v1/hunt`, `POST /api/v1/hunt/skip`, `tapped_you`, `409 skip_locked` and the hunt's lines in section 13 are removed. The export is now Joshua's analysis, not the A/B analysis, with its shape unchanged. Removing them is an exception to section 1's rule, as in the row of 2026-10-07: no service ever built the routes or sent the field, and no screen uses any of them now, since BAC-149 took `tapped_you` out of the passport. Nothing else is removed. |
| 2026-11-06 | Version 0.13, a draft: the answers game's shapes as built (BAC-116, BAC-119, BAC-120, FRO-112). This replaces PR #235's text of 3 November, whose halves with a 2-minute limit BAC-149 has since replaced, and whose hunt was canceled (BAC-126). **Answers:** `/me` (8.1) gives `questions`, the answers game's list with each question's choices, or `null` without the game, and `user.answers`, a map from question ID to choice ID. `PATCH /api/v1/me` (8.7) takes a partial `answers` map, refuses an unknown question or choice under `["answers", "<question ID>"]`, and answers the new `409 answers_fixed` when a change would alter an answer the user's first connection fixed. **Connections:** each item in `/me`'s `connections` gives `match`, a whole percent or `null`, kept from when they connected; `shared`, the IDs of the questions both answered the same, `null` until `shared_at`; and `shared_at`, 2 minutes after the connection. Each connection adds 1 point (section 4). 8.8, 11.10 and 9.10's `connections` are `Implemented`: one 4-second deadline covers the claims calls and the hand-offs, `user_kind` is `null` if the tapper released their first token in between, a failed hand-off is logged as `meeting_handoff_failed`, and the map numbers a new pair by user ID. An `EVENT_SERVICES` entry takes meetings with `"meetings": true`. A token's kind can be its colour (HAR-30). Section 13 has the match's sentences as the screens show them. 0.12's `user.question`, `user.answer`, `answer` in 8.7 and the connection's `question` and `answer` are replaced; 0.12 was a draft and they were never built. |
| 2026-11-06 | Draft additions for the next version: section 10 records BAC-139's token-kind totals and loading, and BAC-152's admin-only list and removal. New list fields are `uid`, `kind`, `owner_id` and `claimed_at`; new error `token_claimed` (409). Section 13 adds the list and removal wording. No fields or routes are removed. |
| 2026-11-09 | For the next version: a login link from the Event screens logs a user in on the GeekyKey screens as the same user, the reverse of 8.6 (BAC-157). A guest whose sign-in on `key.` is gone can still see their own tokens. **New, at `Checkpoint 7`:** `POST /auth/login-link` on the GeekyKey Service (7.5), `POST /api/v1/login-links` on the Event Service (8.12), and `POST /geekykey/v1/used-login-links` (11.11), since the GeekyKey Service keeps no database to make a link work once. 11.9 adds the key for links that way, derived from the Event Service key with its own info, so no new secret is set. The GeekyKey Service takes such links only from an Event Service whose entry says `"login_links_to_geekykey": true`. Section 13 adds the two screens' rows and one sentence for a failed link, which Ethan hasn't seen. No fields or routes are removed. |
| 2026-11-09 | For the next version: the Event screens' login tells a guest who arrived without a login link where to go (FRO-90). Section 13 adds one line under the sign-in buttons, "Signed in as a guest? Open GeekyKey and tap your event button.", with **Open GeekyKey** linking to `https://key.geekshacking.com/`. The GeekyKey screens' login doesn't show it. No endpoint, field or error code changes. |
| 2026-11-09 | For the next version: a tap with no group offers the event, where the participant joins one (FRO-146). Section 13 gives the token page's `no_group` answer its own sentence, "You both need to be in a group to connect. Open the event to join a group, then tap again.", and the event's button, because opening the event joins the participant and a latecomer is placed at once. The dashboard's answer after Accept keeps its own sentence, "You both need to be in a group to connect. Ask an organiser.", since the person is already in the event there. No endpoint, field or error code changes. |
| 2026-11-10 | For the next version: a missing token kind has its own status, `no_kind`, in the meeting hand-off (11.10), the token page's answer (8.8) and Accept (8.10), under the across-token-kinds rule (BAC-135). `same_kind` now means two equal, present kinds. Section 13 gives each its own sentence on the token page and after Accept. Ethan's approval of `no_kind` and the ticket's sentence was confirmed in the implementation session on 10 Nov; the equal-kinds sentence follows his 10 Nov comment. No field is removed. An older GeekyKey Service turns `no_kind` into `unavailable`, and older screens show their existing failure message. New screens accept every older status. |
| 2026-11-11 | For the next version: a reaction test shows the time left to play, not a fresh two minutes (FRO-152). Section 13 replaces "You have 2 minutes to play." with "Time left to play: {m}:{ss}.", which counts down while the test is visible and is recomputed when the page returns, and adds "Checking the result..." while the test reads `/me` at zero, with "Couldn't check the result. Try again." and a **Try again** button if that read fails. A refused play reads `/me` with the same checking sentence. No endpoint, field or error code changes. |
| 2026-11-12 | For the next version: each stored tap records the game that counted it or held it back, so an organizer can change a station's game at any time (BAC-183). The booth's two stations can then run the passport and change to another game during the demo. Section 4 replaces the rule that fixed a station's game with one where each game reads only its own taps: a stamp and points come from the taps the passport accepted, and the cooldown (6.1) and the next stop (8.1) from the taps it judged, so another game's tap at a passport station earns nothing, and a station set back to the passport shows the stamps it had. 8.1's `earned_at` and `next_stop`, 9.5's stamp slots and 9.10's `unique_participants` count the same way, while 9.10's `taps` still counts every game's, so it never drops. Taps stored before the change record the game their station ran then. **Removed:** `409 station_has_taps`, from section 2, 9.11 and the station board's sentence in section 13, and 9.1's rule that a station whose game was fixed keeps none. Removing an error code is an exception to section 1's rule, as in the row of 2026-11-06: an older screen that still knows it is never sent it. **Changed:** 9.2's `game_fixed` is always `false`, and is removed in the version after this one. No other field changes, and nothing is added to a response. |
| 2026-11-12 | For the next version: the server writes the rest of the station's screen (BAC-181, [ADR 0008](../docs/adr/0008-the-server-writes-the-stations-screen.md)). A tap's result can give a `countdown` that the station counts down itself, with `seconds`, `lines` holding `{s}` for the seconds left, and an `ending` for zero (6.1 and 11.2). The ticket called it `then`, which our linter refuses as a key, since it marks an object as a promise. Team duels gives a countdown while its round is open, and the relay (BAC-184) will use one for a transfer's 20 seconds. **New:** `results[].countdown` in 6.1 and 11.2, `idle_lines` on each registered station (11.1) and in the heartbeat's answer (6.2), and the firmware contract for both. Ours gives the passport's and team duels' idle text. An `idle_lines` that breaks the rules is left out for that station alone, not the whole list. Section 4 says the server writes the screen, and 11.1 lets `idle_lines` into the list. Each service works with the other's previous version: an older GeekyKey Service drops both fields, and an older Event Service sends neither, so its stations keep `Ready` / `Tap a tag`. A station that doesn't know them ignores them and shows `lines`. No field or route is removed. |
| 2026-11-13 | For the next version: an Event Service can send a station a station message, with no tap (BAC-182, [ADR 0009](../docs/adr/0009-the-geekykey-service-carries-station-messages-in-a-durable-object.md)). Each station holds a WebSocket open to the GeekyKey Service, which passes on what the station's Event Service sends for it. **New:** the station's socket, `GET /api/v1/stations/socket` (6.3), with its firmware contract; `POST /api/v1/station-messages` on the GeekyKey Service (11.12), the first request an Event Service makes to it, with the Event Service key it already shares; the status `426` and the error `upgrade_required`; and the JSON Schema of the message's request and answer (11.7). A message carries a tap answer's `lines` and `countdown`, with 6.1's rules, and `beep`. One for a station with no socket answers `delivered: false` and is dropped. Section 3 says the Event Service key now goes both ways, and the station limit counts the requests that open the socket. Each service works with the other's previous version: an older GeekyKey Service answers a message `404 not_found`, which ours treats as a failed message, and a station that doesn't know the socket never opens it. No field or route is removed. |
| 2026-11-13 | For the next version: two stations run the relay, where people from different groups pass a transfer between them (BAC-184). A tap at either relay station starts a game and names a group for the other station; that group's tap there within 20 seconds completes a transfer and calls the next group back. A game is 3 transfers with two groups, or 4 with three or more, and ends at its last transfer or after 2 minutes with no tap. **New:** the relay in section 4 and in 9.2's `games`, as `relay`; its lines, countdowns and station messages in 6.1; its idle text in 6.2; and `GET /api/v1/map/relay` (9.13), which the map polls every second, with a limit of its own of 90 a minute rather than a share of the user's 60. The relay gives no points, stamps or connections. No field or route is removed. |
| 2026-11-14 | Version 0.14, a draft for Ethan to read (BAC-137). It gathers every row above marked "for the next version", from 5 to 13 November, into one version and drops those labels from the text. It also writes down what was built with no text here until now. **Participant groups** (BAC-125): section 4's "Groups", `GET` and `POST /api/v1/me/group` (8.13), the board `GET /api/v1/admin/groups` (9.14), the group and member writes (9.15 and 9.16), Allocate, the split and Reset (9.17), and the groups CSV (9.18). **New errors:** `409 no_groups`, `409 too_few_participants`, which carries `needed`, and `409 groups_exist`; `name_taken` now has its row in section 2 and also covers a group's name. **The Groups screen's settings:** `PUT /api/v1/admin/connections/rule` and `/challenge` (9.19, BAC-140 and BAC-161) and the phrase, `PUT /api/v1/admin/groups/phrase` (9.20, BAC-169), with `phrase` and `connections[].word` in 8.1. **Groups reached** (BAC-167): `other_groups` in 8.13 and `reached_group_ids` in 9.14. **Team duels** (BAC-155): section 4's "Team duels", `round_wins` and `round` in 8.1, and `POST /api/v1/me/duels/{id}/reaction` (8.14). **Changed, from the firmware as built:** during a countdown, another result shows for 2 seconds and the countdown then comes back, where 6.1 said a new tap ended it (HAR-50). A station message that arrives during a tap's first 2 seconds waits, its beep plays when it shows, and the station reopens a socket whose `pong` is 15 seconds late (6.3, HAR-51). **Section 13:** the Groups screen, the group card, the phrase card and the team duels card, compared with the screens' code, the dashboard's first-tap hint (FRO-138), the station board's game select, and the CSV rule now names the Groups screen. 8.6 says the account menu's link carries no kind (FRO-151). No field or route is removed. The one code removed since 0.13 is `409 station_has_taps`, in the 12 November row (BAC-183). `game_fixed` in 9.2 stays for this version and is always `false`. |
| 2026-11-14 | Added to 0.14, still a draft: section 13 has the three lines under the dashboard's avatar, for loading and for when 3D can't run or load (FRO-164). The code comments that called 0.14's shapes drafts now name the version. No endpoint or shape changes (BAC-137). |
| 2026-11-14 | For the next version, after 0.14: the Event Service keeps each person's avatar look per event (BAC-191). New fields are `user.avatar`, `connections[].avatar` and `connection_requests[].avatar` in 8.1, `avatar` in 8.7's request and `user.avatar` in its answer, and `owner_avatar` in 8.8 and 11.10 for every status. The look has `character`, `skin`, `hair` and `suit`, or is `null` for none. 8.7 sets the shape and value rules, with `400 validation_failed` under `["avatar"]` or one of its keys, accepts `null` to clear it, and lets `avatar` be the only PATCH field. The look goes to the same people as the bio, without earned pieces, and the evening-before clear removes it with the user. The organizers' screens, the export and the map get none. Screens read missing fields as `null` and draw their default for an unknown value. The GeekyKey Service stores no looks, drops unknown keys inside a look, and reads a missing or unreadable `owner_avatar` as `null` without making the meeting unavailable. An `unavailable` item has `owner_avatar: null`. Deploy both services before screens that send `avatar`, since an older Event Service refuses a PATCH with only that field. No field or route is removed, and section 13 is unchanged. |
