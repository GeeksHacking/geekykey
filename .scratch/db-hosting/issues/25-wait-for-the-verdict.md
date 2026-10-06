# Does a station wait for the Event Service's verdict?

Type: grilling
Status: resolved
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

**Since "Where do token owners live until the Portal's tag APIs exist, and what does the token page do?" (5 Oct 2026):** until the switch, each station request also looks up the tokens' owners at the claims stand-in on our Cloud Run server, before the hand-off. The lookup gets 1.5 s with no retry, and a failure is `503 claims_unavailable`. So a station request now makes two calls to Cloud Run (1.5 s, then 3 s), inside the station's 5 s. Whether the station waits for either is decided here. A station that doesn't wait would hear "received" before anyone knows whether the token is claimed, so `unknown_token` would no longer reach the station.

## Answer

Resolved 6 Oct 2026 by grilling with Adam. The 4-second deadline is provisional until the first deploy measures a cold start.

**Decided**

- **Taps wait for the Event Service's answer, as today.** Nothing changes. The station already doesn't wait on anyone where it matters: since 29 Sep it saves every tap to flash before sending it, and deletes it only once a status comes back (`firmware/geekykey_station/geekykey_station.ino`). When no answer comes in time, it shows `QUEUED` / `Will send later`, keeps the tap, and resends it with the next tap or a minute later. So a slow or missing Event Service costs a participant the screen's answer, never the tap. That's the answer to Julian's question. Rejected:
  - **Not waiting** (answer `received` at once, deliver afterwards), because the station would lose amber for cooldown and `Not claimed yet` / `Claim on phone`, since the owner lookup is on Cloud Run too. And a tap's safety would move from the station's flash to the GeekyKey Service: a tap that fails in `waitUntil()` after the station has deleted it is lost for good, and Queues' free 10,000 operations a day are about 3,300 messages, close to a whole showcase day's taps.
  - **A mix** (wait a short time, then answer `received` and finish in the background), which has both costs whenever it falls back.
- **The heartbeat doesn't wait.** The GeekyKey Service answers the station with `server_time` at once and sends firmware, saved taps and `reader_ok` on to `POST /geekykey/v1/heartbeats` in `waitUntil()`, with no retry. A lost heartbeat is replaced a minute later, and the station has no use for the Event Service's answer. So a heartbeat succeeds, and the station's clock is set, even while Cloud Run is down.
- **One 4-second deadline covers the owner lookup and the hand-off together** (provisional). It replaces 1.5 s for the lookup and then 3 s for the hand-off, which used 4.5 s of the station's 5 s. Whichever call is slow uses up the time. A cold start always lands on the lookup, the call that wakes the instance, so with 1.5 s the first tap after an idle spell would usually fail. With 4 s, a cold start of up to about 3 s still gets its answer, and the station keeps a full second's margin. Each call still fails at once on a `429`, a `5xx` or a body that doesn't parse, with the same codes as before: `503 claims_unavailable` or `503 event_service_unavailable`, whichever call failed. After the switch, the same 4 s covers the Portal and the hand-off. Adam: the number can change once the first deploy measures the cold start.
- **One Cloud Run instance is kept warm on event days only:** the rehearsal (by 7 Nov) and 17 to 18 Nov, and none otherwise. Cloud Run sets minimum instances per service, so this costs cents instead of about US$10 a month. Rejected: never, which leaves the first tap of the morning showing `QUEUED` to an organizer; and always, which costs about US$10 a month or more in Singapore for no gain between events. Warm or not, the station's queue covers a miss.

**What follows without a further decision**

- **No firmware change.** The 28 Sep screen table's "no answer" row becomes `Tap saved` / `Will send later`, as it said it would once the station saved taps. The station already does this, as `QUEUED`. The API agreement's tap responses are unchanged.
- The heartbeats of 20 stations, every minute, will usually keep an instance from going idle during an event, but nothing relies on it.
- Until the firmware sends `tapped_at`, a resent tap is timed when the Event Service receives it, as decided on 28 Sep. Waiting doesn't change that.

**Facts** (checked 6 Oct 2026, in `firmware/geekykey_station/geekykey_station.ino`)

- The station saves a tap to its queue (100 taps, in flash) before sending, sends the whole queue with each new tap, and otherwise resends at most once every 60 seconds.
- It waits 5 seconds for an answer (`http.setTimeout(5000)`). It deletes a tap on any status, keeps it on no answer, `401`, `429` or any `5xx`, and drops the batch on `400`.
- It sends no `tapped_at` and no heartbeat yet; both are in Zi Tao's pending work.

**Glossary**

No change. The glossary says a tap gets a **status**. "Verdict" is only this ticket's word.

**Assets**

- [Message to Zi Tao](../assets/message-to-zi-tao-station-contract.md): the "no answer" row now says `Tap saved` / `Will send later`, with a note at the top.

**Passed on**

- Turning the warm instance on and off for event days, and measuring the cold start at the first deploy (with and without startup CPU boost, and first- or second-generation): "How is the Event Service built, deployed and staged on Cloud Run?".
- The 4-second shared deadline in place of 1.5 s and 3 s; the heartbeat hand-off sent in `waitUntil()` without waiting; the screen table's "no answer" row: "Fold the answers into the spec".
