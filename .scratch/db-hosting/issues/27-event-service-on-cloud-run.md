# How is the Event Service built, deployed and staged on Cloud Run?

Type: grilling
Status: resolved
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

## Answer

Resolved 7 Oct 2026 by grilling with Adam. The Google Cloud project, the infrastructure tool and the domain are provisional until Adam asks Julian and Qing Guan at the meeting on Thu 8 Oct: see [what to ask on 8 Oct](../assets/message-to-julian-workers-requests.md). Wherever it can, the setup copies how GeeksHacking already runs the Portal on Cloud Run.

**Decided**

- **The runtime is Node, not Bun or Deno.** All three ran today's backend unchanged and checked TiDB Cloud's certificate the same way. Once Node loads one bundled file, they're equally fast: a warm tap takes about 6 ms on each, because the database sets the pace ([research/backend-runtimes.md](../research/backend-runtimes.md)). Node wins on the rest. The tests run on Vitest on Node, so production runs what the tests run. The repo already pins only Node. Deno left the backend on 30 Sep.
- **Node 24 for the whole repo,** in one small pull request before the move, because `.mise.toml` pins one Node for every app and CI. Node 24 is LTS, supported until April 2028, and preinstalled in Cloudflare's build image. Node 22 is already in maintenance and ends in April 2027. Node 26 only becomes LTS on 28 Oct, three weeks before the showcase, so the repo moves to it after the showcase.
- **The server.**
  - `src/worker.ts` becomes `src/server.ts` on `@hono/node-server`. The code stays in `apps/backend` until the split.
  - The image runs one file that esbuild bundles at build time, on `node:24-slim`.
  - Settings come from `process.env` and are still read once at start-up.
  - `src/db/hyperdrive.ts` becomes one shared `mysql2` pool of 10 connections, made once, with `verifyIdentity`. Idle connections are dropped after a short time. A query is retried once, but only when its connection was already dead before the query was sent; a query that failed partway is never retried. The `FOR UPDATE` reads stay. The pool is closed on `SIGTERM`.
  - `wrangler.jsonc`, `worker-configuration.d.ts`, the `disableEval` setting and the compatibility flags leave `apps/backend`. The GeekyKey Service's Worker comes back as its own package at the split.
- **Dev, tests and CI.** `node --watch` replaces `wrangler dev`. The tests become plain Vitest on Node, in one project; `@cloudflare/vitest-plugin` and the `requireLikeNode` workaround go. TiDB in Docker stays. CI runs `docker build` on the image, without pushing it, in place of "Build the Worker": that proves the image and the bundle build. `typecheck` drops `wrangler types`. Rejected:
  - **Bun's test runner,** because `bun test` always runs the tests on Bun's runtime, not Node's, and the other apps use Vitest;
  - **Bun as the package manager,** a change for the whole repo with nothing to do with Cloud Run, which would also lose pnpm's `trustPolicy: no-downgrade`. Outside this map.
- **Our own Google Cloud project on GeeksHacking's billing account** (provisional until 8 Oct), so our roles never touch the Portal's. Julian or Qing Guan create it and set up the keyless sign-in from GitHub once.
- **Infrastructure as code: Pulumi in TypeScript, in `infra/`** (provisional until 8 Oct). Pulumi is Qing Guan's tool for the Portal, and TypeScript is the team's language. GitHub Actions applies it on `main`, as the Portal's workflow does. The tool is settled with Qing Guan at the meeting. The alternatives are Pulumi in C#, Terraform or OpenTofu, or `gcloud` commands at first.
- **The deploy: GitHub Actions, on every push to `main`, after the backend checks pass.** One job:
  1. builds the image and pushes it to Artifact Registry;
  2. runs `db:migrate`, with the migration login read from Secret Manager;
  3. deploys to Cloud Run.

  It signs in to Google Cloud without a key (Workload Identity Federation), limited to this repo and its `main` branch, so a workflow on another branch can't deploy or read the migration login. This brings back the 28 Sep preference, migrate then deploy in one job after the tests, without keeping a secret in GitHub. **"Migrate before you merge" and the planned "Migrate production" workflow go away for the Event Service.** Every migration must still work with the version already running.
- **Secrets live in Secret Manager:** `SESSION_SECRET`, the TiDB app login's URL, the migration login's URL, `CLAIMS_STAND_IN_KEY`, and the hand-off key after the split. The infrastructure code creates each secret but never its value. Adam adds each value from his laptop, generated with `openssl rand` and piped into `gcloud secrets versions add --data-file=-`, and keeps no copy. The service pins each secret to a version number, so changing one is a reviewed change and a new revision. As on Workers, never roll back past a key replacement.
- **Staging is a second Cloud Run service, `event-service-staging`,** in the same project, on `geekykey_staging`. It has no warm instance and only its `run.app` address, and it's deployed by hand, from any branch, by running the same workflow (`workflow_dispatch`). The uncommitted `env.staging` and `deploy:staging` in Adam's working tree (BAC-15) are thrown away. Whether the GeekyKey Service gets a staging copy is decided at the split.
- **`event-api.geekshacking.com` is a Cloud Run domain mapping with Cloudflare's proxy off,** exactly like `portal-api.`, which GeeksHacking already runs. It's free, and Google issues the certificate from Google Trust Services, whose roots the stations already trust. `event-web` keeps forwarding `/api` and `/auth` to it, and the GeekyKey Service hands taps off to it. Accepted: Cloudflare's zone rules don't cover `event-api.`, and the `run.app` address stays open, so the limits in our own code are what protect both. The fallback, if domain mapping lets us down, is a Google load balancer at about US$18 a month.
- **The Workers free plan is accepted for the showcase** (Adam): fewer people are expected than the worst case. Every passport and organizer poll forwarded by `event-web` counts against the 100,000 Worker requests a day, and a showcase day should use about 60,000 to 90,000. The estimate is part 3 of the meeting notes, for Adam to raise only if it comes up. The rehearsal gives the real number.
- **Size and cold starts.**
  - Region `asia-southeast1`; 1 vCPU and 512 MiB; up to 80 requests at once per instance.
  - Request-based billing, with startup CPU boost on.
  - At most 2 instances, which also caps TiDB connections at 20.
  - No warm instance, except one on event days: the rehearsal (by 7 Nov) and 17 to 18 Nov. Adam switches it on and off with a reviewed one-line change to the infrastructure code, on the morning of each and after 18 Nov. The event-day sheet lists both switches.
  - At the first deploy, measure a cold start with and without CPU boost, and on the first- and second-generation execution environments, then keep the fastest and revisit the 4-second deadline.
- **Logs** go to Cloud Logging. Its request logs record no request headers, so no keys or cookies, but they do record full URLs. Adam, Ethan and Zi Tao get Logs Viewer: Zi Tao because station health now lives in the Event Service. Joshua gets none. The first-deploy log check becomes "no key or cookie in a log, and no secret in a URL".
- **Rollbacks:** Adam sends all traffic back to the previous revision (`gcloud run services update-traffic`, or the console), with Julian as the backstop. One version back is always safe. Revert the bad commit on `main` straight after, or the next deploy brings it back. The database is never rolled back. Ethan gets no deploy role on Google Cloud; the screens he might roll back stay on Cloudflare.
- **The Workers config already on `main`:** Adam asks Julian on 8 Oct to disconnect Workers Builds from `apps/backend`. The move-first change removes `wrangler.jsonc` from it anyway. Workers Builds is connected again for the GeekyKey Service's own package at the split.

**What follows without a further decision**

- The Event Service's settings that aren't secret (the cooldown, the batch size, the redirect URL, the organizers) move from `wrangler.jsonc` to the Cloud Run service's environment, set by the infrastructure code and changed by a reviewed pull request.
- The deploy never needs a Cloudflare token: Cloudflare still builds only the Workers.
- `run.app` addresses stay reachable. The Event Service's own keys and session checks already protect every route, as they would behind a domain.

**Facts** (7 Oct 2026)

- Node's schedule: Node 22 is in maintenance and ends 30 Apr 2027; Node 24 moves to maintenance on 20 Oct 2026 and ends 30 Apr 2028; Node 26, at 26.10.0, becomes LTS on 28 Oct 2026 and ends 30 Apr 2029 ([nodejs/Release](https://github.com/nodejs/Release/blob/main/schedule.json)).
- How the Portal runs on Google Cloud, from its public repo and DNS: Pulumi in C#; GitHub Actions with Workload Identity Federation for the deploy, the migrations and the infrastructure; secrets in Secret Manager; Pulumi's state in a versioned Cloud Storage bucket; `portal-api.` through a Cloud Run v1 domain mapping with Cloudflare's proxy off ([research/backend-runtimes.md](../research/backend-runtimes.md)).
- Bun 1.4.2's `bun install` can wait before installing new releases (`--minimum-release-age`), but has no option like pnpm's `trustPolicy: no-downgrade`.

**Assets**

- [research/backend-runtimes.md](../research/backend-runtimes.md): Node, Bun and Deno measured against the local TiDB, and the Portal's setup.
- [What to ask Julian and Qing Guan on 8 Oct](../assets/message-to-julian-workers-requests.md): the setup questions from this ticket, the two already set for the meeting, and the Workers free plan if it comes up.

**Passed on**

- "Fold the answers into the spec": section 3 (the Event Service on Cloud Run, `event-api.` as a domain mapping, the pool); section 5 (Secret Manager and `process.env` in place of `wrangler.jsonc` and Workers secrets for the Event Service); checkpoint 2 rewritten as the move to Cloud Run (the Node 24 pull request, `src/server.ts`, the Dockerfile, the tests on Node, CI's `docker build`, the project and the keyless sign-in, staging, the first deploy and the cold-start measurements); the Deploying section's rules (migrations in the deploy job, staging first, the freeze, rollbacks by revision); the README's dev commands in section 8; the warm-instance switches and logs on Google Cloud in section 10; and sections 11 and 12, for what's provisional until 8 Oct.
- The Linear tickets, checked 7 Oct: BAC-11 ("The first deploy: a tap to key-api is stored in TiDB through Hyperdrive") becomes the first Cloud Run deploy, at `event-api.`; BAC-12 ("Check the logs for keys, and write down the first numbers, on staging") becomes the Cloud Logging check and the cold-start measurements, on `event-service-staging`; BAC-13 ("The README explains how we deploy") describes the GitHub Actions deploy; BAC-15 ("Staging: a tap to the workers.dev copy is stored in TiDB through Hyperdrive", in progress) is replaced by staging on Cloud Run.
