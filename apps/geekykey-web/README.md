# GeekyKey screens

The GeekyKey screens are a React single-page app at `https://key.geekshacking.com`. They call the
GeekyKey Service (`apps/geekykey-service`) and nothing else. Each token's address points here, so
these are the first screens a phone opens when it taps a token.

| Route | Screen |
|---|---|
| `/t/{uid}` | The token page. It claims an unclaimed token, shows the owner their own token with a button into each event, and sends half a connection when someone else opens it. A GeekyKey admin can release the token here |
| `/` | My tokens: the user's tokens, releasing one, the event buttons, and claiming one by typing its UID behind "Claim a token manually" |
| `/admin/token-kinds` | Token kinds, for a GeekyKey admin: paste the token writer's log, check it, and load it |
| `/login` | Google sign-in, or "Continue as guest" |

The stack matches the Event screens: React 19, Vite, TanStack Router and Query, Tailwind 4 and
shadcn/ui. The two apps share no component package. A few files are copies of the Event screens'
and change together with them; [CLAUDE.md](CLAUDE.md) lists them, with this app's other rules.
It follows the shared conventions in [the Event screens' coding standards](../event-web/CODING_STANDARDS.md).

## Running it

```bash
mise run dev:geekykey-web   # http://localhost:5174, on mock data
mise run dev                # the whole stack, with these screens calling the GeekyKey Service on 8000
```

As with the Event screens, `VITE_LIVE_API=1` sends every call to the service, and without it an
in-memory mock in `src/api/mock/` answers. The dev server forwards `/api` and `/auth` to
`localhost:8000`. Sign in on `localhost`, not `127.0.0.1` or a network address, because only
`localhost` can reach Firebase's sign-in pages in development.

Locally, sign in as `dev-organizer-1` to act as a GeekyKey admin, since the service's `dev.env`
lists that user.

## The Worker

In production a Cloudflare Worker, `geekykey-web`, serves the built files from `dist/`. It passes
`/api/*` and `/auth/*` to `geekykey-service` through a service binding, and Firebase's sign-in
pages to Firebase. The code is in `worker/`, its settings in `wrangler.jsonc`, and Cloudflare's
Workers Builds deploys it from `main`. `pnpm worker:dev` runs it locally on `localhost:8174`, with
`mise run dev:geekykey-service` running.

## Commands

From any folder:

```bash
mise run test:geekykey-web     # unit tests (Vitest)
mise run build:geekykey-web    # typecheck, then build to dist/
mise run format:geekykey-web   # format in place (oxfmt)
```

From `apps/geekykey-web`: `mise exec -- pnpm lint`, `format:check`, `typecheck`, `test:watch` and
`worker:test`, as in the Event screens. CI's GeekyKey web job runs the lint, format, unit, build and
Worker checks.
