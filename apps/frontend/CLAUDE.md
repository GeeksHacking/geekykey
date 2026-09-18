# GeekyKey frontend

React single-page app for GeekyKey, an NFC stamp-collection system for hackathons.
Participants tap a physical NFC token at ESP32 reader stations. This app is where they
see their stamps and points, and where organisers watch the event. It is one package in
the pnpm monorepo; the backend lives in `apps/backend` (Hono on Deno).

Two audiences, two surfaces:

- **Participants** on their own phones, mid-event, often under dim venue lighting. Mobile first.
- **Organisers** on a laptop at the registration desk or a booth. Desktop first, denser.

Key dates: Sprint 1 is 21 Sep to 4 Oct 2026. The Sprint 2 A/B test runs 5 to 18 Oct.
Showcase is 17 Nov 2026. Scope down before adding features.

## Sources of truth

1. `apps/API-AGREEMENT.md` is the contract. Build against the shapes there, not against
   backend source or guesses. If the backend disagrees with the agreement, the agreement
   wins and the backend gets fixed.
2. `.agents/skills/design-taste-frontend/SKILL.md` is the design authority. See
   "Design direction" below for how it applies to a product UI rather than a landing page.
3. This file covers what neither of those does: stack, layout, conventions, workflow.

Do not copy content from the agreement or the skill into this file. Link to it.

## Current phase: mockup, not integration

Every screen is built against **mock data shaped exactly like the API agreement** before
any real request is wired. Later, each screen is connected one at a time by swapping the
mock data source for a fetch, with no change to the screen itself.

Rules that make this possible:

- All data access goes through `src/api/`. Components and pages never call `fetch`.
- `src/api/types.ts` mirrors the agreement field for field, in `snake_case`. Never add a
  field the agreement does not have. If a screen needs something missing, propose a change
  to the agreement instead of inventing it.
- `src/api/mock/` holds fixtures and a mock client with the same interface as the future
  HTTP client. Fixtures use the seeded IDs (`dev-user-1`, `dev-organizer-1`), cover every
  `tap_status`, include stamps with `earned_at: null`, and use realistic, uneven data. No
  round numbers, no "John Doe".
- The mock client simulates latency and can be told to fail with any error code from the
  agreement, so loading and error states are real from day one. `api.mock.failNext(code)`
  fails the next call with that code, or with `"network"`; tests use it. With
  `simulate: true` (the default in `app.tsx`) a station simulator keeps the online stations'
  heartbeat fresh and drips in new taps, so polling has something to show.

## Stack

| Concern | Choice | Notes |
|---|---|---|
| Runtime, package manager | Node 22, pnpm 11 | Workspace package `@geekykey/frontend` |
| Framework | React 19 | Function components only |
| Language | TypeScript 6.0, strict | Pin `typescript@~6.0.3`. See "TypeScript version" |
| Build | Vite 8 + `@vitejs/plugin-react` | |
| Styling | Tailwind CSS 3.4 | Deliberately v3, not v4. Pin `tailwindcss@^3.4`. Use `tailwind.config.ts` + PostCSS, not the v4 Vite plugin |
| Components | shadcn/ui, Tailwind v3 style, CSS-variable theme | Generated into `src/components/ui`. We own and customise the code. Never left in default state |
| Routing | TanStack Router, file-based | Typed links, params, and search. `routeTree.gen.ts` is generated and committed; never hand-edit it |
| Server state | TanStack Query | Introduced when API wiring starts. Not used in the mockup phase |
| Tables | TanStack Table 8 | Organiser scan log only. Pinned to v8; v9 changed its API |
| Icons | `@phosphor-icons/react` | One family for the whole app. Replace the `lucide-react` imports shadcn generates. Default `weight="regular"` |
| Fonts | Geist, Geist Mono via `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` | Self-hosted. No Google Fonts `<link>` |
| Motion | `motion/react` | Feedback and state transitions only |
| Forms | react-hook-form + zod through shadcn `Form` | Three forms in the MVP: pair token, add station, QR fallback |
| Tests | Vitest + React Testing Library + jsdom | |
| Lint | ESLint flat config + typescript-eslint | |

### Why TanStack Router

The app is roughly ten routes and greenfield, and the team already plans TanStack Query
and TanStack Table. Typed links and params catch broken navigation at compile time, which
matters for a team learning React. To keep the router swappable anyway: screens live in
`features/`, get data from hooks, and never depend on router loaders. Route files only map
a URL to a feature. That keeps a migration in either direction to route files plus
`Link` and `useNavigate` imports.

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
- shadcn CLI 4.21 still generates Tailwind v3 components when `tailwind.config.ts` exists.
  It resolves the `@/` alias from `tsconfig.json`, so the solution tsconfig must keep
  `compilerOptions.paths`. Without it the CLI writes into a literal `@/` folder.
- pnpm 11 refuses to run esbuild's install script unless `allowBuilds` lists it in
  `pnpm-workspace.yaml`. Done at the repo root.
- shadcn's `sonner` component imports `next-themes`. Ours reads `lib/theme` instead.
- The `react-hooks` lint plugin (v7) flags components looked up during render and
  react-hook-form's `watch()`. Use `useWatch` and render looked-up icons through a small
  component (see `features/passport/station-glyph.tsx`).
- Never redirect with a `<Navigate />` element from a component that re-renders. It
  navigates again whenever its props object changes, which is every render, and the router
  never commits, so the page freezes on the loading view. Redirect from a `useEffect` with
  stable dependencies instead (see `features/auth/require-session.tsx`).

## Commands

Run from `apps/frontend`.

```
pnpm dev          # Vite dev server on http://localhost:5173
pnpm build        # typecheck, then production build to dist/
pnpm preview      # serve dist/ locally
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint .
pnpm test         # vitest run
pnpm test:watch   # vitest
pnpm dlx shadcn@latest add <component>   # add a shadcn component
```

Root-level equivalents: `pnpm dev:frontend`, `pnpm build:frontend`, `pnpm test:frontend`.

Sign in on the login page with a seeded account. Alex Tan is a participant, Priya Raman is
an organiser. The mock session survives a reload but not a new tab.

Backend, for the integration phase only:

```
cd apps/backend
deno task seed
DEV_AUTH_ENABLED=true deno task dev
```

## Directory layout

```
apps/frontend/
  CLAUDE.md
  index.html                # theme bootstrap script runs before first paint
  vite.config.ts            # react plugin, router plugin, proxy /api and /auth to :8000
  vitest.config.ts
  tailwind.config.ts
  postcss.config.js
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
        pair.tsx
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
      tokens/               # token list, unpair confirm, pair form
      activity/             # participant tap history
      stations/             # station board, add-station dialog, one-time key reveal
      taps/                 # scan log: filters, TanStack table, cursor paging, polling hook
      fallback/             # QR fallback form and result
      stats/                # KPI tiles, per-station breakdown, CSV export
    components/
      ui/                   # shadcn generated and customised. No app logic here.
      layout/               # shells, nav, page header, theme toggle, account menu, empty/error/loading views
      tap-status.tsx        # shared by several features, alongside online-status and participant-tap-list
    api/
      types.ts              # mirrors API-AGREEMENT.md exactly
      client.ts             # the interface every feature consumes
      context.ts            # useApi()
      provider.tsx
      errors.ts             # ApiError, NetworkError, describeError()
      mock/                 # fixtures + mock client (current phase)
      http/                 # fetch client (integration phase, not written yet)
    lib/                    # shared infrastructure, safe to import from any feature
      session.ts            # "am I logged in": useSession(), useMe()
      session-provider.tsx
      theme.ts              # system preference, dark fallback, manual override
      theme-provider.tsx
      use-request.ts        # small fetch-state hook with polling; TanStack Query replaces it later
      form-errors.ts        # maps validation_failed issues onto react-hook-form fields
      format.ts             # dates, UIDs, points, counts
      constants.ts          # poll intervals, seeded user IDs
      utils.ts              # cn()
    styles/globals.css      # Tailwind layers + CSS-variable tokens for both themes
    test/setup.ts           # Vitest setup: jest-dom matchers, matchMedia stub
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
  merged by `id`. No websockets.
- Scan log pagination is cursor-based via `before_id` and `next_before_id`.
- Timestamps arrive as UTC ISO strings. Format for display in the user's local zone, in
  the mono font. Never parse IDs. Only `taps.id` is numeric, and only for the cursor.
- Every non-2xx body is `{ error, issues? }`. Switch on `error`:
  - `validation_failed`: show each `issues[].message` inline under the field at `issues[].path`.
  - `unauthenticated`: go to login and remember `return_to`.
  - `forbidden`: render the 403 view in place. Do not redirect.
  - `not_found`: inline message on the action that caused it.
  - `uid_already_paired`: inline message on the pair form.
  - `internal_error` or a network failure: generic error state with a retry button.
- Out of scope, do not build UI for it: leaderboards, dual-tap, archetype quests, event
  CRUD, editing or deleting taps, profile editing, station key rotation, reading a key
  back, Web Serial or USB device configuration.

## Screens (MVP)

| Route | Role | Reads | Writes | Must handle |
|---|---|---|---|---|
| `/login` | anyone | | `POST /auth/dev-login` (dev), `GET /auth/login` (prod) | `not_found` on a bad dev user |
| `/` dashboard | participant, organiser | `GET /me` | | loading, no tokens yet, no stamps yet |
| `/passport` | participant | `GET /me` `stamps` | | every station shown; empty slot where `earned_at` is null |
| `/activity` | participant | `GET /me` `recent_taps` | | non-accepted taps shown with a plain-language reason |
| `/pair` | participant, organiser | `GET /me` `tokens` | `POST /tokens/pair`, `DELETE /tokens/{uid}` | 200 vs 201, `uid_already_paired`, `validation_failed`, confirm before unpair |
| `/admin` | organiser | | | participant sees the 403 view |
| `/admin/stations` | organiser | `GET /admin/stations` polled | `POST /admin/stations` | one-time `api_key` reveal with copy button and warning; online and offline; empty board |
| `/admin/taps` | organiser | `GET /admin/taps` polled, filters, cursor | | `user` null on `unknown_token`; load more; empty log |
| `/admin/fallback` | organiser | `GET /admin/stations` | `POST /admin/taps` | `not_found`; result status shown after submit |
| `/admin/summary` | organiser | `GET /admin/stats` | `GET /admin/export.csv` as a download link | zero-tap event |

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
generation requirements, and the Next.js, RSC, and Tailwind v4 defaults in 3.A. This is
a Vite SPA on Tailwind 3.4.

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
renders icon plus text plus colour. Accepted green, cooldown orange, unknown_token red.
Cooldown is orange on screen rather than the agreement's amber so it never reads as the
brand yellow. Station LEDs stay amber.

**Type:** Geist for UI. Geist Mono for points, token UIDs, station IDs, timestamps, and
counts. `tracking-tight` on headings. No oversized display type. The wordmark alone echoes
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
- Data enters components through hooks in `features/*`. Never `useEffect` plus `fetch`
  inside a component.
- Derive, do not sync: no state that duplicates props or server data.
- Formatting rules for dates, UIDs, and points live in `lib/format.ts` and nowhere else.
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

- Do not call the real backend from screens during the mockup phase. Mock client only.
- Do not invent API fields or endpoints. Change the agreement first.
- Do not build leaderboards, dual-tap, quests, event CRUD, tap editing, or device
  configuration UI.
- Do not add Next.js, server components, Tailwind v4, lucide, Inter, or a second icon or
  component library.
- Do not hand-edit `routeTree.gen.ts`. Do not add app logic under `components/ui`.
- Do not commit `.env` files or any station key. Station keys are shown once in the UI
  and never stored.
- Do not upgrade to TypeScript 7 until typescript-eslint supports it.
