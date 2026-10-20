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

## Current scope

The app is a routed shell with `/login`, a pathless signed-in layout, My tokens as the home
page (still a placeholder until FRO-27), the data layer in `src/api/`, and sign-in and sign-out
(FRO-19), and claiming a token from the token page (FRO-22). Claiming by code on My tokens is
FRO-30. There are no GeekyKey admin screens: agreement section 13 says so, and FRO-21, which
would have been one, was canceled.

`src/api/create-client.ts` is the only file that changes when an endpoint goes live, and `liveMethods()` is empty until checkpoint 6: the GeekyKey Service's routes do not exist yet, so every method runs on the mock even with `VITE_LIVE_API=1`.
