# Which cache can a Worker use for free?

Type: research
Status: resolved
Blocked by: none
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)
Findings: [research/worker-cache.md](../research/worker-cache.md)

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

## Answer

Resolved 3 Oct 2026 with targeted lookups in Cloudflare's docs MCP, Redis's and Upstash's docs; nothing was deployed. Full findings: [research/worker-cache.md](../research/worker-cache.md).

- **KV:** a binding in GeeksHacking's account. Free: 100,000 reads and 1,000 writes a day, then that kind of operation fails until 08:00 Singapore time. A write is seen at once in the same location, up to 60 s elsewhere, last write wins. Keys expire (60 s at least). Simulated locally.
- **D1:** a binding, but a SQLite database, which ADR 0003's "no database" has to be weighed against. Free: 5 million rows read and 100,000 written a day, failing past that since 1 Sep 2026. Consistent while read replication is off. No built-in expiry. Placed by an `apac` hint, not a city. Simulated locally.
- **Redis Cloud:** a new vendor account. Free: 30 MB, 30 connections, 100 operations a second. Reached over TCP, and a Worker can't keep a socket between requests, so every request pays TLS and a sign-in, the cost that sank `mysql2` (12 ms of CPU for a bare ping). Singapore on the free plan not confirmed. Needs Docker locally.
- **Upstash:** a new vendor account. Free: 500,000 commands a month and 256 MB. Reached with `fetch()` over HTTPS, likely about 2 ms of CPU a read by analogy with TiDB's driver. Offered in AWS Singapore. Free databases are archived after 30 idle days. Needs Docker locally.
- **Cache API:** free, per data centre, custom domains only, entries can vanish at any time. Worth considering for short-lived lookups, because everyone at the venue reaches Cloudflare's Singapore location. *Added 3 Oct:* no serious downsides for that use. It adds no Worker requests, has no daily limit, and works locally. But dropping an entry is local, storage isn't promised, and keys must be `GET` requests, so it can never be the only copy, and every lookup needs a fallback to the source.
- CPU per read is unmeasured for all of them.
- *Added 3 Oct, at Adam's request:* **Workers Caching** (Cloudflare's cache in front of a Worker) has serious downsides here. It only serves `GET`s, so a tap would have to call its own Worker to use it, and each such call counts against the 100,000 requests a day. Purges are limited to 5 a minute per account. Turning it on also makes static-file requests count. **`fetch()` caching** of outgoing requests is free, but on the free plan a request carrying our `Authorization` header is cached only if the Portal marks its reply `public` or `s-maxage`. Dropping an entry early needs Cloudflare's purge API and a token from Julian, and it only covers `GET`s. The Cache API, wrapped around the same fetch, does the same job without those catches.
