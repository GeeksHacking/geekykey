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

**Since "Where do token owners live until the Portal's tag APIs exist, and what does the token page do?" (5 Oct 2026):** our Cloud Run server also hosts the claims stand-in until the switch after 18 Nov: the `tokens` table and the four claim calls, in a folder of its own, under its own route prefix (for example `/claims-stand-in/v1/…`), and kept apart from the Event Service's code and tables. It isn't part of the Event Service contract. The GeekyKey Service calls it with its own secret, `CLAIMS_STAND_IN_KEY`, which joins the secrets to set. Staging and logs cover it along with the rest of the server.

**Since "Does a station wait for the Event Service's verdict?" (6 Oct 2026):** taps still wait, inside one 4-second deadline for the owner lookup and the hand-off together, and a cold start always lands on the lookup. So decide here how one instance is kept warm on event days only (the rehearsal by 7 Nov, and 17 to 18 Nov), with none otherwise, and who turns it on and off. Measure the cold start at the first deploy, with and without startup CPU boost; the 4 seconds may change with it.
