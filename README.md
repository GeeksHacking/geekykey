# GeekyKey

NFC stamp-collection system for hackathons. Participants tap a physical token at ESP32
reader stations, collect stamps and points, and see them on a mobile web dashboard.
Organisers watch the event from a console.

## Repo layout

This is a pnpm monorepo. The web apps live under `apps/`. The station firmware lives under
`firmware/` because it is an Arduino sketch, not a JavaScript package.

```text
geekykey/
├── .mise.toml                  pinned Node and pnpm versions, plus the task shortcuts
├── package.json                root scripts that the mise tasks call
├── pnpm-workspace.yaml         which folders are packages, and the supply-chain rules
├── pnpm-lock.yaml
├── compose.yaml                TiDB in Docker, the backend's database on your laptop and in CI
├── .github/workflows/
│   ├── ci.yml                  lint, test, build, and audit on every push and pull request
│   ├── event-service.yml       the Event Service's checks, which ci.yml and deploy.yml both run
│   └── deploy.yml              deploys the backend to Google Cloud Run: production from main, staging by hand
├── infra/                      the backend's Google Cloud setup: the runbook, and what deploy.yml deploys with
├── apps/
│   ├── API-AGREEMENT.md        the contract between the frontend, backend, and stations
│   ├── event-web/              Event screens for participants and organisers, port 5173
│   ├── geekykey-web/           GeekyKey screens: the token page and My tokens. Port 5174
│   ├── geekykey-service/       the Cloudflare Worker that stations and the GeekyKey screens call, port 8000
│   ├── event-service/          the Node server that keeps the database, which the Event screens call, port 8001
│   └── updates/                progress timeline for our mentors
├── packages/
│   ├── handoff/                the hand-off's shapes, shared by both sides, and their JSON Schema
│   ├── firebase-login/         the check of a Firebase ID token, shared by both services' logins
│   └── login-link/             the login link the GeekyKey Service makes and the Event Service reads
└── firmware/
    └── geekykey_station/       ESP32 reader station
```

| Folder | Stack | Start reading at |
|---|---|---|
| `apps/event-web` | React 19, Vite, TanStack Router and Query, Tailwind, shadcn/ui | `apps/event-web/CLAUDE.md` |
| `apps/geekykey-web` | React 19, Vite, TanStack Router and Query, Tailwind, shadcn/ui | `apps/geekykey-web/CLAUDE.md` |
| `apps/geekykey-service` | Hono on a Cloudflare Worker, with no database | `src/worker.ts`, then `src/app.ts` |
| `apps/event-service` | Hono on Node, on Google Cloud Run, Drizzle ORM, TiDB | `src/server.ts`, then `src/app.ts` and its two areas |
| `apps/updates` | Astro, with one Markdown file per entry | `apps/updates/CONTENT-MODEL.md` |
| `firmware/geekykey_station` | Arduino sketch for an ESP32-S3 with an RC522 reader | The comment at the top of `geekykey_station.ino` |

`apps/geekykey-web` is the token page and My tokens, on the GeekyKey Service. The two sets of
screens are separate because they belong to separate services. See
`apps/API-AGREEMENT.md`.

`pnpm-workspace.yaml` also includes `packages/*`, for code shared between apps.
`packages/handoff` holds the Zod schemas for what the GeekyKey Service sends an Event Service
and what it answers (the API agreement's section 11). `apps/event-service` bundles it into
its image. Its `json-schema/` folder holds the same shapes as JSON Schema, for other teams: after
changing a schema, run `mise exec -- pnpm --filter @geekykey/handoff json-schema` and commit
what it writes. A test fails while the two differ.
`packages/firebase-login` checks a Firebase ID token against Google's keys, for each
service's `POST /auth/firebase` (the API agreement's 7.2). Its `testing` export fakes
Google's keys, so a service's tests can log in without them.
`packages/login-link` makes and reads login links (the API agreement's 11.9): the GeekyKey
Service makes one for its session's user, and the Event Service logs that user in with it.
Both services bundle it, so the two can't disagree on the format or the key.

### How the pieces connect

```text
browser ──▶ GeekyKey screens :5174 ── /api and /auth ──┐
                                                       ▼
NFC token ──tap──▶ ESP32 station ──POST /api/v1/taps──▶ GeekyKey Service :8000, key-api.
                                                          │ owners and hand-off
                                                          ▼
                                                        Event Service :8001, event-api. ──▶ TiDB :4000
                                                          ▲
browser ──▶ Event screens :5173 ── /api and /auth ────────┘
```

In production a station calls only the GeekyKey Service, at
`https://key-api.geekshacking.com`. The Event Service, at `https://event-api.geekshacking.com`,
has no station endpoints: a tap sent there gets `404`.

The GeekyKey Service, a Cloudflare Worker in `wrangler dev`, checks the station's key, asks
the claims stand-in on the Event Service who owns each token, and hands the taps on. Each set
of screens has a dev server that forwards `/api` and `/auth` to its own service, so the
browser only ever talks to one address. On their own, both sets of screens run on mock data
and never call a service. Endpoints are switched over one at a time (see "With the Event
screens" below).

Locally everything runs on `localhost`:

| Port | What | Started by |
|---|---|---|
| 8000 | The GeekyKey Service, in `wrangler dev` | `mise run dev:geekykey-service` |
| 8001 | The Event Service, on Node | `mise run dev:event-service` |
| 5173 | The Event screens (`apps/event-web`) | `mise run dev:event-web` |
| 5174 | The GeekyKey screens (`apps/geekykey-web`) | `mise run dev:geekykey-web` |

`mise run dev` starts all four at once. See [Running the backend](#running-the-backend).

### Inside the Event screens

```text
apps/event-web/src/
├── routes/       one small file per URL; each says "this URL shows that screen"
├── features/     the screens, one folder per area: passport, stations, taps, ...
├── components/   pieces used by more than one feature; ui/ holds the shadcn/ui components
├── lib/          shared helpers: formatting, theme, who is signed in
└── api/          the only code that talks to the backend: types, mock client, http client
```

### Inside the backend

```text
apps/event-service/
├── src/
│   ├── server.ts          the entry point: reads the settings, starts the server, stops it cleanly
│   ├── app.ts             every route mounted, given the settings and the database
│   ├── base-app.ts        what every response shares: never cached, errors as JSON, /api/health
│   ├── config.ts          every setting, with its default
│   ├── event/             the Event side's base, which every event gets: the hand-off's routes
│   │                      under /geekykey/v1, the tap pipeline and the game interface, /me,
│   │                      logging in and out, the session, station keys, and its tables
│   │                      (stations, passport_stations, users, taps) in schema.ts
│   ├── games/             one folder per game, each behind the interface in event/games.ts:
│   │                      the passport, for now
│   ├── showcase/          the showcase's own settings: which games run on which stations
│   ├── claims-stand-in/   who owns each token until the Portal does: its four routes under
│   │                      /claims-stand-in/v1, and its table (tokens) in schema.ts
│   ├── db/                the connection pool, the migrator, and the column types both schemas share
│   └── lib/               small helpers both areas use (validation, the no-caching header, log lines,
│                          token UIDs, and the key check on the GeekyKey Service's requests)
├── drizzle/           SQL migrations generated from the two schema files, for the one database
├── scripts/           Node scripts for the dev server, the database tasks, the seed, the migration
│                      check, and the end-to-end smoke test
├── test-support/      test setup, and a proxy that breaks database connections on purpose
├── Dockerfile         builds the image Cloud Run runs
├── dev.env            the settings `mise run dev:event-service` starts with, committed
├── .env.example       a template for .env, your own local settings and secrets
└── vitest.config.ts   runs every test on Node, against TiDB in Docker
```

Each test sits next to the code it tests, as a `.test.ts` file.

The two folders under `src/` are the Event side and the claims stand-in, which share one
server, its settings and its database pool until the stand-in goes at the switch to the
Portal. Each keeps its tables in a schema file of its own. Drizzle writes one set of
migrations from both files, since it's one database, and no foreign key crosses between them.
Neither imports the other: the lint rule in `.oxlintrc.json` stops it, and `src/areas.test.ts`
checks the rule.

The Event side is in three folders, so that after the repo split it can become a GitHub
template. `src/event/` is the base every event gets. It stores each tap and asks the games
running at its station for a status: `accepted` if any game counted the tap, otherwise
`cooldown` if one held it back, otherwise `no_game`. `src/games/` has one folder per game, and
`src/showcase/` holds this event's own settings. The base imports neither: `src/app.ts` hands
it the games the settings name, and the same lint rule and test check that too.

The Event Service has no station endpoints. Stations call the GeekyKey Service (see
[Inside the GeekyKey Service](#inside-the-geekykey-service)), which reaches this server only
through its routes: the claims stand-in's under `/claims-stand-in/v1`, with
`CLAIMS_STAND_IN_KEY`, and the Event side's under `/geekykey/v1`, with `EVENT_SERVICE_KEY`.

Every line the server logs is one JSON object whose `message` is a fixed name, such as
`server_started` or `internal_error`, from the list in `src/lib/log.ts`. Cloud Logging
shows that name as the line's headline, and takes its `severity`. A log line never holds a
key, a cookie or a name: an `internal_error` keeps the error's class, its code and where
it was thrown, but not its message, which can hold a query's values. Anything thrown and
never caught, such as a missing setting at start-up, stops the server with one
`fatal_error` line instead of Node's own report, which would print a `DATABASE_URL` that
won't parse, password and all.

The server keeps one pool of up to 10 connections to the database, shared by every
request (`src/db/pool.ts`). Cloud Run pauses the server between requests, so a
connection can die unnoticed. The pool closes connections left unused for a minute, and
checks one with a ping before reusing it after more than a second. A dead one is
replaced before the query is sent, so no query is ever sent twice.

The image holds one file. `pnpm build` uses Rolldown to bundle `src/server.ts` and
everything it imports into `dist/server.cjs`, and the `Dockerfile` runs that on Node 24.
See [The image](#the-image) to build and start it yourself.

### Inside the GeekyKey Service

`apps/geekykey-service` is a Cloudflare Worker with no database. `src/worker.ts` reads its
settings once and hands each request to `src/app.ts`.

It asks the claims stand-in on the Event Service who owns each token, with
`CLAIMS_STAND_IN_KEY`, then hands the owners' taps to the Event side's
`POST /geekykey/v1/taps`, with the showcase's Event Service key, and the Event side stores
them. The hand-off goes to the one Event Service in the `EVENT_SERVICES` setting, the
showcase. A station's request gets one deadline for both, `TAP_DEADLINE_MS`, 4 seconds.
A stand-in that doesn't answer properly in time fails the request with
`503 claims_unavailable`, and an Event Service with `503 event_service_unavailable`. Either
way the station keeps its taps, and nothing is retried.

The Worker checks a station's key against its copy of the stations each Event Service has
registered, which it fills from the Event side's `GET /geekykey/v1/stations`. The copy is
kept in memory. The Worker fills it on the first station request after it starts, within the
same deadline, and refreshes it at most once a minute after that. A list that doesn't come
back is asked for again at most once a minute too, whatever keys arrive. So a new, replaced
or disabled station key takes up to a minute to take effect.

The Worker checks the key on a station's heartbeat, `POST /api/v1/stations/heartbeat`, the
same way. Once it has, the answer with `server_time` goes back, and the Worker then passes
what the station said of its health to the Event side's `POST /geekykey/v1/heartbeats`. A
heartbeat hand-off that fails is logged as `heartbeat_handoff_failed` and not retried, since the
station sends another a minute later. It never fails the heartbeat, so a heartbeat sets a
station's clock even while the Event Service is down.

Work a station request starts for after its answer, the heartbeat hand-off and a refresh of
the copy, goes through the Worker's `waitUntil`, so the answer doesn't wait for it.

The GeekyKey screens log in with `POST /auth/firebase`, which checks the Firebase ID token with
`packages/firebase-login`, the same code as the Event Service's, and sets `gk_session`. The
Worker keeps no users, so the session holds the user ID and the token's name, if it has one.
Each isolate fetches Google's keys once and keeps them for an hour. `GET /api/v1/me` reads the
session, asks the claims stand-in for the user's tokens, and lists each Event Service in
`EVENT_SERVICES` that has a `public_url`, for the screens' buttons. The stand-in has 4 seconds
to answer. When it doesn't answer properly in that time, the Worker answers
`503 claims_unavailable`.

The event buttons call `POST /api/v1/login-links`. It answers the event's address with a login
link in its fragment, `#login=`, signed with a key derived from that Event Service's key. The
Event screens send the link to the Event Service's `POST /auth/login-link`, which checks it with
the same package. The Event Service keeps the link's ID in `used_login_links`, so the link works
once, then sets `event_session` for the same user. The link lasts 60 seconds, and neither
service logs it.

## Running the Event screens

The Event screens currently run against **mock data** shaped like the API agreement, so you
do not need the backend, Docker, or a database to work on it.

### 1. Install the tools

The repo pins Node and pnpm in `.mise.toml`, and [mise](https://mise.jdx.dev) installs
exactly those versions for you.

```bash
brew install mise        # macOS. Other platforms: https://mise.jdx.dev/getting-started.html
cd geekykey
mise install             # downloads the pinned Node and pnpm
mise tasks               # sanity check: lists the tasks used below
```

Optionally, add mise to your shell so plain `node` and `pnpm` pick up the pinned versions
everywhere. For zsh:

```bash
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
```

You can skip that step. Every command in this guide is written as `mise run <task>` or
`mise exec -- <command>`, which work without shell activation. See
[mise commands](#mise-commands) for how they differ.

mise is the only supported setup. Do not install pnpm through Corepack: this repo pins
pnpm 12, which ships as a native binary that Corepack cannot launch.

### 2. Install dependencies

```bash
mise run install
```

This installs every workspace package and can be run from any folder in the repo. The
first time, pnpm also runs install scripts for `esbuild`, which fetch a program for your
computer. That is expected, and they are approved in
`pnpm-workspace.yaml`. If pnpm ever prints "Ignored build scripts" instead, run
`mise exec -- pnpm approve-builds esbuild` once from the repo root and install again.

### 3. Start the dev server

```bash
mise run dev:event-web
```

Open [http://localhost:5173](http://localhost:5173). Edits under `apps/event-web/src`
reload in place.

### 4. Sign in

On its own, `mise run dev:event-web` runs the Event screens on mock data. Sign in with a
seeded account from the form on the login page. "Continue with Google" opens Google's real
sign-in, and the mock then signs you in as Alex Tan whoever you are. To sign in as yourself,
start the whole stack with `mise run dev` (see [With the Event screens](#with-the-event-screens)).

| Account | Role | What you get |
|---|---|---|
| Alex Tan | Participant | Dashboard, passport, activity |
| Priya Raman | Organiser | Stations, scan log, QR fallback, summary |

The mock session survives a reload but not a new tab. A station simulator keeps adding
taps in the background, so the scan log and station board change while you watch.

### Other commands

These work from any folder in the repo:

```bash
mise run test:event-web     # unit tests (Vitest)
mise run build:event-web    # typecheck, then production build to apps/event-web/dist
mise run format:event-web   # format the code in place (oxfmt)
```

For the rest, `cd apps/event-web` first. If your shell is activated, you can leave off
`mise exec --`.

```bash
mise exec -- pnpm typecheck        # tsc, no emit
mise exec -- pnpm lint             # eslint
mise exec -- pnpm format:check     # list files that are not formatted, without changing them
mise exec -- pnpm test:watch       # tests in watch mode
mise exec -- pnpm preview          # serve the production build locally
mise exec -- pnpm dlx shadcn@latest add <component>   # add a shadcn/ui component
```

### If something goes wrong

- **Blank page or the loading screen never goes away.** Open the browser console. If it
  shows an import error, run `mise run install` again; a dependency is probably missing after
  a pull.
- **Port 5173 is taken.** Stop the other process, or start Vite on another port with
  `mise run dev:event-web -- --port 5174`.
- **`node -v` or `pnpm -v` shows a different version than `.mise.toml`.** Your shell is
  not activated, which is fine as long as you use `mise run` or `mise exec --`. If you want
  the plain commands to match, do the `mise activate` step above and open a new terminal.
- **`pnpm add -D typescript` installed TypeScript 7.** Do not do that. The project pins
  `typescript@~6.0.3` because the lint toolchain does not support 7 yet. Run
  `mise run install` to restore the pinned version.
- **The shadcn CLI wrote files into a folder literally called `@`.** The solution
  `apps/event-web/tsconfig.json` must keep its `paths` entry; the CLI reads the alias from
  there. Delete the stray folder and rerun the command.

## mise commands

mise does two jobs in this repo. It installs the exact Node and pnpm versions pinned in
`.mise.toml`, and it gives the common commands short names that work from any folder in
the repo.

```bash
mise install                  # install the pinned tools; run it again after .mise.toml changes
mise tasks                    # list every task with its description
mise run <task>               # run a task
mise tasks info <task>        # show the command a task runs
mise exec -- <command>        # run any command with the pinned tools, e.g. mise exec -- node -v
```

### Every task

| Task | What it does |
|---|---|
| `install` | Install dependencies for every workspace package |
| `dev` | Both services and both sets of screens, on ports 8000, 8001, 5173 and 5174, with dev sign-in on and the Event screens calling the Event Service |
| `dev:event-web` | Event screens dev server on http://localhost:5173 |
| `test:event-web` | Event screens unit tests, run once |
| `build:event-web` | Typecheck the Event screens, then build them to `apps/event-web/dist` |
| `format:event-web` | Format the Event screens code in place with oxfmt |
| `dev:geekykey-web` | GeekyKey screens dev server on http://localhost:5174 |
| `test:geekykey-web` | GeekyKey screens unit tests, run once |
| `build:geekykey-web` | Typecheck the GeekyKey screens, then build them |
| `format:geekykey-web` | Format the GeekyKey screens code in place with oxfmt |
| `dev:event-service` | The Event Service on Node on http://localhost:8001, reloading when a file changes, with dev sign-in turned on |
| `test:event-service` | Event Service tests (Vitest on Node) against `geekykey_test`, run once |
| `format:event-service` | Format the Event Service code in place with oxfmt |
| `dev:geekykey-service` | The GeekyKey Service in `wrangler dev` on http://localhost:8000, with its settings from `apps/geekykey-service/dev.env`, where dev sign-in is turned on |
| `test:geekykey-service` | GeekyKey Service tests (Vitest inside workerd), run once. No database needed |
| `format:geekykey-service` | Format the GeekyKey Service code in place with oxfmt |
| `test:smoke` | Start both services on 8100 and 8101, then send a station's tap and heartbeat through the Worker and check `geekykey_test`. Needs `db:up` first |
| `db:up` | Start TiDB in Docker, then create and migrate `geekykey_dev` and `geekykey_test` |
| `db:reset` | Throw away all TiDB data, then start again with empty, migrated databases |
| `db:down` | Stop TiDB, keeping its data for the next `db:up` |
| `db:migrate` | Apply new migrations to both local databases |
| `seed` | Add a station and the two dev users to `geekykey_dev` |
| `dev:updates` | Updates site dev server on http://localhost:4321 |
| `build:updates` | Build the updates site to `apps/updates/dist` |

### Where a task's command comes from

Each task is a short name for a command that also works without mise. Most tasks go
through the root `package.json`. For example, `mise run dev:event-web` runs:

```text
pnpm dev:event-web                         root package.json
  → pnpm --filter @geekykey/event-web dev   runs the dev script inside apps/event-web
    → vite                                 apps/event-web/package.json
```

The backend tasks follow the same chain, ending in a script from
`apps/event-service/package.json`. For `mise run dev:event-service`, that script is
`node --watch scripts/dev-server.ts`, which reads `apps/event-service/dev.env`, where dev
sign-in is turned on.
`db:up`, `db:reset` and `db:down` are the exception: their commands are written out in the
root `package.json`, because they start and stop TiDB with `docker compose` and the root
`compose.yaml`.

### Passing arguments and settings

Anything after `--` is passed on to the command at the bottom of the chain:

```bash
mise run test:event-web -- format         # only test files with "format" in the name
mise run dev:event-web -- --port 5174      # Vite on another port
mise run seed -- --station "Booth 3"           # give the new station a name
```

To change one of the backend's settings for a single run, set it in front of the
command:

```bash
TAP_COOLDOWN_SECONDS=0 mise run dev:event-service
```

A setting in your shell wins over the backend's settings files. See [Settings](#settings).

### `mise run` or `mise exec`?

Use `mise run <task>` when there is a task for what you want. For anything else, such as
`pnpm lint` or `pnpm typecheck`, use `mise exec -- <command>`. Both put the pinned tools
on `PATH` for that one command. If you did the `mise activate` step, your shell already
does that, and you can leave off `mise exec --`.

### Adding a task

Put the real command in the app's `package.json` first, so it works without mise. Then add
a block to `.mise.toml` that calls it:

```toml
[tasks."lint:event-web"]
description = "Event web lint (eslint)"
run = "pnpm --filter @geekykey/event-web lint"
```

Add `dir = "apps/event-service"` if the command has to run from a particular folder.

## Running the backend

The backend is a Node server. In production, Google Cloud Run runs it from a container
image (see [The image](#the-image)). On your laptop, Node runs it straight from the
TypeScript in `apps/event-service/src`, and its database is TiDB in Docker.

Do steps 1 and 2 of [Running the Event screens](#running-the-event-screens) first.

### 1. Install Docker

On macOS, install [Docker Desktop](https://www.docker.com/products/docker-desktop/):

```bash
brew install --cask docker-desktop
```

Open Docker Desktop, accept its terms the first time, and wait until its whale icon in the
menu bar says it is running. `docker info` in a terminal prints an error until it is. On
Linux, Docker Engine with the Compose plugin works too.

Docker Desktop can use 4 GiB of memory while it runs. Quit it from the whale menu when you
are not working on the backend, and open it again before you next start.

### 2. Start the database

```bash
mise run db:up           # start TiDB in Docker, then set up its two databases
mise run seed            # a station and the two dev users
```

The first `db:up` downloads TiDB, which takes a few minutes. It is done when it prints
`geekykey_test is migrated`. The seed ends by printing a station key and a `curl` command
that sends a tap with it. Keep this terminal open: you need that command in step 4.

### 3. Start the backend

The backend is two services: the Event Service, which keeps the database, and the GeekyKey
Service, which stations call. Open a second terminal, `cd` into the repo, then:

```bash
mise run dev
```

That starts both services and both sets of screens, each line of output starting with the
folder it came from:

- the GeekyKey Service on http://localhost:8000, ready when it prints
  `Ready on http://0.0.0.0:8000`;
- the Event Service on http://localhost:8001, ready when it prints a line with
  `"message":"server_started"`;
- the Event screens on http://localhost:5173, calling the Event Service for what
  `apps/event-web/src/api/create-client.ts` lists (see [With the Event
  screens](#with-the-event-screens));
- the GeekyKey screens on http://localhost:5174, calling the GeekyKey Service for
  everything.

No settings file is needed. Each service turns dev sign-in on by itself and reads a committed
`dev.env`, which points the GeekyKey Service at the Event Service on 8001, with the keys the
Event Service uses locally. Leave `mise run dev` running: each service reloads when you save a
file under its `src`. To stop all four, press Ctrl-C. pnpm may print an error as it stops;
that is normal.

The Firebase sign-in needs the four `VITE_FIREBASE_*` variables, whose values are in
agreement 7.2. Each set of screens has a committed `.env.development` with them, so a fresh
clone can sign in with Google as soon as the stack is up. A variable in your shell wins over
the file, and so does your own `.env.local`. Without the four values the sign-in buttons are
disabled and the page says so, and the local development form signs in instead.

To start only one, use its own task in a terminal of its own: `mise run dev:event-service`,
`mise run dev:geekykey-service`, `mise run dev:event-web` or `mise run dev:geekykey-web`.

Each service signs its users in with a cookie of its own: `event_session` from the Event
Service and `gk_session` from the GeekyKey Service. Cookies on `localhost` ignore the port, so
the two names let you stay signed in on both sets of screens at once, as different users if
you like. Dev sign-in on the Event Service accepts only the seeded users, `dev-user-1` and
`dev-organizer-1`. On the GeekyKey Service it accepts any user ID, since that service keeps no
users, and `dev-organizer-1` is a GeekyKey admin there too.

A login link works locally too. Signed in on the GeekyKey Service, `POST /api/v1/login-links`
with `{"event_id": "showcase"}` answers an address on `http://localhost:5173`, and the Event
Service on 8001 accepts its link, since both start with the same stand-in Event Service key.
The link creates the user on the Event Service if they are new, so any user ID works.

### 4. Send a tap

Back in the first terminal, paste the whole `curl` command the seed printed, all four
lines. It goes to the GeekyKey Service on 8000, which hands the tap to the Event Service.
It should answer with something like:

```json
{"station_id":"...","results":[{"client_tap_id":"tap-1","status":"accepted"}]}
```

If nothing prints, the GeekyKey Service is not running: look for lines starting with
`apps/geekykey-service` in the second terminal. A `503` means it can't reach the Event
Service: look for lines starting with `apps/event-service`.

`accepted` means the tap is stored in `geekykey_dev`. Send the same command again and the
status is `duplicate`, because the station has already sent `tap-1`. Change `tap-1` to
`tap-2` and send it once more, and the status is `cooldown`, because Alex Tan's token was
accepted at this station less than 5 minutes ago. [Settings](#settings) shows how to turn
the cooldown off.

The station key is shown only once, because only its hash is stored. Each seed run adds
another station with a new key, so run it again whenever you need one, for example once per
ESP32:

```bash
mise run seed -- --station "Booth 3"
```

Each seeded station is in the passport, worth 1 point a tap. To add one that no game counts,
whose taps come back `no_game`, add `--outside-passport`:

```bash
mise run seed -- --station "Reader 9" --outside-passport
```

### The local database

TiDB runs in Docker, from the root `compose.yaml`, at the version GeeksHacking's cluster
runs. It holds two databases: `geekykey_dev` for the dev server and the seed, and
`geekykey_test` for the tests, so running the tests never wipes your data.

- **After pulling a new migration,** run `mise run db:migrate`.
- **After you quit Docker Desktop,** TiDB has stopped too. Run `mise run db:up` again once
  Docker Desktop is running. Your data is still there.
- **`mise run db:down`** stops TiDB and keeps the data.
- **To start over,** run `mise run db:reset`, then seed again.

### Settings

Every setting is an environment variable, read once when the backend starts.
`apps/event-service/src/config.ts` explains each one and gives its default. The one you are
most likely to change:

| Setting | Default | Why you would change it |
|---|---|---|
| `TAP_COOLDOWN_SECONDS` | `300` | Set it to `0` so repeat taps at the same station count while you test |

`mise run dev:event-service` reads them from three places. Each one wins over the one
before:

1. `apps/event-service/dev.env`, which is committed. It turns dev sign-in on and points the
   backend at `geekykey_dev`. Change it only for something everyone should get.
2. `apps/event-service/.env`, your own, which git ignores. Copy `.env.example` to start it,
   and put a setting there to keep it, such as `TAP_COOLDOWN_SECONDS=0`.
3. Your shell, for one run, as in
   [Passing arguments and settings](#passing-arguments-and-settings).

Never put a secret in `dev.env`. In production, Cloud Run sets the settings, and the
secrets come from Google's Secret Manager.

The port is the `PORT` setting, which `dev.env` sets to 8001, since the GeekyKey Service
holds 8000. The Event screens' dev server and the GeekyKey Service's `dev.env` expect
8001, so change them too if you move it. The backend listens on your whole network, not
only your laptop, because real stations call it by the laptop's name. So anyone on the
same Wi-Fi can reach it, dev sign-in included.

`dev.env` sets `DEV_AUTH_ENABLED=true`. That adds `POST /auth/dev-login`, which signs in a
seeded user without a real login, and gives the session secret, the claims stand-in's key
and the Event Service key built-in values, the same ones the GeekyKey Service's `dev.env`
sends. Never turn it on in production. Without it, the backend refuses to start unless
`SESSION_SECRET`, `CLAIMS_STAND_IN_KEY` and `EVENT_SERVICE_KEY` are set, each key as 64 hex
characters.

`FIREBASE_PROJECT_ID` is the Firebase project whose ID tokens `POST /auth/firebase` accepts,
`geekykey-b035a` in `dev.env` and on Cloud Run alike. The backend refuses to start without it,
with or without dev sign-in.

`ORGANIZERS` lists the user IDs who are organizers on the Event side, separated by commas.
Everyone else is a participant. The server reads it when it starts, so a change takes a
restart, or a deploy in production. Empty or unset means nobody. With dev sign-in on, an unset
list holds `dev-organizer-1`, so Priya Raman from the seed is an organizer.
It also refuses to start without `DATABASE_URL`, the database's `mysql://` address. It
connects over TLS, checking the database's certificate and name, unless the address is on
your laptop, such as `127.0.0.1`.

The GeekyKey Service's settings are in `apps/geekykey-service/wrangler.jsonc`, which is
deployed, and its secrets are set on the Worker. `mise run dev:geekykey-service` runs
`wrangler dev --env-file dev.env --var DEV_AUTH_ENABLED:true`, so locally
`apps/geekykey-service/dev.env` replaces both. It is committed and holds no real secret.
`DEV_AUTH_ENABLED=true` adds `POST /auth/dev-login` and takes `Secure` off the session cookie.
It never appears in `wrangler.jsonc`, since unset is off. A setting in your shell wins over `dev.env`, for one run, as in
`TAP_DEADLINE_MS=1000 mise run dev:geekykey-service`. `FIREBASE_PROJECT_ID`, `geekykey-b035a`,
is in `wrangler.jsonc`, the same as the Event Service's. `wrangler dev` takes from `dev.env` and
your shell only the secrets and the settings `wrangler.jsonc` already names, and the Worker
stops as it starts, naming the setting, if one is missing or malformed. `mise run dev` doesn't
read a `.dev.vars`.

### Other backend commands

These work from any folder in the repo:

```bash
mise run test:event-service     # tests, run once. TiDB must be up (mise run db:up)
mise run format:event-service   # format the code in place (oxfmt)
```

For the rest, `cd apps/event-service` first. If your shell is activated, you can leave off
`mise exec --`.

```bash
mise exec -- pnpm lint               # oxlint
mise exec -- pnpm format:check       # list files that are not formatted, without changing them
mise exec -- pnpm typecheck          # tsc
mise exec -- pnpm db:generate        # write a migration after editing a schema file
mise exec -- pnpm build              # bundle the server into dist/server.cjs, as the image does
mise exec -- pnpm build:image        # build the image Cloud Run runs (Docker Desktop must be running)
mise exec -- pnpm check:migrations   # fail if a schema file has a change with no migration
```

`db:generate` runs `drizzle-kit generate`, which writes the new migration into `drizzle/`.
Commit it, and run `mise run db:migrate` to apply it to both local databases. CI builds
the image and runs `check:migrations` on every pull request.

Three more set up GeeksHacking's production database: `db:logins`, `db:test-station` and
`db:migrate --production`. `db:logins --staging` does the same for staging's,
`geekykey_staging`. Only Adam runs them, since they need logins kept on his laptop.
The comment at the top of each script in `scripts/` says what it does.

### The image

Cloud Run runs the backend from a container image, which `apps/event-service/Dockerfile`
builds. Docker Desktop must be running. From `apps/event-service`:

```bash
mise exec -- pnpm build:image     # builds the image geekykey-event-service
```

To start it, give it the three settings it can't start without, as Cloud Run does:

```bash
docker run --rm --publish 8001:8000 \
  --env DATABASE_URL=mysql://geekykey:geekykey@127.0.0.1:4000/geekykey_dev \
  --env SESSION_SECRET=any-16-characters-or-more \
  --env CLAIMS_STAND_IN_KEY=$(openssl rand -hex 32) \
  geekykey-event-service
```

Then http://localhost:8001/api/health answers. Inside the container, `127.0.0.1` is the
container itself, not your laptop, so the routes that need the database fail. Ctrl-C
stops it.

### With the Event screens

`mise run dev` starts the Event screens with `VITE_LIVE_API=1`, and so does
`mise exec -- pnpm dev:live` from `apps/event-web`, which starts the Event screens
alone. That sends the methods listed in `apps/event-web/src/api/create-client.ts` to the
Event Service on port 8001 and keeps everything else on mock data. So far the list has
signing in (`devLogin` and `firebaseLogin`), signing out (`logout`) and `me`, which says
who is signed in and carries a participant's points, stamps and recent taps. So with the
backend running and seeded, you can sign in as Alex Tan or Priya Raman for real. The plan
for switching the rest over is in `apps/event-web/CLAUDE.md`, under "Wiring an endpoint to
the real backend".

### With the GeekyKey screens

`mise run dev` starts the GeekyKey screens with `VITE_LIVE_API=1` too, and
`mise exec -- pnpm dev:live` from `apps/geekykey-web` starts them alone. They send every
call to the GeekyKey Service on port 8000: signing in, `me`, the token lookup, claiming,
releasing and the login links. Sign in as `dev-organizer-1` to release someone else's
token, since the service's `dev.env` makes that user a GeekyKey admin. For the Firebase
sign-in, see the end of [3. Start the backend](#3-start-the-backend).

## Updates site

A public timeline of the project's progress, for our mentors. Each entry is a Markdown
file in `apps/updates/src/content/entries/`, and `apps/updates/CONTENT-MODEL.md` explains
what goes in one.

```bash
mise run dev:updates      # http://localhost:4321
mise run build:updates    # production build to apps/updates/dist
```

The build also checks every entry. It fails on an en or em dash, on a file name that does
not start with the entry's date, and on a leftover `TODO(` marker. Both tasks turn off
Astro's anonymous usage reporting.

## Station firmware

`firmware/geekykey_station` is an Arduino sketch for an ESP32-S3 with an RC522 NFC reader.
It is not part of the pnpm workspace and has no mise task; you build and flash it with the
Arduino tools. The wiring and the libraries it needs are in the comment at the top of
`geekykey_station.ino`.

To point a station at a backend running on your laptop:

1. Start the backend and seed a station for it, as in
   [Running the backend](#running-the-backend). Keep the printed key.
2. Copy `secrets.example.h` to `secrets.h` in the same folder. Fill in the Wi-Fi name and
   password, the server's full base URL, and the station key. `secrets.h` is gitignored,
   so it never reaches the repo.
3. Put the laptop and the station on the same network.

The server setting is a base URL: `http://your-laptop.local:8000` for a laptop, or
`https://key-api.geekshacking.com` for production. The setup mode changes it on a station
without a reflash. An `https://` URL is checked against
the root certificates in `ca_roots.h`; a plain `http://` URL is only sent to a host ending
in `.local`, since the station key must not cross a network unencrypted.

The station's side of the contract is `POST /api/v1/taps` in `apps/API-AGREEMENT.md`,
section 6.1.

## CI

`.github/workflows/ci.yml` runs on every pull request and every push to `main`, with the
same tool versions from `.mise.toml`. To run the same checks before you push, start from
the repo root:

```bash
# Event web job
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm --filter @geekykey/event-web lint
mise run test:event-web
mise run build:event-web

# GeekyKey screens job
mise exec -- pnpm --filter @geekykey/geekykey-web lint
mise run test:geekykey-web
mise run build:geekykey-web

# Dependency audit job
mise exec -- pnpm audit --audit-level=high

# GeekyKey Service job
mise exec -- pnpm --filter @geekykey/geekykey-service lint
mise exec -- pnpm --filter @geekykey/geekykey-service format:check
mise exec -- pnpm --filter @geekykey/geekykey-service typecheck     # writes its types from wrangler.jsonc first
mise run test:geekykey-service
mise exec -- pnpm --filter @geekykey/geekykey-service check:build   # wrangler deploy --dry-run

# Event Service job (Docker Desktop must be running)
mise exec -- pnpm --filter @geekykey/event-service lint
mise exec -- pnpm --filter @geekykey/event-service format:check
mise exec -- pnpm --filter @geekykey/event-service typecheck
mise exec -- pnpm --filter @geekykey/handoff lint                     # and the same four for the hand-off package
mise exec -- pnpm --filter @geekykey/handoff format:check
mise exec -- pnpm --filter @geekykey/handoff typecheck
mise exec -- pnpm --filter @geekykey/handoff test
mise exec -- pnpm --filter @geekykey/firebase-login lint              # and the same four for the Firebase login package
mise exec -- pnpm --filter @geekykey/firebase-login format:check
mise exec -- pnpm --filter @geekykey/firebase-login typecheck
mise exec -- pnpm --filter @geekykey/firebase-login test
mise exec -- pnpm --filter @geekykey/login-link lint                  # and the same four for the login link package
mise exec -- pnpm --filter @geekykey/login-link format:check
mise exec -- pnpm --filter @geekykey/login-link typecheck
mise exec -- pnpm --filter @geekykey/login-link test
mise run db:up
mise run test:event-service
mise exec -- pnpm --filter @geekykey/event-service build:image        # the image builds
docker run --detach --rm --name event-service --publish 8000:8000 \
  --env DATABASE_URL=mysql://geekykey:geekykey@127.0.0.1:4000/geekykey_test \
  --env SESSION_SECRET=ci-stand-in-not-a-secret \
  --env CLAIMS_STAND_IN_KEY=$(openssl rand -hex 32) \
  --env EVENT_SERVICE_KEY=$(openssl rand -hex 32) \
  --env FIREBASE_PROJECT_ID=geekykey-b035a \
  geekykey-event-service
curl --fail --retry 10 --retry-delay 1 --retry-all-errors http://localhost:8000/api/health   # and starts
docker stop event-service
mise exec -- pnpm --filter @geekykey/event-service check:migrations   # every schema change has its migration

# End-to-end smoke test job (Docker Desktop must be running)
mise run db:up
mise run test:smoke

# Updates site job
mise run build:updates
```

`--frozen-lockfile` fails instead of changing a lockfile. If it fails, `pnpm-lock.yaml` is
out of date: run `mise run install` and commit what changed.

When `check:migrations` fails, run it on your laptop. It usually writes the missing
migration into `apps/event-service/drizzle/`: look it over and commit it. If it writes
nothing, you probably renamed something, so run `mise exec -- pnpm db:generate` from
`apps/event-service` and answer its question about the rename.

## Deploying

Today we deploy two services, the Event Service and the GeekyKey Service, and a copy of the
Event Service for trying changes first. The screens are coming, at checkpoint 5 of the
migration spec (`.scratch/db-hosting/spec.md`, section 6):

| Part | Built from | Runs on | Address |
|---|---|---|---|
| `event-service` | `apps/event-service` | Google Cloud Run | `https://event-api.geekshacking.com`, behind Cloudflare's proxy, and its `run.app` address |
| `event-service-staging`, the staging copy | `apps/event-service` | Google Cloud Run | Its `run.app` address only, listed in `infra/README.md`, step 5 |
| `geekykey-service`, which stations call | `apps/geekykey-service` | A Cloudflare Worker, deployed by Workers Builds from `main` | `https://key-api.geekshacking.com` |
| `geekykey-web` and `event-web`, the two sets of screens, coming at checkpoint 5 | `apps/geekykey-web` and `apps/event-web` | Cloudflare Workers | `https://key.geekshacking.com` and `https://event.geekshacking.com` |

Both Cloud Run services are deployed by one GitHub workflow, `.github/workflows/deploy.yml`.
What it deploys with (which service, which settings, which secret versions) is in
`infra/`, and `infra/README.md` is the runbook of `gcloud` commands that set up everything
else by hand. There's no infrastructure as code yet: Julian asked on 8 Oct 2026 for the
setup to stay by hand while the architecture settles.

### Production

**Every push to `main` deploys `event-service`.** Since 18 Oct 2026 `main` is protected,
so the only push is a merged pull request, a docs change included, and anyone who can merge
one deploys. Nobody runs a deploy command. Each merge starts a run of the deploy workflow,
listed under Actions, then Deploy, which:

1. checks `apps/event-service`, with the same checks as CI, and stops there if one fails;
2. signs in to Google Cloud as production's deploy account, which only a run on `main` can
   use;
3. builds the image and pushes it to Artifact Registry;
4. migrates production's database, `geekykey`, with the migration login it reads from
   Secret Manager;
5. deploys the image to `event-service`, with the settings in
   `infra/production/settings.env` and the secret versions in
   `infra/production/deploy.env`, and sends all traffic to it.

A run takes about four minutes. Once it's green, the new version is answering at
`https://event-api.geekshacking.com`. Cloudflare answers that address and passes each
request on to Cloud Run (`infra/README.md`, step 9 says why it's set up that way).

The migration runs before the new version starts, so for a short while the version still
running meets the new tables. That's why every migration has to work with it (rule 2 below).

Production's logs are in Cloud Logging, which Adam and Ethan can read. They hold no keys or
cookies, but they do hold every request's full address, so a secret never goes in a URL.

On event days, the rehearsal (by Sat 7 Nov) and 17 to 18 Nov, one instance is kept running,
so no tap waits for one to start. Adam switches it on and off with the commands in
`infra/README.md`, under "The warm instance", first at the rehearsal. A deploy doesn't undo
it.

### Rolling back

Each deploy makes a new revision of the service: its image and settings as they were at
that deploy. The old revisions stay. If a deploy breaks production, Adam sends all traffic
back to the revision before, with `gcloud run services update-traffic` or from the Cloud
Run console. The commands are in `infra/README.md`, under "Rolling back". If Adam can't be
reached, Julian does it, as the project's owner.

Then revert the bad commit on `main`. The revert's deploy sends traffic back to the newest
revision by itself. Until the revert is on `main`, push nothing else: every push deploys,
and the bad commit would come back with it.

- **One revision back is safe,** because every migration works with the version before
  it, unless the bad deploy changed a secret's version.
- **Never roll back past a change of secret.** The older revision would use the older
  value, which may no longer work, or may be the one that leaked. If the bad deploy is the
  one that changed a secret, fix it forward instead: Adam adds a version that works, and a
  new pull request pins it.
- **The database is never rolled back.**

Rolling back was tried on staging on 12 Oct 2026. Moving the traffic took about 9 seconds,
and the first request after it took 6.5 seconds, while the old revision started an
instance. The rehearsal, by Sat 7 Nov, tries it on production.

### Staging

`event-service-staging` runs the same code as production, in the same Google Cloud
project, against its own database, `geekykey_staging`, on GeeksHacking's TiDB cluster. Its
two database logins can't touch production's database, `geekykey`. It has no domain of its
own and no warm instance, so the first request after a quiet spell can take two or three
seconds while an instance starts.

**What it's for.** Every merge to `main` goes live, so a change is tried on staging first
when it touches how the server starts, its settings, its Google Cloud setup or how it
reaches the database. Logs from staging show whether it works before production ever
runs it.

**Deploying it.** Adam deploys staging, and nobody else does unless he asks them to.
Anyone with write access to the repo could run the workflow, so that's a team rule, not a
lock: staging runs one branch at a time, and a branch's migrations stay in its database.
Nobody deploys from their laptop. Run the deploy workflow by hand, from any branch:

1. On GitHub, open Actions, then Deploy, then Run workflow.
2. Under "Use workflow from", pick your branch, and press Run workflow.

The run checks `apps/event-service` first,
with the same checks as CI, and stops there if one fails. Then it signs in to Google Cloud
as staging's deploy account, and:

1. builds the image from your branch and pushes it to Artifact Registry;
2. migrates `geekykey_staging`, with staging's migration login, which it reads from
   Secret Manager;
3. deploys that image to `event-service-staging`, with the settings in
   `infra/staging/settings.env` and the secret versions in `infra/staging/deploy.env`, as
   your branch has them.

Once it's green, `/api/health` on staging's address answers `200`. Staging keeps running
your branch until someone runs the workflow again. To see which branch is on it, look under
Actions, then Deploy, for the latest successful run that was started by hand, since
production's runs from `main` are listed there too. Each service deploys one run at a time:
a run started meanwhile waits, and a third replaces the one waiting.

Things to know:

- **The migration runs even if the deploy then fails.** `geekykey_staging` is never rolled
  back, so a migration tried there stays, even if its branch never merges. That is fine
  only because every migration has to work with the version still running.
- **A secret version that doesn't exist** fails the deploy step, with a red X on the run,
  and staging keeps answering from the version before. A version that starts but can't
  run, such as one missing `SESSION_SECRET`, never gets any traffic either.
- **Keep test runs small.** TiDB measures every query's work in Request Units, and
  GeeksHacking's cluster gets a free amount each month. Staging's queries use the same
  allowance as production's.
- **A test station.** Adam makes one in `geekykey_staging` from his laptop, with staging's
  migration login. From `apps/event-service`:

  ```bash
  mise exec -- pnpm db:test-station --production --env-file ~/.config/geekykey/tidb-staging-migration.env
  ```

  `--production` means GeeksHacking's cluster, and the login decides which database. It
  also adds a test participant holding one token. It prints the station key once, and the
  token's UID, so keep both outside the repo. The station is in the passport, so a claimed
  token's tap there is `accepted`. With `--outside-passport` it isn't, and the tap is
  `no_game`.
- **Its logs** are in Cloud Logging, which Adam and Ethan can read.

### Secrets

Secrets live in Google's Secret Manager. None is ever committed, kept in GitHub, or pasted
into a chat. Each Cloud Run service has two:

| Secret | Read by | What it is |
|---|---|---|
| `APP_SECRETS` | The service, when it starts | The four below, as one JSON object, which the server unpacks |
| `MIGRATION_DATABASE_URL` | The deploy workflow only, for `db:migrate` | The TiDB migration login, which can also change tables |

| Inside `APP_SECRETS` | What it is |
|---|---|
| `SESSION_SECRET` | A random value that signs the session cookie. Nobody keeps a copy |
| `DATABASE_URL` | The TiDB app login, which can read and write rows but not change tables |
| `EVENT_SERVICE_KEY` | A random key that the GeekyKey side's requests to the Event side carry. Nobody keeps a copy |
| `CLAIMS_STAND_IN_KEY` | A random key that the GeekyKey side's requests to the claims stand-in carry. Nobody keeps a copy |

The four share one secret because Secret Manager bills each stored version, and one each
made ten; this way the project stores four, inside the free allowance. Locally they're
four separate settings, and there's no `APP_SECRETS`.

Staging's are named `event-service-staging-…`, and production's `event-service-…`. Each
service runs as its own Google account, which can read only its own `APP_SECRETS`, and
each deploy account can read only its own service's migration login.

**Changing one** takes two steps:

1. A new version is added, keeping no copy, as `infra/README.md` says under "Changing a
   secret". For `APP_SECRETS` that means all four values: Julian, who can read it, keeps
   the other three as they are, or Adam makes all four new.
2. A pull request, reviewed before it merges, changes the version number in that
   service's `deploy.env`. The next
   deploy uses it. For staging's own secrets, that's the next run from the branch, so a
   new value can be tried there before it merges. Production's are only used once the
   change reaches `main`.

**GitHub holds no secret at all,** not even a key for Google Cloud. GitHub gives every
workflow run a signed token saying which repo and branch it came from, and Google trusts
it without a key (`infra/README.md`, step 6). Staging's deploy account accepts a run from
any branch of this repo, and can reach only staging: its service, its migration login and
the image repository. Production's accepts only runs on `main`.

### Where every credential lives

This says where each one is, never its value. Each is kept only where the table says.

| Credential | Lives in | Set by | If it leaks or is lost |
|---|---|---|---|
| TiDB root login | `~/.config/geekykey/tidb.env` on Adam's laptop. Never deployed | Julian gave it to Adam | Ask Julian |
| TiDB app logins, production's and staging's | Secret Manager, as `DATABASE_URL` in each service's `APP_SECRETS` | Adam makes each with `db:logins` and adds it from his laptop, keeping no copy | Adam gives it a new password, a new version of `APP_SECRETS` holds it, and a pull request pins the service to that |
| TiDB migration logins, production's and staging's | Secret Manager, as each service's `MIGRATION_DATABASE_URL`, and `~/.config/geekykey/` on Adam's laptop | Adam, with `db:logins` | Adam gives it a new password, and adds a new version |
| `SESSION_SECRET`, one per service | Secret Manager, in `APP_SECRETS` | Adam, as a random value nobody keeps | A new one signs everyone out of that service |
| `EVENT_SERVICE_KEY` and `CLAIMS_STAND_IN_KEY`, one of each per service | Secret Manager, in `APP_SECRETS`. Production's two are also Workers secrets on the GeekyKey Service | Adam, as random values nobody keeps. Julian copied production's two onto the Worker at checkpoint 4, since Adam's account can't read them | Set a new one on both sides, outside the event. Taps fail with `503` until both match, and stations resend them. `CLAIMS_STAND_IN_KEY` is deleted on both sides after the switch to the Portal |
| Station key | The station's gitignored `secrets.h`. The database keeps only its hash | Adam, with `db:test-station`, until organizers can make one on the station board (coming) | Tell Adam. Replacing a key while keeping the station's ID comes with the station board |
| Wi-Fi details | Each station's `secrets.h`, until the station's setup mode can store them (coming, HAR-14) | Zi Tao | Change the password, and put the new one on each station |
| Token write password | `firmware/token_writer/secrets.h` (gitignored), and Adam's copy outside the repo | Zi Tao | Without it, tokens can never be rewritten |
| Our database copies | Adam's laptop, outside the repo. Never GitHub, a workflow's files or a chat | Adam | They hold user IDs, names and who tapped where |

Still coming: the GeekyKey Service's own `SESSION_SECRET`, a Workers secret that Julian sets
at checkpoint 4 with the two keys; the GeeksHacking login's client secret,
which will live in Firebase's own settings once Qing Guan issues it; and the Portal's
client secret, after the showcase. The migration spec, section 5.2, has the full list.

### The team's rules

1. **Every push to `main` deploys.** Don't push anything to `main`, or merge anything into
   it, that you wouldn't want live in four minutes. From checkpoint 4, Cloudflare's Workers
   Builds deploys the Workers from `main` too.
2. **Every migration works with the version still running.** Add first, switch the code,
   drop later. To rename a column, say: add the new column, then change the code to use it,
   and drop the old one in a later deploy. The version still running never meets a table
   it doesn't understand.
3. **Staging first.** A change to how the server starts, its settings, its Google Cloud
   setup or how it reaches the database runs on `event-service-staging` before it merges.
4. **The freeze.** From Wed 11 Nov, a week before the showcase, only fixes merge to
   `apps/event-service`. The last merge of all is on Mon 16 Nov. From then until the
   showcase ends on Wed 18 Nov, nothing goes onto `main` except a fix Adam approves and
   announces in the team chat, so nothing deploys the night before. Every push migrates,
   so the freeze stops migrations too.
5. **Rolling back.** The Event Service is rolled back by revision, then the bad commit is
   reverted, as in [Rolling back](#rolling-back). A Worker, from checkpoint 4 for the
   GeekyKey Service and checkpoint 5 for the screens, is rolled back by reverting the
   commit on `main`, which Workers Builds deploys in a few minutes, or by Julian rolling
   back one version.
6. **The hand-off.** The two sides share `packages/handoff`, and from checkpoint 4 the two
   services do. A change to it must work with the other service's previous version,
   because from then on the two deploy separately.
7. **Copies.** Adam takes a copy of production's database before merging a migration, just
   before the test data is cleared, and at the end of the event day. The `db:backup`
   command that takes it is coming. Copies stay on his laptop, never in GitHub or a chat.
8. **On the event day,** only Adam changes data, with a fresh copy first and Ethan reading
   the query before it runs. A counting or display bug is fixed by rolling back, not by
   changing data.

## Where to read next

- `apps/API-AGREEMENT.md` is the contract every part of the system is built against. It
  wins over the migration spec, the older plans, and the code when they disagree.
- `apps/event-web/CLAUDE.md` is the working agreement for the Event screens: stack, layout,
  contract rules, and the definition of done for a screen.
- `apps/geekykey-web/CLAUDE.md` is the same for the GeekyKey screens.
- `docs/agents/` explains how work is tracked: the Linear workspace, the five triage labels,
  and where domain docs live.
- `apps/updates/CONTENT-MODEL.md` is the format for an updates entry.
- `CONTEXT.md` names the things GeekyKey deals with, such as the GeekyKey Service, tokens,
  claims and stations, and says which words to use for them.
- `docs/adr/` holds the decisions that would be hard to undo, one file each, with the
  options we turned down and why.
