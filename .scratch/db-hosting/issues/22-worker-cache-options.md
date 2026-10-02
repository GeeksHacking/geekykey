# Which cache can a Worker use for free?

Type: research
Status: open
Blocked by: none
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

The GeekyKey Service keeps no database, but it may keep a cache ([ADR 0003](../../../docs/adr/0003-event-service-on-cloud-run-geekykey-service-without-a-database.md)). Four have been suggested: Workers KV (Adam), D1 (Julian), and Redis or Redis Cloud (Julian and Qing Guan). Adam asked whether Redis Cloud's free tier is enough for token-owner pairs. This ticket gathers the facts that "What does the GeekyKey Service cache, and in which store?" needs. It decides nothing.

For each of Workers KV, D1, Redis Cloud and Upstash Redis (its HTTP API), find:

- **Free limits:** reads, writes, storage, connections and requests a day, and what happens when a limit is reached (an error, or a bill).
- **How a Worker reaches it:** a binding, `fetch()` over HTTPS, or a TCP socket. A TCP connection from a Worker pays TLS and a sign-in on every request, the same cost that made `mysql2` too expensive (20 ms of CPU per tap; see [the benchmark](../research/hyperdrive-alternatives-benchmark.md)). Measure or cite the CPU per read where possible, against the free plan's 10 ms.
- **Consistency:** how soon a write is seen by the next read, here and in other locations. Already known for KV: a write can take up to 60 s to be seen elsewhere, the free plan allows 1,000 writes and 100,000 reads a day, and concurrent writes to one key end with the last one winning.
- **Expiry:** whether keys can expire on their own.
- **Where it lives:** whether it's in Singapore, and the latency from a Worker there.
- **Local dev and tests:** whether `wrangler dev` and the Vitest plugin can stand it in locally, or whether it needs Docker or a network.
- **Who sets it up:** whether it lives in GeeksHacking's Cloudflare account (Julian creates it) or needs a new vendor account.

Also say whether Cloudflare's Cache API, which is per data centre and free, is worth considering for short-lived lookups.

Findings go in [research/worker-cache.md](../research/worker-cache.md), with a source for each fact. For Cloudflare's products, search Cloudflare's docs MCP server rather than fetching web pages.
