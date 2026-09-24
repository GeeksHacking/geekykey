# GeekyKey

NFC stamp-collection system for hackathons. Participants tap a physical token at ESP32
reader stations, collect stamps and points, and see them on a mobile web dashboard.
Organisers watch the event from a console.

## Repo layout

This is a pnpm monorepo. The web apps live under `apps/`. The station firmware lives under
`firmware/` because it is an Arduino sketch, not a JavaScript package.

```text
geekykey/
├── .mise.toml                  pinned Node, pnpm, and Deno versions, plus the task shortcuts
├── package.json                root scripts that the mise tasks call
├── pnpm-workspace.yaml         which folders are packages, and the supply-chain rules
├── pnpm-lock.yaml
├── .github/workflows/ci.yml    lint, test, build, and audit on every push and pull request
├── apps/
│   ├── API-AGREEMENT.md        the contract between the frontend, backend, and stations
│   ├── frontend/               web app for participants and organisers
│   ├── backend/                event service and database
│   └── updates/                progress timeline for our mentors
└── firmware/
    └── geekykey_station/       ESP32 reader station
```

| Folder | Stack | Start reading at |
|---|---|---|
| `apps/frontend` | React 19, Vite, TanStack Router and Query, Tailwind, shadcn/ui | `apps/frontend/CLAUDE.md` |
| `apps/backend` | Hono on Deno, Drizzle ORM, SQLite (libSQL) | `src/index.ts`, then `src/app.ts` |
| `apps/updates` | Astro, with one Markdown file per entry | `apps/updates/CONTENT-MODEL.md` |
| `firmware/geekykey_station` | Arduino sketch for an ESP32-S3 with an RC522 reader | The comment at the top of `geekykey_station.ino` |

`pnpm-workspace.yaml` also includes `packages/*`, for code shared between apps. There is
nothing there yet.

### How the pieces connect

```text
NFC token ──tap──▶ ESP32 station ──POST /api/v1/taps──▶ backend :8000 ──▶ SQLite
                                                          ▲
browser ──▶ frontend :5173 ── /api and /auth ─────────────┘
```

The frontend's dev server forwards `/api` and `/auth` to the backend on port 8000, so the
browser only ever talks to one address. The frontend does not use that yet: it runs on
mock data until each endpoint is switched over (see "With the frontend" below).

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
│   ├── index.ts       starts the server: read settings, open the database, migrate, serve
│   ├── app.ts         builds the Hono app and mounts the routes
│   ├── config.ts      every environment variable, with its default
│   ├── routes/        HTTP handlers, one file per area (auth, taps)
│   ├── services/      the logic behind the handlers (the tap pipeline, token lookup)
│   ├── middleware/    session cookie and station key checks
│   ├── db/            Drizzle schema, database client, and the migrator
│   └── lib/           small helpers (station keys, validation)
├── drizzle/           SQL migrations generated from src/db/schema.ts
├── scripts/seed.ts    dev data: a station, Alex Tan, and Priya Raman
└── data/              the local SQLite file (gitignored)
```

## Running the frontend

The frontend currently runs against **mock data** shaped like the API agreement, so you
do not need the backend, Deno, or a database to work on it.

### 1. Install the tools

The repo pins Node, pnpm, and Deno in `.mise.toml`, and [mise](https://mise.jdx.dev)
installs exactly those versions for you.

```bash
brew install mise        # macOS. Other platforms: https://mise.jdx.dev/getting-started.html
cd geekykey
mise install             # downloads the pinned Node, pnpm, and Deno
mise tasks               # sanity check: lists the tasks used below
```

Optionally, add mise to your shell so plain `node`, `pnpm`, and `deno` pick up the
pinned versions everywhere. For zsh:

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

This installs every workspace package and can be run from any folder in the repo. You
should see pnpm run an install script for `esbuild`; that is expected and already approved
in `pnpm-workspace.yaml`. If pnpm ever prints "Ignored build scripts" instead, run
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
| Alex Tan | Participant | Dashboard, passport, activity, token pairing |
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

mise does two jobs in this repo. It installs the exact Node, pnpm, and Deno versions
pinned in `.mise.toml`, and it gives the common commands short names that work from any
folder in the repo.

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
| `dev:backend` | Backend on http://localhost:8000, restarting when a file changes, with dev sign-in turned on |
| `test:backend` | Backend tests |
| `seed:backend` | Add a station and the two dev users to the local database |
| `deps:backend` | Update `apps/backend/deno.lock` after backend dependencies change |
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

The backend tasks end one step further down, in a `deno task` from
`apps/backend/deno.json`. That file is where the Deno permission flags and
`DEV_AUTH_ENABLED=true` are set.

### Passing arguments and settings

Anything after `--` is passed on to the command at the bottom of the chain:

```bash
mise run test:frontend -- format               # only test files with "format" in the name
mise run dev:frontend -- --port 5174           # Vite on another port
mise run seed:backend -- --station "Booth 3"   # give the new station a name
```

Environment variables set in front of `mise run` reach the command too:

```bash
TAP_COOLDOWN_SECONDS=0 mise run dev:backend
```

### `mise run` or `mise exec`?

Use `mise run <task>` when there is a task for what you want. For anything else, such as
`pnpm lint` or `deno task check`, use `mise exec -- <command>`. Both put the pinned tools
on `PATH` for that one command. If you did the `mise activate` step, your shell already
does that, and you can leave off `mise exec --`.

### Adding a task

Put the real command in the app's `package.json` or `deno.json` first, so it works
without mise. Then add a block to `.mise.toml` that calls it:

```toml
[tasks."lint:frontend"]
description = "Frontend lint (eslint)"
run = "pnpm --filter @geekykey/frontend lint"
```

Add `dir = "apps/backend"` if the command has to run from a particular folder, as the
`deno task` ones do.

## Running the backend

Do steps 1 and 2 of [Running the frontend](#running-the-frontend) first. The same
`mise install` gives you Deno.

```bash
mise run seed:backend    # once: creates the database, a station, and the two dev users
mise run dev:backend     # http://localhost:8000
```

The seed prints a station key and a `curl` command that sends a tap. Paste the command
into a second terminal to see the tap endpoint answer. The key is shown only once, because
only its hash is stored. Each seed run adds another station with a new key, so run it
again whenever you need one, for example once per ESP32:

```bash
mise run seed:backend -- --station "Booth 3"
```

The database is a SQLite file at `apps/backend/data/geekykey.db`. Migrations run every
time the server starts. To start over, stop the server, delete `apps/backend/data`, and
seed again.

### Settings

Every setting is an environment variable, listed with its default in
`apps/backend/src/config.ts`. The ones you are most likely to change:

| Variable | Default | Why you would change it |
|---|---|---|
| `TAP_COOLDOWN_SECONDS` | `300` | Set it to `0` so repeat taps at the same station count while you test |
| `PORT` | `8000` | Something else is using 8000. The frontend's dev server and the stations also expect 8000, so change them to match |
| `DATABASE_URL` | `file:./data/geekykey.db` | Use a different SQLite file, or a `libsql://` URL for a hosted database |

`mise run dev:backend` sets `DEV_AUTH_ENABLED=true`. That adds `POST /auth/dev-login`,
which signs in a seeded user without the portal, and signs sessions with a built-in
secret. Never turn it on in production. Without it, the server refuses to start unless
`SESSION_SECRET` is set.

### Other backend commands

`cd apps/backend` first:

```bash
mise exec -- deno task check          # typecheck, as CI does
mise exec -- deno task db:generate    # write a new migration after editing src/db/schema.ts
```

### Changing backend dependencies

Backend dependencies are listed in `apps/backend/package.json` but resolved twice: by pnpm
into `pnpm-lock.yaml`, and by Deno into `apps/backend/deno.lock`. After adding or
upgrading one, run both and commit both lockfiles. CI fails if they disagree.

```bash
mise run install
mise run deps:backend
```

### With the frontend

`mise exec -- pnpm dev:live`, from `apps/frontend`, starts the frontend with
`VITE_LIVE_API=1`. That sends the methods listed in `apps/frontend/src/api/create-client.ts`
to the backend on port 8000 and keeps everything else on mock data. No real endpoint is on
that list yet. The plan for switching them over is in `apps/frontend/CLAUDE.md`, under
"Wiring an endpoint to the real backend".

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

# Dependency audit job
mise exec -- pnpm audit --audit-level=high

# Backend job
cd apps/backend
mise exec -- deno install --frozen-lockfile   # deno.lock matches package.json
mise exec -- deno task check
mise run test:backend
```

`--frozen-lockfile` fails instead of changing a lockfile. If it fails, a lockfile is out of
date: run `mise run install`, plus `mise run deps:backend` if it was `deno.lock`, and
commit what changed.

## Where to read next

- `apps/frontend/CLAUDE.md` is the working agreement for the frontend: stack, layout,
  contract rules, and the definition of done for a screen.
- `apps/API-AGREEMENT.md` is the contract every part of the system is built against.
- `apps/updates/CONTENT-MODEL.md` is the format for an updates entry.
