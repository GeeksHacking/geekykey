# Does a station wait for the Event Service's verdict?

Type: grilling
Status: open
Blocked by: 21, 24
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

Julian, 2 Oct 2026: the GeekyKey Service calls the Portal, the Event Service, or both, "and you may want to think about whether it can be done without waiting for a response."

Today's design waits. The GeekyKey Service hands taps to the Event Service, which gets 3 s. The station shows each tap's status for about 2 s, amber only for `cooldown`. If no answer comes in time, the station gets `503` and resends ("How do stations talk to the GeekyKey Service?", "How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?").

Decide:

- **Wait, don't wait, or a mix.** For example, the station hears "received" at once while the verdict reaches only the passport, or the station waits only when the Event Service is warm.
- **What the station shows,** and whether participants lose anything they'd notice. Amber for cooldown, and "unclaimed token" at the station rather than on a phone.
- **If not waiting, what carries the taps.** Cloudflare Queues are on the free plan, with 10,000 operations a day (one message is about three: write, read, delete), messages kept 24 h, and delivery at least once. Or `waitUntil()` with a retry. Duplicates are already dropped by `client_tap_id`, but a tap lost after the station has deleted it is lost for good.
- **Cold starts.** From "What does Cloud Run "v1" mean, and what does running the Event Service there involve?": does a cold Event Service fit in 3 s, and does keeping one instance warm settle this on its own?
- **Who must change.** Zi Tao's firmware (HAR tickets) and the API agreement's tap responses.

**Since "Who registers stations, where is a station key checked, and how does the GeekyKey Service know which Event Service a station feeds?" (5 Oct 2026):** the heartbeat is handed off too. The GeekyKey Service answers the station's clock itself, and hands firmware, saved taps and `reader_ok` to the Event Service at `POST /geekykey/v1/heartbeats`. Whether the station waits for that answer is decided here alongside the taps. The key check no longer reaches any database, because the GeekyKey Service checks keys against its copy of the Event Services' station lists.
