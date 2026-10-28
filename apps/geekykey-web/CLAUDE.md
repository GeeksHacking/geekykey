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
- Toasts render from the `Toaster` in `routes/__root.tsx`, above the route tree, so a message
  survives the redirect to `/login`.
- Forms use react-hook-form and zod through the shadcn `Form`, in `src/components/ui/form.tsx` and
  `src/components/ui/input.tsx`. Import `zod/mini`, as the Event screens do; lint refuses `zod`
  (see the Forms row of the stack table in `apps/event-web/CLAUDE.md`).
- `src/components/ui/form.tsx`, `src/components/ui/input.tsx` and `src/lib/form-errors.ts` are
  copies of the Event screens' files, with the same tests. Change them together.
- `src/styles/globals.css` is identical to the Event screens'. Change both together (see "Tailwind 4 notes" in `apps/event-web/CLAUDE.md`).
- `worker/firebase.ts` and `authDomain()` in `src/lib/firebase.ts` are copies of the Event
  screens', and `worker/config.ts` checks its address the way theirs does. Change them
  together.
- Keep GeekyKey Service and Event Service concerns separate.
- The Vite dev server proxies `/api` and `/auth` to `http://localhost:8000`.
- The Firebase sign-in needs the three `VITE_FIREBASE_*` variables, under the names the
  runbook's step 13 gives. The committed `.env.development` carries them for development, so
  a fresh clone can sign in; a variable in your shell or in your own `.env.local` wins over
  the file. Without them the sign-in buttons are disabled and the page says so, and a live
  build fails rather than ship that. Only `localhost` signs in through
  `geekykey-b035a.firebaseapp.com` (agreement 7.2). On `127.0.0.1` or a LAN address the popup
  opens on that address, where nothing forwards Firebase's pages, so sign in on `localhost`.
- In production the Worker in `worker/` (settings in `wrangler.jsonc`) serves `dist/` and
  passes `/api/*` and `/auth/*` to `geekykey-service` through a service binding, and
  Firebase's sign-in pages to Firebase (agreement 7.2). It works
  like the Event screens' Worker, and has the same `worker:*` commands. `pnpm worker:dev`
  needs `mise run dev:geekykey-service` running, and serves on `http://localhost:8174`.

## Current scope

The app is a routed shell with `/login`, a pathless signed-in layout, My tokens as the home
page (still a placeholder until FRO-27), the data layer in `src/api/`, and sign-in and sign-out
(FRO-19), and claiming a token from the token page (FRO-22). My tokens also claims a token by
typing its UID, for the tokens a phone cannot read (FRO-30). The form is in
`src/features/home/claim-by-code-form.tsx`, and the claim it makes goes through the hook in
`src/lib/use-claim-token.ts`, which the token page uses too.
The login screen signs in with Firebase's web SDK, through `src/lib/firebase.ts` and
`src/features/auth/firebase-sign-in.tsx`, and sends the ID token to the GeekyKey Service
(agreement 7.2). It also offers "Continue as guest", which the Event screens don't (FRO-59).
When `/me` answers 401 and Firebase still remembers the user, `src/lib/session-provider.tsx`
logs them in again without showing the login. A returning guest who saw the login instead
would press "Continue as guest" and become a new guest, who doesn't own their tokens. For the
same reason a guest is asked before signing out, in section 13's words (FRO-62).
A sign-out waits for that returning-user login to finish before it clears the cookie, so a
login already in flight cannot set the cookie again (FRO-69). A sign-in waits for a
returning-user login already running and stops a new one from starting, so the sign-in is
the last write to the cookie. A `/me` that answers 401 after the session has changed does
not start a login either (FRO-91).
My tokens and the token page carry a button for each event in `/me`, which asks the
GeekyKey Service for a login link (agreement 8.6) and opens it, so the user reaches an
event's screens as the same user (FRO-31). The buttons are in
`src/components/event-buttons.tsx`, and the hook that opens the link is in
`src/lib/use-login-link.ts`.
There are no GeekyKey admin screens: agreement section 13 says so, and FRO-21,
which would have been one, was canceled.

`src/api/create-client.ts` decides which client the app runs on. A live build sends every
method to the GeekyKey Service: the session, the token lookup, claiming and releasing
(agreement 8.2, 8.3 and 8.5), and the login link (8.6). A mock build answers every method
from `src/api/mock`, and the token page says so in section 13's "Demo data" notice
(`src/components/layout/data-source-notice.tsx`). A live build shows no notice.

`pnpm dev` runs the app on the mock. `pnpm dev:live` sends every call to the service, and
`mise run dev` starts it that way with the rest of the stack. To release someone else's
token locally, sign in as `dev-organizer-1`, whom the service's `dev.env` lists in
`GEEKYKEY_ADMINS`.
