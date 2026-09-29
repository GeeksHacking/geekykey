# How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?

Type: grilling
Status: resolved
Blocked by: 12
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

In Julian's station flow, the GeekyKey Service triggers the Event Service directly with the user ID and station ID.

- **The call.** A service binding suits our sample Event Service in the same Cloudflare account. Another team's Event Service outside our account is out of scope, but the design must also work for it, for example as a signed web request.
- **The mapping.** Which Event Service does each station feed? (Not which game: see below.) Where does that live (Julian: "a very light data store for the trigger handlers"), and who changes it?
- **The payload.** The user ID and station ID, plus anything else the Event Service needs, such as `tapped_at` and `client_tap_id`?
- **Failures.** What happens when a token is unclaimed, or the Event Service is down or slow? Stations must not wait seconds for an answer.

**Settled by "Which parts of today's backend belong to the GeekyKey Service, and which to the Event Service?" (28 Sep):**

- A station feeds exactly one Event Service at a time. The link names no game; the Event Service decides which of its games count a tap.
- The hand-off carries users, never a token's ID. Taps by unclaimed tokens never reach an Event Service.
- Every Event Service must drop replays by `client_tap_id` itself, so this belongs in the contract other teams build against.
- The Event Service returns one verdict per tap. Which verdicts exist is for this ticket.
- The Event Service needs a way to ask the GeekyKey Service for the status (last seen) of its own stations.

**Settled by "How do stations talk to the GeekyKey Service?" (28 Sep):**

- The GeekyKey Service answers `no_event`, a new status that is not stored, for a tap at a station linked to no Event Service, and for a tap whose `tapped_at` is earlier than the start of the station's current link. So the link needs its start time, and where it is stored is this ticket's call.
- When the Event Service cannot answer (down, slow or failing), the station hears `503` with error code `event_service_unavailable` for the whole request, keeps every tap in it and resends them. The GeekyKey Service must give up on the Event Service before the station gives up on the GeekyKey Service; the station waits 5 seconds today.
- Stations ignore response fields and statuses they do not know, treating an unknown status as "recorded". So a verdict another team's Event Service adds reaches the station without breaking it, but only statuses in the API agreement get their own screen.

## Answer

Resolved 28 Sep 2026 by grilling with Adam.

**Decided**

- **The hand-off is one HTTP request, the same for every Event Service.** The GeekyKey Service sends `POST /geekykey/v1/taps` to the Event Service the station is linked to. Our sample is reached through a service binding, another team's Event Service through an `https://` URL, and only the line that sends it differs (`env.<BINDING>.fetch(request)` or `fetch(request)`). An RPC method on a named entrypoint was rejected: other teams copy our sample, it would use a path they cannot, and the end-to-end smoke test would test the wrong contract.
- **Both services share the hand-off's types through a workspace package, `packages/handoff`,** holding the Zod schemas for its request and response. The Event Service checks each request with them, as `jsonBody` does today, and the GeekyKey Service checks each response. Types come from `z.infer`, so they hold at compile time and are checked at run time, which RPC types are not. Other teams get the API agreement's section and a JSON Schema generated from the same schemas with `z.toJSONSchema`. The empty `packages/shared` folder is not used: a package named for its one job does not become a junk drawer.
- **The list of Event Services lives in the GeekyKey Service's settings:** for each, an ID, a name, how to reach it (a binding name or an `https://` URL) and its Event Service key as a Workers secret. Adding one is a reviewed change and a deploy, because it decides who receives users' Portal IDs. A table managed on a screen was rejected: it would hold the keys in plain text, since the GeekyKey Service must send them. The showcase has one entry.
- **A station's link is two columns on the GeekyKey Service's `stations` table:** the ID of the Event Service it feeds, or empty, and when the link started. This is Julian's "very light data store"; nothing else, such as KV, is needed.
  - Linking or moving a station sets the start to now. Linking it again to the Event Service it already feeds changes nothing, so its saved taps still count. Unlinking empties both columns.
  - No history table: each change goes to the Workers logs with who made it.
  - A link naming an Event Service that is no longer in the list behaves as no link (`no_event`) and is logged.
  - Accepted cost: a station unlinked by mistake and linked again a minute later loses the taps it saved before the new link.
- **GeekyKey admins create stations and change their links,** not Event Services. They are GeeksHacking people, listed by Portal user ID in the GeekyKey Service's settings, since it keeps no users. An event's organizers ask them. The readers are GeeksHacking's hardware, so lending them to an event is GeeksHacking's call, and no other team's Event Service can ever move a station. Event Services linking stations to themselves was rejected: it needs a rule so one event cannot take another's stations, and it shows every Event Service the free ones. At the showcase Adam's team is both.
- **What the hand-off carries:** one call per station request, with the whole batch.

  ```json
  { "station_id": "…",
    "taps": [ { "client_tap_id": "tap-000123", "user_id": "<Portal user ID>", "tapped_at": "2026-10-10T01:00:00.000Z" } ] }
  ```

  `tapped_at` is `null` when the station sent none or it was wildly off. Left out: the token's ID; taps turned away with `unknown_token` or `no_event`; `source`, which is always a station, since the QR fallback lives inside the Event Service; the GeekyKey Service's receipt time, since the Event Service uses its own clock; and the user's name, which the GeekyKey Service does not know, so an Event Service that needs it asks the Portal. Every Event Service drops replays by station ID and `client_tap_id`.
- **The answer is one status per tap, in request order, with the same `client_tap_id`s.** Our Event Service returns `accepted`, `cooldown`, `duplicate`, or the new **`no_game`**: the tap reached the event and is stored, but no game counts taps at that station, for example one with no passport settings. That is neither `accepted`, which counts in at least one game, nor `cooldown`, and as a status the firmware does not know it would show "Tap received" in blue. With several games: `accepted` if any game counted the tap, otherwise `cooldown` if a game held it back for cooldown, otherwise `no_game`. The station shows `Not in a game` / `Tell organizer` in red. Any other status from another team's Event Service passes through unchanged.
- **The GeekyKey Service gives the Event Service 3 seconds.** The station waits 5, and the key and token lookups need the rest. No answer in time, a response that is not a 2xx, a redirect, or a body the schema rejects all fail the whole station request with `503 event_service_unavailable`, logged with the Event Service's ID. The GeekyKey Service does not retry: the station resends later, which is safe even if the Event Service stored part of the batch. Accepted scenario: a slow Event Service stores the taps after 3.5 seconds; the station shows `Not recorded` / `Please tap again`; the participant's new tap gets `cooldown` ("Already counted"), which is true; the resent taps come back as `duplicate`.
- **The two services prove who they are with one Event Service key per Event Service,** sent as `Authorization: Bearer ...` in both directions. Our sample checks it even over the binding, because the hand-off route also answers on its public hostname, where anyone could otherwise post fake taps for any user. The rules:
  - 32 random bytes, generated like station keys. Nobody picks one.
  - Compared in constant time.
  - The hand-off never follows a redirect (`redirect: "manual"`), because `fetch()` sends `Authorization` on to wherever a redirect points, even another domain. Another team's address must start with `https://`.
  - The key is never logged.

  A leaked key lets someone post fake taps to that one Event Service and read its station list, and nothing else. Two keys, one per direction, signed requests, and no key over the binding were rejected; signing would only help if a request leaked without its key, which the last rule covers. To replace a key, set the new one on both sides outside the event: hand-offs fail with `503` until both match, and stations resend.
- **An Event Service reads its stations' status with `GET /api/v1/event-service/stations` on `api.geekykey.geekshacking.com`,** over HTTPS with its key. Not through a binding back to the GeekyKey Service: a Custom Domain is reachable from the same zone, two Workers binding each other cannot be deployed cleanly the first time, and it is the path other teams use. The address is a setting. It lists only the stations linked to that Event Service now, each with its station ID, device label, link start, last seen, online, firmware version and saved taps. The Event Service gives it 3 seconds, and on failure shows each station's status as unknown, not offline, so organizers do not restart healthy stations. The GeekyKey Service sends no notice when a link changes: the Event Service learns of a station from this call or from its first tap, and creates the station's lock row at that first tap.

**When the GeekyKey Service is down,** nothing new is designed. Stations keep their taps and show `Not recorded` / `Please tap again`. Phones cannot open the token page, so nobody can claim. The Event Service's screens keep working on what is stored, with station status unknown. Stations have no second address to fall back to, which would undo Julian's architecture. With one database, TiDB going down takes both services down. Rolling back and noticing belong to "Backups and event-day recovery" and "Monitoring during the event", still fog on the map.

**The same rules on the station's side.** Adam asked whether they apply to stations too. They do, and three already hold: station keys are 32 random bytes from `generateStationKey`; they are checked by looking up their SHA-256 hash, so the check's timing says nothing useful about the key and the database holds no keys; and the ESP32's `HTTPClient` follows no redirects unless told to. What is new, for the firmware:

- Send the station key over plain `http://` only to a `.local` address. A production address typed with `http://` would send the key unencrypted across the venue WiFi before any redirect to HTTPS could help.
- Leave redirects off.
- Never print the key on the serial port.

Whether Cloudflare's invocation logs record the `Authorization` header matters for station keys as much as for Event Service keys.

**What follows without a further decision**

- Each hand-off counts as one outside request, whatever the batch size, against the free plan's 50 per request.
- The first time, the Event Service is deployed before the GeekyKey Service, because a Worker cannot deploy with a binding to a Worker that does not exist yet.
- `no_game` joins the Event Service's `tap_status` `ENUM`.

**Facts** (checked 28 Sep 2026)

- On the same zone, a Worker can call another Worker only through a service binding, or with `fetch()` to the other Worker's Custom Domain. Calls to a route or a `workers.dev` address fail ([Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), updated 14 Aug 2026).
- Each call through a service binding counts toward the subrequest limit, one request may make at most 32 Worker invocations, and the Worker being called must be deployed first ([Service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/), updated 18 Aug 2026). A binding can also target a named entrypoint ([Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)).
- With the redirect mode `follow`, the default for a `fetch()` a Worker makes itself, all headers, including `Authorization`, go on to the redirect's destination, even on another domain ([Request](https://developers.cloudflare.com/workers/runtime-apis/request/)).
- Invocation logs capture request metadata and headers ([changelog, 7 Apr 2025](https://developers.cloudflare.com/changelog/post/2025-04-07-increase-trace-events-limit/)). The docs do not say whether `Authorization` is hidden. `observability.logs.invocation_logs = false` turns them off ([Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)).
- The ESP32 core 3.3.11's `HTTPClient` defaults to `HTTPC_DISABLE_FOLLOW_REDIRECTS` (`libraries/HTTPClient/src/HTTPClient.h`).

**Glossary**

`CONTEXT.md` gains **Link**, **Hand-off**, **Event Service key** and **GeekyKey admin**. **Organizer** now looks after the event's stations on the day, rather than running them, which read as deciding where they feed. **Station** feeds an event through its link.

**Assets**

- [Message to Zi Tao](../assets/message-to-zi-tao-station-contract.md) gains `no_game` and the three station key rules.

**Passed on**

- The GeekyKey admin screens (create a station, replace its key, change its link); how admins log in through the Portal and are checked against the list in the settings; the Event Service's station list, built from the status call and showing "status unknown" when it fails; and local dev, where the GeekyKey Service must answer on a port of its own, because real stations use `http://A-Mac.local:8000` and the Event Service's status call needs HTTP: "Which screens belong to which service, and how does each know who is logged in?".
- Event Service keys as Workers secrets on both Workers in each environment; the list of Event Services and the GeekyKey admin list in the settings; the binding and the deploy order; the Event Service's setting for the GeekyKey Service's address; and checking one invocation log on the first deployed Worker for the `Authorization` header, and what to do if it is there: "How do deploys and secrets work?".
- The API agreement's changes (a section for Event Service builders with the hand-off contract, its statuses, dropping replays, the 3 seconds and the key rules; `no_game`; the status endpoint), `packages/handoff`, the two link columns, and the updated message to Zi Tao: "Write the migration spec".
- Rate limits on `api.geekykey.geekshacking.com` must not block Event Services' status calls: "Protecting our public services", still fog on the map.

## Renamed (28 Sep 2026)

`api.geekykey.geekshacking.com` is now **`geekykey-api.geekshacking.com`**, wherever it appears above. Qing Guan, who runs the zone, advised one level of subdomain because of Cloudflare's certificate limits; see "How do deploys and secrets work?".

## Updated by "How do we protect our public addresses without blocking the stations?" (29 Sep 2026)

`event-service` has no public address after all: all four Workers turn off `workers.dev` and preview addresses, and `event-service` has no custom domain, so only its two bindings reach it. Our sample still checks the Event Service key on the hand-off, as decided above, because other teams copy it and theirs will be on public addresses.
