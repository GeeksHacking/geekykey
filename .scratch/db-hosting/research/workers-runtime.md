# What does running the backend on Workers involve?

Research for ticket 02, 25 Sep 2026. Sources checked 25 Sep 2026. The run was stopped early to save tokens. The first four points were checked; the rest are marked with what is still open.

## Answer

- **The code port is small.** Only three Deno calls (`Deno.serve`, `Deno.env`, `Deno.mkdir`) and the start-up migration step tie the backend to Deno. On Workers, the entry file does `export default app`, and config comes from `c.env`. Hono, zod, `@hono/zod-validator` and Drizzle's query builder already run there. `@libsql/client` and the file-reading migrator have to go.
- **Migrations must leave the Worker.** A Worker may not do I/O outside a request, so it cannot migrate at start-up. Migrations become a separate step, run from CI or a laptop.
- **A tap might pay a cold database connection with TiDB's serverless driver.** Each query is its own HTTPS request, and a new driver connection per request starts a new TiDB session. Cloudflare does not document whether it reuses the TCP and TLS connection to TiDB between requests. A tap runs about six queries in a row. This must be measured on a deployed Worker.
- **Hyperdrive removes the cold connection, but is unproven for TiDB.** It keeps a pool of open MySQL connections near the database and works on both plans. TiDB is not on Cloudflare's list, and its default 60-second read cache would break duplicate and cooldown checks unless turned off.
- **Plan limits.** The free plan allows 100,000 requests a day and 10 ms of CPU per request; the paid plan is US$5 a month with 10 million requests and 30 million CPU milliseconds included (Workers pricing page, checked 25 Sep 2026). Waiting for the database does not count as CPU time. The 10 ms is the tightest limit. Subrequest and request-body limits (a station can upload 500 taps at once) were not checked.
- **Stations (not finished).** Nothing on Cloudflare blocks an ESP32 outright, but the firmware must move to HTTPS, and bot settings on the geekshacking.com zone may need an exemption for station requests. Which certificate authorities the ESP32 must trust was not checked.
- **Tests (not researched).** Whether `deno test` can stay when production runs on Cloudflare's runtime is left to the ticket "How do local dev, tests and CI get a runtime and a database?".

## What this means for the other tickets

- **"How is the database set up?"** chooses between the serverless driver (simple, but a possible cold connection on each tap) and Hyperdrive (pooled, but TiDB is not on its supported list, and its read cache must be off). Migrations run outside the Worker.
- **"How do local dev, tests and CI get a runtime and a database?"** owns the tests question.
- **"How do deploys and secrets work?"** should ask Julian about the zone's bot settings and the account's plan, and include the migration step in the pipeline.

## Open questions

- Does a Worker reuse its HTTPS connection to TiDB between requests? Only a deployed Worker can tell.
- Does Hyperdrive work with TiDB Cloud Starter? A small test once we have Cloudflare access.
- Subrequest and body-size limits for a 500-tap upload.
- Which CAs the ESP32 must trust, and whether the zone's bot settings block it: Zi Tao and Julian.
