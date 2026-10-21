# GeekyKey Web

`apps/geekykey-web` is the GeekyKey screens app. It is deployed separately from the Event app at `https://key.geekshacking.com` and runs at `http://localhost:5174` during development.

## Sources of truth

- Shared frontend conventions: `apps/event-web/CLAUDE.md`
- API contract: `apps/API-AGREEMENT.md`
- This app's planned screens: section 13 of the API agreement

Read those files before adding screens. They are references, not documents to copy into this file.

## App rules

- Screens obtain data only through `src/api/`.
- API types follow the agreement; the mock is the default test and demo data source.
- Do not introduce a shared component package between the two web apps.
- Copy a shadcn component from `apps/event-web/src/components/ui/` only when a GeekyKey screen needs it.
- `src/styles/globals.css` is identical to the Event screens'. Change both together (see "Tailwind 4 notes" in `apps/event-web/CLAUDE.md`).
- Keep GeekyKey Service and Event Service concerns separate.
- The Vite dev server proxies `/api` and `/auth` to `http://localhost:8000`.
- The Firebase sign-in needs the four `VITE_FIREBASE_*` variables, under the names the
  runbook's step 13 gives. The committed `.env.development` carries them for development, so
  a fresh clone can sign in; a variable in your shell or in your own `.env.local` wins over
  the file. Without them the sign-in buttons are disabled and the page says so, and a live
  build fails rather than ship that.
- In production the Worker in `worker/` (settings in `wrangler.jsonc`) serves `dist/` and
  passes `/api/*` and `/auth/*` to `geekykey-service` through a service binding. It works
  like the Event screens' Worker, and has the same `worker:*` commands. `pnpm worker:dev`
  needs `mise run dev:geekykey-service` running, and serves on `http://localhost:8174`.

## Current scope

The app is a routed shell with `/login`, a pathless signed-in layout, My tokens as the home
page (still a placeholder until FRO-27), the data layer in `src/api/`, and sign-in and sign-out
(FRO-19), and claiming a token from the token page (FRO-22). Claiming by code on My tokens is
FRO-30. The login screen signs in with Firebase's web SDK, through `src/lib/firebase.ts` and
`src/features/auth/firebase-sign-in.tsx`, and sends the ID token to the GeekyKey Service
(agreement 7.2). There are no GeekyKey admin screens: agreement section 13 says so, and FRO-21,
which would have been one, was canceled.

`src/api/create-client.ts` is the only file that changes when an endpoint goes live. The session
slice is live: `me`, `devLogin`, `firebaseLogin` and `logout` go to the GeekyKey Service, while
the token lookup, claiming and releasing (agreement 8.2, 8.3 and 8.5) stay on the mock until
checkpoint 6. Until then the token page answers from the mock's fixtures while My tokens
answers from the service, so the two do not agree about who owns a token. The token page says
where its data came from in a "Demo data" notice, the way the Event screens' organiser
console does, so a claim there cannot look like a claim on the service. The notice's wording
is section 13's. My tokens lists the service's tokens, so a live build hides its Release
while `releaseToken` is still on the mock (`isLeftOnMock` in `src/api/mode.ts`).

`pnpm dev` runs the app on the mock. `pnpm dev:live` sends the live slice to the service, and
`mise run dev` starts it that way with the rest of the stack.
