# What does running the backend on Workers involve?

Type: research
Status: resolved
Blocked by: none
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)
Findings: [research/workers-runtime.md](../research/workers-runtime.md)

## Question

What does it take to run this Hono backend on Cloudflare Workers in production, and what does that mean for the stations and for our tests?

Find out, from primary sources:

- **Moving off Deno.** Which Deno-only APIs the backend uses (`Deno.serve`, `Deno.env`, `Deno.mkdir`, reading migration files at startup). How a Hono app runs on Workers: the entry point, and reading config from bindings and secrets. Whether any dependency (Drizzle, zod, `node:` modules) needs the `nodejs_compat` flag or will not run at all.
- **Reaching TiDB Cloud Starter** (Alibaba Cloud, Singapore) from a Worker:
  - With the TiDB serverless driver over HTTPS, does each request pay for a new connection, or does Cloudflare reuse connections between requests? A laptop saw 644 ms for a first query, then 12 ms.
  - Hyperdrive: does it support MySQL and TiDB, does it pool connections and remove that first-query cost, which drivers does it work with, and what does it cost?
  - Would Smart Placement help, with the database in Singapore?
- **Plan limits that matter here,** on both the free and paid plans: CPU time per request, subrequests per request, request body size (a station can upload up to 500 taps at once), memory, and the free plan's daily request cap.
- **The stations** (ESP32 over Wi-Fi):
  - Which certificate authorities issue Cloudflare's edge certificates, and can they change? The ESP32 has to trust them: compare trusting a CA bundle with pinning one root.
  - Would Cloudflare's bot protection on the geekshacking.com zone (Bot Fight Mode and similar settings) challenge or block a non-browser client posting taps? How can it be exempted, on which plans?
- **Local development and tests.** `wrangler dev`, Miniflare and Cloudflare's Vitest integration. Is it realistic to keep `deno test` for this backend when production runs on Cloudflare's runtime (workerd), and what would slip through?

Read first: `apps/backend/src/index.ts`, `src/app.ts`, `src/config.ts`, `src/db/`, `deno.json`, `package.json`, the station endpoints in `apps/API-AGREEMENT.md`, and `firmware/` for how a station talks to the backend today.

## Answer

Resolved 25 Sep 2026 from research stopped early to save tokens. Full findings: [research/workers-runtime.md](../research/workers-runtime.md).

- The port off Deno is small: three Deno calls and the start-up migrations. Hono, zod and Drizzle's query builder already run on Workers; `@libsql/client` and the file-reading migrator go.
- Migrations must run outside the Worker, from CI or a laptop.
- With TiDB's serverless driver, whether each tap pays a cold database connection is undocumented. It can only be measured on a deployed Worker.
- Hyperdrive would pool connections, but TiDB is not on its supported list, and its read cache would have to be off.
- The free plan's 10 ms of CPU per request is the tightest limit; waiting on the database does not count.
- Still open: which CAs the ESP32 must trust, the zone's bot settings, subrequest and body-size limits. Tests move to "How do local dev, tests and CI get a runtime and a database?".
