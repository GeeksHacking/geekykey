# Who registers stations, where is a station key checked, and how does the GeekyKey Service know which Event Service a station feeds?

Type: grilling
Status: resolved
Blocked by: none
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

Until 2 Oct, the GeekyKey Service owned the `stations` table: each station's key hash, label, link (`event_service_id`, `linked_at`), disabling, last seen and heartbeat fields. It checked keys from a list kept in memory, and GeekyKey admins changed links ("How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?", "How do we protect our public addresses without blocking the stations?"). At the 2 Oct meeting Julian said stations should be registered by the Event Service: "The GeekyKey service should simply recognize the concept of a station, and each station has an ID... I've received an event that tells me I have a tag ID that did an action at the station with this ID... I'm going to throw it over to the event service." The GeekyKey Service keeps no database ([ADR 0003](../../../docs/adr/0003-event-service-on-cloud-run-geekykey-service-without-a-database.md)).

Decide:

- **Who creates a station and issues its key.** The Event Service, a GeekyKey admin, or Zi Tao when flashing the firmware.
- **Where the key is checked.** The GeekyKey Service, from a list the Event Service pushes into its cache, or from its own settings? Or the Event Service, with the GeekyKey Service passing the key through unchecked? The second lets junk through to Cloud Run, which the 60-a-minute limit and the in-memory list were meant to stop.
- **How the GeekyKey Service finds a station's Event Service.** Some options: a routing list in its settings or cache; the station ID naming its Event Service; the station sending it; or asking every Event Service. Stations must not be tied to one fixed address, and moving a station to another event must stay easy (Julian, 27 Sep).
- **Who sees station health.** The heartbeat (clock, buffered taps, reader check), `last_seen_at`, the station board and disabling a station. Are these the Event Service's now?
- **What happens to the glossary's Link, Station key and GeekyKey admin** if stations belong to an Event Service. A station lent to another team's event is a case to try.
- **What changes for Zi Tao.** The station's requests and its key are set in "How do stations talk to the GeekyKey Service?", and the firmware is his (HAR tickets).

## Answer

Resolved 5 Oct 2026 by grilling with Adam. Two parts are provisional until Julian answers at the in-person meeting on Thu 8 Oct 2026, the day after this map is due: see "To ask Julian".

**Decided**

- **Each Event Service holds its own stations.** It creates them, issues their station keys, and keeps each station's key hash, label, health and whether it is disabled. This is Julian's "stations should be registered by EventService", and it keeps one truth, with no copy for the GeekyKey Service to keep in step. Rejected: a station list in the GeekyKey Service's settings, because adding or disabling a station would need a reviewed change and a deploy, and deploys are frozen on event day; a station key that names its Event Service, passed on unchecked, because junk keys would then reach Cloud Run and TiDB; and asking every Event Service on each tap, because one slow Event Service would slow every station.
- **The GeekyKey Service still checks the key, from lists the Event Services publish.** Every Event Service serves its list at `GET /geekykey/v1/stations`, called by the GeekyKey Service with that Event Service's key, the same key and direction as the hand-off:

  ```json
  { "stations": [ { "station_id": "…", "key_hash": "<SHA-256 of the key, in hex>" } ] }
  ```

  The GeekyKey Service fetches the list from every Event Service in its settings and refreshes its copy at most once a minute, as the key list in memory from "How do we protect our public addresses without blocking the stations?" did. That list now comes from the Event Services instead of a table. A key that's on no list gets `401`, so junk keys never reach Cloud Run. The 60-a-minute limit per station is unchanged.
- **A station feeds the Event Service whose list has its key.** The GeekyKey Service needs no routing list and no link: finding the key finds the Event Service. A station ID or key hash that appears twice, whether in one list or in two, is refused and logged. Keys keep the `gk_sta_` prefix and the SHA-256 hash that `src/lib/station-keys.ts` uses today.
- **The list carries nothing else:** no label and no location. It holds enabled stations only, so a disabled station simply drops off it, and its key gets `401` within a minute, as decided before. The Event Service logs who disabled it, so the GeekyKey Service's log line only needs to say the key is unknown. Keeping the list this small means less for other teams to build, and fewer of our users' details pass through the GeekyKey Service.
- **Organizers manage their event's stations,** on the station board: create a station (its key shown once), replace its key, disable and enable it. At the showcase the organizers are the same people as the GeekyKey admins. A separate role above organizers was rejected as one more list to keep for no gain. GeekyKey admins have no station jobs left. Whether they keep releasing other people's tokens is for "Where do token owners live until the Portal's tag APIs exist, and what does the token page do?".
- **Station health lives in the Event Service.** The station's heartbeat still goes to the GeekyKey Service, the only address it knows. The GeekyKey Service answers the clock (`server_time`) itself, so a station's clock is set even when Cloud Run is down. It hands the rest (firmware, saved taps, `reader_ok`) to the Event Service as a second hand-off request, `POST /geekykey/v1/heartbeats`. The Event Service keeps `last_seen_at` and the rest on its own `stations` table, and the station board reads them from there. The status call, `GET /api/v1/event-service/stations`, goes away, with its 120-a-minute limit and its "status unknown" case. Accepted cost: while the Event Service is down, no record is kept that the station is alive, but the station board is down then too. Whether the station waits for the Event Service's answer is for "Does a station wait for the Event Service's verdict?".
- **A station is one tap point registered by one Event Service.** A reader lent to another event becomes a new station there, with a new ID and key from that event's Event Service. Stamps, points and station points are per event anyway, so nothing a user sees carries over. Rejected: keeping the same station across events, which needs an export between Event Services and a rule for settling clashes.
- **Moving a reader to another event is a reflash** (provisional). First the station sends its saved taps to the old event. Then its flash is erased ("Erase All Flash Before Sketch Upload"), and it's flashed with the key from the new event's Event Service. The old key just stops appearing on any list, so two events can never both claim one reader. If moves become frequent, the fix is a firmware setup mode that takes a new key without USB.
- **`no_event` is retired** (provisional). Without links, a station either has a key an Event Service lists or it gets `401`. Erasing the flash on a move covers the other case `no_event` handled: taps saved before the move. The firmware can keep knowing the status. Rejected: the Event Service setting `no_event` itself for taps timed before the station was created, because every Event Service would have to build it, and taps with no time couldn't be checked anyway.
- **Nothing changes for Zi Tao's firmware.** The requests, the key format, the `key-api.` address and the `401` handling all stay. He gets an updated message. Adam can change the firmware too, if something comes up.

**To ask Julian (Thu 8 Oct 2026)**

- Is a reflash an acceptable way to move a reader to another event, given he wanted it to be easy to point stations at a new event (27 Sep)?
- Is retiring `no_event` acceptable, with the flash erased on each move?

**What follows without a further decision**

- **Move first, split second, gets easier.** In the move, today's `stations` table goes to Cloud Run with everything else, and it stays there. The split only cuts out the key check, the routing and the clock.
- **Gone:** the link columns (`event_service_id`, `linked_at`), the GeekyKey admins' station screens and endpoints (`/api/v1/admin/stations…` on the GeekyKey Service), and the status call. **Moving to the Event Service:** creating a station, replacing its key, and disabling and enabling it.
- Other teams' Event Services must serve the station list and accept the heartbeat hand-off. Our sample does both, and the API agreement's section for Event Service builders describes them.
- The tap's journey is now: the key is checked against the copied lists, the token's owner is found, and the taps are handed to the Event Service that listed the key.

**Glossary**

`CONTEXT.md`: **Station** is now one tap point registered by one Event Service, and organizers disable it. **Station key** is issued by that Event Service. **Link** is removed. **GeekyKey Service**, **Hand-off**, **GeekyKey admin**, **Organizer**, **Station board** and **Tap** are reworded to match.

**Assets**

- [Message to Zi Tao](../assets/message-to-zi-tao-station-contract.md) gains a note at the top: `no_event` retired, organizers issue station keys, and how to move a reader.

**Passed on**

- Where the copy of the station lists is kept, and what happens when it is empty, stale, or the Event Service is down when it's refreshed: "What does the GeekyKey Service cache, and in which store?".
- Whether the heartbeat hand-off, like the taps, waits for the Event Service: "Does a station wait for the Event Service's verdict?".
- The API agreement (the station list, the heartbeat hand-off, the status call and `no_event` removed, the station endpoints moved to the Event Service), `packages/handoff`, the `stations` table on the Event Service, and the spec's sections on the GeekyKey admin screens and the station board: "Fold the answers into the spec".
- Station health and its logs on Google Cloud, for the event-day sheet: the fog patch "Event day on two platforms".
