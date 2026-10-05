# GeekyKey Web

`apps/geekykey-web` is the GeekyKey screens app. It is deployed separately from the Event app at `https://key.geekshacking.com` and runs at `http://localhost:5174` during development.

## Sources of truth

- Shared frontend conventions: `apps/frontend/CLAUDE.md`
- API contract: `apps/API-AGREEMENT.md`
- This app's planned screens: section 13 of the API agreement

Read those files before adding screens. They are references, not documents to copy into this file.

## App rules

- Screens obtain data only through `src/api/`.
- API types follow the agreement; the mock is the default test and demo data source.
- Do not introduce a shared component package between the two web apps.
- Copy a shadcn component from `apps/frontend/src/components/ui/` only when a GeekyKey screen needs it.
- Keep GeekyKey Service and Event Service concerns separate.
- The Vite dev server proxies `/api` and `/auth` to `http://localhost:8000`.

## Current scope

The app is an empty routed shell with one placeholder page. Token claiming, My tokens, and the GeekyKey admin screens are added by later tickets.
