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
animate the map and the avatar. Pragmatic drag and drop moves people on the Groups screen with a mouse.

[CLAUDE.md](CLAUDE.md) points to the guidance for a change.
[CODING_STANDARDS.md](CODING_STANDARDS.md) holds the conventions, design rules and definition of
done for a screen. Read it when reviewing a change.

## Running it

```bash
mise run dev:event-web     # http://localhost:5173, on mock data
mise run dev               # the whole stack, with these screens calling the Event Service on 8001
```

### Mock and live builds

On mock data the screens need no backend, Docker or database. `src/api/` is the only code that
talks to the backend. With `VITE_LIVE_API=1` every call goes to the Event Service, and without it
every call is answered by the in-memory mock in `src/api/mock/`, shaped like
[the API agreement](../API-AGREEMENT.md). `mise run dev` sets it, and so does
`mise exec -- pnpm dev:live` from this folder. The dev server forwards `/api` and `/auth` to
`localhost:8001`.

The mock's seeded accounts are Alex Tan, a participant, and Priya Raman, an organizer. Against the
real Event Service, the seeded users are the same two (`dev-user-1` and `dev-organizer-1`).
[Getting started](../../docs/getting-started.md#signing-in-locally) covers signing in.

The mock session lives in `sessionStorage`; the real session is an HttpOnly cookie. They are
independent. Sign out before switching modes, or use a fresh tab.

To try an arriving login link on the mock, open `http://localhost:5173/#login=mock` for Alex Tan,
or `#login=guest` for a guest without a name. Any other `login` value tries an expired link.

Firebase's committed web config is in `.env.development`; a shell variable or `.env.local`
overrides it. These public values are the only committed `.env` exception. Keep private config
and station keys out of git. Firebase sign-in works on `localhost`, where the app uses Firebase's
hosted sign-in pages. On `127.0.0.1` or a LAN address the popup opens locally, where those pages
are not forwarded. Use `localhost` for Firebase login.

### Checking the real service

Follow [Getting started](../../docs/getting-started.md) to start the database, seed it and run the
services. Use the live client and check populated, loading, empty and error states. Force errors
through the service: stop it for a network failure, sign out for a 401, and open `/admin/stations`
as `dev-user-1` for a 403. Mock `failNext` calls cannot check the integration.

Before deploying a screen that requires a new `/me` field, run `pnpm check:me <service address>`
from this folder against the deployed service. It needs `EVENT_SESSION` in the environment;
[scripts/check-live-me.ts](scripts/check-live-me.ts) explains how to supply it. A successful local
test does not establish which fields production sends. If its response differs from the
agreement, follow the root [escalation rule](../../AGENTS.md#escalation).

### Screenshots and phone access

The first `pnpm test:e2e` or `pnpm shot` on a machine, and the first after a Playwright version
bump, need `pnpm exec playwright install chromium`. Each version needs its own Chromium build;
without it Playwright stops with "Executable doesn't exist" before running a test.

To try a screen on a phone on your Tailscale network, run `pnpm dev --host 127.0.0.1`; plain
`pnpm dev` can listen on IPv6 only. Check `tailscale serve status` for a free port, then run
`tailscale serve --bg --https=<free port> http://127.0.0.1:5173` once. Open
`https://<machine>.<tailnet>.ts.net:<port>` on the phone. Use a mock session there; Firebase login
needs the hostname described above.

## The Worker

In production a Cloudflare Worker, `event-web`, serves the built files from `dist/`. It sends
`/api/*` and `/auth/*` to the Event Service at `EVENT_API_URL`, unchanged both ways, so the
browser only ever talks to one address and needs no CORS. It also passes Firebase's sign-in pages
(`/__/auth/*`) to Firebase, without the cookie. The code is in `worker/`, and its settings are in
`wrangler.jsonc`. Cloudflare's Workers Builds deploys it from `main`
([docs/operations.md](../../docs/operations.md)).

`pnpm worker:dev` needs the Event Service running. It serves the built screens as production
does, so check that deep links reload and cookies return through the Worker, rather than through
Vite's proxy. Build before `pnpm worker:test`, because those tests need `dist/`.
Changes to the forwarded path prefixes in `wrangler.jsonc` need Adam's review.

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
