# Which cache can a Worker use for free?

Research for "Which cache can a Worker use for free?", 3 Oct 2026. Cloudflare's facts come from its docs MCP server. Redis Cloud's and Upstash's come from their own docs. All were checked 3 Oct 2026. Nothing was deployed, so CPU and latency figures are **unmeasured** unless they cite our benchmark.

## Answer

- **All four can be used for free, but they differ in how a Worker reaches them, and that decides the CPU cost.**
  - **KV** and **D1** are bindings in GeeksHacking's own Cloudflare account. They need no new vendor, and `wrangler dev` and the Vitest plugin stand them in locally.
  - **Upstash** is reached with `fetch()` over HTTPS, like TiDB's serverless driver, which cost about 2 ms of CPU a ping.
  - **Redis Cloud** needs a TCP connection opened afresh on every request. The docs say a socket "cannot be created in global scope and shared across requests", so each request pays TLS and a sign-in, the cost that sank `mysql2` (12 ms of CPU for a bare ping).
- **Free limits:**
  - **KV:** 100,000 reads and 1,000 writes a day. Past either, that kind of operation fails until 08:00 Singapore time.
  - **D1:** 5 million rows read and 100,000 rows written a day. Past either, queries fail, enforced since 1 Sep 2026.
  - **Upstash:** 500,000 commands a month and 256 MB.
  - **Redis Cloud:** 30 MB, 30 connections at once and 100 operations a second.
  - Neither of the first two bills on the free plan. Redis Cloud and Upstash limit or warn rather than bill.
- **Consistency:** KV is the weak one. A write is seen at once in the same Cloudflare location, but can take up to 60 s elsewhere. Concurrent writes to one key end with the last one winning. D1 without read replication, and Redis in one region, show a write to the next read.
- **Expiry:** KV (60 s at least), Redis Cloud and Upstash (Redis `EXPIRE`) and the Cache API (`Cache-Control`) expire keys on their own. D1 doesn't: it would need an expiry column and a cleanup.
- **Location:** Upstash offers AWS Singapore. D1 takes an "Asia-Pacific" hint, not a city. KV is global with local caching. Whether Redis Cloud's free plan offers Singapore wasn't confirmed.
- **D1 is a database.** It's SQLite. ADR 0003 says the GeekyKey Service doesn't hit a database, so using D1 as a cache is a call for "What does the GeekyKey Service cache, and in which store?".
- **The Cache API is worth considering for short-lived lookups.** It's free and per data centre, and every station and phone at the venue reaches Cloudflare's Singapore location. But it can drop an entry at any time, and it only works on a custom domain.

## Findings

### Side by side

| | Workers KV | D1 | Redis Cloud (free) | Upstash Redis (free) |
|---|---|---|---|---|
| **Free limits** | 100,000 keys read, 1,000 written, 1,000 deleted and 1,000 lists a day; 1 GB stored ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)) | 5 million rows read and 100,000 rows written a day; 5 GB in all ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)) | 30 MB, 30 connections at once, 100 operations a second, 5 GB of network a month; one free database per account ([Essentials plans](https://redis.io/docs/latest/operate/rc/subscriptions/view-essentials-subscription/essentials-plan-details/), [free database](https://redis.io/docs/latest/operate/rc/databases/create-database/create-free-database/)) | 500,000 commands a month, 256 MB, 10,000 commands a second, 10 GB of bandwidth a month, one database ([pricing](https://upstash.com/pricing/redis), [limits](https://upstash.com/docs/redis/overall/pricing)) |
| **At the limit** | "further operations of that type will fail with an error" until 00:00 UTC ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)) | Queries fail with "exceeded D1's free tier daily row read limit" (or write) until midnight UTC, since 1 Sep 2026; stored data is kept ([changelog](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/)) | "We will notify you before limiting your database usage" ([Essentials plans](https://redis.io/docs/latest/operate/rc/subscriptions/view-essentials-subscription/essentials-plan-details/)) | "We send email notifications... we may rate limit depending on the case" ([pricing](https://upstash.com/pricing/redis)); its FAQ says commands past the limit "return exception" ([FAQ](https://upstash.com/docs/redis/help/faq)) |
| **How a Worker reaches it** | Binding | Binding | TCP socket (`cloudflare:sockets`) with TLS, new each request | `fetch()` over HTTPS, `@upstash/redis/cloudflare` ([Workers guide](https://upstash.com/docs/redis/sdks/ts/deployment)) |
| **CPU per read** | Unmeasured, small: no TLS or sign-in in our code | Unmeasured, small: as KV | Unmeasured; likely high: TLS and `AUTH` on every request | Unmeasured; about 2 ms a ping by analogy with TiDB's HTTPS driver ([benchmark](hyperdrive-alternatives-benchmark.md)) |
| **Consistency** | Seen at once in the same location, up to 60 s elsewhere; last write wins ([writing](https://developers.cloudflare.com/kv/api/write-key-value-pairs/)) | All queries go to one primary unless read replication is on; with it, the Sessions API gives "sequential consistency" ([read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/)) | One database, so a read sees the last write | Strong in its primary region; read regions are "eventually consistent" ([global database](https://upstash.com/docs/redis/features/globaldatabase)) |
| **Expiry** | `expiration` or `expirationTtl`, at least 60 s ahead ([writing](https://developers.cloudflare.com/kv/api/write-key-value-pairs/)) | None built in | Redis `EXPIRE` | Redis `EXPIRE` |
| **Where it lives** | Central store, cached in each location that reads it | Primary near where it was created, or a hint such as `apac` (Asia-Pacific), which "does not guarantee" the place ([data location](https://developers.cloudflare.com/d1/configuration/data-location/)) | AWS, Google Cloud or Azure regions; Singapore on the free plan **not confirmed** ([regions](https://redis.io/docs/latest/operate/rc/supported-regions/)) | AWS Singapore (`ap-southeast-1`) offered ([global database](https://upstash.com/docs/redis/features/globaldatabase)) |
| **Local dev and tests** | Simulated by `wrangler dev` and the Vitest plugin, stored in `.wrangler/state` ([local development](https://developers.cloudflare.com/workers/local-development/)) | Simulated, as KV | A Redis server in Docker or on the network | A Redis server plus the community SRH proxy in Docker, which Upstash documents ([developing](https://upstash.com/docs/redis/sdks/ts/developing)) |
| **Who sets it up** | Julian, in GeeksHacking's Cloudflare account | Julian, as KV | A new Redis Cloud account; its URL and password become a Worker secret | A new Upstash account; its URL and token become Worker secrets |

### Notes on each

- **KV reads are cached where they are read,** for `cacheTtl` seconds: 60 by default, 30 at least, lowered from 60 in January 2026 ([changelog](https://developers.cloudflare.com/changelog/post/2026-01-30-kv-reduced-minimum-cachettl/)). "Both existing key-value pairs and non-existent key-value pairs (also known as negative lookups) are cached". A write revalidates KV's own regional and central caches ([reading](https://developers.cloudflare.com/kv/api/read-key-value-pairs/)). Each KV call counts towards the free plan's 50 outside requests per incoming request.
- **The 1,000 KV writes a day are the tightest number.** Each claim, release or station change written to KV uses one, and so does every test run against production that day.
- **D1's free-plan errors now really happen.** Before 1 Sep 2026 the daily limits weren't enforced. The reset is at midnight UTC, which is 08:00 in Singapore, as for KV and the Workers request allowance.
- **Redis Cloud over TCP:** "TCP sockets cannot be created in global scope and shared across requests", and each open socket counts towards the open-connection limit ([TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/)). Each request therefore opens TLS and sends `AUTH`. In our benchmark, the same pattern for MySQL cost 12 ms of CPU for a bare ping, mostly spent setting up TLS through the Node compatibility layer. A Redis client built on `cloudflare:sockets` with `secureTransport: "on"` uses workerd's own TLS and might cost less, but nobody has measured it, and which Redis client runs on Workers wasn't checked. The 30-connection cap also limits how many requests can be in flight at once.
- **Upstash archives free databases** "after a minimum of 30 days of inactivity", with warning emails, and they can be restored ([FAQ](https://upstash.com/docs/redis/help/faq)). A quiet month between rehearsal and showcase could trigger it.
- **Upstash's numbers disagree in places.** Its FAQ still mentions an older limit of 10,000 requests a day, and says Singapore isn't offered, while the pricing page and the regions page say otherwise. The pricing and regions pages are the newer ones.

### The Cache API

- It is "available globally but the contents of the cache do not replicate outside of the originating data center". `match`, `put` and `delete` act only in the data centre handling the request ([Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/), [how the cache works](https://developers.cloudflare.com/workers/reference/how-the-cache-works/)).
- It's free. Calls share the free plan's 50 outside requests per incoming request ([limits](https://developers.cloudflare.com/workers/platform/limits/)).
- "Workers deployed to custom domains have access to functional `cache` operations". Our Workers use custom domains with `workers.dev` turned off, so this holds, but `wrangler dev` and previews are different.
- `put()` "resolves to `undefined` regardless of whether the cache successfully stored the response", and entries can be evicted at any time. Expiry follows the response's `Cache-Control`. So it can only hold things that are safe to look up again.
- **Worth considering for short-lived lookups:** at the venue, the stations and phones all reach Cloudflare's Singapore location, so a per-location cache behaves almost like a shared one there. Dropping an entry on a claim works for that location only.
- **Its downsides for the GeekyKey Service** (added 3 Oct, at Adam's request). None is serious for short-lived lookups. All of them rule it out as the only copy of anything:
  - **One location only.** Being reached through Singapore is likely at the venue but not guaranteed, and a lookup through another location simply misses and asks the source.
  - **Dropping an entry is local.** After a claim, `cache.delete` clears Singapore's copy, but any other location keeps the old owner until it expires. Short expiry times limit this.
  - **No promise it was stored.** `put()` "resolves to `undefined` regardless of whether the cache successfully stored the response", and entries can be evicted at any time. Every lookup needs a fallback to the Portal or the Event Service.
  - **Its keys and values are web requests and responses.** The key must be a `GET` request, or `put()` throws. A value is a `Response`, and one with `Set-Cookie` is never stored. So a token's owner would be stored as a small JSON response under a made-up URL. That's easy to wrap in one module.
  - **It does nothing in the dashboard editor and Playground previews.** On our custom domains it works.
- **It costs nothing extra:** each call uses one of the free plan's 50 outside requests per incoming request ([limits](https://developers.cloudflare.com/workers/platform/limits/)) but adds no Worker requests, and it has no daily limit. **Locally,** the Miniflare in our repo (5.20260926) ships a cache plugin, so `wrangler dev` and the Vitest plugin have a Cache API too. Whether it behaves exactly like production wasn't checked.

### Workers Caching and `fetch()` caching, compared with the Cache API

Added 3 Oct 2026, after Adam asked. Cloudflare has three caches a Worker can use, and the docs keep them apart: Workers Caching "is a separate cache from the one that sits in front of outgoing fetch() subrequests", and both are separate from the Cache API ([limitations](https://developers.cloudflare.com/workers/cache/limitations/)).

| | Cache API | Workers Caching | `fetch()` caching |
|---|---|---|---|
| **What it caches** | Anything the Worker puts in, by key | The Worker's own responses, served before the Worker runs ([Workers Cache](https://developers.cloudflare.com/workers/cache/)) | Replies to the Worker's outgoing `GET` requests ([how the cache works](https://developers.cloudflare.com/workers/reference/how-the-cache-works/)) |
| **Turned on by** | Code | `"cache": { "enabled": true }` in the Wrangler file, Wrangler 4.69 or later ([configuration](https://developers.cloudflare.com/workers/cache/configuration/)) | `cf.cacheTtl` or `cacheTtlByStatus` on the request ([cache using fetch](https://developers.cloudflare.com/workers/examples/cache-using-fetch/)) |
| **Where** | One data centre | Tiered: shared beyond one data centre | Tiered, if the zone has Tiered Cache |
| **Requests it serves** | Any | Only `GET` and `HEAD`; skipped when the request has `Authorization` or the response sets a cookie | Only `GET` and `HEAD` |
| **Cost on the free plan** | Free | Each cache hit counts as a Worker request, and turning it on also counts calls between Workers and static file requests, which are otherwise free ([Workers Cache](https://developers.cloudflare.com/workers/cache/)) | Free: outgoing requests aren't billed ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)) |
| **Dropping an entry** | `cache.delete`, in one data centre only | `ctx.cache.purge()` by tag or path, everywhere, at most 5 purges a minute for the account (a burst of 25) on any plan ([purge](https://developers.cloudflare.com/workers/cache/purge/), [purge limits](https://developers.cloudflare.com/cache/how-to/purge-cache/)) | A purge on the *origin's* hostname ([how the cache works](https://developers.cloudflare.com/workers/reference/how-the-cache-works/)), so only for origins on a zone we control |
| **After a deploy** | Kept | Starts empty, because the Worker's version is part of the key ([cache keys](https://developers.cloudflare.com/workers/cache/cache-keys/)) | Kept |

**Workers Caching has two serious downsides for the GeekyKey Service on the free plan:**

- **It doesn't reach the requests that matter, unless every lookup costs an extra request.** Taps and heartbeats are `POST`s, so they always run the Worker. A token page request carries the visitor's login. To cache a lookup made during a tap, such as a token's owner, the Worker would call itself with a `GET`, which the docs suggest. Each of those calls counts against the 100,000 requests a day, so a tap could count twice.
- **Purges are too scarce for claims.** Dropping a token's cached owner when it is claimed is one purge, and the account gets 5 a minute. A check-in rush would run out, and owners would stay stale until their entries expire.

**It would also hurt any Worker that serves static files.** `geekykey-web` and `event-web` serve their screens as static files, which are free and unlimited today. With Workers Caching turned on, each of those requests would count too.

**`fetch()` caching has no cost downside, and it would spare the Portal,** which answers one request at a time ([the facts](../map.md)). But both open points turn out against it:

- **Requests with `Authorization` are cached only if the origin allows it.** On the free plan, a reply to a request carrying `Authorization` "is cacheable only if `Cache-Control` also includes `public`, `s-maxage`, or `must-revalidate`" ([cache responses](https://developers.cloudflare.com/cache/concepts/cache-responses/), [Cache-Control](https://developers.cloudflare.com/cache/concepts/cache-control/)). The GeekyKey Service calls the Portal as itself, with a token, so the Portal would have to mark its replies, and that's Qing Guan's code. Whether our own `cf.cacheTtl` overrides the rule isn't documented. Only a test on a deployed Worker would tell.
- **Dropping an entry early means calling Cloudflare's purge API.** A reply is cached under the hostname the Worker fetched. To purge it you purge that URL, and if the host is proxied by Cloudflare, "you must own" it and purge from its zone ([how the cache works](https://developers.cloudflare.com/workers/reference/how-the-cache-works/)). Either way, the Worker would need a Cloudflare API token with purge rights, which only Julian can create. Without one, an entry waits out its expiry.
- **It only covers `GET`s,** and the hand-off to the Event Service is a `POST`.

**The Cache API covers the same need with fewer catches.** Wrapped around the same `GET` to the Portal (look in the cache, otherwise fetch, then store), it caches the reply whatever headers the Portal sends, drops it with `cache.delete` without an API token, and adds no Worker requests. What it lacks is Tiered Cache, which doesn't matter when everyone at the venue reaches one location.

**So the Cache API is the one to consider, and `fetch()` caching adds nothing it lacks.** Whether `wrangler dev` and the Vitest plugin stand in Workers Caching or `fetch()` caching locally wasn't checked.

### Also on hand

- **A variable in the Worker's memory** lasts as long as one isolate and isn't shared between isolates. "How do we protect our public addresses without blocking the stations?" already keeps the station key list this way.
- **Durable Objects** are on the free plan ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)), can be placed in Southeast Asia with the `apac-se` hint ([changelog](https://developers.cloudflare.com/changelog/post/2026-06-19-apac-ne-apac-se-location-hints/)), and are strongly consistent. Their free limits weren't checked.

## Open questions

- CPU per read for each store, measured from a deployed Worker, as in the benchmark.
- Whether Redis Cloud's free plan can be created in Singapore, and whether it removes idle free databases.
- What the GeekyKey Service would cache at all: that's "What does the GeekyKey Service cache, and in which store?".
