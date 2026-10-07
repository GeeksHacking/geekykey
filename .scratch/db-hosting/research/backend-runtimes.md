# Which runtime should the Event Service's server use on Cloud Run?

Research for "How is the Event Service built, deployed and staged on Cloud Run?", 7 Oct 2026, asked by Adam during its grilling. It compares Node, Bun and Deno for today's backend running as one server with a shared `mysql2` pool. Measured on Adam's laptop (Apple silicon) against the local TiDB in Docker, so the numbers compare the runtimes with each other. They don't predict Cloud Run, where a cold start also pays for starting the container and a first TLS connection to TiDB Cloud (about 1.2 s from a laptop on 25 Sep).

## Answer

- **All three run today's backend unchanged.** The same Hono routes, Drizzle and `mysql2` 3.24.4 served real taps through the whole ingest (the station's key, the owner lookup, the transaction with `FOR UPDATE` reads, the insert) on Node 22.23.3, Bun 1.4.2 and Deno 2.9.7. Only the three-line entry file differs: Node needs `@hono/node-server`, while Bun (`Bun.serve`) and Deno (`Deno.serve`) take `app.fetch` directly.
- **All three check TiDB Cloud's certificate the same way.** With `verifyIdentity`, each reached TiDB Cloud's login step by hostname and refused the connection by IP address ("Hostname/IP does not match certificate's altnames"). The login itself wasn't tried, so no credential was used. Taking an AuthSwitchRequest is done by `mysql2`'s own code, which is identical on all three, but only Node has done it against TiDB Cloud so far (the database scripts).
- **Speed is a tie once Node loads one bundled file.** Warm taps take about 5 to 6 ms on every runtime, and all handle about 200 to 230 taps a second with 20 at once: the database sets the pace, not the runtime. Node's slower start, about 380 ms, comes from stripping the types out of every `.ts` file as it loads them. Bundled into one file with esbuild, Node starts in about 87 ms, the same as Bun.
- **Memory fits easily in 512 MiB either way:** about 95 MiB on Bun, 110 MiB on bundled Node and 140 MiB on Deno.
- **The images are close in size,** 41 to 76 MiB compressed, and Cloud Run streams images rather than downloading them whole, so this barely moves a cold start.
- **So the runtime is chosen on everything else, and Node wins.**
  - The tests run in Vitest on Node, as planned. With Node in production, the tests run on production's runtime, which is what the 30 Sep decision to run the tests inside workerd was for.
  - The repo pins exactly one runtime, Node, in `.mise.toml`. The frontend, Vite, the database scripts, drizzle-kit and CI all use it. Bun or Deno would be a second runtime to pin, install in CI and teach, for no speed gain.
  - Deno left the backend on 30 Sep ("How do local dev, tests and CI get a runtime and a database?").
  - Bun's own test runner and Vitest under Bun would split the tests from the rest of the repo's tooling.
- **Not looked at further:** workerd in a container on Cloud Run, which would keep today's entry file but can't keep a connection pool between requests, the very reason for leaving Workers; and Node 24, since the repo pins Node 22, which stays supported until April 2027.

## Findings

Seven rounds of each, with the order alternating between rounds. Each round starts the server, waits for `/api/health`, sends one tap (the first database connection), then 300 taps one after another, then 300 more in groups of 20 at once. The middle of the seven rounds is shown.

| Runtime | Start to `/api/health` | First tap | Warm tap, median | Warm tap, p95 | 20 at once | Memory |
|---|---|---|---|---|---|---|
| Node 22.23.3, `.ts` files as they are | 384 ms | 39 ms | 6.2 ms | 11.5 ms | 213 taps/s | 129 MiB |
| Node 22.23.3, bundled into one file | 87 ms | 24 ms | 6.2 ms | 10.3 ms | 204 taps/s | 110 MiB |
| Bun 1.4.2 | 85 ms | 35 ms | 5.3 ms | 7.3 ms | 207 taps/s | 95 MiB |
| Deno 2.9.7 | 113 ms | 27 ms | 6.2 ms | 9.7 ms | 231 taps/s | 142 MiB |

- **The harness** was a throwaway in `/tmp`, outside the repo. It imported `src/base-app.ts`, `src/config.ts` and the three route files straight from `apps/backend`, with one `mysql2` pool of 10 connections to `geekykey_dev` and dev-login on. The seeded dev station sent the taps, all for one token, so after the first most came back `cooldown`, which still runs the whole transaction.
- **Bundling** used the esbuild already in the repo: `--bundle --platform=node --format=esm`, plus a banner that defines `require` for `mysql2`'s CommonJS code. The bundle was 2.5 MB.
- **Base images,** compressed for `linux/amd64`, checked with `docker manifest inspect` on 7 Oct:

  | Image | Size |
  |---|---|
  | `node:22.23.3-slim` | 76 MiB |
  | `node:22.23.3-alpine` | 58 MiB |
  | `gcr.io/distroless/nodejs22-debian12` | 50 MiB |
  | `oven/bun:1.4.2-slim` | 68 MiB |
  | `oven/bun:1.4.2-distroless` | 41 MiB |
  | `denoland/deno:debian-2.9.7` | 69 MiB |
  | `denoland/deno:distroless-2.9.7` | 51 MiB |

## Also found on 7 Oct: how the Portal runs on Google Cloud

Read from its public repo, `GeeksHacking/portal` (`GeeksHackingPortal.Infra/Stacks/DefaultStack.cs` and `GeeksHackingPortal.WebApp/nuxt.config.ts`), and its DNS:

- **Infrastructure as code is Pulumi, in C#.** It describes a Cloud Run v2 service in `asia-southeast1`, Artifact Registry, Secret Manager secrets (among them a TiDB connection string) and a service account.
- **`portal-api.geekshacking.com` is a Cloud Run domain mapping,** made through Pulumi's `CloudRun` (v1) resources, since domain mappings exist only in Cloud Run's v1 interface. That's probably what Julian meant by "Cloud Run v1". Its DNS answers with Google's own addresses (216.239.32.21 to 216.239.38.21), so Cloudflare's proxy is off for it, and Google issues its certificate.
- **The Portal's web app** is Nuxt with `ssr: false`, built for Cloudflare. Its API calls go to `portal-api.`, not through a Worker.
