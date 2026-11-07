# Getting started

This takes a fresh laptop to the whole system running locally, with a tap sent through it. The
first part is enough to work on the Event screens, which can run on mock data with no backend.

## 1. Install the tools

The repo pins Node and pnpm in `.mise.toml`, and [mise](https://mise.jdx.dev) installs exactly
those versions.

```bash
brew install mise        # macOS. Other platforms: https://mise.jdx.dev/getting-started.html
cd geekykey
mise install             # downloads the pinned Node and pnpm
mise tasks               # lists the tasks used below
```

Every command in these docs is written as `mise run <task>` or `mise exec -- <command>`, which work
without changing your shell. To have plain `node` and `pnpm` use the pinned versions too, add mise
to your shell. For zsh:

```bash
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
```

mise is the only supported setup. Don't install pnpm through Corepack: this repo pins pnpm 12,
which is a native binary that Corepack can't launch.

## 2. Install dependencies

```bash
mise run install
```

This installs every package in the workspace, from any folder in the repo. The first time, pnpm
runs `esbuild`'s install script, which fetches a program for your computer. That is expected, and
`pnpm-workspace.yaml` approves it. If pnpm prints "Ignored build scripts" instead, run
`mise exec -- pnpm approve-builds esbuild` once from the repo root and install again.

## 3. The Event screens on mock data

```bash
mise run dev:event-web
```

Open http://localhost:5173. Edits under `apps/event-web/src` reload in place. Sign in with a seeded
account from the form on the login page:

| Account | Role | What you get |
|---|---|---|
| Alex Tan | Participant | Dashboard, passport, activity |
| Priya Raman | Organizer | Stations, groups, scan log, QR fallback, summary |

"Continue with Google" opens Google's real sign-in, and the mock then signs you in as Alex Tan
whoever you are. The mock session survives a reload but not a new tab. A station simulator keeps
adding taps, so the scan log and the station board change while you watch.

`mise run dev:geekykey-web` does the same for the GeekyKey screens, on port 5174.

## 4. Install Docker

The backend's database is TiDB, which runs in Docker on your laptop. On macOS, install
[Docker Desktop](https://www.docker.com/products/docker-desktop/):

```bash
brew install --cask docker-desktop
```

Open it, accept its terms the first time, and wait until its whale icon in the menu bar says it is
running. `docker info` prints an error until it is. On Linux, Docker Engine with the Compose plugin
works too.

Docker Desktop can use 4 GiB of memory. Quit it from the whale menu when you aren't working on the
backend.

## 5. Start the database

```bash
mise run db:up           # start TiDB, then create and migrate geekykey_dev and geekykey_test
mise run seed            # a station and the two dev users
```

The first `db:up` downloads TiDB, which takes a few minutes. It is done when it prints
`geekykey_test is migrated`. The seed ends by printing a station key and a `curl` command that
sends a tap with it. Keep this terminal open for step 7.

## 6. Start everything

In a second terminal:

```bash
mise run dev
```

That starts four processes, each line of output starting with the folder it came from:

| Port | What | Ready when it prints |
|---|---|---|
| 8000 | The GeekyKey Service, in `wrangler dev` | `Ready on http://0.0.0.0:8000` |
| 8001 | The Event Service, on Node | a line with `"message":"server_started"` |
| 5173 | The Event screens, calling the Event Service | Vite's address |
| 5174 | The GeekyKey screens, calling the GeekyKey Service | Vite's address |

No settings file is needed. Each service turns on dev sign-in and reads a committed `dev.env`,
which points the GeekyKey Service at the Event Service on 8001 with the keys the Event Service uses
locally. Each process reloads when you save a file under its `src`. Ctrl-C stops all four, and pnpm
may print an error as it stops, which is normal.

To start one on its own, use its task: `mise run dev:event-service`, `mise run dev:geekykey-service`,
`mise run dev:event-web` or `mise run dev:geekykey-web`.

### Signing in locally

Each service signs users in with its own cookie: `event_session` from the Event Service and
`gk_session` from the GeekyKey Service. So you can be signed in on both sets of screens at once, as
different users if you like.

- **Dev sign-in.** The local form on each login page. The Event Service accepts only the seeded
  users, `dev-user-1` (Alex Tan) and `dev-organizer-1` (Priya Raman). The GeekyKey Service keeps no
  users, so it accepts any user ID, and `dev-organizer-1` is a GeekyKey admin there.
- **Google.** Each set of screens has a committed `.env.development` with the three
  `VITE_FIREBASE_*` values, so "Continue with Google" works on a fresh clone. A variable in your
  shell or in your own `.env.local` wins over the file.
- **Login links.** Signed in on the GeekyKey screens, an event button opens the Event screens on
  5173 as the same user, as it does in production. The link creates the user on the Event Service
  if they are new.

## 7. Send a tap

Back in the first terminal, paste the whole `curl` command the seed printed. It goes to the
GeekyKey Service on 8000, which hands the tap to the Event Service. The answer looks like:

```json
{"station_id":"...","results":[{"client_tap_id":"tap-1","status":"accepted"}]}
```

- Nothing prints: the GeekyKey Service isn't running. Look for lines starting with
  `apps/geekykey-service` in the second terminal.
- A `503`: it can't reach the Event Service. Look for lines starting with `apps/event-service`.

`accepted` means the tap is stored in `geekykey_dev`. Send the same command again and the status is
`duplicate`, because the station already sent `tap-1`. Change `tap-1` to `tap-2` and the status is
`cooldown`, because Alex Tan's token was accepted at this station less than 5 minutes ago. To turn
the cooldown off, start the Event Service with `TAP_COOLDOWN_SECONDS=0`
([the Event Service's settings](../apps/event-service/README.md#settings)).

The seed shows the station key once, because only its hash is stored. Each run adds another
station with a new key, so run it again whenever you need one, for example once per ESP32:

```bash
mise run seed -- --station "Booth 3"
mise run seed -- --station "Reader 9" --outside-passport   # a station no game counts: taps are no_game
```

To point a real station at your laptop, see
[the firmware's server address](../firmware/README.md#the-server-address).

## mise tasks

mise installs the pinned tools and gives the common commands short names that work from any
folder in the repo.

```bash
mise tasks                    # every task, with its description
mise run <task>               # run a task
mise tasks info <task>        # the command a task runs
mise exec -- <command>        # any other command, with the pinned tools, e.g. mise exec -- pnpm lint
```

| Task | What it does |
|---|---|
| `install` | Install every package's dependencies |
| `dev` | Both services and both sets of screens, on 8000, 8001, 5173 and 5174 |
| `dev:<part>`, `test:<part>`, `format:<part>` | One part's dev server, tests or formatter. Parts: `event-web`, `geekykey-web`, `event-service`, `geekykey-service` (the Event Service's tests need `db:up`) |
| `build:event-web`, `build:geekykey-web` | Typecheck a set of screens, then build it |
| `test:smoke` | Both services on 8100 and 8101, then a station's tap and heartbeat through the Worker. Needs `db:up` |
| `db:up`, `db:migrate`, `db:down`, `db:reset`, `seed` | The local database ([the Event Service's README](../apps/event-service/README.md#the-database)) |
| `dev:updates`, `build:updates` | The updates site |

Anything after `--` goes to the command at the end of the chain, such as
`mise run test:event-web -- format` to run only test files with "format" in the name. A setting in
front of a task applies to that run: `TAP_COOLDOWN_SECONDS=0 mise run dev:event-service`.

Each task calls a script in the root `package.json`, which calls the app's own script, so every
task also works without mise. To add one, put the command in the app's `package.json` first, then
add a block to `.mise.toml`:

```toml
[tasks."lint:event-web"]
description = "Event web lint (oxlint)"
run = "pnpm --filter @geekykey/event-web lint"
```

## Before you push

CI (`.github/workflows/ci.yml`) runs on every pull request and every push to `main`, with the same
tool versions. It has one job per part: Event web, GeekyKey web, Setup page, GeekyKey Service,
Event Service, the end-to-end smoke test, the updates site and a dependency audit. Each part's
README lists its checks. The ones that catch most problems:

```bash
mise exec -- pnpm install --frozen-lockfile   # fails if pnpm-lock.yaml is out of date
mise exec -- pnpm check:dashes                 # no em or en dash in tracked Markdown
mise run test:<part>                           # the tests of each part you changed
```

If `--frozen-lockfile` fails, run `mise run install` and commit the changed `pnpm-lock.yaml`.

## If something goes wrong

- **Blank page, or the loading screen never goes away.** Open the browser console. An import error
  usually means a dependency is missing after a pull: run `mise run install` again.
- **A port is taken.** Stop the other process, or start Vite on another port with
  `mise run dev:event-web -- --port 5180`.
- **`node -v` or `pnpm -v` differs from `.mise.toml`.** Your shell isn't activated, which is fine as
  long as you use `mise run` or `mise exec --`.
- **`pnpm add -D typescript` installed TypeScript 7.** The project pins `typescript@~6.0.3`, and npm's
  `latest` tag is TypeScript 7. Run `mise run install` to restore the pinned version.
- **The shadcn CLI wrote files into a folder called `@`.** Each app's `tsconfig.json` must keep its
  `paths` entry, which the CLI reads the alias from. Delete the stray folder and rerun the command.
- **The backend can't reach the database after a restart.** Quitting Docker Desktop stops TiDB.
  Run `mise run db:up` again once Docker is running. Your data is still there.
