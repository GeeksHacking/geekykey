# How is the Event Service built, deployed and staged on Cloud Run?

Type: grilling
Status: open
Blocked by: 21
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

Settled while redrawing the map (Adam, 2 Oct 2026): **move first, split second.** The stuck checkpoint 2 becomes today's whole backend, unchanged, deployed to Cloud Run on TiDB with an ordinary `mysql2` connection pool, at `event-api.geekshacking.com`. After that, the GeekyKey Service is cut out as a Worker with no database. Stations move to `key-api.` once that Worker exists. `event-web` stays a Worker that forwards `/api` and `/auth` to Cloud Run over HTTPS.

The backend's routes, services, schema, migrations and database scripts are plain Hono, Drizzle and `mysql2`. Only the entry file (`src/worker.ts`), the connection (`src/db/hyperdrive.ts`), the test setup and `wrangler.jsonc` are tied to Workers.

Decide, with Qing Guan's advice and the facts from "What does Cloud Run "v1" mean, and what does running the Event Service there involve?":

- **The runtime.** A Node server (`@hono/node-server`) in a container. Settings from `process.env`, still read once at start-up. One shared `mysql2` pool with `verifyIdentity`, and the `FOR UPDATE` locking reads kept.
- **Dev, tests and CI.** `node --watch` or similar, instead of `wrangler dev`. Vitest on Node, the fallback planned in "How do local dev, tests and CI get a runtime and a database?". TiDB in Docker stays. What does CI check instead of `check:build`?
- **Who sets up what.** Julian and Qing Guan create the project, the service, the domain and the deploy access, or Adam does with granted roles. Does infrastructure as code live in this repo, and who applies it?
- **The deploy.** A trigger on `main`, and how "migrate before you merge" fits it. Where the image is built.
- **Secrets.** `SESSION_SECRET` and the TiDB app login's URL, who sets them, and that no copy is kept.
- **Staging.** A second Cloud Run service in GeeksHacking's project, Adam's own GCP project, or none. `geekykey_staging` already exists.
- **Cold starts and cost.** Minimum instances, region and CPU settings.
- **Logs.** Who can read them, and the check for keys in request logs.
- **What happens to the Workers config already on `main`** (`wrangler.jsonc` with `routes` for `key-api.` and a stand-in Hyperdrive ID), which makes every Workers Builds build of `main` fail.
