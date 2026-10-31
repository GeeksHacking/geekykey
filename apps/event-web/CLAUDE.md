# Event screens

React single-page app for GeekyKey, an NFC stamp-collection system for hackathons.
Participants tap a physical NFC token at ESP32 reader stations. This app is where they
see their stamps and points, and where organisers watch the event. It is one package in
the pnpm monorepo; the backend lives in `apps/event-service` (Hono on Node, on Google
Cloud Run, Drizzle ORM, TiDB).

Two audiences, two surfaces:

- **Participants** on their own phones, mid-event, often under dim venue lighting. Mobile first.
- **Organisers** on a laptop at the registration desk or a booth. Desktop first, denser.

Key dates: the grad tea on 12 Nov 2026 is a pilot of the showcase's games, and the showcase is on
17 Nov 2026. Scope down before adding features.

## Sources of truth

1. `apps/API-AGREEMENT.md` is the contract. Build against the shapes there, not against
   backend source or guesses. If the backend disagrees with the agreement, the agreement
   wins and the backend gets fixed.
2. The taste skill, `.agents/skills/design-taste-frontend-v2-experimental/SKILL.md` at the
   repo root, is the design authority. It is the single-file, dial-driven version from
   `Leonxlnx/taste-skill`. The package's newer default, `design-taste-frontend`, is for public
   pages only, so do not swap it in. See [docs/design-direction.md](docs/design-direction.md)
   for how the skill applies to a product UI rather than a landing page.
3. This file covers what neither of those does: stack, layout, conventions, workflow.

Do not copy content from the agreement or the skill into this file. Link to it.

## Mock and live builds

`src/api/create-client.ts` decides which client the app runs on. A live build
(`VITE_LIVE_API=1`) sends every method to the Event Service: the session, the station board
and its writes, the scan log, the QR fallback, the stats, the export and the map. A mock build
answers every method from `src/api/mock`, and the organiser console and the map say so in
section 13's "Demo data" notice (`src/components/layout/data-source-notice.tsx`). A live build shows no notice.
Token claiming lives in the separate GeekyKey app, not in these Event screens. Screens never
need to know which client supplied a value.

Rules that make this possible:

- All data access goes through `src/api/`. Components and pages never call `fetch`.
- `src/api/types.ts` mirrors the agreement field for field, in `snake_case`. Never add a
  field the agreement does not have. If a screen needs something missing, propose a change
  to the agreement instead of inventing it.
- `src/api/mock/` holds fixtures and a mock client with the same interface as the HTTP
  client. Fixtures use the seeded IDs (`dev-user-1`, `dev-organizer-1`), cover the
  statuses currently used by the mock, include stamps with `earned_at: null`, and use realistic,
  uneven data. No round numbers, no "John Doe".
- The mock client simulates latency and can be told to fail with any error code from the
  agreement, so loading and error states are real from day one. `api.mock.failNext(code)`
  fails the next call with that code, or with `"network"`; tests use it. With
  `simulate: true` (the default in `api/create-client.ts`) a station simulator keeps the
  online stations' heartbeat fresh and drips in new taps, so polling has something to show.

## The real backend

No screen, hook, or query key knows whether it talks to the mock or to the Event Service.
`pnpm dev` runs entirely on the mock, so nobody doing UI work is blocked on a running backend.
`pnpm dev:live` sets `VITE_LIVE_API=1` and sends every call to the Event Service. On Windows
PowerShell, `$env:VITE_LIVE_API="1"; pnpm dev`.

`src/api/service-client.ts` groups the methods under the service that owns them in the
agreement: a session bundle and an Event bundle. It has no GeekyKey bundle because these
screens make no GeekyKey call. The screens still consume the single `ApiClient`.

`GET /api/v1/admin/stations` is the organiser's station board (9.2), which the station
screen, the fallback picker and the scan-log filter all read through `listStationBoard`.
Each Event Service registers and issues its own stations (9.7 to 9.9), and the GeekyKey
Service keeps only a copy in memory of what they registered.

To check a screen against the real service:

1. Start the backend: `mise run db:up` and `mise run seed` once (Docker must be running),
   then `mise run dev:event-service`.
2. `pnpm dev:live`, then work through the screen: populated, loading, empty, and every error
   path. Force the errors for real rather than with `failNext`. Stop the backend for a
   network failure, sign out for a 401, and sign in as `dev-user-1` and open
   `/admin/stations` for a 403.
3. If the real JSON differs from `src/api/types.ts`, the agreement wins and the backend is
   fixed. Never widen `types.ts` to match a backend that drifted.

The HTTP client checks every JSON answer against its schema in `src/api/schemas.ts`, so an
answer in the wrong shape becomes a `NetworkError` before a screen sees it. The Event
Service's route tests parse their own answers with the same schemas, so the service and the
screens can't drift apart without a failing test.

`send()` in `src/api/http/client.ts` is implemented. It sends credentialed requests, handles
2xx/204 responses, parses the JSON error envelope, and turns transport or malformed-success
failures into the shared `ApiError`/`NetworkError` types. Keep transport behavior there; do
not add per-screen reshaping, points, stamp, or cooldown calculations.

One thing that looks like a bug and is not:

- The mock session is a `sessionStorage` key called `gk-mock-session`, and the real one is
  an HttpOnly cookie. Neither knows about the other. Sign out before switching modes, or
  use a fresh tab.

## Stack

| Concern | Choice | Notes |
|---|---|---|
| Runtime, package manager | Node 24, pnpm 12 | Workspace package `@geekykey/event-web`. Exact versions are pinned in the root `.mise.toml` |
| Framework | React 19 | Function components only |
| Language | TypeScript 6.0, strict | Pin `typescript@~6.0.3`. npm's `latest` tag is TypeScript 7, so never a bare `pnpm add -D typescript` |
| Build | Vite 8 + `@vitejs/plugin-react` | |
| Styling | Tailwind CSS 4 | The `@tailwindcss/vite` plugin, no config file and no PostCSS. The theme is the `@theme inline` block in `src/styles/globals.css`. Animations come from `tw-animate-css`. See [docs/tailwind-4.md](docs/tailwind-4.md) |
| Components | shadcn/ui, CSS-variable theme | Generated into `src/components/ui`. We own and customise the code. Never left in default state |
| Routing | TanStack Router, file-based | Typed links, params, and search. `routeTree.gen.ts` is generated and committed; never hand-edit it |
| Server state | TanStack Query 5 | Queries and mutations live in feature hooks; keys in `src/api/keys.ts`; the session is the `["me"]` query. See "Server state" |
| Login | Firebase's web SDK | `@firebase/app` 0.16.3 and `@firebase/auth` 1.13.7, the versions `firebase` 13.0.0 uses. Firebase's docs import from `firebase/app` and `firebase/auth`, the same code under another name. The `firebase` package would also bring Firestore and the other products. Keep both on the versions one `firebase` release uses, and keep them behind `src/lib/firebase.ts`: the config from the build, the switch for GeeksHacking's OpenID Connect provider, and the sign-in and sign-out calls. The screens send the ID token to their own service (agreement 7.2) |
| Tables | TanStack Table 9 | Organiser scan log only. Features are opt-in through `tableFeatures()`; row, cell, and header methods live on prototypes, so call them on the instance and never spread one |
| Icons | `@phosphor-icons/react` | One family for the whole app. Replace the `lucide-react` imports shadcn generates. Default weight `fill`, set once by `IconContext` in `app.tsx`, because the branding kit draws its icons filled |
| Fonts | Open Sans, Geist Mono via `@fontsource-variable/open-sans` and `@fontsource-variable/geist-mono` | Self-hosted. No Google Fonts `<link>` |
| Motion | CSS/shadcn transitions, and GSAP on the map and the desktop passport | GSAP (`gsap` and `@gsap/react`'s `useGSAP`) was agreed with Ethan on 26 Oct 2026 for the map (FRO-78, FRO-80) and the passport at desktop widths (FRO-77). It may load only from the map's route files, and on the passport only through `import()` at 1024 px and up, so a phone never downloads it. The organiser screens never load it. Everywhere else, CSS and `tw-animate-css`. Two examples: the map's pulse, `features/map/use-map-pulses.ts`, and the passport's `features/passport/desktop-motion.ts`, which imports `passport-motion.ts` only when `matchMedia` matches. The passport can't use `useGSAP`, because a static import of `@gsap/react` brings GSAP with it. Both read reduced motion through `gsap.matchMedia()` |
| 3D | three.js | The grad tea's avatar only (FRO-105): `features/passport/avatar/voxel-world.ts` turns each pixel of the art into a cube. It loads through `React.lazy` from `avatar-stage.tsx`, so the dashboard paints the flat avatar first, and a phone without WebGL, or a failed download, keeps it. Its file is about 130 KB gzipped. three.js on phones goes past the 26 Oct rule above, and FRO-105 waits on Ethan's yes before it merges |
| Forms | react-hook-form + zod through shadcn `Form` | Add station, passport settings, QR fallback, and the name on the passport. Import `zod/mini`, here and in `src/api/schemas.ts`, and lint refuses `zod`. Every page loads the schemas, and one import of `zod` would put all of classic zod on top, about 10 KB gzipped (FRO-67). Mini writes `.nullable()` as `z.nullable(...)` and `.min(1, "...")` as `.check(z.minLength(1, "..."))` |
| Tests | Vitest + React Testing Library + jsdom | |
| Lint | Oxlint | Rules in `.oxlintrc.json`, with the React hooks rules native |
| Format | oxfmt | Prettier-compatible and fast. Settings in `.oxfmtrc.jsonc`; Markdown and `routeTree.gen.ts` are skipped. Pinned to an exact version, because a new release can change the output and everyone must format the same way |

### Why TanStack Router

The app is roughly ten routes and greenfield, and the team already plans TanStack Query
and TanStack Table. Typed links and params catch broken navigation at compile time, which
matters for a team learning React. To keep the router swappable anyway: screens live in
`features/`, get data from hooks, and never depend on router loaders. Route files only map
a URL to a feature. That keeps a migration in either direction to route files plus
`Link` and `useNavigate` imports.

### Server state

TanStack Query owns everything that comes from the API. The pattern, shown once:

- A feature hook wraps `useQuery` with a key from `src/api/keys.ts` and a `queryFn` that
  calls the `ApiClient`. Polled views pass `refetchInterval` with the constant from
  `lib/constants.ts`. Example: `features/stations/use-station-board.ts`.
- Writes are `useMutation` hooks whose `onSuccess` invalidates the keys they change, so
  screens never pass "refetch me" callbacks around. Example:
  `features/fallback/use-log-fallback-tap.ts` invalidates `["taps"]` and `queryKeys.stats`
  after a successful QR fallback, because the tap shows up in the scan log and the totals.
  A write that answers with what it changed puts that into the cache instead:
  `features/passport/use-set-display-name.ts` writes the `user` that `PATCH /me` answers
  into `["me"]`. It drops a `/me` poll in flight first, so a late answer cannot put the
  old name back (FRO-68).
- Screens read `isPending`, `isError`, `isFetching`, `dataUpdatedAt`, and `data`. They do
  not hold copies of server data in `useState`.
- The session is the `["me"]` query in `lib/session-provider.tsx`. A 401 is a normal
  answer, so the query function returns `null` for it instead of throwing; `undefined`
  means not fetched yet, an object means signed in. Sign-out sets it to `null` and drops
  every other cached query so nothing leaks to the next person at a shared laptop. The
  10-second poll runs only while the cache holds a user: a 401 or a sign-out stops it, a
  login starts it again, and the focus refetch still asks once.
- The first `["me"]` read also sends the login link a page arrived with
  (`POST /auth/login-link`, agreement 7.4). It is a write, but it is not a mutation: the
  agreement has it sent before anything reads `/me`, and sending it inside that read is
  what guarantees the order.
- The scan log is two queries: a polled head with no cursor, merged by `id` with an
  infinite query for older pages that only fetches on "Load older taps". This is the
  agreement's live-feed recipe, not a plain `useInfiniteQuery` with polling, which would
  refetch every loaded page each tick.
- Cache policy is in `lib/query-client.ts`: an `ApiError` is never retried, a network
  failure twice. Tests build the client with retries off through `test/providers.tsx`.

The mock client needs nothing special: Query only wants async functions.

### Gotchas

- Before using TanStack Table, react-hook-form's `watch`, a redirect, or a shadcn component that
  imports `next-themes`, read [docs/scaffold-notes.md](docs/scaffold-notes.md). It also says why
  the repo stays on TypeScript 6.0.
- Before writing Tailwind classes copied from a snippet, or changing `globals.css`, read
  [docs/tailwind-4.md](docs/tailwind-4.md): the class names that changed meaning, `space-y`, and
  why a token lives in two places.

## Commands

Run from `apps/event-web`.

```
pnpm dev          # Vite dev server on http://localhost:5173, fully mocked
pnpm dev:live     # same, but every call goes to the Event Service on :8001
pnpm build        # typecheck, then production build to dist/
pnpm preview      # serve dist/ locally
pnpm typecheck    # tsc --noEmit
pnpm lint         # oxlint
pnpm format       # oxfmt, rewrites files in place
pnpm format:check # oxfmt --check, lists files that are not formatted
pnpm test         # vitest run
pnpm test:watch   # vitest
pnpm test:e2e     # playwright Chromium smoke suite against the mock dev server
pnpm shot <route> --as organiser   # 360 and 1280 px, light and dark, into test-results/shots/
pnpm dlx shadcn@latest add <component>   # add a shadcn component
pnpm worker:dev       # live build, then the production Worker in wrangler dev on :8173
pnpm worker:typecheck # writes the Worker's types from wrangler.jsonc, then tsc
pnpm worker:test      # the Worker's tests; needs dist/, so build first
pnpm worker:dry-run   # bundles the Worker and checks wrangler.jsonc, without deploying
```

The first `pnpm test:e2e` or `pnpm shot` on a machine, and the first after a Playwright version
bump, need `pnpm exec playwright install chromium`. Each Playwright version wants its own Chromium
build, so without it the suite stops with "Executable doesn't exist" instead of a test
failure.

To try a screen on a phone on your Tailscale network, run `pnpm dev --host 127.0.0.1` (plain
`pnpm dev` can listen on IPv6 only), then once `tailscale serve --bg --https=<free port>
http://127.0.0.1:5173`. `tailscale serve status` lists the ports already taken. The phone opens
`https://<machine>.<tailnet>.ts.net:<port>`.

Root-level equivalents: `pnpm dev:event-web`, `pnpm build:event-web`, `pnpm test:event-web`,
`pnpm format:event-web`.

Sign in on the login page with a seeded account. Alex Tan is a participant, Priya Raman is
an organiser. The mock session survives a reload but not a new tab. The GeekyKey screens'
event buttons open these screens with a login link. To try that on the mock, open
`http://localhost:5173/#login=mock`, which logs in as Alex Tan, or `#login=guest`, which logs in
as a guest who has no name yet, so the passport asks for one. Any other value after `login=` is
an expired link.

The Firebase sign-in needs the three `VITE_FIREBASE_*` variables, which the runbook's step 13
sets. The committed `.env.development` carries them, so a fresh clone can sign in, and a
variable in your shell or in your own `.env.local` wins over the file. Without them the
sign-in buttons are disabled and the page says so, and a live build fails rather than ship
that. Only `localhost` signs in through `geekykey-b035a.firebaseapp.com` (agreement 7.2). On
`127.0.0.1` or a LAN address the popup opens on that address, where nothing forwards
Firebase's pages, so sign in on `localhost`.

Backend, for the integration phase only:

```
mise run db:up         # once per session, with Docker running
mise run seed          # once
mise run dev:event-service
```

`pnpm worker:dev` needs the Event Service running as above. It serves the built screens the
way production does, so a deep link such as `/admin/stations` reloads, and the cookie
comes back through the Worker rather than through Vite's proxy.

## Directory layout

```
apps/event-web/
  CLAUDE.md
  index.html                # theme bootstrap script runs before first paint
  public/brand/             # the branding kit's logos; the secondary one is also the favicon
  vite.config.ts            # react, router and tailwind plugins, proxy /api and /auth to :8001
  wrangler.jsonc            # the event-web Worker: serves dist/, forwards /api, /auth and Firebase's sign-in pages
  worker/                   # the Worker's code, its tests and their tsconfigs
    index.ts                # forwards to EVENT_API_URL, unchanged both ways
    firebase.ts             # forwards Firebase's sign-in pages to FIREBASE_AUTH_URL, without the cookie
    config.ts               # checks EVENT_API_URL and FIREBASE_AUTH_URL at start-up
    worker.test.ts          # runs the Worker in wrangler dev against a fake Event Service and a fake Firebase
  vitest.config.ts
  scripts/shot.ts           # pnpm shot: the definition of done's four screenshots of a route
  components.json           # shadcn config
  tsconfig.json             # solution file; also carries the @/ alias for the shadcn CLI
  tsconfig.app.json         # src
  tsconfig.node.json        # config files
  src/
    main.tsx                # fonts, globals.css, mounts <App />
    app.tsx                 # providers (theme, api, session) + <RouterProvider />
    routeTree.gen.ts        # generated by the router plugin, committed, never edited
    routes/                 # file routes. Thin: map a URL to a feature, no logic.
      __root.tsx            # <Outlet />, toaster, not-found view
      login.tsx
      _app.tsx              # pathless layout: session gate + participant shell
      _app/
        index.tsx           # participant dashboard
        passport.tsx
        activity.tsx
      map.tsx               # the map on the big screen: session gate, no role gate (9.10 decides)
      admin/
        route.tsx           # session gate + organiser role gate + console shell
        index.tsx           # redirects to /admin/stations
        stations.tsx
        taps.tsx
        fallback.tsx
        summary.tsx
    features/               # one folder per domain; the real UI lives here
      auth/                 # login screen, Firebase sign-in buttons, dev-login form, expired-link notice, RequireSession, RequireRole, 403 view, shell wiring
      passport/             # dashboard, stamp grid, stamp tile, station glyph, the name prompt and Change name,
                           # the grad tea's avatar, its colours and memory card (avatar/, FRO-105),
                           # what a poll changed (passport-changes.ts), the new stamp's group link offer
                           # (new-stamp-banner.tsx, use-new-stamp-link.ts), and its animations
                           # (desktop-motion.ts, passport-motion.ts)
      activity/             # participant tap history
      stations/             # station board, add-station dialog, one-time key reveal,
                           # passport settings form (add or edit a slot), booth dialog,
                           # each row's Actions menu
      taps/                 # scan log: filters, TanStack table, cursor paging, polling hook
      fallback/             # QR fallback form and result
      stats/                # KPI tiles, per-station breakdown, CSV export
      map/                  # the big screen's map: floor plan, placing stations, pulses (GSAP)
    components/
      ui/                   # shadcn generated and customised. No app logic here.
      layout/               # shells, nav, page header, theme toggle, account menu, empty/error/loading views
      look/                 # the sci-fi look's corner brackets; its grid and labels are utilities in globals.css
      tap-status.tsx        # shared by several features, alongside online-status and participant-tap-list
      online-status.tsx     # online, offline, or never connected (agreement 9.2)
    api/
      types.ts              # mirrors API-AGREEMENT.md exactly
      client.ts             # the interface every feature consumes
      keys.ts               # every TanStack Query key, in one place
      context.ts            # useApi()
      provider.tsx
      errors.ts             # ApiError, NetworkError, describeError(), publishAuthError()
      schemas.ts            # Zod validation of every JSON answer the HTTP client parses
      mock/                 # fixtures + mock client
      http/                 # fetch client, credentialed transport, error envelope, response validation
      create-client.ts      # the mock, or the HTTP client in a live build
      service-client.ts     # the methods grouped by the service that owns them
    lib/                    # shared infrastructure, safe to import from any feature
      session.ts            # "am I logged in": useSession(), useMe()
      session-provider.tsx
      login-link.ts         # takes agreement 7.4's #login=<link> out of the address at start-up
      firebase.ts           # Firebase's web SDK: the config from the build, the sign-in calls, the sign-out
      theme.ts              # system preference, dark fallback, manual override
      theme-provider.tsx
      query-client.ts       # TanStack Query cache and retry policy
      form-errors.ts        # maps validation_failed issues onto react-hook-form fields
      display-name.ts       # agreement 8.7's rule for a name, shared by the form and the mock
      booth.ts              # agreement 9.12's rule for a station's booth, shared the same way
      group-link.ts         # agreement 9.1's rule for a group link, shared the same way
      format.ts             # dates, points, counts
      constants.ts          # poll intervals, seeded user IDs, GEEKYKEY_SCREENS_URL
      csv.ts                # the export's column order and cell escaping
      use-route-heading-focus.ts
      utils.ts              # cn()
    styles/globals.css      # Tailwind import, @theme mapping, CSS-variable tokens for both themes
    test/setup.ts           # Vitest setup: jest-dom matchers, matchMedia, ResizeObserver and canvas stubs
    test/providers.tsx      # the app's provider stack for tests
    test/hold-next-me.ts    # holds a /me answer so a test can land it after a write
```

Rules:

- Route files are thin. They wire a feature to a URL and nothing else.
- Features own their components, hooks, fixtures, and tests. Cross-feature imports go
  through `components/` or `lib/`, never feature to feature. Session and theme live in
  `lib/` for exactly this reason. `features/auth` is consumed only by route files.
- `components/ui` belongs to shadcn. Customise tokens and variants there; do not add
  GeekyKey behaviour to it.
- Imports use the `@/` alias for `src/`.

## API contract rules

- The session is an HttpOnly cookie. The app cannot read it. "Am I logged in" is
  `GET /api/v1/me`; a 401 means no.
- In dev, login is `POST /auth/dev-login` with a seeded user ID. In production it is
  Firebase's: the screens sign in with Google, or with GeeksHacking's own login once its
  OpenID Connect provider is set up in Firebase, and send the ID token to
  `POST /auth/firebase` (agreement 7.2). The screen after login is identical either way. The
  dev-login form only renders when `import.meta.env.DEV` is true.
- The Vite dev server proxies `/api` and `/auth` to the Event Service on
  `http://localhost:8001`, so requests are same-origin and the cookie just works. The HTTP
  client still sends `credentials: "include"` so it also works without the proxy.
- In production the Worker in `worker/` does the proxy's job: `/api/*` and `/auth/*` go to
  the Event Service, Firebase's sign-in pages (`/__/auth/*` and `/__/firebase/init.json`) go
  to Firebase, and every other path gets the screens. The paths under `run_worker_first` in
  `wrangler.jsonc` are the agreement's prefixes and Firebase's pages from 7.2. A change to
  them needs Adam's review.
- The user ID always comes from the session. Never put a user ID in a request body except
  where the agreement says so (QR fallback).
- The Event screens never compute stamps, points, or cooldown. Display what the backend returns.
- Poll, do not stream. Stations every 10 to 15 s. Scan log every 5 s with no cursor,
  merged by `id`. The map every 2 s. Polling is Query's `refetchInterval`, which already
  pauses in hidden tabs. No websockets.
- Scan log pagination is cursor-based via `before_id` and `next_before_id`.
- Timestamps arrive as UTC ISO strings. Format for display in the user's local zone, in
  the mono font. Never parse IDs. Only `taps.id` is numeric, and only for the cursor.
- Every non-2xx body is `{ error, issues? }`. Switch on `error`:
   - `validation_failed`: show each `issues[].message` inline under the field at `issues[].path`,
     unless section 13 sets the sentence, as it does for the name ("Use 1 to 30 characters.").
   - `unauthenticated`: go to login and remember `return_to`.
   - `invalid_token` / `login_unavailable`: the sign-in did not work. Both say "Couldn't
     log you in. Try again." (agreement 7.2, section 13). `invalid_token` is the service
     refusing the ID token, and it is not a lost session.
   - `invalid_login_link`, or any other failure of `POST /auth/login-link`: the link the page
     arrived with did not log anyone in. Show section 13's sentence for `invalid_login_link`
     whatever the failure, because the link works once and tapping the token again is the
     only fix (`features/auth/login-link-notice.tsx`). The session the browser already had carries
     on, so the sentence sits above the screen it shows.
   - `forbidden`: render the 403 view in place. Do not redirect.
   - `not_found`: inline message on the action that caused it.
   - `rate_limited`: show a wait-and-retry message; do not loop immediately.
   - `event_service_unavailable` / `claims_unavailable` / `service_unavailable`: show a
     service-availability message.
     `claims_unavailable` replaced `portal_unavailable` in agreement 0.3; it is what 8.2 to 8.5
     and the station endpoints answer when the claims stand-in, or the Portal, cannot say who
     owns a token.
     `service_unavailable` is what the Worker in front of these screens answers when the Event
     Service gave no answer at all (agreement section 2).
   - `invalid_event_service_key` / station-key errors: setup/configuration message.
   - `internal_error` or a network failure: generic error state with a retry button.
- Out of scope, do not build UI for it: leaderboards, dual-tap, archetype quests, event
  CRUD, editing or deleting taps, profile editing beyond the name (8.7), reading a station
  key back, Web Serial or USB device configuration. Replacing a station's key is **not** out
  of scope: agreement 9.8 does it on the station board and FRO-28 builds it.

## Screens

Before building or changing a screen, read its row in [docs/screens.md](docs/screens.md): the
route, the role, what it reads and writes, and every case it must handle.

## Design rules

Before a change to colour, type, shape, layout, the sci-fi look or motion, read
[docs/design-direction.md](docs/design-direction.md): how the taste skill applies to a product
UI, the dials, the palette and its helpers, the look, and the motion exceptions on the big screens.
These three rules apply to every change:

**Status is never colour alone.** Every `tap_status` and every online/offline indicator
renders icon plus text plus colour. Accepted green, cooldown orange, no_game red. The kit
has no status colours, so these are the app's own.
Cooldown is orange on screen rather than the agreement's amber so it never reads as the
brand yellow. Station LEDs stay amber.

**Copy:** plain language. British spelling in visible text ("organiser", "colour"). API
spelling in code (`organizer`). No emoji. No em-dash or en-dash anywhere visible. No
placeholder-as-label. Buttons are verbs, one label per intent across the app.

**States:** every data view ships loading, empty, error, and populated. Skeletons match
the final layout. Empty states say what to do next. Errors are inline where the user
acted; toasts only for transient success.

## Coding conventions

- Function components, named exports, one component per file, explicit prop types.
  No `React.FC`.
- Strict TypeScript with `noUncheckedIndexedAccess`. No `any`; use `unknown` and narrow.
- Tailwind classes only. No CSS modules, no CSS-in-JS, no `.css` files beyond
  `globals.css`. Compose class names with `cn()`.
- Server data enters components through TanStack Query hooks in `features/*`. Never
  `useEffect` plus `fetch`, and never a `useState` copy of something the cache holds.
- Derive, do not sync: no state that duplicates props or server data.
- Formatting rules for dates and points live in `lib/format.ts` and nowhere else.
- Colocate tests as `*.test.tsx`. Test behaviour through the DOM, not implementation.
- Comments explain why, not what. Keep components under roughly 150 lines and split by
  responsibility, not by markup.

## Team and AI usage

Joshua and Ethan own this app and are learning React while building it. Adam owns the
backend. Working agreement from the 2 September 2026 team meeting:

- Critical logic is written by hand by the frontend owners. AI is fine for styling,
  boilerplate, and shadcn wiring.
- When Claude changes code here, it explains the change in plain language and keeps
  diffs small enough to read in one sitting.
- Show a pattern once and point to it rather than generating the same thing many times.
- Do not introduce a library or pattern missing from the stack table without saying why.

## Definition of done for a screen

1. `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass.
2. Loading, empty, error, and populated states all render against the mock client.
3. Checked at 360 px and 1280 px, in light and dark.
4. Keyboard reachable, visible focus rings, a label on every input, WCAG AA contrast on
   text and controls.
5. No status conveyed by colour alone.
6. No em-dash or en-dash in any visible string. No emoji. No lorem ipsum, no generic
   names, no round fake numbers.
7. shadcn components customised to the tokens, not default.
8. Only endpoints and fields from the agreement are referenced.

For step 3, `pnpm shot <route>` takes the four screenshots, with `--as participant` or
`--as organiser` to sign in first (`scripts/shot.ts`). It uses the dev server on :5173 if one is
up and starts the mock one if not. For anything it doesn't do, such as opening a menu first,
drive Playwright yourself. Two gotchas: Radix Select ignores a synthetic click, so dispatch a
`pointerdown` on the trigger and then click the option; and headless Arc crashes after a few
navigations.

## Do not

- Do not call the real backend from screens. Every call goes through the `ApiClient`, which
  is the mock unless `VITE_LIVE_API=1`.
- Do not invent API fields or endpoints. Change the agreement first.
- Do not build leaderboards, dual-tap, quests, event CRUD, tap editing, or device
  configuration UI.
- Do not add Next.js, server components, lucide, Inter, or a second icon or
  component library.
- Do not hand-edit `routeTree.gen.ts`. Do not add app logic under `components/ui`.
- Do not commit `.env` files or any station key. Station keys are shown once in the UI
  and never stored. The one exception is each app's `.env.development`, which holds only
  Firebase's web config from agreement 7.2. None of it is secret.
- Do not upgrade to TypeScript 7 yet. The repo stays on 6.0.
