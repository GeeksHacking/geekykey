# GeekyKey MVP through showcase plan

## Planning basis and scope

This plan targets the **full MVP through the 17 November 2026 showcase**, but execution is staged: first complete and test the frontend/backend locally, then package the same artifacts for the later Google Cloud Run release. The frontend screens are already built against mock data; the primary remaining product work is backend completion and live integration, not another redesign.

Assumptions and decisions to carry into implementation:

- The detailed participant contract in `apps/API-AGREEMENT.md:366-397` and the existing `/pair` screen are authoritative: pairing is allowed for either an authenticated participant or organiser. Update the endpoint index/changelog to remove the contradictory “Participant” wording.
- Keep the mock client as the default UI/test harness until a real slice is explicitly enabled. Never mix a live `me()` with mock login methods.
- Do not invent portal OIDC or QR payload details. The final single-container Cloud Run and Turso/libSQL choices are recorded below; production-origin and provider claims remain external inputs.
- Do not add leaderboards, quests, event CRUD, tap editing, device-configuration UI, websockets, or profile editing. These are explicitly out of scope in `apps/API-AGREEMENT.md:528-537` and `apps/frontend/CLAUDE.md:464-475`.

## Decision gates before dependent implementation

These are not safe to guess. Keep the affected feature mocked until the decision is recorded in the API agreement and reflected in both sides. The QR storage decision below is now resolved; the remaining gates are external or operational.

- **Portal QR payload and token storage:** resolved for the implementation: a QR fallback identified by `user_id` may have no active NFC token, so `taps.token_uid` becomes nullable; the backend preserves `user_id` and resolves cooldown/stamp state by user/station. A fallback identified by `uid` still resolves an active token or returns `unknown_token` with `201`. Update the agreement, Drizzle schema/types, mock, CSV, and UI together.
- **Production authentication:** obtain OIDC issuer/client, claims, role mapping, state/PKCE rules, and callback behavior from the portal owner.
- **Deployment topology and database:** resolved for the final product: build the frontend and backend into one Docker image/service on Google Cloud Run behind one public origin. Use one Deno/Hono process with a static-file/SPA handler to serve the app and `/api`/`/auth`; no separate frontend host is planned. Keep the current local file database for development/testing; use Turso/libSQL in Cloud Run, with the same Drizzle schema/migrations and `DATABASE_AUTH_TOKEN` from Secret Manager.
- **Device clock trust:** resolved for MVP: store `tapped_at` for audit, but use server receipt time for cooldown unless the device value is within a configurable `TAP_CLOCK_SKEW_SECONDS` bound (default 300 seconds). Add boundary tests and document heartbeat/server-time synchronization.
- **Firmware offline behavior:** resolved for MVP: implement a bounded persistent queue in NVS/flash (configurable capacity, default 100), retry/backoff network failures, remove items after any definitive result, and flush through the existing batch endpoint. When full, retain existing items and reject a new tap with visible station feedback; power loss and duplicate `client_tap_id` behavior are test cases.
- **A/B operation:** confirm venue/date, station inventory, key provisioning, and the aggregate-only analysis process.
- **Client adapter semantics:** explicitly document that `pairToken()`’s `created` flag is adapter metadata derived from HTTP 201 versus 200, not a wire field; keep screens independent of response reshaping.

## Current milestone

- **Now:** finish the local frontend/backend MVP using the existing file database, with mock mode as the default and live slices enabled only after backend tests pass.
- **Later:** build one combined frontend/backend Docker image and deploy the single service to Cloud Run with Turso/libSQL; do not block local acceptance on production OIDC. Keep dev-login and the Vite proxy as the local path; hold `/auth/login`, `/auth/callback`, and production deployment behind their external release gates.

### Local acceptance gate

Before starting Cloud Run packaging, the local workspace is ready when:

- `deno task seed` creates a local database and the Deno backend passes typecheck/tests.
- The frontend passes typecheck/lint/format/tests/build, and the updates site passes its build/content checks.
- `VITE_LIVE_API=1` runs the session, pairing, organiser, fallback, stats, export, and unpair slices against the local backend; the same suite still passes with the flag off.
- A seeded participant and organiser complete the end-to-end browser flow, including error, empty, forbidden, and stale/poll-failure states.
- The physical station path has at least one successful local test, including a powered-off queued tap that flushes after reconnection without duplication; if hardware is unavailable, record the exact blocker and validate the queue/parser with a host-side harness.

### Explicitly outside the current local milestone

- Portal `/auth/login` and `/auth/callback`: no speculative OIDC implementation; use seeded `dev-login` locally and revisit when the portal contract arrives.
- Cloud Run image, Turso provisioning, production cookie hardening, and router/SPA routing: the combined container topology is decided, but these release details must not block local MVP work.
- A/B venue logistics and showcase deployment: track as release operations, not as reasons to delay the local feature sequence.

## Current baseline

| Area | Current state | Consequence |
|---|---|---|
| Frontend | All participant and organiser screens are present and mock-driven. `createAppClient()` composes the mock with live overrides. | UI feature work is mostly complete; integration and acceptance remain. |
| HTTP transport | `apps/frontend/src/api/http/client.ts:55-60` intentionally throws from `send()`. | No live endpoint can be trusted until the transport is implemented and tested. |
| Backend | Hono/Deno, Drizzle/libSQL schema, session middleware, dev login/logout, health, and station tap ingestion exist (`apps/backend/src/app.ts:46-65`). | The database foundation is reusable; participant and organiser routes are missing. |
| Contract statuses | Only health, station taps, dev login, and logout are marked `Implemented` (`apps/API-AGREEMENT.md:193-212`). | Do not switch frontend methods live before their backend route and tests are complete. |
| Firmware | Main station sketch reads NFC UIDs, persists a tap counter, authenticates with a station key, and posts taps. | Hardware still lacks heartbeat, reconnect/retry/buffer behaviour, and production transport. |
| Tooling | CI covers frontend, backend, and pnpm audit, but not updates-site build or firmware. | Add missing quality gates and make the locked toolchain compatible. |
| Documentation | The API agreement, frontend working agreement, and progress journal disagree on a few ownership/status details. | Resolve drift before using statuses as release gates. |

## First executable checkpoint

The first code slice should end with a local participant flow, not a partial hybrid app:

1. Land the token/tap schema and global error/config foundations.
2. Implement and test `GET /api/v1/me` plus the session route tests.
3. Implement `send()` and enable `devLogin`, `logout`, and `me` together.
4. Add `pairToken`/`unpairToken` with the new history model and enable the pairing screen.
5. Only then add organiser routes and the remaining MVP tail.

## Ordered implementation work

### 0. Security and contract closure

1. **Remove the experimental credential leak immediately.** `firmware/test/test.ino:31-33` contains hard-coded Wi-Fi credentials and a placeholder server URL. Rotate those credentials, refactor the sketch to use a `secrets.h` template or remove it from the product path, and inspect history for any copied secret. Do not print the credential values in updates or commits.
2. **Add repository-wide secret protection.** The root `.gitignore` currently ignores firmware `secrets.h` but not backend `.env` files, while `apps/backend/src/config.ts:61-73` reads `DATABASE_AUTH_TOKEN` and `SESSION_SECRET`. Add a safe example and ignore policy, then run a secret scan over the repository and history.
3. **Close contract and instruction ambiguities.** Record the pairing-role decision above, correct stale frontend ownership and portal-contact naming in the relevant documents, and update `apps/API-AGREEMENT.md` statuses only after implementation and tests. Reconcile the frontend stack guide with the actual package/source tree: it lists `motion/react`, but no motion dependency or import is present, and `features/stats/export-button.tsx` uses a direct API action instead of the documented feature mutation-hook pattern. Either adopt or remove each claim consistently.
4. **Obtain external inputs before their work starts:** portal issuer/client/claims and callback rules, participant QR payload, production frontend origin, A/B venue/date, and the chosen station library/build versions. Track each as a blocker with an owner.
5. **Repair toolchain/config defects.** Align `.mise.toml` Node with the locked engines (`jsdom@30.1.0` requires Node `^22.22.2 || ^24.15.0 || >=26.0.0`; `undici@8.10.2` requires `>=22.19.0`) or deliberately downgrade the affected dependencies, then refresh the lockfile and verify CI. Repair the stale `apps/backend/deno.json` `exports: "./mod.ts"` entry because that file is absent. Add explicit backend format/lint tasks and run them in CI. Verify the frontend node typecheck configuration as well: `apps/frontend/tsconfig.node.json:14` includes `eslint.config.js` while `allowJs` is not enabled, so either remove that file from the TypeScript include or make the configuration intentional. Also verify a clean CI runner against `pnpm-workspace.yaml:12-15`; the 24-hour `minimumReleaseAge` policy can delay newly published dependency resolution and should be documented rather than mistaken for a code failure.
6. **Add updates-site coverage.** Invoke `pnpm --filter @geekykey/updates build` in CI so content front matter, dates, dash rules, and `TODO(` publication checks run on every change. Add checks for the required headings, contiguous windows, image references/alt text, and PII/secret review. Add a Deno dependency/lock audit if supported by the pinned Deno version, and document Deno’s 24-hour minimum dependency-age behavior alongside pnpm’s policy.
7. **Make configuration discoverable and migrations checkable.** Add a safe backend environment example covering `PORT`, `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `SESSION_SECRET`, `MAX_TAPS_PER_REQUEST`, `TAP_CLOCK_SKEW_SECONDS`, and `DEV_AUTH_ENABLED`; add a CI check that Drizzle migrations match `src/db/schema.ts`; and add a root engine/preflight check so the supported Node version fails fast rather than only warning.

### 0A. Close backend data-model and reliability gaps

Resolve these before building the resource routes:

1. **Preserve token history.** The agreement requires unpair to retain a revoked row and permits the same UID to be paired again, but `apps/backend/src/db/schema.ts:32-40` currently makes `uid` the sole primary key. Migrate in an expand/backfill/constrain sequence: add a token row ID, backfill existing rows, enforce uniqueness only for active UIDs (for example, a partial unique index where `revoked_at IS NULL`), and make `taps.token_uid` nullable without deleting history. Pairing must handle an active-UID race by re-reading ownership and returning the agreed `200`/`409` result. Add migration, rollback/compatibility, and lifecycle tests.
2. **Make tap ingestion concurrency-safe.** `TapPipeline` currently reads cooldown state and inserts later without a transaction; concurrent distinct IDs can both be accepted, and a lost duplicate insert can return the wrong status. Use a transaction/conditional-write design, inspect insert conflicts, and return the inserted row ID needed by QR fallback. Preserve the latest historical accepted timestamp when processing older buffered taps. Add simultaneous-duplicate, simultaneous-user/station, and interleaved-offline-history tests.
3. **Implement the resolved QR `user_id` rule.** Make `taps.token_uid` nullable. For a QR request containing `user_id`, verify the user, resolve cooldown/stamps by `user_id` and station, and accept the tap even when no active NFC token exists. For a request containing `uid`, use the normal active-token resolver; an unpaired/revoked UID is `unknown_token` with `201`. Update the agreement, Drizzle schema/types, mock, CSV serializer, and admin display together. Add a no-active-token known-user fixture and reject an unknown user with `404`; never use an empty string as a sentinel.
4. **Implement the bounded clock policy.** Preserve the submitted `tapped_at` in the tap record, but derive cooldown time from server receipt unless the device timestamp is within `TAP_CLOCK_SKEW_SECONDS` (default 300). Treat a missing or out-of-window timestamp as untrusted, add future/past boundary tests, and document that heartbeat `server_time` is the station’s synchronization source.
5. **Enforce global HTTP/error/config contracts.** Add a JSON `notFound` handler and ensure all expected `HTTPException` statuses retain the agreement’s `{ error, issues? }` shape instead of becoming 500s. The final same-origin Cloud Run router does not require production CORS; retain the Vite proxy for local development and add exact CORS only if the topology later changes. Validate `MAX_TAPS_PER_REQUEST` to the agreement’s 1-500 range, validate `PORT`, and refuse dev auth/static secrets in production.
6. **Harden seed and query foundations.** Validate seed UIDs, do not silently report conflicts as success, prevent accidental production seeding, and add indexes needed by `/me` and admin filters (user/time, station/time, status/time). Keep migrations generated through Drizzle and container-relative. Before applying the token/tap migration locally, copy or export the database and run the migration against a disposable seeded database; never use the only event database as the rollback mechanism.

### Runtime data flow to preserve

`browser -> createAppClient -> HTTP send -> Hono route -> service/Drizzle -> JSON response -> TanStack Query cache -> screen`

`ESP32 -> stationAuth -> TapPipeline -> Drizzle -> per-item station result`

Keep the two paths separate: station requests never accept a user ID from the device, participant requests always derive identity from the session, and organiser fallback resolves identity through the agreed `user_id`/`uid` rule before entering the same cooldown pipeline.

### Backend module boundary

Keep Hono route handlers thin: validate request/response shapes, call `requireSession`/`requireRole`/`stationAuth`, and delegate domain work to services. Add `routes/me.ts`, `routes/tokens.ts`, `routes/admin/stations.ts`, `routes/admin/taps.ts`, `routes/stations/heartbeat.ts`, and `routes/admin/stats.ts`/`export.ts` as the route surface; put reusable queries, token-lifecycle transitions, tap-pipeline orchestration, aggregation, and CSV serialization in `src/services/`. Frontend screens must consume only the typed `ApiClient` wire results and must not query the database or reshape server errors.

### 1. Complete the backend session slice

Create focused route/service modules under `apps/backend/src/routes/` and reuse the existing `requireSession`, `requireRole`, `readSession`, and Drizzle schema.

1. **Implement `GET /api/v1/me`.**
   - Require a signed-in session.
   - Return the current user, active tokens only, every station as a passport slot, points derived from accepted taps, and the newest 50 taps including rejected statuses. Order stations by `created_at ASC, id ASC`; order recent taps by `id DESC`. Treat `earned_at` as the earliest accepted tap’s server `received_at`, matching the mock’s semantics and avoiding untrusted device time.
   - Add tests for anonymous access, empty event data, revoked-token exclusion, all tap statuses, stamp derivation, repeated accepted points, and recent-tap ordering.
2. **Implement `POST /api/v1/tokens/pair`.**
   - Validate and normalise the UID, return `201` for a new pairing and `200` for the same user’s idempotent repeat, and return `409` for an active token owned by another user.
   - Allow a revoked UID to be paired again by a new user.
   - Handle the primary-key/revocation relationship transactionally and add route-level tests.
3. **Implement `DELETE /api/v1/tokens/{uid}`.**
   - Require the owning session, set `revoked_at`, return `204`, and return `404` for a token not owned by the current user.
4. Add any necessary Drizzle migration only after the schema change is agreed. Update the API agreement to `Implemented` only after the response shapes and error paths are tested.

### 2. Make the frontend session slice live

1. Implement `send()` in `apps/frontend/src/api/http/client.ts` by hand:
   - call `fetch` with `credentials: "include"`;
   - return successful responses untouched, including `204`;
   - parse `{ error, issues? }` on non-2xx responses and throw `ApiError`;
   - map missing, malformed, or HTML error bodies to a useful status-based `ErrorCode`, especially `401` to `unauthenticated`;
   - throw `NetworkError` when `fetch` rejects.
2. Add HTTP-client tests for JSON success, empty `204`, structured validation errors, malformed/empty error bodies, 401/403/500 mappings, and network rejection. Do not copy response reshaping into screens. Keep `baseUrl` empty for both the local proxy and the final same-origin Cloud Run service; add `VITE_API_BASE_URL` only if the one-origin topology changes.
3. In `apps/frontend/src/api/create-client.ts`, enable `devLogin`, `logout`, and `me` as one live slice. Leave the remaining methods mocked until their backend routes pass.
4. Before calling the session slice complete, align `apps/frontend/src/lib/session-provider.tsx:23-36` with the central retry policy: convert 401 to `null`, but allow the documented network-failure retry instead of disabling all retries. Add a test for a transient `NetworkError` and a signed-out session.
5. Centralize live 401/403 handling before enabling mutations. Expired cookies should invalidate the session and return to `/login` with a safe `return_to`; organiser queries should render the existing `ForbiddenView` in place rather than a generic error. Catch logout failures instead of leaving unhandled promise rejections in `ParticipantFrame`/`AdminFrame`.
6. Make identity/cache transitions safe: clear identity-scoped queries before or during logout and before a new sign-in, reset the mock session when the live session slice is enabled, and show a non-blocking stale-data/error indicator when a background poll fails. Add a test that a failed logout cannot expose the previous user’s cached data.
7. Fix login navigation ownership so dev login and the authenticated login effect cannot push twice; one component should own post-login navigation, with a router test proving exactly one navigation.
8. Add missing screen/hook coverage: scan-log `loadMore` failures must expose retry/error state, and the live slice should be tested for loading, empty, populated, validation, 401, 403, 404, internal-error, and network-error paths. Add a route/screen smoke test layer rather than relying only on mock-client tests; introduce a tracked browser runner (the frontend instructions mention Playwright) for the critical participant and organiser paths. Map fallback API issues such as `user_id`/`uid` onto the form’s `identifier` field while preserving the agreed field path.
9. Apply the frontend design/accessibility acceptance checks in `apps/frontend/CLAUDE.md:447-475`: 360 px and 1280 px layouts, light/dark themes, keyboard focus, labels, contrast, and non-colour status cues. Audit the small existing violations found in review, including the token timestamp’s missing mono treatment and alert-dialog pure-black/shadow styling.
10. Seed the database, run the backend with dev auth, and exercise `/login`, `/`, `/passport`, and `/activity` in `VITE_LIVE_API=1` mode. Verify the complete state matrix, then rerun the suite with the flag off.

### 3. Complete organiser Sprint 1 endpoints and wire the screens

1. **Stations:** implement `POST /api/v1/admin/stations` and `GET /api/v1/admin/stations` behind session + organiser middleware. Generate and hash a one-time `gk_sta_` key, never return the hash, compute `online` from `last_seen_at` within 120 seconds, and test empty/error/populated boards and one-time key exposure.
2. **Scan log:** implement `GET /api/v1/admin/taps` with `limit` (1-200), `before_id`, `station_id`, and stored-status filters. Join station/user data, return `user: null` for unknown tokens, order newest first, and return a non-overlapping `next_before_id`. Test cursor boundaries and filter combinations.
3. Enable `listStations`, `createStation`, and `listTaps` in `liveMethods()` only after their tests and agreement status are complete. Run the organiser station, scan-log, empty, offline, polling, and load-more scenarios against the live backend.

### 4. Finish the MVP API tail and live switches

Implement each route with exact agreement semantics and endpoint tests before enabling its client method:

- `POST /api/v1/stations/heartbeat`: station-key auth, optional firmware/buffer fields, `station_id`, and `server_time`; update liveness through the existing station-auth path.
- `POST /api/v1/admin/taps`: organiser auth, exactly one of `user_id` or `uid` using the resolved nullable-token rule, generated `client_tap_id`, `source: "qr_fallback"`, the same cooldown/stamp pipeline as station taps, and a `201` result for accepted/cooldown/unknown token. Return the inserted tap ID required by the agreement; unknown users/stations are `404`.
- `GET /api/v1/admin/stats`: total/accepted tap counts, distinct non-null `user_id` values among accepted taps, and per-station aggregates in station creation order; use the same definition for the global and per-station unique-participant counts.
- `GET /api/v1/admin/export.csv`: exact agreed column order, all statuses, correct CSV escaping, and attachment headers; write an empty CSV cell for null `token_uid` and verify the header and rows against the Sprint 2 analysis requirements.
- Complete token unpair if not delivered with the session slice.

Then enable `createFallbackTap`, `stats`, `exportCsv`, and `unpairToken` in the live client and run the complete organiser flow. Keep the frontend’s response types as a field-for-field mirror of the agreement.

### 5. Add production portal authentication after the external decision gate

Once the portal contract is supplied, implement `GET /auth/login` and `GET /auth/callback` with state/nonce validation, safe relative `return_to` handling, role/display-name claim mapping, and the existing signed-cookie session helper. Add provider-failure, invalid-state, unknown-user, and production-disabled-dev-auth tests. Do not ship a guessed OIDC implementation.

### 6. Make the station firmware field-ready

1. Keep the production sketch’s `secrets.h` model and persistent `client_tap_id` counter. Add bounded Wi-Fi connection attempts, serial diagnostics, reconnect/backoff, and explicit handling for network failure versus a returned tap status.
2. Implement a bounded NVS-backed offline queue (`QUEUE_CAPACITY`, default 100) with a documented overflow policy: retain existing entries, reject a new tap with visible station feedback, and recover after a successful flush. Retry network failures/5xx with backoff, remove entries after any definitive response (including `duplicate`/`unknown_token`), preserve `tapped_at` when available, and flush through `POST /api/v1/taps`. Add power-loss, out-of-order, overflow, and duplicate-ID tests; do not silently drop taps.
3. Add the required heartbeat on boot and every 60 seconds, consume `server_time` for the bounded clock policy, and test the 120-second online threshold.
4. Keep participant data out of station responses. Provision one key per station, keep the key out of firmware history/serial logs, and test missing/invalid keys.
5. Extract the duplicated NTAG/NDEF parser into a testable module and add bounds/length checks before reading malformed or short tags. Keep the scratch sketch explicitly non-deployable and add a firmware README/flash checklist.
6. For remote deployment, replace lab-only mDNS/plain HTTP assumptions with the agreed HTTPS/reverse-proxy path. Add a reproducible Arduino library/version record and a hardware test checklist covering RC522 wiring, UID normalisation, restart persistence, accepted/cooldown/unknown statuses, retries, heartbeat, and time handling.
7. Complete the materials decision/order and run at least one end-to-end physical test with the seeded backend.

### 7. Package and release for Cloud Run after local acceptance

Do not block local Sprint 1/MVP work on a hosting choice. After the local full-stack acceptance suite passes:

1. Package the combined frontend/backend application as one Docker image for Google Cloud Run. Add a reproducible multi-stage `apps/backend/Dockerfile` and `.dockerignore`, build `apps/frontend` into the image, and make one Deno/Hono process listen on Cloud Run’s `$PORT`. Let Hono serve static assets and an SPA fallback, while `/api` and `/auth` remain the API surface; expose `/api/health`. Use Turso/libSQL in production through `DATABASE_URL` and `DATABASE_AUTH_TOKEN` from Secret Manager, while retaining the current `file:./data/geekykey.db` only for local development. Configure startup migrations, health checks, and a rollback path.
2. Use one public origin for the service. Hono’s static handler must serve `apps/frontend/dist` for non-API paths, preserve the SPA fallback for `/passport` and `/admin/*`, and keep API/auth routes ahead of the fallback. Add integration tests for direct navigation, cookies, station routes, and same-origin behavior.
3. Provision Turso when the subscription is available, set `DATABASE_URL`/`DATABASE_AUTH_TOKEN` only in the Cloud Run environment, run the same Drizzle migrations against it, and verify the local/Turso schema checksums. If event data must move, use a reviewed export/import procedure rather than copying a live SQLite/WAL file; test backup and restore before relying on Turso. Define the production origin, secure-cookie behavior, `SESSION_SECRET`, station-key provisioning, logs, request IDs, and failure monitoring; keep `DEV_AUTH_ENABLED` false.
4. Add deployment configuration/workflow only after the Turso credentials and secret values are ready; ensure a fresh environment can build and start the single service. Configure the Hono/SPA fallback and document/install the pinned pnpm, Node, and Deno versions in the Docker build.
5. Keep one update entry per mentor check-in. Record decisions, rejected alternatives, blockers, learning, and next goals, with no PII, secrets, or participant-level A/B data.

## Validation and release gates

Run the local checks after each work package. Treat production-hosting checks as a separate release gate:

```text
mise run install
pnpm --filter @geekykey/frontend typecheck
pnpm --filter @geekykey/frontend lint
pnpm --filter @geekykey/frontend format:check
pnpm --filter @geekykey/frontend test
pnpm --filter @geekykey/frontend build
cd apps/backend && deno task check
cd apps/backend && deno task test
pnpm --filter @geekykey/updates build
pnpm audit --audit-level=high
```

Add live smoke scenarios to the release checklist:

- compare real JSON field-by-field against `src/api/types.ts`; add a shared contract/schema or integration check so the hand-maintained Markdown/types/mock/backend surfaces cannot drift silently;

- participant dev login, dashboard, passport, activity, pairing, idempotent repeat, conflict, and unpair;
- organiser login, forbidden participant view, station create/list, one-time key reveal, scan polling, filters, cursor paging, fallback for a known user with no active token, fallback for an unpaired UID, summary, and CSV download;
- stopped backend/network failure, invalid station key, malformed body, 401, 403, 404, 409, and 500 paths;
- physical NFC tap through ESP32 to accepted/cooldown/unknown results and organiser visibility;
- restart/reconnect, duplicate `client_tap_id`, offline flush ordering, heartbeat, and station online threshold;
- production same-origin cookie/router behavior with dev auth disabled;
- updates-site content/schema build and PII/secret review.

## Explicit blockers and risks

| Blocker/risk | Mitigation or decision gate |
|---|---|
| Portal OIDC details and QR payload are unknown | Use dev-login and seeded IDs locally; implement production auth/fallback parsing only after the portal contract arrives. |
| Token history and QR `user_id` storage require a schema migration | Migrate to retained token rows and nullable `taps.token_uid` before pair/unpair/fallback. |
| Tap cooldown and duplicate handling are race-prone outside single-request tests | Make the pipeline transactional/conditional, return inserted IDs, and add concurrency/interleaving tests. |
| Device clocks can distort cooldown/offline ordering | Use the resolved bounded-skew policy, heartbeat server time, and future/past boundary tests before event use. |
| Physical station network/hardware reliability and queue overflow | Test persistent queue, heartbeat, reconnects, key auth, parser bounds, and explicit overflow behavior before the showcase. |
| Hybrid mock/live state can produce misleading screens | Enable one documented slice at a time and run the full suite with `VITE_LIVE_API` both off and on. |
| Contract drift across web, backend, firmware, and ESP32 | Treat `API-AGREEMENT.md` as the fixed point; update it before changing a shape or status. |
| Locked dependencies require a newer Node than mise pins | Align the pin and lockfile before relying on CI/test results. |
| Cloud Run filesystem and Turso provisioning are not yet available | Keep local file SQLite for development, use Turso/libSQL plus Secret Manager in the single Cloud Run service, and validate the internal router before deployment. |
| Public updates site can leak event data | Enforce aggregate-only reporting, secret scanning, and PII review before publishing. |

## Definition of done

### Local MVP

- Every `Sprint 1` and local `MVP` endpoint is implemented and tested, except production OIDC, which remains an explicit release gate with no false live status.
- Token history, tap idempotency/cooldown concurrency, bounded clock handling, error shaping, and configuration bounds have regression coverage.
- The frontend session, pairing, organiser, fallback, stats, export, and unpair slices run against the local backend; mock mode remains usable.
- A seeded participant and organiser complete the browser flow, and the physical station path has at least one local test or a named hardware blocker.

### Showcase/release

- Production OIDC, secure cookies, Turso/libSQL configuration, combined Cloud Run image/router, migrations, backups, and release rollback are documented and exercised in the selected environment.
- The physical station path has passed field tests, including heartbeat/retry behaviour and no secret leakage.
- CSV export is verified for the Sprint 2 dataset, the A/B event has a confirmed date/venue/operating plan, and showcase data/reporting is aggregate-only.
- CI validates frontend, backend, updates, lockfiles, formatting/linting, tests, builds, and dependency policy.
- The public updates journal has entries for each check-in window and contains no PII or secrets.
