# Event screens

The Event screens are a React single-page app at `https://event.geekshacking.com`. They call the
Event Service (`apps/event-service`) and nothing else. They have two audiences:

- **Participants**, on their own phones. The dashboard (`/`) is where a login link lands, and has
  connection requests, connections and the avatar. The passport (`/passport`) shows stamps and
  points, and `/activity` lists their taps.
- **Organizers**, on a laptop, under `/admin`: the station board, groups and the connection rule,
  the scan log, the QR fallback for logging a tap by hand, and the summary with its export. `/map`
  is the map of the hall for the screen at the booth.

The stack is React 19, Vite, TanStack Router and Query, Tailwind 4 and shadcn/ui. GSAP and three.js
animate the map and the avatar.

[CLAUDE.md](CLAUDE.md) is the working agreement for this app: stack, layout, contract rules,
design rules and the definition of done for a screen. Read it before changing a screen. `docs/`
holds the longer notes it points to, such as [the directory layout](docs/directory-layout.md).

## Running it

```bash
mise run dev:event-web     # http://localhost:5173, on mock data
mise run dev               # the whole stack, with these screens calling the Event Service on 8001
```

On mock data the screens need no backend, Docker or database. `src/api/` is the only code that
talks to the backend. With `VITE_LIVE_API=1` every call goes to the Event Service, and without it
every call is answered by the in-memory mock in `src/api/mock/`, shaped like
[the API agreement](../API-AGREEMENT.md). `mise run dev` sets it, and so does
`mise exec -- pnpm dev:live` from this folder. The dev server forwards `/api` and `/auth` to
`localhost:8001`.

The mock's seeded accounts are Alex Tan, a participant, and Priya Raman, an organizer. Against the
real Event Service, the seeded users are the same two (`dev-user-1` and `dev-organizer-1`).
[Getting started](../../docs/getting-started.md#signing-in-locally) covers signing in.

## The Worker

In production a Cloudflare Worker, `event-web`, serves the built files from `dist/`. It sends
`/api/*` and `/auth/*` to the Event Service at `EVENT_API_URL`, unchanged both ways, so the
browser only ever talks to one address and needs no CORS. It also passes Firebase's sign-in pages
(`/__/auth/*`) to Firebase, without the cookie. The code is in `worker/`, and its settings are in
`wrangler.jsonc`. Cloudflare's Workers Builds deploys it from `main`
([docs/operations.md](../../docs/operations.md)).

## Commands

From any folder:

```bash
mise run test:event-web     # unit tests (Vitest)
mise run build:event-web    # typecheck, then build to dist/
mise run format:event-web   # format in place (oxfmt)
```

From `apps/event-web`:

```bash
mise exec -- pnpm lint              # oxlint, and a check for banned dashes
mise exec -- pnpm format:check      # list unformatted files without changing them
mise exec -- pnpm typecheck         # tsc
mise exec -- pnpm test:watch        # tests in watch mode
mise exec -- pnpm test:e2e          # Playwright, against the mock dev server
mise exec -- pnpm shot              # the definition of done's screenshots of a route
mise exec -- pnpm worker:test       # the Worker's tests
mise exec -- pnpm dlx shadcn@latest add <component>
```

CI's Event web job runs the lint, format, unit, build, end-to-end and Worker checks.
