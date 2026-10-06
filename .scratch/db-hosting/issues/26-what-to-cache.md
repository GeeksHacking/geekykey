# What does the GeekyKey Service cache, and in which store?

Type: grilling
Status: resolved
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

## Answer

Resolved 7 Oct 2026 by grilling with Adam. The cache of owners after the switch is provisional, and is built at the switch, not before.

**Decided**

- **Token owners aren't cached before the switch.** Every station request asks the claims stand-in, inside the 4-second deadline from "Does a station wait for the Event Service's verdict?". The stand-in shares a Cloud Run server with the hand-off, so a cache would save one call between two Singapore data centres without keeping anything up when Cloud Run is down. It would add two ways to be wrong: a token claimed and tapped at once would keep showing `Not claimed yet` while a cached "unclaimed" lived, and a token released and claimed by someone else could credit the old owner while another isolate or location still held them.
- **The copy of the registered stations lives in memory, in each Worker isolate,** as the 29 Sep key list did. It's free, needs no setup and behaves the same in tests. Each new isolate starts empty. Rejected for this map:
  - **KV,** because a refresh once a minute is 1,440 writes a day, over the free 1,000, and other locations can see a write up to 60 s late;
  - **D1,** which is a database, against ADR 0003;
  - **Upstash and Redis Cloud,** each a new vendor account, and Redis Cloud a fresh TLS connection and sign-in on every request.
- **An empty copy is filled on the request path, inside the same 4-second deadline** as the owner lookup and the hand-off. If an Event Service's registered stations couldn't be fetched and the key isn't in the others, the answer is **`503 event_service_unavailable`**, not `401`, because the key may belong to the list that's missing. The station keeps its taps and resends them. Only when every list is in hand and the key is on none of them does it get `401`. A heartbeat is treated the same way: no `server_time` until its key is checked.
- **A copy more than a minute old is used for the request, then refreshed in `waitUntil()`,** so a tap never waits on a refresh. Each Event Service's list is refreshed on its own. When one doesn't answer, or its answer doesn't parse, its last good list is kept, with no time limit, and the failure is logged. An isolate doesn't live long, and the cost is small: a station disabled during the outage still gets its clock, and its taps fail at the hand-off anyway. As before, an unknown key never causes a refresh, so junk keys can't make us call Cloud Run.
- **The Cache API is added for the registered stations only if the rehearsal shows the need.** A named log line, `stations_copy_filled`, records each fill, how long it took and whether every list came back, with a fourth saved query beside the three from "How do we notice trouble on event day, and who watches?". After the rehearsal (by 7 Nov), the Cache API goes in behind memory if a fill ran out of time and caused a `503`, or if fills came more than about once every 10 minutes while stations were busy. Otherwise it stays out.
- **After the switch, owners at the Portal are cached in the Cache API** (provisional, for the spec's "After the showcase"). The Portal answers one request at a time and sleeps when idle, so this is where Julian's "fill up the cache with all of the mapping of key to user" fits. It's free, shared by everyone at the venue through Cloudflare's Singapore location, and needs no purge token. Only owned tokens are cached, never "unclaimed", so a fresh claim counts at once. Entries expire after 5 minutes. Claim and release, which both go through the GeekyKey Service, delete the entry. Accepted: after a release and someone else's claim, a lookup through another Cloudflare location could credit the old owner for up to 5 minutes. Rejected: Redis, for the reasons above, and `fetch()` caching, which needs the Portal to mark its replies cacheable and Julian's purge token to drop an entry.
- **When the Cache API is used at all:** for something slow or costly to look up again, safe to serve a few minutes old, and either never cleared early or cleared on a path we control. Never as the only copy of anything, never for "unclaimed", and never for anything our own claim and release paths can't clear.
- **Tests:** one module owns the copy, the lists' ages and the refresh, with the clock and the fetch passed in. Each test makes its own instance, so nothing is left over between tests. The tests cover the empty-copy fill, `503` against `401` when a list is missing, a stale list kept when an Event Service fails, and no refresh on an unknown key. The owners cache at the switch runs on Miniflare's Cache API in `wrangler dev` and the Vitest plugin, so local development needs nothing new.

**What follows without a further decision**

- Before the switch the GeekyKey Service uses no cache store at all, so it adds no KV, D1 or vendor reads or writes against any free limit, and Julian has nothing to create for it.
- A fill costs one request to each Event Service, counted against the free plan's 50 outside requests per incoming request. With one Event Service at the showcase, a tap that fills the copy makes three calls to Cloud Run: the registered stations, the owners and the hand-off.
- The warm Cloud Run instance on event days, from "Does a station wait for the Event Service's verdict?", keeps fills fast.

**Glossary**

`CONTEXT.md`: **Registered stations** is new: what an Event Service tells the GeekyKey Service about its enabled stations and their key hashes. "Station list" stays avoided, now for both meanings.

**Assets**

- [Message to Julian and Qing Guan](../assets/message-to-qing-guan-tag-apis.md) gains a note at the top. Part 1 answers Julian's cache suggestion, and part 2's point on speed now gives the 4-second deadline and the owners cache after the switch, with a short follow-up in case part 2 has already gone out.

**Passed on**

- "Fold the answers into the spec": the spec's section on the station key list in memory, rewritten for the registered stations (the empty-copy fill inside the deadline, `503` against `401`, the refresh in `waitUntil()`, a stale list kept); `stations_copy_filled` and its saved query; the rehearsal's check on fills; the owners cache in "After the showcase", where `PortalClaims` said "no cache"; and section 11.1 on the free plans.
