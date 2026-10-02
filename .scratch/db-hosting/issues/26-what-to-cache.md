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
