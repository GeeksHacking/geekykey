# GeekyKey frontend

React single-page app for GeekyKey, an NFC stamp-collection system for hackathons.
Participants tap a physical NFC token at ESP32 reader stations. This app is where they
see their stamps and points, and where organisers watch the event. It is one package in
the pnpm monorepo; the backend lives in `apps/backend` (Hono on Node, on Google Cloud Run,
Drizzle ORM, TiDB).

Two audiences, two surfaces:

- **Participants** on their own phones, mid-event, often under dim venue lighting. Mobile first.
- **Organisers** on a laptop at the registration desk or a booth. Desktop first, denser.

Key dates: Sprint 1 is 21 Sep to 4 Oct 2026. The Sprint 2 A/B test runs 5 to 18 Oct.
Showcase is 18 Nov 2026. Scope down before adding features.

## Sources of truth

1. `apps/API-AGREEMENT.md` is the contract. Build against the shapes there, not against
   backend source or guesses. If the backend disagrees with the agreement, the agreement
   wins and the backend gets fixed.
2. `.agents/skills/design-taste-frontend/SKILL.md` is the design authority. See
   "Design direction" below for how it applies to a product UI rather than a landing page.
3. This file covers what neither of those does: stack, layout, conventions, workflow.

Do not copy content from the agreement or the skill into this file. Link to it.

## Current phase: staged live session, mock resources

The screens are built against the mock and the first live session slice is now enabled:
`me`, `devLogin`, and `logout` use the backend in live mode. Admin, fallback, stats,
and export remain mock-backed until their service routes are implemented. Token claiming lives in
the separate GeekyKey app, not in these Event screens. The mock/live split
is intentional; screens never need to know which client supplied a value.

`src/api/create-client.ts` is still the only file that changes when an endpoint goes live.
`src/api/service-client.ts` prepares the future GeekyKey/Event Service split without changing
screen contracts yet.

Rules that make this possible:

- All data access goes through `src/api/`. Components and pages never call `fetch`.
- `src/api/types.ts` mirrors the agreement field for field, in `snake_case`. Never add a
  field the agreement does not have. If a screen needs something missing, propose a change
  to the agreement instead of inventing it.
- `src/api/mock/` holds fixtures and a mock client with the same interface as the future
  HTTP client. Fixtures use the seeded IDs (`dev-user-1`, `dev-organizer-1`), cover the
  statuses currently used by the mock, include stamps with `earned_at: null`, and use realistic,
  uneven data. No round numbers, no "John Doe".
- The mock client simulates latency and can be told to fail with any error code from the
  agreement, so loading and error states are real from day one. `api.mock.failNext(code)`
  fails the next call with that code, or with `"network"`; tests use it.
  `api.mock.setStatusKnown(false)` makes the station board behave as if the GeekyKey
  Service's status call failed, so every status field comes back null (agreement 9.2).
  With
  `simulate: true` (the default in `api/create-client.ts`) a station simulator keeps the online stations'
  heartbeat fresh and drips in new taps, so polling has something to show.

## Wiring an endpoint to the real backend

No screen, hook, or query key changes when an endpoint goes live. `src/api/create-client.ts`
changes, and nothing else. It is worth reading that file before the first slice; it is
about thirty lines.

`pnpm dev` is unchanged and still runs entirely on the mock, so nobody doing UI work is
blocked on a running backend. `pnpm dev:live` sets `VITE_LIVE_API=1`, which sends the
methods listed in `liveMethods()` to the real backend and leaves every other method on the
mock. On Windows PowerShell, `$env:VITE_LIVE_API="1"; pnpm dev`.

Migrate in slices, not one method at a time. The session slice in particular has to move
as a unit: a live `me()` with a mock `devLogin()` means nobody can sign in.

### Two-service preparation

`apps/API-AGREEMENT.md` v0.2 separates the GeekyKey Service from the Event Service. The
current screens still consume one `ApiClient` so existing hooks do not change during the
staged migration. `src/api/service-client.ts` provides a non-breaking session/GeekyKey/Event
bundle for new code. Do not move a route to that bundle until its backend endpoint and
response contract are implemented; the bundle is organizational preparation, not a second
live switch.

`GET /api/v1/admin/stations` is on both services with different responses. The GeekyKey
Service's (agreement 10.1) is the station registry behind `/admin/stations`, next to
`createStation` (10.2), which only the GeekyKey Service has. The Event Service's (9.2) is the
Organizer's station board, which the fallback picker and the scan-log filter need. The bundle
names them `geekykey.listStations` and `event.listStationBoard`; both still call the one
`listStations()` until the services split.

| # | Slice | Methods | Screens it makes real |
|---|---|---|---|
| 1 | Session | `devLogin`, `logout`, `me` | `/login`, `/`, `/passport`, `/activity` |
| 2 | Stations | `listStationBoard`, `listStations`, `createStation`, `setStationPassport` | `/admin/stations`, the picker on `/admin/fallback` |
| 3 | Scan log | `listTaps` | `/admin/taps` |
| 4 | Event tail | `createFallbackTap`, `stats`, `exportCsv` | `/admin/summary`, `/admin/fallback` |

One slice, start to finish:

1. The endpoint is live in `apps/backend` with tests, and its row in the agreement says
   `Implemented`. Until then, leave it on the mock.
2. Start the backend: `mise run db:up` and `mise run seed` once (Docker must be running),
   then `mise run dev:backend`.
3. Add one line per method to `liveMethods()` in `src/api/create-client.ts`.
4. `pnpm dev:live`, then work through each screen in the slice: populated, loading, empty,
   and every error path. Force the errors for real now rather than with `failNext`. Stop
   the backend for a network failure, sign out for a 401, and sign in as `dev-user-1` and
   open `/admin/stations` for a 403.
5. Compare the real JSON against `src/api/types.ts` field by field, for example
   `curl -s localhost:8000/api/v1/admin/stations | jq`. If they differ, the agreement wins
   and the backend is fixed. Never widen `types.ts` to match a backend that drifted.
6. `pnpm typecheck`, `pnpm lint` and `pnpm test` still pass with the flag off.

`send()` in `src/api/http/client.ts` is implemented. It sends credentialed requests, handles
2xx/204 responses, parses the JSON error envelope, and turns transport or malformed-success
failures into the shared `ApiError`/`NetworkError` types. Keep transport behavior there; do
not add per-screen reshaping, points, stamp, or cooldown calculations.

Two things that look like bugs and are not:

- The mock session is a `sessionStorage` key called `gk-mock-session`, and the real one is
  an HttpOnly cookie. Neither knows about the other. Sign out before switching modes, or
  use a fresh tab.
- Between slices the data does not line up. After slice 1 you are signed in as the real
  `dev-user-1` while stations and taps still come from fixtures, so IDs will not match
  across screens. That is expected and it goes away as the next slice lands. Do not chase
  it, and do not patch fixtures to paper over it.

## Stack

| Concern | Choice | Notes |
|---|---|---|
| Runtime, package manager | Node 24, pnpm 12 | Workspace package `@geekykey/frontend`. Exact versions are pinned in the root `.mise.toml` |
| Framework | React 19 | Function components only |
| Language | TypeScript 6.0, strict | Pin `typescript@~6.0.3`. See "TypeScript version" |
| Build | Vite 8 + `@vitejs/plugin-react` | |
| Styling | Tailwind CSS 4 | The `@tailwindcss/vite` plugin, no config file and no PostCSS. The theme is the `@theme inline` block in `src/styles/globals.css`. Animations come from `tw-animate-css`. See "Tailwind 4 notes" |
| Components | shadcn/ui, CSS-variable theme | Generated into `src/components/ui`. We own and customise the code. Never left in default state |
| Routing | TanStack Router, file-based | Typed links, params, and search. `routeTree.gen.ts` is generated and committed; never hand-edit it |
| Server state | TanStack Query 5 | Queries and mutations live in feature hooks; keys in `src/api/keys.ts`; the session is the `["me"]` query. See "Server state" |
| Tables | TanStack Table 9 | Organiser scan log only. Features are opt-in through `tableFeatures()`; row, cell, and header methods live on prototypes, so call them on the instance and never spread one |
| Icons | `@phosphor-icons/react` | One family for the whole app. Replace the `lucide-react` imports shadcn generates. Default `weight="regular"` |
| Fonts | Geist, Geist Mono via `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` | Self-hosted. No Google Fonts `<link>` |
| Motion | CSS/shadcn transitions | No motion library is currently required; do not add one without agreeing it in the stack |
| Forms | react-hook-form + zod through shadcn `Form` | Two forms in the Event screens: add station, QR fallback |
| Tests | Vitest + React Testing Library + jsdom | |
| Lint | ESLint flat config + typescript-eslint | |
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
  `features/fallback/use-log-fallback-tap.ts` invalidates `["me"]` after a successful QR
  fallback.
- Screens read `isPending`, `isError`, `isFetching`, `dataUpdatedAt`, and `data`. They do
  not hold copies of server data in `useState`.
- The session is the `["me"]` query in `lib/session-provider.tsx`. A 401 is a normal
  answer, so the query function returns `null` for it instead of throwing; `undefined`
  means not fetched yet, an object means signed in. Sign-out sets it to `null` and drops
  every other cached query so nothing leaks to the next person at a shared laptop.
- The scan log is two queries: a polled head with no cursor, merged by `id` with an
  infinite query for older pages that only fetches on "Load older taps". This is the
  agreement's live-feed recipe, not a plain `useInfiniteQuery` with polling, which would
  refetch every loaded page each tick.
- Cache policy is in `lib/query-client.ts`: an `ApiError` is never retried, a network
  failure twice. Tests build the client with retries off through `test/providers.tsx`.

The mock client needs nothing special: Query only wants async functions.

### TypeScript version

TypeScript 6.0 is the target. Vite 8 transpiles with oxc and ignores the TS version, and
typescript-eslint 8 supports `<6.1.0`. **npm's `latest` tag is TypeScript 7**, the Go
port, which typescript-eslint does not support yet. Always install with an explicit
`typescript@~6.0.3`; never a bare `pnpm add -D typescript`. If any tool rejects 6.0 at
scaffold time, fall back to `typescript@~5.9` and record why in this section.

### Scaffold notes (18 September 2026)

Verified when the app was scaffolded:

- TypeScript 6.0.3 works with Vite 8.3, `@vitejs/plugin-react` 6.1, `@tanstack/router-plugin`
  1.168, typescript-eslint 8.70, and Vitest 5.
- The shadcn CLI resolves the `@/` alias from `tsconfig.json`, so the solution tsconfig
  must keep `compilerOptions.paths`. Without it the CLI writes into a literal `@/` folder.
  (The app started on Tailwind 3.4; see "Tailwind 4 notes" for the move.)
- pnpm 11 refuses to run esbuild's install script unless `allowBuilds` lists it in
  `pnpm-workspace.yaml`. Done at the repo root.
- shadcn's `sonner` component imports `next-themes`. Ours reads `lib/theme` instead.
- The `react-hooks` lint plugin (v7) flags components looked up during render and
  react-hook-form's `watch()`. Use `useWatch` and render looked-up icons through a small
  component (see `features/passport/station-glyph.tsx`).
- TanStack Table moved from v8 to v9 on 18 Sep 2026 while the scan log was the only table.
  v9 is `useTable({ features, columns, data })` with `tableFeatures({})`; there is no
  `getCoreRowModel`, and `<table.FlexRender cell={cell} />` replaces `flexRender`. Most
  tutorials and the shadcn data-table recipe still show v8; the package ships its own
  migration notes under `node_modules/@tanstack/react-table/skills`.
- Never redirect with a `<Navigate />` element from a component that re-renders. It
  navigates again whenever its props object changes, which is every render, and the router
  never commits, so the page freezes on the loading view. Redirect from a `useEffect` with
  stable dependencies instead (see `features/auth/require-session.tsx`).

### Tailwind 4 notes (6 October 2026)

The app moved from Tailwind 3.4 to 4 because Tailwind 3 depends on `braces`, which has a
security advisory with no fixed version, and the CI dependency audit fails on it. Every
screen was compared with the Tailwind 3 build, pixel by pixel, in both themes at 1280 and
390 px. Two small differences were kept: a table header that wraps is 2px shorter, and
the summary tiles' text moves 1px. What to know:

- There is no `tailwind.config.ts`. A token lives in `src/styles/globals.css` twice: as HSL
  channels in `:root` and `.dark`, and in the `@theme inline` block, which turns
  `--color-primary-text` into `text-primary-text` and so on. `globals.css` is identical in
  `apps/geekykey-web`, so change both together.
- Wrap a label and its field in `grid gap-2`, not `space-y-2`. Tailwind 4's `space-y` puts
  the margin on every child except the last, and an inline `<label>` ignores a vertical
  margin. `FormItem` already does this. `Label` uses `leading-6` so fields sit where they
  did on Tailwind 3.
- Tailwind 4 sets `scale-*` and `translate-*` through their own CSS properties, not
  `transform`. In a `transition-[...]` list, write `scale` (see `components/ui/button.tsx`).
  Do not copy shadcn's Tailwind 3 dialog classes `slide-in-from-left-1/2` or
  `slide-in-from-top-[48%]`: on Tailwind 4 they push the dialog off-centre.
- Some class names changed meaning. When copying an older snippet, use `outline-hidden`
  for `outline-none`, `shadow-xs` for `shadow-sm`, `shadow-sm` for `shadow`, `blur-xs` for
  `blur-sm`, `blur-sm` for a bare `blur`, `ring-3` for a bare `ring`, and
  `origin-(--radix-...)` for `origin-[--radix-...]`. `npx @tailwindcss/upgrade` does these
  renames, but not the three fixes above.
- `components.json` has an empty `tailwind.config`, so `pnpm dlx shadcn@latest add` writes
  Tailwind 4 components. The existing ones started as Tailwind 3 components, so check a new
  one's spacing against them.

## Commands

Run from `apps/frontend`.

```
pnpm dev          # Vite dev server on http://localhost:5173, fully mocked
pnpm dev:live     # same, but the live slices in src/api/create-client.ts hit the backend
pnpm build        # typecheck, then production build to dist/
pnpm preview      # serve dist/ locally
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint .
pnpm format       # oxfmt, rewrites files in place
pnpm format:check # oxfmt --check, lists files that are not formatted
pnpm test         # vitest run
pnpm test:watch   # vitest
pnpm test:e2e     # playwright Chromium smoke suite against the mock dev server
pnpm dlx shadcn@latest add <component>   # add a shadcn component
```

Root-level equivalents: `pnpm dev:frontend`, `pnpm build:frontend`, `pnpm test:frontend`,
`pnpm format:frontend`.

Sign in on the login page with a seeded account. Alex Tan is a participant, Priya Raman is
an organiser. The mock session survives a reload but not a new tab.

Backend, for the integration phase only:

```
mise run db:up         # once per session, with Docker running
mise run seed          # once
mise run dev:backend
```

## Directory layout

```
apps/frontend/
  CLAUDE.md
  index.html                # theme bootstrap script runs before first paint
  vite.config.ts            # react, router and tailwind plugins, proxy /api and /auth to :8000
  vitest.config.ts
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
      admin/
        route.tsx           # session gate + organiser role gate + console shell
        index.tsx           # redirects to /admin/stations
        stations.tsx
        taps.tsx
        fallback.tsx
        summary.tsx
    features/               # one folder per domain; the real UI lives here
      auth/                 # login screen, dev-login form, RequireSession, RequireRole, 403 view, shell wiring
      passport/             # dashboard, stamp grid, stamp tile, points summary, station glyph
      activity/             # participant tap history
      stations/             # station board, add-station dialog, one-time key reveal,
                           # passport settings form (add or edit a slot)
      taps/                 # scan log: filters, TanStack table, cursor paging, polling hook
      fallback/             # QR fallback form and result
      stats/                # KPI tiles, per-station breakdown, CSV export
    components/
      ui/                   # shadcn generated and customised. No app logic here.
      layout/               # shells, nav, page header, theme toggle, account menu, empty/error/loading views
      tap-status.tsx        # shared by several features, alongside online-status and participant-tap-list
      online-status.tsx     # online, offline, never connected, or "Status unknown" (agreement 9.2)
    api/
      types.ts              # mirrors API-AGREEMENT.md exactly
      client.ts             # the interface every feature consumes
      keys.ts               # every TanStack Query key, in one place
      context.ts            # useApi()
      provider.tsx
      errors.ts             # ApiError, NetworkError, describeError(), publishAuthError()
      schemas.ts            # Zod validation of the two responses we parse
      mock/                 # fixtures + mock client (current phase)
      http/                 # fetch client, credentialed transport, error envelope, response validation
      create-client.ts      # the mock, or the mock with the live slices swapped in
      service-client.ts     # non-breaking preparation for the GeekyKey/Event Service split
      mode.ts               # mock/live data-source indicator rules
    lib/                    # shared infrastructure, safe to import from any feature
      session.ts            # "am I logged in": useSession(), useMe()
      session-provider.tsx
      theme.ts              # system preference, dark fallback, manual override
      theme-provider.tsx
      query-client.ts       # TanStack Query cache and retry policy
      form-errors.ts        # maps validation_failed issues onto react-hook-form fields
      format.ts             # dates, points, counts
      constants.ts          # poll intervals, seeded user IDs, GEEKYKEY_SCREENS_URL
      csv.ts                # the export's column order and cell escaping
      use-route-heading-focus.ts
      utils.ts              # cn()
    styles/globals.css      # Tailwind import, @theme mapping, CSS-variable tokens for both themes
    test/setup.ts           # Vitest setup: jest-dom matchers, matchMedia stub
    test/providers.tsx      # the app's provider stack for tests
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
- In dev, login is `POST /auth/dev-login` with a seeded user ID. In production it is a
  redirect to `/auth/login`. The screen after login is identical either way. The dev-login
  form only renders when `import.meta.env.DEV` is true.
- The Vite dev server proxies `/api` and `/auth` to `http://localhost:8000`, so requests
  are same-origin and the cookie just works. The HTTP client still sends
  `credentials: "include"` so it also works without the proxy.
- The user ID always comes from the session. Never put a user ID in a request body except
  where the agreement says so (QR fallback).
- The frontend never computes stamps, points, or cooldown. Display what the backend returns.
- Poll, do not stream. Stations every 10 to 15 s. Scan log every 5 s with no cursor,
  merged by `id`. Polling is Query's `refetchInterval`, which already pauses in hidden
  tabs. No websockets.
- Scan log pagination is cursor-based via `before_id` and `next_before_id`.
- Timestamps arrive as UTC ISO strings. Format for display in the user's local zone, in
  the mono font. Never parse IDs. Only `taps.id` is numeric, and only for the cursor.
- Every non-2xx body is `{ error, issues? }`. Switch on `error`:
   - `validation_failed`: show each `issues[].message` inline under the field at `issues[].path`.
   - `unauthenticated`: go to login and remember `return_to`.
   - `forbidden`: render the 403 view in place. Do not redirect.
   - `not_found`: inline message on the action that caused it.
   - `rate_limited`: show a wait-and-retry message; do not loop immediately.
   - `event_service_unavailable` / `portal_unavailable`: show a service-availability message.
   - `invalid_event_service_key` / station-key errors: setup/configuration message.
   - `internal_error` or a network failure: generic error state with a retry button.
- Out of scope, do not build UI for it: leaderboards, dual-tap, archetype quests, event
  CRUD, editing or deleting taps, profile editing, station key rotation, reading a key
  back, Web Serial or USB device configuration.

## Screens (MVP)

| Route | Role | Reads | Writes | Must handle |
|---|---|---|---|---|
| `/login` | anyone | | `POST /auth/dev-login` (dev), `GET /auth/login` (prod) | `not_found` on a bad dev user |
| `/` dashboard | participant, organiser | `GET /me` | | Portal user ID with a copy button; claim help before the first tap; Event content only afterwards |
| `/passport` | participant | `GET /me` `stamps` | | every station shown; empty slot where `earned_at` is null |
| `/activity` | participant | `GET /me` `recent_taps` | | non-accepted taps shown with a plain-language reason |
| `/admin` | organiser | | | participant sees the 403 view |
| `/admin/stations` | organiser | `GET /admin/stations` (Event board) polled | `POST /admin/stations`, `PUT /admin/stations/{id}/passport` | one-time `api_key` reveal with copy button and warning; online and offline; unknown status, which is never shown as offline; problem stations first; empty board; Add to passport on a row with no settings, Edit on one with |
| `/admin/taps` | organiser | `GET /admin/taps` polled, filters, cursor | | stored `no_game` keeps its user; load more; empty log |
| `/admin/fallback` | organiser | `GET /admin/stations` (Event board) | `POST /admin/taps` | `not_found`; result status shown after submit |
| `/admin/summary` | organiser | `GET /admin/stats` | `GET /admin/export.csv`, fetched and saved as a file | zero-tap event |

`/admin/stations` and `/admin/fallback` both read the Event board, from
`listStationBoard()`, which shares the `GET /api/v1/admin/stations` path with the
GeekyKey registry's `listStations()` but returns a different response type. The
registry list is not on screen yet. The export is not a link: `features/stats/export-button.tsx`
fetches it and hands the browser a Blob.

Endpoint statuses (`Implemented`, `Sprint 1`, `MVP`) are in the agreement. Screens
against `MVP` endpoints are still built now, against mocks.

## Design direction

The skill is written for landing pages and says dashboards and data tables are outside
its scope. GeekyKey is a product UI. Resolution:

**Apply everywhere:** Section 0 brief inference and anti-default discipline, 3.C icons,
3.E responsiveness, 4.1 typography, 4.2 one accent and the colour lock, 4.4 shape lock,
4.5 interactive states and contrast checks, 4.6 form rules, 6 performance and
accessibility, 8 dark mode protocol, 9 AI tells including the em-dash ban, and the
pre-flight check as adapted in "Definition of done".

**Do not apply:** hero rules, eyebrows, bento, marquee, GSAP scroll patterns, image
generation requirements, and the Next.js and RSC defaults in 3.A. This is a Vite SPA on
Tailwind 4.

**Design read:** mobile-first product UI for hackathon participants plus a denser desktop
console for organisers, with a dark-capable, high-contrast tech-event language, leaning
shadcn/ui customised.

**Dials:** `DESIGN_VARIANCE 4`, `MOTION_INTENSITY 3`, `VISUAL_DENSITY 5` on participant
screens and `7` on organiser screens. Symmetric grids, no scroll choreography, no
decorative motion.

**Theme:** follow `prefers-color-scheme`. When the browser reports no preference, use
dark. Both token sets live in `globals.css` as CSS variables in the shadcn convention.
A manual toggle in the app shell overrides the system setting and persists in
`localStorage`. Never flip theme per section. Check every screen in both.

**Palette:** zinc neutrals and one accent, the GeeksHacking yellow `#F9F668` (confirmed by
Adam on 18 Sep 2026). It is a fill colour with near-black text on it, and it needs two
helpers on the light theme because yellow has no luminance contrast against off-white:
`border-primary-edge` puts a charcoal 1px edge on every yellow fill (the logo's own trick),
and `text-primary-text` is what links, icons, and active labels use, which is yellow on dark
and a darkened yellow on light. Never `text-primary` for text. No pure `#000` or `#fff`.
No gradients, no glows.

**Status is never colour alone.** Every `tap_status` and every online/offline indicator
renders icon plus text plus colour. Accepted green, cooldown orange, no_game red.
Cooldown is orange on screen rather than the agreement's amber so it never reads as the
brand yellow. Station LEDs stay amber.

**Type:** Geist for UI. Geist Mono for points, station IDs, timestamps, and counts.
`tracking-tight` on headings. No oversized display type. The wordmark alone echoes
the GeeksHacking logo: Geist ExtraBold with `tracking-[0.06em]`, mixed case. Do not add a
display face to the app; spend that on the showcase poster if wanted.

**Shape:** one radius scale. `rounded-lg` for cards, dialogs, and inputs; `rounded-md`
for buttons and badges. Document any exception in this file.

**Layout:** participant screens designed at 360 to 430 px first, single column, one-line
bottom or top nav, `min-h-[100dvh]` never `h-screen`. Organiser screens designed at
1024 px and up with a sidebar and still usable at 768 px. `max-w-7xl mx-auto` containers.
CSS grid, never flex percentage math.

**Copy:** plain language. British spelling in visible text ("organiser", "colour"). API
spelling in code (`organizer`). No emoji. No em-dash or en-dash anywhere visible. No
placeholder-as-label. Buttons are verbs, one label per intent across the app.

**States:** every data view ships loading, empty, error, and populated. Skeletons match
the final layout. Empty states say what to do next. Errors are inline where the user
acted; toasts only for transient success.

**Motion:** 150 to 250 ms on `transform` and `opacity` only, for feedback and state
change. Respect `prefers-reduced-motion`. `:active` gets `scale-[0.98]`.

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

For screenshots, Playwright against the dev server with its own Chromium build works well.
Two gotchas: Radix Select ignores a synthetic click, so dispatch a `pointerdown` on the
trigger and then click the option; and headless Arc crashes after a few navigations.

## Do not

- Do not call the real backend from screens during mock mode. The only allowed live calls
  are the session methods listed in `create-client.ts`, and only in `VITE_LIVE_API=1`.
- Do not invent API fields or endpoints. Change the agreement first.
- Do not build leaderboards, dual-tap, quests, event CRUD, tap editing, or device
  configuration UI.
- Do not add Next.js, server components, lucide, Inter, or a second icon or
  component library.
- Do not hand-edit `routeTree.gen.ts`. Do not add app logic under `components/ui`.
- Do not commit `.env` files or any station key. Station keys are shown once in the UI
  and never stored.
- Do not upgrade to TypeScript 7 until typescript-eslint supports it.
