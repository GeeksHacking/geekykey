---
title: "Sprint 1 opens: the first endpoint lands and the team reshuffles"
date: 2026-09-23
window:
  from: 2026-09-18
  to: 2026-09-23
sprint: 1
authors: [adam]
summary: >-
  The first real endpoint is in: a station can POST a tap and the backend records it,
  while every MVP screen runs against a written API contract until the rest catches up.
  Roles have shifted: Joshua now owns ideas and the report, and Ethan leads the frontend.
  Hardware materials get decided at Thursday's check-in and ordered by Friday.
areas: [backend, frontend, hardware, design, tooling, admin]
asks:
  - who: Qing Yuan
    what: >-
      30 minutes on the portal user schema and the OIDC callback shape. Everything
      auth-related past dev login is blocked on this.
  - who: Mr Pang
    what: >-
      A date for the Sprint 2 A/B test at an SSTInc or CCA session. Sprint 2 starts 5 Oct
      and the 4 Jul mentor meeting put the lead time at about a month.
---

## What moved

### Backend

- `POST /api/v1/taps` accepts taps from a reader station, one at a time or as a batch, and
  records them. This is the endpoint the whole product hangs off: it is what the ESP32
  calls when someone touches their token to a reader.
- The database schema and its first migration are in. Drizzle generates the migration from
  the schema, so the two are not kept in sync by hand.
- Session handling landed as middleware with its own tests, and a `DEV_AUTH_ENABLED` flag
  now gates the development-only login.

### Contract

- `apps/API-AGREEMENT.md` is written down: every endpoint, its request and response shape,
  its error codes, and whether it is implemented, due in Sprint 1, or due by MVP. The web
  app, the backend and the ESP32 firmware all build against it.

### Frontend

- Every MVP screen is built and running against mock data shaped exactly like the API
  agreement: the participant dashboard, passport, activity and token pairing, and the
  organiser's stations, scan log, QR fallback and summary.
- The real HTTP client is in, with a per-endpoint switch. An endpoint moves from mock to
  live by adding one line in one file, and no screen changes. Nothing is switched over
  yet; the session endpoints go first.
- Data fetching moved from hand-written `useEffect` hooks to TanStack Query, and the scan
  log table moved to TanStack Table v9.
- The README has a setup guide written so someone new to the repo can get the app running
  from scratch.

### Hardware

- Zi Tao started the first prototype of the scanner and fixed some early issues with it.

### Ideas

Joshua is working through ideas for game mechanics. Two of them, neither a decision yet:

- **A disk that gets passed around**, padded for safety, with an NFC tag inside, so
  tapping it shares information about whoever threw it.
- **An RGB light on the token that shows its owner's skill set.** The colour comes from
  the owner's profile, one colour per skill set. Team-formation games can then require a
  number of each colour, so every team has the skills it needs. These would be side
  challenges, separate from the main hackathon, and the colours could also drive treasure
  hunts. This builds on the skill-colour grouping idea from the 2 Sep meeting, with the
  colour moved onto the token itself.

### Tooling and CI

- Node, pnpm and Deno versions are pinned in one file and installed by mise, so every
  laptop and CI run the same toolchain.
- CI runs on every pull request: lint, tests and a production build for the frontend,
  typecheck and tests for the backend, plus a dependency audit.
- Dependency supply chain hardened (PR #1). `pnpm audit` was reporting one high, seven
  moderate and one low advisory. drizzle-orm 0.45.2 fixes the high, a SQL injection, and
  hono 4.13.8 fixes most of the rest; the one left affects only a development server
  nothing here runs. The install policy is now written down instead of inherited: a
  24-hour wait before any newly published version can be installed, no silent drops in
  package signing, and install scripts allowed only for exact approved versions.

## Decisions

**Joshua takes on ideas and the report; Ethan leads the frontend.** Joshua is now also
responsible for the project's ideas and the report, and his frontend work drops to a
supporting role. Ethan owns the frontend. Why: the report is one of the project's main
deliverables and needs someone focused on it alone, and so do the ideas. Joshua is a good
fit for both, and Ethan has been handling the frontend well. Rejected: keeping the old
split, where both were on the frontend and the report was no one's main job.

**Build the frontend against a written contract and mock data, not against the backend.**
Why: the frontend could not wait on a backend that did not exist yet, and the portal OIDC
integration has no date. The mock is shaped exactly like the agreement, so going live is
a one-line switch per endpoint. Rejected: building screens against the real backend as it
lands, which would have left the frontend broken every time the backend was mid-change,
and would have had the whole frontend waiting on one person.

**The API agreement wins over the code.** If the backend and the agreement disagree, the
backend gets fixed. Why: with three surfaces talking to each other (web app, backend and
firmware), the contract has to be the fixed point or every change becomes a negotiation.
Rejected: treating the backend as the source of truth, which means the other two find out
about changes by breaking.

**Development login sits behind a flag rather than being a temporary stub.** Why: when the
portal OIDC integration lands there is no code to delete and nothing to accidentally ship:
the route is simply never mounted in production. Rejected: a fake-auth shortcut to be torn
out later, which is exactly the kind of thing that survives to the showcase.

**Write the dependency policy down instead of relying on defaults.** Why: the protections
we want are defaults only in the newest pnpm. Anyone installing with an older version
would have silently lost them. Rejected: trusting the defaults, which is invisible when
it fails.

**Pin the toolchain with mise, not corepack.** Why: pnpm 12 ships as a native binary that
corepack cannot launch, and mise pins Node, pnpm and Deno in one file that CI reads too.
Rejected: corepack, which fails outright on the pinned pnpm, and "just install Node
yourself", which is how version drift starts.

**Build this updates site.** Why: mentor contact is fortnightly from September to November,
and the internal review on 2 Sep found the journal was behind and light on reasoning. A
timeline that records decisions as they are made serves both the check-ins and the final
report. Decided on 21 Sep: Astro with markdown entries, living in this repo as
`apps/updates` so a post ships in the same pull request as the work it describes; deployed
to Cloudflare Pages on its own domain; public, with no participant data on it.

## Blockers and asks

- **Materials: decided Thursday, ordered by Friday.** The team has until Fri 25 Sep to
  procure the hardware materials. What goes on the order gets settled with Julian at the
  in-person check-in, now moved to Thu 24 Sep at 11:30, and the order goes in after that.
- **Portal integration is the critical path.** `GET /auth/callback` cannot be built without
  the portal's user schema and OIDC details, and nothing that needs a real logged-in user
  can follow until it exists. This needs a meeting with Qing Yuan.
- **The A/B test needs a date before it needs a build.** Sprint 2 (5-18 Oct) is the test
  window, and the 4 Jul mentor meeting put the lead time for booking an SSTInc or CCA
  session at about a month.

## What we learned

- **Joshua and Ethan:** the tech stack, how the codebase is structured, and how to add to
  the web app within that structure.

## Next window

- **Team:** settle the materials list with Julian at Thursday's check-in and get the order
  in by Friday.
- **Adam:** `GET /api/v1/me`. It is a big endpoint: profile, tokens, stamps, points and
  history in one response. Then token pairing, so the participant dashboard runs on real
  data end to end.
- **Zi Tao:** getting the ESP32 to connect to the internet reliably.
- **Joshua:** developing the game ideas above.
- **Ethan:** getting to know the codebase and finding where he can start contributing on
  the frontend.
