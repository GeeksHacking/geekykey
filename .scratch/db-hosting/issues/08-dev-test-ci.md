# How do local dev, tests and CI get a runtime and a database?

Type: grilling
Status: resolved
Blocked by: 01, 02, 12
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

Today the tests use in-memory SQLite, and `deno task dev` needs no setup. After the move:

- Do the backend tests stay on Deno, or move to Cloudflare's Vitest integration, which runs on Cloudflare's own runtime?
- What database do tests and CI run against: a local TiDB, MySQL in Docker, or a branch of the TiDB Cloud cluster?
- How do Adam and Ethan run the backend locally, and what happens to the frontend's dev setup (the Vite proxy to port 8000)?
- What changes in `.github/workflows/ci.yml`, including the check that `deno.lock` and `pnpm-lock.yaml` agree?

Since the 27 Sep redraw there are two services, the GeekyKey Service and the sample Event Service. Local dev and tests also need a way to run them together, and a stand-in for the Portal.

**Settled by "Which parts of today's backend belong to the GeekyKey Service, and which to the Event Service?" (28 Sep):** move first, split second. The first checkpoint is today's backend as one Worker on one TiDB database; the two services only become two Workers, joined by a service binding, after the line is drawn inside it. Local dev and tests need to work at both stages.

**Settled by "How is the database set up?" (28 Sep):** the Workers reach TiDB through Hyperdrive with `mysql2` under Drizzle, so tests and local dev can use the same driver against a local TiDB or MySQL. Migrations run through a `db:migrate` task outside any Worker, with a migration login separate from the app login. The taps table uses `AUTO_ID_CACHE 1`, which MySQL does not know, so the choice of local database has to handle that line in the migration. The cooldown's lock uses `SELECT ... FOR UPDATE`, so tests that cover it need a real database, not a stand-in.

## Answer

Resolved 28 Sep 2026 by grilling with Adam, after measuring TiDB in Docker on his Mac.

**Decided**

- **Deno leaves the backend.** It becomes a pnpm package like the frontend. `wrangler dev` runs it locally, and that is already workerd, the open-source runtime Workers run on; running workerd by hand would mean writing its config and building the bundle ourselves, for nothing. Tests move to Vitest with `@cloudflare/vitest-plugin` (named `@cloudflare/vitest-pool-workers` until 19 Aug 2026), which runs the whole test suite inside workerd, so the tests exercise the runtime and the `mysql2` driver production uses. The tests mostly swap `Deno.test` for `test`; `node:assert` can stay. ESLint, oxfmt and `tsc` replace `deno lint`, `deno fmt` and `deno check`, as in the frontend. `deno.json`, `deno.lock`, the CI step that checks `deno.lock` against `pnpm-lock.yaml`, and Deno in `.mise.toml` all go. **Provisional** until the first checkpoint shows the plugin reaching a local TiDB through the Hyperdrive binding. The fallback is the same Vitest test files run on Node, with `mysql2` connecting directly.
- **Laptops and CI run TiDB v8.5.3 in Docker** (`pingcap/tidb`), the version the cluster runs. It compares strings exactly and runs `ENUM`, `AUTO_ID_CACHE` and `SELECT ... FOR UPDATE` as production does. MySQL was rejected because it compares strings without regard to case by default and would leave TiDB's behaviour untested; `tiup playground` because it recommends 10 GiB of memory; a database on GeeksHacking's cluster because every laptop and CI would need the internet and cluster credentials. Ethan and the others install Docker.
- **A `compose.yaml` at the repo root pins the image, and CI uses the same file,** so the version lives in one place. mise tasks wrap it: `db:up` starts the container, creates `geekykey_dev` and `geekykey_test` and migrates both; `db:reset` throws the data away and does that again; `db:down` stops it. There is no Docker volume: dev data comes back with `db:reset` and `seed`.
- **`db:migrate` and `seed` are Node scripts** that connect straight to the database with `mysql2`, not through Hyperdrive. Node 22 runs TypeScript directly, and the code already imports with `.ts` extensions.
- **Tests share one `geekykey_test` database,** kept apart from `geekykey_dev` so running tests never wipes the data you develop with. It is migrated once before a run, test files run one at a time, and each test starts by deleting every row from every table. No test assumes an id value, because deleting rows does not reset them. A database per test file was rejected because the Hyperdrive binding names one database; a transaction rolled back after each test because the cooldown's tests need a second connection to see the lock, and the code opens its own transactions.
- **The frontend keeps its Vite dev server.** Its proxy points at `wrangler dev`, pinned to port 8000 so the proxy does not change. Mock mode stays for work that needs no backend. Cloudflare's Vite plugin, which would run the frontend as its production Worker with the backend behind a real service binding, waits for "Which screens belong to which service, and how does each know who is logged in?".
- **The Portal stand-in stays as it is:** dev-login signs in a seeded user, and `LocalTokenResolver` reads the `tokens` stand-in. When the Portal's tag APIs exist, tests get an in-memory fake `TokenResolver` and local dev a small fake Portal. Adam will pass on news from Qing Guan.
- **After the split, the two services are two packages,** `apps/geekykey-service` and `apps/event-service`, each with its own `wrangler.jsonc`, schema, tests and CI job; `apps/backend` keeps its name until then. Separate packages make sure each Worker imports only its own schema, and a standalone Event Service is a clearer sample for other teams. One command runs both locally: `wrangler dev -c <first>/wrangler.jsonc -c <second>/wrangler.jsonc`, where the first answers on port 8000 and the second is reachable only through the binding.
- **After the split, each service is tested on its own, with the other faked at the binding.** The GeekyKey Service's tests hand taps to a fake Event Service and check what it received; the Event Service's tests call its hand-off directly. One end-to-end smoke test starts both Workers with `wrangler dev` and sends a station tap through to the database, **on every pull request**, because the hand-off is where the two services break each other and it is the contract other teams' Event Services must meet. Running both Workers inside Vitest was rejected: the second must be built to JavaScript first and cannot use the test helpers.
- **The backend's CI job at the first checkpoint:** mise installs Node and pnpm; `pnpm install --frozen-lockfile`, which now guards the backend's dependencies too; lint, format check and `tsc`, with the Workers types from `wrangler types`; `db:up` from `compose.yaml`; the tests. Two checks are added:
  - **The Worker builds:** `wrangler deploy --dry-run` needs no Cloudflare login and catches an import that only works in Node, or a Worker over the size limit, on the pull request.
  - **The migrations match the schema:** `drizzle-kit generate` must write nothing. A missed migration would otherwise first show up when `db:migrate` runs against the real database. The hand-added `AUTO_ID_CACHE` line does not trip it, because `generate` compares the schema with Drizzle's snapshot, not with the SQL files.

  After the split it becomes one job per service plus the smoke test's job. The frontend, updates-site and audit jobs do not change.

**Measured on Adam's Mac (8 GiB of memory), 28 Sep**

- The `pingcap/tidb:v8.5.3` image is an 843 MB download, once; the pull took 12 seconds.
- The container is ready about 1.5 seconds after it starts, by its own logs.
- It uses about 350 MiB of memory idle and about 460 MiB after creating tables and running queries, and about 7% of one CPU core idle. Docker Desktop itself may use up to 4 GiB, so quit it when not working on the backend.
- Creating a database took 16 ms and six tables 52 ms. Deleting every row from six tables took 4 ms; truncating them took 46 ms.
- TiDB keeps `/*T! AUTO_ID_CACHE=1 */`, and TiDB's docs say MySQL ignores anything in a `/*T! ... */` comment. The migration uses that form, so MySQL stays a fallback for anyone who cannot run TiDB.
- A new database compares strings exactly (`utf8mb4_bin`), as the cluster does.

**What follows without a further decision**

- `mysql2` must be 3.13 or later and connect with `disableEval: true` inside workerd, in tests as in production.
- workerd downloads its runtime through an install script, so `allowBuilds` in `pnpm-workspace.yaml` gains the approved `workerd` version, and each Wrangler upgrade needs a person to approve the new one.
- The probe and write-test scripts in this map's `assets/` stay as Deno records. Running them again needs Deno installed on its own.
- No glossary change: these are tooling decisions, not domain terms.

**Passed on**

- Local secrets and `DEV_AUTH_ENABLED` in a gitignored `.dev.vars`, never in deployed config, and whether the build check's output becomes what is deployed: "How do deploys and secrets work?".
- Which service the Vite proxy points at after the split, and whether to move to Cloudflare's Vite plugin then: "Which screens belong to which service, and how does each know who is logged in?".
- The Vitest plugin proof in the first checkpoint, removing Deno (including the README and docs that say `deno task`), and the order of the split-stage work: "Write the migration spec".
