# Event Service

The Event Service runs one event's games and keeps the database. It is a Hono server on Node 24,
deployed to Google Cloud Run at `https://event-api.geekshacking.com`, with Drizzle ORM over TiDB.
This copy is the one for the Capstone Showcase.

Two kinds of caller reach it:

- **The Event screens** (`apps/event-web`), through `/api` and `/auth`, as participants and
  organizers.
- **The GeekyKey Service** (`apps/geekykey-service`), with a key, through two sets of routes:
  `/geekykey/v1` for taps, heartbeats, meetings and the registered stations, and `/claims-stand-in/v1`
  for who owns each token.

It has no station endpoints. A tap sent here straight from a station gets `404`. The routes and their
shapes are in [the API agreement](../API-AGREEMENT.md), sections 9 to 11.

Start a fresh laptop at [docs/getting-started.md](../../docs/getting-started.md). How it's
deployed is in [docs/operations.md](../../docs/operations.md), and the Google Cloud setup in
[infra/README.md](../../infra/README.md).

## Layout

```text
apps/event-service/
├── src/
│   ├── server.ts          the entry point: reads the settings, starts the server, stops it cleanly
│   ├── app.ts             mounts every route, given the settings and the database
│   ├── base-app.ts        what every response shares: no caching, errors as JSON, /api/health
│   ├── config.ts          every setting, with its default and what it does
│   ├── event/             the base every event gets (below)
│   ├── games/             one folder per game: passport/ and connections/
│   ├── showcase/          this event's own settings: which games run, and the questions
│   ├── claims-stand-in/   who owns each token, until the Portal can say
│   ├── db/                the connection pool, the migrator, shared column types
│   └── lib/               small helpers: validation, log lines, token UIDs, the key check
├── drizzle/               SQL migrations, generated from the schema files
├── scripts/               the dev server, the database tasks, the seed, the smoke test
├── test-support/          test setup, and a proxy that breaks database connections on purpose
├── Dockerfile             the image Cloud Run runs
├── dev.env                the settings for local runs, committed, with no real secret
├── .env.example           a template for .env, your own local settings
└── CODING_STANDARDS.md    how the code here is written
```

Each test sits next to the code it tests, as a `.test.ts` file.

## The areas

The server has two areas that share one process, one settings object and one database pool, and
never import each other.

**The Event side** is split in three, so that it can become a template for other events:

- `src/event/` is the base every event gets. It stores each tap, applies the cooldown, and asks
  the games on the tap's station for a status: `accepted` if any game counted it, otherwise
  `cooldown` if one held it back, otherwise `no_game`. It also has logins, login links, `/me`,
  stations and their keys, the station board, groups and allocation, the tap log, stats, the
  export, the map's data and the QR fallback.
- `src/games/` holds one folder per game, each behind the interface in `src/event/games.ts`.
  `passport/` gives stamps and points. `connections/` handles connection requests, the answers
  game's match, and the challenges (dice and the reaction test).
- `src/showcase/` holds this event's settings: which games run on which stations, and the
  questions.

The base imports neither `games/` nor `showcase/`. `src/app.ts` hands it the games the settings
name.

**The claims stand-in** (`src/claims-stand-in/`) keeps who owns each token, and each token's kind,
until the GeeksHacking Portal can. Only the GeekyKey Service calls it, with `CLAIMS_STAND_IN_KEY`.
It goes at the switch to the Portal, so token UIDs never reach the Event side.

The lint rule in `.oxlintrc.json` stops an import across these lines, and `src/areas.test.ts`
checks the rule.

## The database

One TiDB database holds both areas' tables. Each area keeps its tables in its own `schema.ts`, and
no foreign key crosses between them. Drizzle writes one set of migrations from all of them.

| Area | Tables |
|---|---|
| `src/event/schema.ts` | `users`, `user_kinds`, `stations`, `passport_stations`, `taps`, `used_login_links`, `participant_groups`, `group_members`, `group_allocation`, `event_settings` |
| `src/games/connections/schema.ts` | `answers`, `meeting_halves`, `connections` |
| `src/claims-stand-in/schema.ts` | `tokens`, `token_kinds` |

Locally, TiDB runs in Docker from the root `compose.yaml`, at the version GeeksHacking's cluster
runs. It holds `geekykey_dev` for the dev server and the seed, and `geekykey_test` for the tests,
so running the tests never wipes your data.

| Task | What it does |
|---|---|
| `mise run db:up` | Start TiDB, then create and migrate both databases. Run it again after quitting Docker Desktop |
| `mise run db:migrate` | Apply new migrations to both databases, after a pull |
| `mise run db:down` | Stop TiDB and keep its data |
| `mise run db:reset` | Throw away all data and start with empty, migrated databases. Seed again after |
| `mise run seed` | Add a station and the two dev users to `geekykey_dev`. `-- --station "Name"` names it, `--outside-passport` leaves it out of the passport |

### Changing a table

1. Edit the area's `schema.ts`.
2. From `apps/event-service`, run `mise exec -- pnpm db:generate`, which writes a migration into
   `drizzle/`. Commit it.
3. Run `mise run db:migrate` to apply it locally.

Every migration must work with the version still running, because production migrates before the
new version starts. Add first, switch the code, drop later: to rename a column, add the new one,
move the code to it, and drop the old one in a later deploy.

CI runs `check:migrations`, which fails when a schema change has no migration. When it fails, run
it locally. It usually writes the missing migration: look it over and commit it. If it writes
nothing, you probably renamed something, so run `db:generate` and answer its question about the
rename.

## Settings

Every setting is an environment variable, read once at start-up. `src/config.ts` explains each one
and gives its default. Locally, `mise run dev:event-service` reads them from three places, each
winning over the one before:

1. `dev.env`, committed. It turns dev sign-in on and points at `geekykey_dev`. Change it only for
   something everyone should get, and never put a secret in it.
2. `.env`, your own, which git ignores. Copy `.env.example` to start it.
3. Your shell, for one run: `TAP_COOLDOWN_SECONDS=0 mise run dev:event-service`.

In production, `infra/production/settings.env` sets the settings and Secret Manager holds the
secrets ([docs/operations.md](../../docs/operations.md#secrets)).

| Setting | What it is |
|---|---|
| `DATABASE_URL` | The database's `mysql://` address. Required. It connects over TLS, checking the certificate and name, unless the host is on your laptop |
| `SESSION_SECRET`, `CLAIMS_STAND_IN_KEY`, `EVENT_SERVICE_KEY` | Required unless dev sign-in is on, which gives them built-in values. Each key is 64 hex characters |
| `FIREBASE_PROJECT_ID` | The Firebase project whose ID tokens `POST /auth/firebase` accepts: `geekykey-b035a`. Always required |
| `DEV_AUTH_ENABLED` | `true` adds `POST /auth/dev-login`, which signs in a seeded user without a real login. Never on in production |
| `ORGANIZERS` | User IDs who are organizers, separated by commas. Everyone else is a participant. With dev sign-in on, unset means `dev-organizer-1` |
| `MAP_SCREENS` | User IDs that may read the map and nothing else an organizer can, for the screen at the booth |
| `TAP_COOLDOWN_SECONDS` | `300`. Set it to `0` so repeat taps count while you test |
| `PORT` | `8001` in `dev.env`, since the GeekyKey Service holds 8000. The Event screens' dev server and the GeekyKey Service's `dev.env` expect 8001 |

The server reads `ORGANIZERS` and `MAP_SCREENS` at start-up, so a change takes a restart, or a
deploy in production. Locally the server listens on your whole network, not only `localhost`, so
anyone on the same Wi-Fi can reach it, dev sign-in included. Stations don't call it: point a
station at the GeekyKey Service on port 8000.

## How it behaves in production

**Logs.** Every line is one JSON object whose `message` is a fixed name, such as `server_started`
or `internal_error`, from the list in `src/lib/log.ts`. Cloud Logging shows that name as the
headline and takes its `severity`. A line never holds a key, a cookie or a name. An
`internal_error` keeps the error's class, code and where it was thrown, but not its message, which
can hold a query's values. An uncaught error, such as a missing setting at start-up, stops the
server with one `fatal_error` line instead of Node's own report, which would print a
`DATABASE_URL` with its password.

**The pool.** One pool of up to 10 connections, shared by every request (`src/db/pool.ts`). Cloud
Run pauses the server between requests, so a connection can die unnoticed. The pool closes
connections unused for a minute, and pings one before reusing it after more than a second. A dead
one is replaced before the query is sent, so no query is ever sent twice.

**The image.** `pnpm build` uses Rolldown to bundle `src/server.ts` and everything it imports into
one file, `dist/server.cjs`, and the `Dockerfile` runs it on Node 24. To build and start it
yourself, with Docker running, from `apps/event-service`:

```bash
mise exec -- pnpm build:image
docker run --rm --publish 8001:8000 \
  --env DATABASE_URL=mysql://geekykey:geekykey@127.0.0.1:4000/geekykey_dev \
  --env SESSION_SECRET=any-16-characters-or-more \
  --env CLAIMS_STAND_IN_KEY=$(openssl rand -hex 32) \
  --env EVENT_SERVICE_KEY=$(openssl rand -hex 32) \
  --env FIREBASE_PROJECT_ID=geekykey-b035a \
  geekykey-event-service
```

Then http://localhost:8001/api/health answers. Inside the container `127.0.0.1` is the container
itself, so routes that need the database fail.

## Commands

From any folder:

```bash
mise run dev:event-service      # the server on 8001, reloading on save, with dev sign-in on
mise run test:event-service     # every test, once, against geekykey_test. Needs db:up
mise run test:smoke             # both services on 8100 and 8101, then a tap and a heartbeat through them
mise run format:event-service   # format in place (oxfmt)
```

Test runs take turns across checkouts, since they share `geekykey_test`. Failed tests are listed in
`test-results/failures.log`.

From `apps/event-service`:

```bash
mise exec -- pnpm lint               # oxlint
mise exec -- pnpm format:check       # list unformatted files without changing them
mise exec -- pnpm typecheck          # tsc
mise exec -- pnpm db:generate        # write a migration after a schema change
mise exec -- pnpm check:migrations   # fail if a schema change has no migration
mise exec -- pnpm build              # bundle into dist/server.cjs
mise exec -- pnpm build:image        # the image Cloud Run runs
mise exec -- pnpm db:token-kinds     # load a token writer's log into geekykey_dev
```

Three scripts run against GeeksHacking's cluster with a login kept outside the repo: `db:logins`
(makes the database logins), `db:test-station` (a station and a test participant), and
`db:migrate --production`. `db:clear-test-data` empties an event's data before a session
([docs/operations.md](../../docs/operations.md#clearing-an-events-data)). The comment at the top
of each script in `scripts/` says what it does and which options it takes.

CI's Event Service job (`.github/workflows/event-service.yml`) runs the lint, format, type and
test checks here and in the three `packages/`, builds and starts the image, and runs
`check:migrations`. The deploy workflow runs the same job first.
