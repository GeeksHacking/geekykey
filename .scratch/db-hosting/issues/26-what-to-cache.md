# What does the GeekyKey Service cache, and in which store?

Type: grilling
Status: open
Blocked by: 22, 23, 24
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

The GeekyKey Service keeps no database but may keep a cache ([ADR 0003](../../../docs/adr/0003-event-service-on-cloud-run-geekykey-service-without-a-database.md)). Julian's example at the 2 Oct meeting: "during an event, we might say that we fill up the Redis cache very quickly with all of the mapping of key to user... without having to query portal every time."

Decide:

- **What's cached:** token owners, the station list or routing, or both, depending on "Where do token owners live until the Portal's tag APIs exist, and what does the token page do?" and "Who registers stations, where is a station key checked, and how does the GeekyKey Service know which Event Service a station feeds?".
- **Where the truth lives for each,** so the cache is only ever a copy, and what happens when the cache is empty, stale or down. For example, a token claimed a minute ago and tapped at once, or a token released then claimed by someone else.
- **How long entries live,** and who clears them: expiry, the claim and release paths, or the Event Service pushing changes.
- **Which store,** from "Which cache can a Worker use for free?", against the free plan's limits on a showcase day.
- **Local dev and tests** for the chosen store.

**Since "Who registers stations, where is a station key checked, and how does the GeekyKey Service know which Event Service a station feeds?" (5 Oct 2026):** one thing to cache is settled. It's the station list each Event Service serves at `GET /geekykey/v1/stations` (station IDs and key hashes, enabled stations only). The GeekyKey Service refreshes its copy at most once a minute, and the truth lives in each Event Service. Still to decide here: which store holds the copy (memory per instance, as the 29 Sep key list did, or a shared store), what a tap does when the copy is empty, such as the first request after an instance starts while Cloud Run is cold, and whether a stale copy is kept when an Event Service fails to answer.

**Since "Where do token owners live until the Portal's tag APIs exist, and what does the token page do?" (5 Oct 2026):** until the switch, token owners live in a claims stand-in on our Cloud Run server, and the GeekyKey Service looks them up there (1.5 s, no retry, `503 claims_unavailable`). After 18 Nov it looks them up at the Portal. The truth is the stand-in, then the Portal. Still to decide here: whether owners are cached in front of the lookup at all; if so, how a claim or release made on the token page clears the entry, since both go through the GeekyKey Service; and whether caching becomes needed only after the switch, when the Portal runs one request at a time.
