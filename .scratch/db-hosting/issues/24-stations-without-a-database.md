# Who registers stations, where is a station key checked, and how does the GeekyKey Service know which Event Service a station feeds?

Type: grilling
Status: open
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
