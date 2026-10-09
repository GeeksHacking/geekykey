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
│   ├── backend.yml             the backend's checks, which ci.yml and deploy.yml both run
│   └── deploy.yml              deploys the backend to Google Cloud Run: production from main, staging by hand
├── infra/                      the backend's Google Cloud setup: the runbook, and what deploy.yml deploys with
├── apps/
│   ├── API-AGREEMENT.md        the contract between the frontend, backend, and stations
│   ├── frontend/               Event screens for participants and organisers, port 5173
│   ├── geekykey-web/           GeekyKey screens: the token page, My tokens, admin. Port 5174
│   ├── backend/                the Node server that stations and the frontend call
│   └── updates/                progress timeline for our mentors
└── firmware/
    └── geekykey_station/       ESP32 reader station
```

| Folder | Stack | Start reading at |
|---|---|---|
| `apps/frontend` | React 19, Vite, TanStack Router and Query, Tailwind, shadcn/ui | `apps/frontend/CLAUDE.md` |
| `apps/geekykey-web` | React 19, Vite, TanStack Router and Query, Tailwind, shadcn/ui | `apps/geekykey-web/CLAUDE.md` |
| `apps/backend` | Hono on Node, on Google Cloud Run, Drizzle ORM, TiDB | `src/server.ts`, then `src/app.ts` and `src/routes/` |
| `apps/updates` | Astro, with one Markdown file per entry | `apps/updates/CONTENT-MODEL.md` |
| `firmware/geekykey_station` | Arduino sketch for an ESP32-S3 with an RC522 reader | The comment at the top of `geekykey_station.ino` |

`apps/geekykey-web` is a scaffold so far: one placeholder page, and no screens yet. The
two sets of screens are separate because they belong to separate services. See
`apps/API-AGREEMENT.md`.

`pnpm-workspace.yaml` also includes `packages/*`, for code shared between apps. There is
nothing there yet.

### How the pieces connect

```text
NFC token ──tap──▶ ESP32 station ──POST /api/v1/taps──▶ backend :8000 ──▶ TiDB :4000
                                                          ▲
browser ──▶ frontend :5173 ── /api and /auth ─────────────┘
```

The frontend's dev server forwards `/api` and `/auth` to the backend on port 8000, so the
browser only ever talks to one address. By default the frontend runs on mock data and never
calls the backend. Endpoints are switched over to the backend one at a time (see "With the
frontend" below).

### Inside the frontend

```text
apps/frontend/src/
├── routes/       one small file per URL; each says "this URL shows that screen"
├── features/     the screens, one folder per area: passport, stations, taps, ...
├── components/   pieces used by more than one feature; ui/ holds the shadcn/ui components
├── lib/          shared helpers: formatting, theme, who is signed in
└── api/          the only code that talks to the backend: types, mock client, http client
```

### Inside the backend

```text
apps/backend/
├── src/
│   ├── server.ts      the entry point: reads the settings, starts the server, stops it cleanly
│   ├── app.ts         every route mounted, given the settings and the database
│   ├── base-app.ts    what every response shares: never cached, errors as JSON, /api/health
│   ├── config.ts      every setting, with its default
│   ├── routes/        HTTP handlers, one file per area (auth, me, taps)
│   ├── services/      the logic behind the handlers (the tap pipeline, token lookup, /me)
│   ├── middleware/    session cookie and station key checks, and the no-caching header
│   ├── db/            Drizzle schema, the connection pool, and the migrator
│   └── lib/           small helpers (station keys, validation)
├── drizzle/           SQL migrations generated from src/db/schema.ts
├── scripts/           Node scripts for the dev server, the database tasks, the seed, and the migration check
├── test-support/      test setup, and a proxy that breaks database connections on purpose
├── Dockerfile         builds the image Cloud Run runs
├── dev.env            the settings `mise run dev:backend` starts with, committed
├── .env.example       a template for .env, your own local settings and secrets
└── vitest.config.ts   runs every test on Node, against TiDB in Docker
```

Each test sits next to the code it tests, as a `.test.ts` file.

The server keeps one pool of up to 10 connections to the database, shared by every
request (`src/db/pool.ts`). Cloud Run pauses the server between requests, so a
connection can die unnoticed. The pool closes connections left unused for a minute, and
checks one with a ping before reusing it after more than a second. A dead one is
replaced before the query is sent, so no query is ever sent twice.

The image holds one file. `pnpm build` uses Rolldown to bundle `src/server.ts` and
everything it imports into `dist/server.cjs`, and the `Dockerfile` runs that on Node 24.
See [The image](#the-image) to build and start it yourself.

## Running the frontend

The frontend currently runs against **mock data** shaped like the API agreement, so you
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
mise run dev:frontend
```

Open [http://localhost:5173](http://localhost:5173). Edits under `apps/frontend/src`
reload in place.

### 4. Sign in

The portal sign-in is not wired yet. Use a seeded account from the form on the login page:

| Account | Role | What you get |
|---|---|---|
| Alex Tan | Participant | Dashboard, passport, activity |
| Priya Raman | Organiser | Stations, scan log, QR fallback, summary |

The mock session survives a reload but not a new tab. A station simulator keeps adding
taps in the background, so the scan log and station board change while you watch.

### Other commands

These work from any folder in the repo:

```bash
mise run test:frontend     # unit tests (Vitest)
mise run build:frontend    # typecheck, then production build to apps/frontend/dist
mise run format:frontend   # format the code in place (oxfmt)
```

For the rest, `cd apps/frontend` first. If your shell is activated, you can leave off
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
  `mise run dev:frontend -- --port 5174`.
- **`node -v` or `pnpm -v` shows a different version than `.mise.toml`.** Your shell is
  not activated, which is fine as long as you use `mise run` or `mise exec --`. If you want
  the plain commands to match, do the `mise activate` step above and open a new terminal.
- **`pnpm add -D typescript` installed TypeScript 7.** Do not do that. The project pins
  `typescript@~6.0.3` because the lint toolchain does not support 7 yet. Run
  `mise run install` to restore the pinned version.
- **The shadcn CLI wrote files into a folder literally called `@`.** The solution
  `apps/frontend/tsconfig.json` must keep its `paths` entry; the CLI reads the alias from
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
| `dev:frontend` | Frontend dev server on http://localhost:5173 |
| `test:frontend` | Frontend unit tests, run once |
| `build:frontend` | Typecheck the frontend, then build it to `apps/frontend/dist` |
| `format:frontend` | Format the frontend code in place with oxfmt |
| `dev:geekykey-web` | GeekyKey screens dev server on http://localhost:5174 |
| `test:geekykey-web` | GeekyKey screens unit tests, run once |
| `build:geekykey-web` | Typecheck the GeekyKey screens, then build them |
| `format:geekykey-web` | Format the GeekyKey screens code in place with oxfmt |
| `dev:backend` | Backend on Node on http://localhost:8000, reloading when a file changes, with dev sign-in turned on |
| `test:backend` | Backend tests (Vitest on Node) against `geekykey_test`, run once |
| `format:backend` | Format the backend code in place with oxfmt |
| `db:up` | Start TiDB in Docker, then create and migrate `geekykey_dev` and `geekykey_test` |
| `db:reset` | Throw away all TiDB data, then start again with empty, migrated databases |
| `db:down` | Stop TiDB, keeping its data for the next `db:up` |
| `db:migrate` | Apply new migrations to both local databases |
| `seed` | Add a station and the two dev users to `geekykey_dev` |
| `dev:updates` | Updates site dev server on http://localhost:4321 |
| `build:updates` | Build the updates site to `apps/updates/dist` |

### Where a task's command comes from

Each task is a short name for a command that also works without mise. Most tasks go
through the root `package.json`. For example, `mise run dev:frontend` runs:

```text
pnpm dev:frontend                          root package.json
  → pnpm --filter @geekykey/frontend dev   runs the dev script inside apps/frontend
    → vite                                 apps/frontend/package.json
```

The backend tasks follow the same chain, ending in a script from
`apps/backend/package.json`. For `mise run dev:backend`, that script is
`node --watch scripts/dev-server.ts`, which reads `apps/backend/dev.env`, where dev
sign-in is turned on.
`db:up`, `db:reset` and `db:down` are the exception: their commands are written out in the
root `package.json`, because they start and stop TiDB with `docker compose` and the root
`compose.yaml`.

### Passing arguments and settings

Anything after `--` is passed on to the command at the bottom of the chain:

```bash
mise run test:frontend -- format               # only test files with "format" in the name
mise run dev:frontend -- --port 5174           # Vite on another port
mise run seed -- --station "Booth 3"           # give the new station a name
```

To change one of the backend's settings for a single run, set it in front of the
command:

```bash
TAP_COOLDOWN_SECONDS=0 mise run dev:backend
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
[tasks."lint:frontend"]
description = "Frontend lint (eslint)"
run = "pnpm --filter @geekykey/frontend lint"
```

Add `dir = "apps/backend"` if the command has to run from a particular folder.

## Running the backend

The backend is a Node server. In production, Google Cloud Run runs it from a container
image (see [The image](#the-image)). On your laptop, Node runs it straight from the
TypeScript in `apps/backend/src`, and its database is TiDB in Docker.

Do steps 1 and 2 of [Running the frontend](#running-the-frontend) first.

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

Open a second terminal, `cd` into the repo, then:

```bash
mise run dev:backend     # http://localhost:8000
```

It is ready when it prints `Listening on http://localhost:8000`. Leave it running: it
restarts when you save a file under `apps/backend/src`. To stop it, press Ctrl-C. pnpm may
print an error as it stops; that is normal.

### 4. Send a tap

Back in the first terminal, paste the whole `curl` command the seed printed, all four
lines. The backend should answer with something like:

```json
{"station_id":"...","results":[{"client_tap_id":"tap-1","status":"accepted"}]}
```

If nothing prints, the backend is not running: look at the second terminal.

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
`apps/backend/src/config.ts` explains each one and gives its default. The one you are most
likely to change:

| Setting | Default | Why you would change it |
|---|---|---|
| `TAP_COOLDOWN_SECONDS` | `300` | Set it to `0` so repeat taps at the same station count while you test |

`mise run dev:backend` reads them from three places. Each one wins over the one before:

1. `apps/backend/dev.env`, which is committed. It turns dev sign-in on and points the
   backend at `geekykey_dev`. Change it only for something everyone should get.
2. `apps/backend/.env`, your own, which git ignores. Copy `.env.example` to start it, and
   put a setting there to keep it, such as `TAP_COOLDOWN_SECONDS=0`.
3. Your shell, for one run, as in
   [Passing arguments and settings](#passing-arguments-and-settings).

Never put a secret in `dev.env`. In production, Cloud Run sets the settings, and the
secrets come from Google's Secret Manager.

The port is the `PORT` setting, 8000 unless set. The frontend's dev server and the
stations expect 8000, so change them too if you move it. The backend listens on your whole
network, not only your laptop, because real stations call it by the laptop's name. So
anyone on the same Wi-Fi can reach it, dev sign-in included.

`dev.env` sets `DEV_AUTH_ENABLED=true`. That adds `POST /auth/dev-login`, which signs in a
seeded user without the portal, and signs sessions with a built-in secret. Never turn it
on in production. Without it, the backend refuses to start unless `SESSION_SECRET` is set.
It also refuses to start without `DATABASE_URL`, the database's `mysql://` address. It
connects over TLS, checking the database's certificate and name, unless the address is on
your laptop, such as `127.0.0.1`.

### Other backend commands

These work from any folder in the repo:

```bash
mise run test:backend      # tests, run once. TiDB must be up (mise run db:up)
mise run format:backend    # format the code in place (oxfmt)
```

For the rest, `cd apps/backend` first. If your shell is activated, you can leave off
`mise exec --`.

```bash
mise exec -- pnpm lint               # oxlint
mise exec -- pnpm format:check       # list files that are not formatted, without changing them
mise exec -- pnpm typecheck          # tsc
mise exec -- pnpm db:generate        # write a migration after editing src/db/schema.ts
mise exec -- pnpm build              # bundle the server into dist/server.cjs, as the image does
mise exec -- pnpm build:image        # build the image Cloud Run runs (Docker Desktop must be running)
mise exec -- pnpm check:migrations   # fail if src/db/schema.ts has a change with no migration
```

`db:generate` runs `drizzle-kit generate`, which writes the new migration into `drizzle/`.
Commit it, and run `mise run db:migrate` to apply it to both local databases. CI builds
the image and runs `check:migrations` on every pull request.

Three more set up GeeksHacking's production database: `db:logins`, `db:test-station` and
`db:migrate --production`. Only Adam runs them, since they need logins kept on his laptop.
The comment at the top of each script in `scripts/` says what it does.

### The image

Cloud Run runs the backend from a container image, which `apps/backend/Dockerfile`
builds. Docker Desktop must be running. From `apps/backend`:

```bash
mise exec -- pnpm build:image     # builds the image geekykey-backend
```

To start it, give it the two settings it can't start without, as Cloud Run does:

```bash
docker run --rm --publish 8001:8000 \
  --env DATABASE_URL=mysql://geekykey:geekykey@127.0.0.1:4000/geekykey_dev \
  --env SESSION_SECRET=any-16-characters-or-more \
  geekykey-backend
```

Then http://localhost:8001/api/health answers. Inside the container, `127.0.0.1` is the
container itself, not your laptop, so the routes that need the database fail. Ctrl-C
stops it.

### With the frontend

`mise exec -- pnpm dev:live`, from `apps/frontend`, starts the frontend with
`VITE_LIVE_API=1`. That sends the methods listed in `apps/frontend/src/api/create-client.ts`
to the backend on port 8000 and keeps everything else on mock data. So far the list has
signing in and out (`devLogin` and `logout`) and `me`, which says who is signed in and
carries a participant's points, stamps and recent taps. So with the backend running and
seeded, you can sign in as Alex Tan or Priya Raman for real. The plan for switching the
rest over is in `apps/frontend/CLAUDE.md`, under "Wiring an endpoint to the real backend".

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
   password, your laptop's network name, and the station key. `secrets.h` is gitignored,
   so it never reaches the repo.
3. Put the laptop and the station on the same network.

The station's side of the contract is `POST /api/v1/taps` in `apps/API-AGREEMENT.md`,
section 6.1.

## CI

`.github/workflows/ci.yml` runs on every pull request and every push to `main`, with the
same tool versions from `.mise.toml`. To run the same checks before you push, start from
the repo root:

```bash
# Frontend job
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm --filter @geekykey/frontend lint
mise run test:frontend
mise run build:frontend

# GeekyKey screens job
mise exec -- pnpm --filter @geekykey/geekykey-web lint
mise run test:geekykey-web
mise run build:geekykey-web

# Dependency audit job
mise exec -- pnpm audit --audit-level=high

# Backend job (Docker Desktop must be running)
mise exec -- pnpm --filter @geekykey/backend lint
mise exec -- pnpm --filter @geekykey/backend format:check
mise exec -- pnpm --filter @geekykey/backend typecheck
mise run db:up
mise run test:backend
mise exec -- pnpm --filter @geekykey/backend build:image        # the image builds
docker run --detach --rm --name backend --publish 8000:8000 \
  --env DATABASE_URL=mysql://geekykey:geekykey@127.0.0.1:4000/geekykey_test \
  --env SESSION_SECRET=ci-stand-in-not-a-secret geekykey-backend
curl --fail --retry 10 --retry-delay 1 --retry-all-errors http://localhost:8000/api/health   # and starts
docker stop backend
mise exec -- pnpm --filter @geekykey/backend check:migrations   # every schema change has its migration

# Updates site job
mise run build:updates
```

`--frozen-lockfile` fails instead of changing a lockfile. If it fails, `pnpm-lock.yaml` is
out of date: run `mise run install` and commit what changed.

When `check:migrations` fails, run it on your laptop. It usually writes the missing
migration into `apps/backend/drizzle/`: look it over and commit it. If it writes nothing,
you probably renamed something, so run `mise exec -- pnpm db:generate` from `apps/backend`
and answer its question about the rename.

## Where to read next

- `apps/API-AGREEMENT.md` is the contract every part of the system is built against. It
  wins over the migration spec, the older plans, and the code when they disagree.
- `apps/frontend/CLAUDE.md` is the working agreement for the Event screens: stack, layout,
  contract rules, and the definition of done for a screen.
- `apps/geekykey-web/CLAUDE.md` is the same for the GeekyKey screens.
- `docs/agents/` explains how work is tracked: the Linear workspace, the five triage labels,
  and where domain docs live.
- `apps/updates/CONTENT-MODEL.md` is the format for an updates entry.
- `CONTEXT.md` names the things GeekyKey deals with, such as the GeekyKey Service, tokens,
  claims and stations, and says which words to use for them.
- `docs/adr/` holds the decisions that would be hard to undo, one file each, with the
  options we turned down and why.
