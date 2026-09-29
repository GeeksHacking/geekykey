# Write the migration spec

Type: task
Status: resolved
Blocked by: 04, 05, 06, 07, 08, 09, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

Turn the resolved tickets into one hand-off spec at `.scratch/db-hosting/spec.md`. It should cover:

- **The target architecture:** the Portal, the GeekyKey Service and the sample Event Service, how they call each other, and how it leaves room for the 24 Sep game ideas, the Portal's tag APIs and other teams' Event Services.
- **Claims behind one module.** Claiming a token and finding which user owns it go through one module, so switching from the `tokens` table to the Portal's tag APIs later is not painful (Julian and Adam, 27 Sep).
- **The ordered migration steps** Adam builds in checkpoints, from today's single backend: schema and driver, the Workers port, splitting into the two services, tests and CI, screens and hosting, and deploys.
- **Edits to `apps/API-AGREEMENT.md`,** as the first migration step, in a pull request Ethan reviews:
  - the production base URL;
  - CORS and cookies, rewritten to match "How is the frontend set up, and how does the browser reach the backend?": no CORS, and `Cache-Control: no-store` on API responses;
  - section 10's "One container is one event";
  - section 12's open questions;
  - the endpoints split between the two services, `/me` without the token list, and the export without `token_uid` and `unknown_token` rows, its `status` column holding `accepted`, `cooldown` or `no_game` (Joshua confirmed the A/B analysis needs neither, in "Does the A/B analysis need token IDs or unclaimed-token taps?", 28 Sep).
- **Edits to `README.md`.**
- **The environment variables and secrets.**
- **What Julian, Ethan and Zi Tao each need from us.**

Adam reviews the spec before any code changes.

**Provisional in the spec (Adam, 28 Sep):** the fog left on the map, "Staying on the free plan" (it needs the first deploy's numbers, and the decision on Paid is due by 11 Nov 2026) and "After the event". The other four patches became tickets that block this one.

**Settled by "Which parts of today's backend belong to the GeekyKey Service, and which to the Event Service?" (28 Sep):** the order is move first, split second: today's backend unchanged as one Worker on TiDB, then the line drawn inside it, then two Workers joined by a service binding.

**Settled by "How is the database set up?" (28 Sep):** the first checkpoint proves a deployed Worker reaches TiDB through Hyperdrive, with TiDB's serverless driver as the fallback. A one-off step with the root login creates the `geekykey` database, the app login and the migration login. The schema moves to MySQL in one fresh migration, with `ENUM` columns, `VARCHAR(24)` timestamps and a hand-edited `AUTO_ID_CACHE 1` on taps. The cooldown's lock replaces `#oneAtATime` in the Workers port.

**Settled by "How do local dev, tests and CI get a runtime and a database?" (28 Sep):** the first checkpoint also proves `@cloudflare/vitest-plugin` reaches a local TiDB through the Hyperdrive binding, with Vitest on Node as the fallback. Deno leaves: `deno.json`, `deno.lock`, the CI lockfile check, Deno in `.mise.toml`, and every `deno task` in the README and docs. The steps include `compose.yaml` with `pingcap/tidb:v8.5.3`, the `db:up`, `db:reset`, `db:down`, `db:migrate` and `seed` tasks, the tests moved to Vitest on one `geekykey_test` database, `workerd` in `allowBuilds`, and the two new CI checks (the Worker builds, the migrations match the schema). The split stage adds the two packages, a CI job per service and the end-to-end smoke test on every pull request.

**Settled by "What is a token's ID, and what URL is written on each token?" (28 Sep):** the steps include Zi Tao's token writer sketch (`firmware/token_writer/`), run on every token before the event; see [the message to Zi Tao](../assets/message-to-zi-tao-token-writer.md). The API agreement gains the token address, `https://geekykey.geekshacking.com/t/<UID>`, next to its Token UID section. What Julian needs from us includes keeping that hostname and the `/t/` path working for as long as tokens are in use; Adam raises it with him. [ADR 0001](../../../docs/adr/0001-token-id-is-the-hardware-uid.md) records the decision.

**Settled by "How do stations talk to the GeekyKey Service?" (28 Sep):** the API agreement gains the production base URL for stations (`https://geekykey-api.geekshacking.com`, renamed from `api.geekykey.` on 28 Sep); the `no_event` status; `503 event_service_unavailable`; the rules for `401`, `429`, `5xx` and `400`; the rule that firmware ignores fields and statuses it does not know; the screen and LED table as the suggested mapping, replacing today's "accepted green, cooldown amber" line; `unknown_token` no longer stored; replacing a station's key instead of "to rotate, create a new station"; and the heartbeat as the boot check and the clock source. The steps include the firmware changes in [the message to Zi Tao](../assets/message-to-zi-tao-station-contract.md), and what Julian needs from us includes the `api.` hostname.

**Settled by "How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?" (28 Sep):**
- The API agreement gains a section for people building an Event Service:
  - the hand-off, `POST /geekykey/v1/taps`, with its request and its answer of one status per tap
  - dropping replays by station ID and `client_tap_id`
  - the 3-second limit and what counts as a failure
  - the Event Service key and its rules
  - the status call, `GET /api/v1/event-service/stations`
  - the JSON Schema generated from `packages/handoff`
- The `tap_status` table gains `no_game`.
- The steps include `packages/handoff` with the Zod schemas, the two link columns on the GeekyKey Service's `stations` table, the list of Event Services and of GeekyKey admins in its settings, and the updated [message to Zi Tao](../assets/message-to-zi-tao-station-contract.md): `no_game`, and the station key sent over `http://` only to `.local` addresses, with redirects off and never printed.
- **A test step for the first deployed Worker** (Adam, 28 Sep: note it for testing): send one station request, open its invocation log in the Cloudflare dashboard, and check whether the `Authorization` header, and so the station key, appears. After the split, do the same for one hand-off on the Event Service's log, for the Event Service key. If a key shows, the checkpoint isn't done until "How do deploys and secrets work?" has decided what to do, for example turning invocation logs off, and any key that appeared has been replaced.

**Settled by "Which screens belong to which service, and how does each know who is logged in?" (28 Sep):**
- **The API agreement:**
  - base URLs for both sets of screens, `geekykey.geekshacking.com` and the Event Service's (provisional);
  - `/auth/login`, `/auth/callback` and `/auth/logout` on each service, with its own cookie: `gk_session` for the GeekyKey Service, `event_session` for the Event Service;
  - section 3's callers table: organizers come from a list in the Event Service's settings, not `users.role`, and GeekyKey admins from the GeekyKey Service's;
  - `/me` without `tokens`;
  - pairing and unpairing (8.2, 8.3) move to the GeekyKey Service as claim and release, plus a "tokens for this user" call for My tokens;
  - section 9.4, the QR fallback, takes `user_id` only; its open question about the Portal's QR code stays with Qing Guan;
  - section 11's screen map, split by service, with the token page, My tokens and the GeekyKey admin screens added.
- **The steps:**
  - `apps/geekykey-web`, a second Vite app on the same stack, with its forwarding Worker, the token page (`/t/<UID>`, landing back there after login), My tokens (with release and the claim-by-code form) and the GeekyKey admin screens;
  - the station board, add-station dialog and key reveal moving to it from `apps/frontend`;
  - `apps/frontend` renamed to `apps/event-web` at the split stage;
  - the passport dropping its pair screen and token status, gaining the "Tap your token with your phone to claim it" hint while a participant has no taps, and showing the user's Portal user ID;
  - the organizers' station board merging the status call with passport settings, with "Not in the passport" and "no longer linked";
  - the fallback form losing its "Token UID" mode;
  - the `users.role` column going, with `dev-organizer-1` on the local organizer list;
  - the local ports and one root `pnpm dev`.
- **What Julian needs from us:** [the rewritten message](../assets/message-to-julian-redirect-urls.md) with three custom domains and six redirect URLs. **For the token and hardware workstream:** a printed QR label holding each token's address works with no code change.
- [ADR 0002](../../../docs/adr/0002-each-service-logs-in-through-the-portal.md) records that each service logs in through the Portal itself.

**Settled by "How do deploys and secrets work?" (28 Sep, updated after Julian and Qing Guan's replies the same evening):**
- **The steps:**
  - making the repo public: first Zi Tao changes the Wi-Fi password committed in `firmware/NFC_test/test.ino` and removes it ([message](../assets/message-to-zi-tao-wifi-password.md)); then `main` is protected (pull request and CI required) and a `production` environment is created with Adam as its approver, holding the migration login;
  - a manual "Migrate production" workflow on GitHub Actions, run on a pull request's branch through the `production` environment, and **merged only after it succeeds**; the rule goes in the README;
  - Cloudflare building each Worker from `main` (Workers Builds): its folder as the root directory, `NODE_VERSION` `22.23.3`, `PNPM_VERSION` `12.5.1`, `VITE_LIVE_API` `1` on `event-web`, `npx wrangler deploy`, watch paths for its folder, the shared packages and the lockfile, and preview builds off; one trial build confirms pnpm 12.5.1;
  - the Workers created with their custom domains at the first deploy (`geekykey.geekshacking.com`, `geekykey-api.geekshacking.com`, `showcase.geekshacking.com`), each also in its config's `routes`, so there is no `workers.dev` stage; no config sets `workers_dev = true`;
  - each service's `wrangler.jsonc` with its settings, including its OAuth client ID and redirect URL, and `secrets.required`;
  - one Hyperdrive config for production, created by Adam with the app login and the query cache off;
  - Adam setting each secret with `wrangler secret put` and keeping no copy;
  - measuring what a passport poll and a tap cost at the first deploy, for the Paid decision due by 11 Nov 2026.
- **The first deployed Worker's test step** checks `Cookie` as well as `Authorization`, on every Worker that receives them. If either shows, that Worker gets `observability.logs.invocation_logs = false`, and whatever showed is replaced (the key, or the service's `SESSION_SECRET`).
- **The environment variables and secrets:** per service, `SESSION_SECRET`, the Event Service key or keys, and the Portal client secret if Qing Guan issues one; everything else is a setting in `wrangler.jsonc`; `DEV_AUTH_ENABLED` only in `.dev.vars`. GitHub holds only the migration login, in the `production` environment. No Cloudflare API token is kept in GitHub.
- **The API agreement:** the stations' and Event Services' base URL is `https://geekykey-api.geekshacking.com`; two OAuth apps, one per service, each with its final redirect URL only (local dev keeps dev-login until the Portal takes several URLs per app).
- **README or team notes:** migrate before you merge; every merge to `main` deploys; the event-day freeze (from the evening before 18 Nov until the showcase ends, fixes only, approved by Adam); how to roll back (one Worker, one version, then revert on `main`; never past a key replacement); a change to `packages/handoff` must work with the other service's previous version.
- **What Julian and Qing Guan need from us:** [the message](../assets/message-to-julian-redirect-urls.md). Part 1 was sent on 28 Sep; part 2, the reply to Qing Guan, goes now; part 3 at the first deploy (creating and connecting the Workers with their domains, the roles, protecting `main`, the `production` environment and admin for Adam). Qing Guan registers the two OAuth apps.
- **Still the spec's call:** what the single Worker is called during "move first", and so which of the four names, domains and folders its first deploy uses.

**Settled by "What does the GeekyKey Service need from the Portal's tag APIs?" (28 Sep):**
- **The steps:**
  - the `Claims` module replacing `TokenResolver` (`ownersOf`, `claim`, `release` only if the given user still owns the token, `tokensOf`), with `LocalClaims` over the `tokens` table, which holds only current owners and when each claimed;
  - the token page's fifth level: a GeekyKey admin tapping someone else's token gets a **Release** button, and each release writes a log line saying who released which UID from whom;
  - **after the showcase:** `PortalClaims` (1.5 seconds per lookup, no cache, `ClaimsUnavailable` turned into `503 portal_unavailable`), the GeekyKey admin action "Copy claims to the Portal" (40 rows per request, safe to repeat), then the switch in order (deploy the action, run it, deploy `PortalClaims`, run it again, drop the table later), before the showcase's data is cleaned up. All of this waits on Julian agreeing to keep the showcase on the `tokens` table.
- **The API agreement:** section 8.3 loses "the row is kept with `revoked_at`"; claim answers "already yours" or "taken"; `503 portal_unavailable` joins the stations' errors, from the switch on.
- **The environment variables and secrets:** the GeekyKey Service's Portal client secret, needed from the switch for client credentials.
- **What Julian and Qing Guan need from us:** [the message](../assets/message-to-qing-guan-tag-apis.md), part 1 for Julian (the switch after 18 Nov) and part 2 for Qing Guan (the tag APIs).
- **Fact changed:** since 28 Sep the Portal takes several redirect URLs per OAuth app, which "How do deploys and secrets work?" planned for: the `localhost` URLs join their apps, and local dev can log in through the Portal as well as dev-login.

**Settled by "How do we back up the database, recover it on event day, and clear the test data before the doors open?" (29 Sep):**
- **The steps:** the `db:backup`, `db:restore` (table by table) and `db:clear-test-data` tasks, in TypeScript with `mysql2`, tested in CI against the Docker TiDB; the Event Service's log line for every stored tap (station ID, `client_tap_id`, user ID, `tapped_at` and status, with no names and no token IDs); the migration login kept on Adam's laptop as well as in GitHub's `production` environment; trying the restore once on production before the event.
- **README or team notes:** copies are taken before every "Migrate production" run, just before the test data is cleared and at the end of the event day, and stay on Adam's laptop, never in GitHub or a chat; the event-day freeze covers "Migrate production" too; on the day only Adam changes data, with a fresh copy first and Ethan reading the query; a counting or display bug is fixed by rolling back, not by changing data.
- **The evening before and the morning of the event:** the clear empties `taps` and `tokens` and restarts every link, after a copy; the morning check taps each station with an unclaimed token and expects "Unknown token".
- **Provisional:** tokens claimed at check-in, and the clear as a laptop task rather than a workflow.

**Settled by "How do we protect our public addresses without blocking the stations?" (29 Sep):**
- **The steps:**
  - `workers_dev = false` and `preview_urls = false` in all four Workers' Wrangler files;
  - the rate limiting bindings, each with a `namespace_id` no other Worker in GeeksHacking's account uses: per station, 60 requests a minute, counted by the hash of the key it sent before the database; per user on each service's API, 60 a minute; per user for token lookups and claims on the GeekyKey Service, 20 a minute; per Event Service key on the status call, 120 a minute;
  - the GeekyKey Service's list of station key hashes kept in memory, refreshed on a timer at most once a minute;
  - the 3-token cap in the `Claims` module, with the cap as a GeekyKey Service setting;
  - disabling and enabling a station on the GeekyKey admin screens, with a `stations` column saying since when it is disabled, and a log line saying who did it;
  - one log line for each tripped limit, naming the caller and never a key;
  - the screens' handling of `429`: polling screens keep the last data, and the token page, claim form and My tokens say "Too many tries. Wait a minute and try again."
- **The API agreement:** `429` with `{"error": "rate_limited"}` and `Retry-After: 60` on every service; `409 token_limit_reached` on claim; stations resend saved taps at most once a minute, with a new tap still sent at once; a disabled station gets `401`.
- **What Qing Guan needs from us, raised when the custom domains are added:** one custom rule that skips Browser Integrity Check, Security Level and all rate limiting rules for `geekykey-api.geekshacking.com`. We ask for no rate limiting rule.
- **What Zi Tao needs from us:** the resend pace, in the updated [message](../assets/message-to-zi-tao-station-contract.md).

**Settled by "How do we notice trouble on event day, and who watches?" (29 Sep):**
- **The steps:**
  - every log line both services write is one JSON object with a fixed name (`tap_stored`, `handoff_failed`, `rate_limited`, `unknown_token`, `no_event`, `link_changed`, `station_disabled`, `token_released`, and any others the steps add), never holding a key, a cookie or a name;
  - three saved queries in the Workers Observability dashboard, shared as one link: errors in the last 15 minutes by name and Worker, failed hand-offs by Event Service, and responses of 500 or above by Worker;
  - `reader_ok` stored with last seen on the GeekyKey Service's `stations` table, and passed on by the status call;
  - the organizers' station board gaining each station's last tap time from the Event Service's taps, and putting stations first, in red, that are offline, holding saved taps, not in the passport, or whose reader isn't responding; a station that is only quiet stays uncoloured;
  - Adam, Ethan and Zi Tao on the GeekyKey admin list for the showcase.
- **The API agreement:** the heartbeat's optional `reader_ok`, and the status call's `reader_ok` for each station, missing when the station hasn't sent one.
- **The event-day section of the spec:**
  - who watches: Adam the services, Zi Tao the stations, Ethan the screens; Adam or Ethan always at the desk, handing over before leaving; the rota's times left blank until the programme is out;
  - the event-day sheet from the ticket, printed for the desk, with Julian's and Qing Guan's numbers if they agree;
  - if still on the free plan, Adam's hourly check of Workers requests and Hyperdrive queries from 08:00, calling Julian at 70%, and the evening check of TiDB's Request Units;
  - the rehearsal on production by Saturday 7 Nov, and what it runs.
- **What Zi Tao needs from us:** `reader_ok` and the `Reader error` screen, in the updated [message](../assets/message-to-zi-tao-station-contract.md).
- **What Julian and Qing Guan need from us:** read-only TiDB access for Adam at the first deploy (part 3), and being reachable by phone on the day (part 4), in [the message](../assets/message-to-julian-redirect-urls.md).

## Answer

Resolved 29 Sep 2026. Claude wrote the spec alone from the resolved tickets, and Adam reviews it before any code changes: **[spec.md](../spec.md)**.

**What it holds:** the architecture (the three kinds of service, the four Workers, how a tap and a claim travel, the database and its tables); `Claims`; every setting, secret, binding and credential; the migration plan as step 0 and eight checkpoints, plus the switch after the showcase and three tracks alongside (going public, the screens, the stations); the edits to the API agreement, section by section, with an endpoint index for both services; the edits to the README and `apps/frontend/CLAUDE.md`; what Julian, Qing Guan, Ethan, Zi Tao and Joshua each need; the event day; and what stays provisional.

**The spec's calls,** listed in its section 2 for review, since no ticket decided them:

- The single Worker is `geekykey-service` from its first deploy, built from `apps/backend` until the split, at `geekykey-api.geekshacking.com`. The screens Workers first deploy with login, at checkpoint 5.
- The order: the API agreement pull request (step 0), today's backend on workerd and TiDB (1), the first deploy (2), the line drawn inside (3), two Workers (4), login and the screens (5), the GeekyKey Service's features (6), the Event Service's (7), ready for the event (8), then the Portal switch after the showcase.
- New endpoints are built once, in their own service, so Sprint 1's pairing and station endpoints wait for checkpoints 6 and 7.
- Reshaping the tables keeps the migration rule, deleting test data rather than converting it.
- Until `main` is protected, Adam migrates from his laptop and deploys by hand.
- `Claims.claim` gains `limit_reached`.
- Proposed paths for the new endpoints, `token_taken`, the GeekyKey Service's `/me`, and `user.role` kept on the Event Service's `/me`.
- The table names `event_stations` and `passport_stations`, the rate limits' names and namespace IDs, two more numbers for the decision on Paid, and the team's rules in the README.

**Found while writing it:**

- **The showcase's date is in doubt.** The map says 18 Nov; the Single Source of Truth and `apps/frontend/CLAUDE.md` say Tue 17 Nov at Ngee Ann Polytechnic, with setup on the 16th.
- **The Sprint 2 A/B test** (5 to 18 Oct) comes before most checkpoints, and needs the Portal login whichever setup runs it. Whether that is a ticket on this map or a decision outside it is Adam's call.
- **The station firmware of 29 Sep** treats any status it doesn't know, and a `400`, as a failed send, and keeps the tap at the head of its queue. Once the service answers `no_event` or `no_game`, one such tap stops the station sending altogether. The spec's notes for Zi Tao say so.
- **An open question in the API agreement can close:** the firmware has saved its tap counter in flash since 23 Sep.
- **Whether `.scratch/`, and so the spec, goes public** with the repo is still Adam's call.

**Not done here:** no message was edited. Part 3 of [the message to Julian](../assets/message-to-julian-redirect-urls.md) needs the "move first" changes in section 9 of the spec before it is sent. The API agreement, the README and the code are unchanged: they are checkpoint work.

**Passed on:** nothing. The destination is reached. The two patches of fog, "Staying on the free plan" and "After the event", stay provisional in section 11 of the spec.

## After Adam's first look (29 Sep 2026)

- **The spec's calls:** "seem sound enough" (Adam).
- **The showcase's date is settled:** setup on Tue 17 Nov and the showcase on Wed 18 Nov. The Single Source of Truth and `apps/frontend/CLAUDE.md`, which say 17 Nov, need correcting.
- **The Sprint 2 A/B test isn't confirmed yet,** so the checkpoints don't wait on it. It stays open in section 12 of the spec.
- **`.scratch/` is committed** with `CONTEXT.md` and `docs/adr/`, while the repo is still private.
- **The messages are updated:** [the station contract](../assets/message-to-zi-tao-station-contract.md) gains section 6, on the 29 Sep firmware's queue; [the message to Julian](../assets/message-to-julian-redirect-urls.md) loses part 2's OAuth paragraph, and part 3 becomes 3a, 3b and 3c, following the checkpoints; and a new [message to Qing Guan](../assets/message-to-qing-guan-login.md) asks for the two OAuth apps, the login details and what the Portal's QR code holds.
- **Later, as Adam decided:** the API agreement pull request and checkpoint 1.
