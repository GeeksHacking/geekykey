# Without Hyperdrive, how should a Worker reach TiDB?

Research for BAC-15, 2 Oct 2026. Measured from a throwaway Worker, `geekykey-db-bench`, on Adam's free Cloudflare account, against `geekykey_staging` on GeeksHacking's TiDB Cloud Starter cluster. Every request ran in Cloudflare's Singapore location (`SIN`), like the cluster.

## Answer

- **Hyperdrive can't connect to TiDB Cloud.** TiDB Cloud's gateway sends a MySQL AuthSwitchRequest at every sign-in, even to a login that already answered with the method it asks for. Hyperdrive doesn't support that message. No login setting gets around it: changing the login's sign-in method didn't help.
- **Both ways that skip Hyperdrive work from a deployed Worker:**
  - **A:** `mysql2` over TCP and TLS, with a new connection for every request.
  - **B:** TiDB's serverless driver, over HTTPS.
- **A needs a compatibility flag.** As shipped, mysql2 3.24 can't open TLS on Workers at all. It always passes `checkServerIdentity` to `tls.connect`, and workerd refuses that option. Adding the compatibility flag `no_throw_on_not_implemented_tls_options` makes workerd ignore it instead. That loses no protection: workerd's own TLS checks the certificate and its hostname. A wrong-host, a self-signed and an expired certificate were all rejected.
- **Speed is close.** A tap-shaped set of queries takes about 110 ms with A and 135 ms with B (in-Worker median). A spends about 55 ms of that opening its connection.
- **CPU time decides it on the free plan.** Workers Free allows 10 ms of CPU per request, with only occasional overruns tolerated. A used a median of **20 ms** for a tap, with no app code around it. B used **7 ms**. So A means paying for Workers Paid ($5 a month), or expecting `1102` errors once stations tap steadily. B fits the free plan, though only just once Hono, Drizzle and Zod are added.

## Findings

20 rounds, run one at a time, each round alternating A ping, A tap, B ping, B tap. Times are in milliseconds.

| Case | Connect, median | Queries, median | In-Worker, median | In-Worker, p90 | In-Worker, max | From the laptop, median | CPU, median | CPU, max |
|---|---|---|---|---|---|---|---|---|
| A ping (`SELECT 1`) | 56 | 5 | 61 | 115 | 216 | 129 | 12 | 51 |
| A tap | 53 | 53 | 110 | 301 | 484 | 172 | 20 | 69 |
| B ping | none | 22 | 22 | 455 | 463 | 76 | 2 | 5 |
| B tap | none | 135 | 135 | 466 | 688 | 190 | 7 | 17 |

- **What "tap" means.** The same 8 statements the tap ingest makes, against rows that don't exist: the station lookup, the last-seen update and the token lookup, then `BEGIN`, the three `FOR UPDATE` reads and `ROLLBACK`. The real ingest ends with an `INSERT` and a `COMMIT` instead, so it's one statement longer. Nothing was stored.
- **Where the numbers come from.** CPU time is from `wrangler tail`. In-Worker times are from `performance.now()`, which on Workers only advances across I/O, so it measures waiting, not computing.
- **B's spread.** B is either fast (about 10 ms a ping) or slow (about 400 ms). The slow ones look like a new HTTPS connection to TiDB's endpoint, and the fast ones reuse one. A has no slow mode, but pays its 50 to 60 ms connection on every request.
- **A's CPU.** The 20 ms is spent setting up TLS and mysql2's connection, inside the runtime's Node compatibility layer. Pooling would remove it, but Workers can't keep a connection between requests, and that pooling is the job Hyperdrive would have done.
- **B's lock.** B runs the interactive transaction and `FOR UPDATE` without errors. TiDB's driver calls its interactive transactions experimental (`tidb-fit.md`). This benchmark didn't check that the lock holds when two ingests race. The tests can't check it either, because Docker TiDB doesn't serve the HTTP API.
- **The first B request after a password change failed with `Forbidden`.** It worked a few seconds later.

## What each choice costs

| | A: mysql2, no Hyperdrive | B: serverless driver |
|---|---|---|
| Code change | Small. `src/db/hyperdrive.ts` takes a URL from a secret, and one compatibility flag is added | Drizzle's adapter becomes `tidb-serverless`, plus a change to the Db type |
| Dev and CI | Unchanged. Docker TiDB, the same driver as production | Docker TiDB can't serve the HTTP API, so local runs and tests use mysql2 while production uses B |
| Free plan | About 20 ms of CPU a tap, over the 10 ms limit, so Workers Paid | About 7 ms before app code, so it fits, narrowly |
| Cooldown lock | As tested today | Experimental transactions, and untested under a race |
