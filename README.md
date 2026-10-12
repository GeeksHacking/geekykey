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
│   ├── geekykey-web/           GeekyKey screens: the token page and My tokens. Port 5174
│   ├── backend/                the Node server that stations and the frontend call
│   └── updates/                progress timeline for our mentors
└── firmware/
    └── geekykey_station/       ESP32 reader station
```

| Folder | Stack | Start reading at |
|---|---|---|
| `apps/frontend` | React 19, Vite, TanStack Router and Query, Tailwind, shadcn/ui | `apps/frontend/CLAUDE.md` |
| `apps/geekykey-web` | React 19, Vite, TanStack Router and Query, Tailwind, shadcn/ui | `apps/geekykey-web/CLAUDE.md` |
| `apps/backend` | Hono on Node, on Google Cloud Run, Drizzle ORM, TiDB | `src/server.ts`, then `src/app.ts` and its three areas |
| `apps/updates` | Astro, with one Markdown file per entry | `apps/updates/CONTENT-MODEL.md` |
| `firmware/geekykey_station` | Arduino sketch for an ESP32-S3 with an RC522 reader | The comment at the top of `geekykey_station.ino` |

`apps/geekykey-web` is a shell so far: logging in and out, and a placeholder My tokens page,
all on mock data. The two sets of screens are separate because they belong to separate
services. See `apps/API-AGREEMENT.md`.

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
│   ├── server.ts          the entry point: reads the settings, starts the server, stops it cleanly
│   ├── app.ts             every route mounted, given the settings and the database
│   ├── base-app.ts        what every response shares: never cached, errors as JSON, /api/health
│   ├── config.ts          every setting, with its default
│   ├── geekykey/          the GeekyKey side: the station routes and the station key check
│   ├── event/             the Event side: the tap pipeline, /me, logging in and out, the session,
│   │                      and its tables (stations, users, taps) in schema.ts
│   ├── claims-stand-in/   who owns each token until the Portal does: today's token lookup,
│   │                      and its table (tokens) in schema.ts
│   ├── db/                the connection pool, the migrator, and the column types both schemas share
│   └── lib/               small helpers every area uses (validation, the no-caching header, log lines)
├── drizzle/           SQL migrations generated from the two schema files, for the one database
├── scripts/           Node scripts for the dev server, the database tasks, the seed, and the migration check
├── test-support/      test setup, and a proxy that breaks database connections on purpose
├── Dockerfile         builds the image Cloud Run runs
├── dev.env            the settings `mise run dev:backend` starts with, committed
├── .env.example       a template for .env, your own local settings and secrets
└── vitest.config.ts   runs every test on Node, against TiDB in Docker
```

Each test sits next to the code it tests, as a `.test.ts` file.

The three folders under `src/` follow the line between the two services the backend
becomes at checkpoint 4: the GeekyKey side becomes a Worker, while the Event side and the
claims stand-in stay on Cloud Run. Until then the three share one server, its settings and
its database pool, which sit beside them. The Event side and the stand-in each keep their
tables in a schema file of their own, and the GeekyKey side has none. Drizzle writes one
set of migrations from both files, since it's one database, and no foreign key crosses
between them.

Three places still reach across the areas, and the rest of checkpoint 3 replaces each with
the request it will send once the services run apart. The station route reads the Event
side's `stations` to check a key, looks up owners in the stand-in's `tokens`, and calls the
tap pipeline itself. The tap pipeline takes the stand-in's token lookup. And `/me` lists the
user's tokens from `tokens`.

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

The real login, through Firebase, isn't wired yet (checkpoint 5 of the migration spec). Use a
seeded account from the form on the login page:

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

It is ready when it prints a line with `"message":"server_started"`. Leave it running: it
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
seeded user without a real login, and signs sessions with a built-in secret. Never turn it
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
   password, the server's full base URL, and the station key. `secrets.h` is gitignored,
   so it never reaches the repo.
3. Put the laptop and the station on the same network.

The server setting is a base URL: `http://your-laptop.local:8000` for a laptop, or
`https://event-api.geekshacking.com` for production. An `https://` URL is checked against
the root certificates in `ca_roots.h`; a plain `http://` URL is only sent to a host ending
in `.local`, since the station key must not cross a network unencrypted.

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

## Deploying

Today we deploy one service, the Event Service, and a copy of it for trying changes
first. The rest are coming, at the checkpoints of the migration spec
(`.scratch/db-hosting/spec.md`, section 6), its steps from today's one server to the
showcase:

| Part | Built from | Runs on | Address |
|---|---|---|---|
| `event-service` | `apps/backend` | Google Cloud Run | `https://event-api.geekshacking.com`, behind Cloudflare's proxy, and its `run.app` address |
| `event-service-staging`, the staging copy | `apps/backend` | Google Cloud Run | Its `run.app` address only, listed in `infra/README.md`, step 5 |
| `geekykey-service`, coming at checkpoint 4 | `apps/geekykey-service` | A Cloudflare Worker | `https://key-api.geekshacking.com` |
| `geekykey-web` and `event-web`, the two sets of screens, coming at checkpoint 5 | `apps/geekykey-web` and `apps/event-web` (today's `apps/frontend`) | Cloudflare Workers | `https://key.geekshacking.com` and `https://event.geekshacking.com` |

Both Cloud Run services are deployed by one GitHub workflow, `.github/workflows/deploy.yml`.
What it deploys with (which service, which settings, which secret versions) is in
`infra/`, and `infra/README.md` is the runbook of `gcloud` commands that set up everything
else by hand. There's no infrastructure as code yet: Julian asked on 8 Oct 2026 for the
setup to stay by hand while the architecture settles.

### Production

**Every push to `main` deploys `event-service`.** That's any push: a merged pull request, or
a commit pushed straight to `main`, a docs change included. `main` isn't protected, so
anyone who can push to it deploys. Nobody runs a deploy command. Each push starts a run of
the deploy workflow, listed under Actions, then Deploy, which:

1. checks `apps/backend`, with the same checks as CI, and stops there if one fails;
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

The run checks `apps/backend` first,
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
  migration login. From `apps/backend`:

  ```bash
  mise exec -- pnpm db:test-station --production --env-file ~/.config/geekykey/tidb-staging-migration.env
  ```

  `--production` means GeeksHacking's cluster, and the login decides which database. It
  also adds a test participant holding one token. It prints the station key once, and the
  token's UID, so keep both outside the repo.
- **Its logs** are in Cloud Logging, which Adam and Ethan can read.

### Secrets

Secrets live in Google's Secret Manager. None is ever committed, kept in GitHub, or pasted
into a chat. Each Cloud Run service has five:

| Secret | Read by | What it is |
|---|---|---|
| `SESSION_SECRET` | The service, when it starts | A random value that signs the session cookie. Nobody keeps a copy |
| `DATABASE_URL` | The service, when it starts | The TiDB app login, which can read and write rows but not change tables |
| `MIGRATION_DATABASE_URL` | The deploy workflow only, for `db:migrate` | The TiDB migration login, which can also change tables |
| `EVENT_SERVICE_KEY` | The service, when it starts | A random key that the GeekyKey side's requests to the Event side carry. Nobody keeps a copy |
| `CLAIMS_STAND_IN_KEY` | The service, when it starts | A random key that the GeekyKey side's requests to the claims stand-in carry. Nobody keeps a copy |

Staging's are named `event-service-staging-…`, and production's `event-service-…`. Each
service runs as its own Google account, which can read only its own four, and each deploy
account can read only its own service's migration login.

**Changing one** takes two steps:

1. Adam adds the new value as a new version, from his laptop, keeping no copy, as
   `infra/README.md` says under "Changing a secret".
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
| TiDB app logins, production's and staging's | Secret Manager, as each service's `DATABASE_URL` | Adam makes each with `db:logins` and adds it from his laptop, keeping no copy | Adam gives it a new password, adds a new version, and a pull request pins the service to it |
| TiDB migration logins, production's and staging's | Secret Manager, as each service's `MIGRATION_DATABASE_URL`, and `~/.config/geekykey/` on Adam's laptop | Adam, with `db:logins` | Adam gives it a new password, and adds a new version |
| `SESSION_SECRET`, one per service | Secret Manager | Adam, as a random value nobody keeps | A new one signs everyone out of that service |
| `EVENT_SERVICE_KEY` and `CLAIMS_STAND_IN_KEY`, one of each per service | Secret Manager. From checkpoint 4, production's two are also Workers secrets on the GeekyKey Service | Adam, as random values nobody keeps. At checkpoint 4 he reads production's two once, for Julian to set | Set a new one on both sides, outside the event. Taps fail with `503` until both match, and stations resend them |
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
   `apps/backend`. The last merge of all is on Mon 16 Nov. From then until the showcase ends on
   Wed 18 Nov, nothing goes onto `main` except a fix Adam approves and announces in the
   team chat, so nothing deploys the night before. Every push migrates, so the freeze
   stops migrations too.
5. **Rolling back.** The Event Service is rolled back by revision, then the bad commit is
   reverted, as in [Rolling back](#rolling-back). A Worker, from checkpoint 4 for the
   GeekyKey Service and checkpoint 5 for the screens, is rolled back by reverting the
   commit on `main`, which Workers Builds deploys in a few minutes, or by Julian rolling
   back one version.
6. **The hand-off.** From checkpoint 4, the two services share `packages/handoff`, which
   doesn't exist yet. A change to it must work with the other service's previous version,
   because the two deploy separately.
7. **Copies.** Adam takes a copy of production's database before merging a migration, just
   before the test data is cleared, and at the end of the event day. The `db:backup`
   command that takes it is coming. Copies stay on his laptop, never in GitHub or a chat.
8. **On the event day,** only Adam changes data, with a fresh copy first and Ethan reading
   the query before it runs. A counting or display bug is fixed by rolling back, not by
   changing data.

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
