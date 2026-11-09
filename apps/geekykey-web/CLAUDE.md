# GeekyKey Web

`apps/geekykey-web` is the GeekyKey screens app. It is deployed separately from the Event app at `https://key.geekshacking.com` and runs at `http://localhost:5174` during development.

## Sources of truth

- Shared frontend conventions: `apps/event-web/CLAUDE.md`
- API contract: `apps/API-AGREEMENT.md`
- This app's planned screens: section 13 of the API agreement

Read those files before adding screens. They are references, not documents to copy into this file.
[README.md](README.md) is the short guide for people new to this app; this file wins where the two
differ.

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
- `src/test/location.ts` is a copy of the Event screens' file. Change them together.
- `src/components/ui/native-select.tsx` is this app's own, with no Event screens' copy: the
  browser's `<select>` drawn like `input.tsx`, with room for its arrow (FRO-145). Token kinds'
  ownership filter is native radios drawn as one segmented control, rather than a copy of the
  Event screens' Radix `radio-group.tsx`, whose round dots don't read as a filter.
- `src/components/ui/textarea.tsx` is the Event screens' copy, with `input.tsx`'s background and
  no shadow, so the two fields match.
- `src/styles/globals.css` is identical to the Event screens'. Change both together (see `apps/event-web/docs/tailwind-4.md`).
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
page, listing the user's tokens with Release (FRO-27), the data layer in `src/api/`, and sign-in and sign-out
(FRO-19), and claiming a token from the token page (FRO-22). My tokens also claims a token by
typing its UID, for the tokens a phone cannot read (FRO-30). The page lists the tokens, then
the event buttons, then the form behind "Claim a token manually", closed on load
(`src/features/home/manual-claim.tsx`, FRO-155). The form is in
`src/features/home/claim-by-code-form.tsx`, and the claim it makes goes through the hook in
`src/lib/use-claim-token.ts`, which the token page uses too.
The login screen signs in with Firebase's web SDK, through `src/lib/firebase.ts` and
`src/features/auth/firebase-sign-in.tsx`, and sends the ID token to the GeekyKey Service
(agreement 7.2). It also offers "Continue as guest", which the Event screens don't (FRO-59).
When `/me` answers 401 and Firebase still remembers the user, `src/lib/session-provider.tsx`
logs them in again without showing the login. A returning guest who saw the login instead
would press "Continue as guest" and become a new guest, who doesn't own their tokens. For the
same reason a guest is warned before signing out, in section 13's words, and going ahead releases
their tokens first, since nobody but a GeekyKey admin could afterwards (FRO-62, FRO-131). A failed
release keeps them signed in. The Event screens can't do this themselves, so they send anyone who
arrived by a login link to `/sign-out` here (`src/features/auth/event-sign-out-screen.tsx`), which
warns a guest and sends anyone else back to the event's login.
A guest who signs out here goes on to `/sign-out` on the Event screens, which end that session and
come back to the login here, so the next person on a shared phone doesn't find their passport
(FRO-144).
A sign-out waits for that returning-user login to finish before it clears the cookie, so a
login already in flight cannot set the cookie again (FRO-69). A sign-in waits for a
returning-user login already running and stops a new one from starting, so the sign-in is
the last write to the cookie. A `/me` that answers 401 after the session has changed does
not start a login either (FRO-91). `src/lib/sign-out-marker.ts` remembers a sign-out whose
Firebase call fails in `localStorage` until the next successful sign-in, so a reload does
not log the person back in (FRO-92).
My tokens and the token page carry a button for each event in `/me`, which asks the
GeekyKey Service for a login link (agreement 8.6) and opens it, so the user reaches an
event's screens as the same user (FRO-31). The token page's buttons name its token, so
the link carries the token's kind (11.9, ADR 0006); My tokens sends none, since it shows
several tokens (FRO-106). The buttons are in
`src/components/event-buttons.tsx`, and the hook that opens the link is in
`src/lib/use-login-link.ts`. The signed-in header has a separate place switch for My tokens and
Event screens. Event names appear directly in the menu and open login links without a token UID.
The trigger says "Opening event" while a link is pending, and an error shows under the header.
The account menu contains the user ID and Sign out; its trigger says "Account".
The header scrolls away on phones and stays at the top from tablet width up. Event-link errors
scroll with the page. Page navigation moves focus to the new heading.

Token pages have a My tokens back link. Users allowed to view Token kinds also get persistent
My tokens and Token kinds page links, with the current page marked.
A token someone else holds sends half a connection by itself once the lookup answers
`someone_else`, except for a GeekyKey admin, or when the browser says the page load is a reload
or a move back or forward, which isn't a tap (BAC-149). The page words the Event Service's answer
with section 13's sentences (agreement 8.8, FRO-110). With `waiting`, `connected` or
`already_connected`, the event's button opens the dashboard through a login link, where the
other person accepts a request and the guest sees the reveal (BAC-149). The mock answers it for
now: BAC-120 builds 8.8 in the service. The hook is `src/features/token/use-meeting.ts`, and the
sentences are in `src/features/token/meeting-notice.tsx`.
When the answer gives the owner's name, the page names them and asks whoever is carrying the token
to swap it back, so people notice swapped tokens (BAC-143, wording approved for the agreement's next version). When it
gives the owner's bio, the page shows it under the name (BAC-151, for the agreement's next version). The mock
gives no name unless a test calls `setMeetingOwnerName`, and no bio unless a test calls `setMeetingOwnerBio`.
The one GeekyKey admin screen is Token kinds, at `/admin/token-kinds` (BAC-139), in
`src/features/token-kinds/`. A GeekyKey admin pastes the token writer's log there, and the browser
reads it by `db:token-kinds`' rules (`read-writer-log.ts`) before anything is written. An organizer
on `TOKEN_KIND_VIEWERS`, in the service's settings, sees the totals and no paste box. The header
links to it for whoever `/me` says can see it. Its calls are ahead of the agreement's next
version, so BAC-139's pull request lists them. A GeekyKey admin also releases a claimed token
from the list there (agreement 8.3, FRO-145), and finds tokens by ownership and sorts them by
UID or kind. The filtering and sorting are in `kind-token-view.ts`, and the release in
`release-kind-token-dialog.tsx`. FRO-21, an admin console, stays canceled.

`src/api/create-client.ts` decides which client the app runs on. A live build sends every
method to the GeekyKey Service: the session, the token lookup, claiming and releasing
(agreement 8.2, 8.3 and 8.5), and the login link (8.6). A mock build answers every method
from `src/api/mock`, and the token page says so in section 13's "Demo data" notice
(`src/components/layout/data-source-notice.tsx`). A live build shows no notice.

`pnpm dev` runs the app on the mock. `pnpm dev:live` sends every call to the service, and
`mise run dev` starts it that way with the rest of the stack. To release someone else's
token locally, sign in as `dev-organizer-1`, whom the service's `dev.env` lists in
`GEEKYKEY_ADMINS`.
