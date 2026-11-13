# Operations

How GeekyKey is deployed, where its secrets live, how to recover from a bad deploy, and the team's
rules for the weeks around the showcase. The commands that set up Google Cloud and the Cloudflare
builds are in the runbook, [infra/README.md](../infra/README.md).

## What runs where

| Part | Built from | Runs on | Deployed by | Address |
|---|---|---|---|---|
| `event-service` | `apps/event-service` | Google Cloud Run | `.github/workflows/deploy.yml`, on every push to `main` | `https://event-api.geekshacking.com`, behind Cloudflare's proxy, and its `run.app` address |
| `event-service-staging` | `apps/event-service` | Google Cloud Run | The same workflow, run by hand from any branch | Its `run.app` address only (`infra/README.md`, step 5) |
| `geekykey-service` | `apps/geekykey-service` | Cloudflare Workers | Workers Builds, from `main` | `https://key-api.geekshacking.com` |
| `geekykey-service-staging` | `apps/geekykey-service`, the `staging` environment in `wrangler.jsonc` | Cloudflare Workers | By hand, `wrangler deploy --env staging`, on Adam's own account (BAC-182) | Its `workers.dev` address only |
| `geekykey-web` | `apps/geekykey-web` | Cloudflare Workers | Workers Builds, from `main` | `https://key.geekshacking.com` |
| `event-web` | `apps/event-web` | Cloudflare Workers | Workers Builds, from `main` | `https://event.geekshacking.com` |

The Workers live in GeeksHacking's Cloudflare account, which Julian runs. The team can't deploy
there, set a Worker's secrets or read its logs. The Event Service lives in a Google Cloud project of
our own, `geekykey-b035a`, on GeeksHacking's billing account. It is also our Firebase project. There
is no infrastructure as code yet: Julian asked on 8 Oct 2026 for the setup to stay by hand, written
down command by command in the runbook, while the architecture settles.

## Who can do what

| Job | Who today | Needs |
|---|---|---|
| Merge to `main`, which deploys everything | Anyone who can merge a pull request | Write access to the repo |
| Deploy staging | Adam, or someone he asks | Write access. A team rule, not a lock |
| Roll back the Event Service | Adam, or Julian as the project's owner | A role on the Google Cloud project |
| Roll back a Worker, read Worker logs, set Worker secrets | Julian | GeeksHacking's Cloudflare account |
| Read the Event Service's logs | Adam and Ethan | Logs Viewer on the project |
| Grant roles, read secret values | Julian | Owner on the project |
| Add secret versions, switch the warm instance | Adam | Editor on the project |
| Run `db:logins`, `db:test-station`, `db:backup`, `db:restore`, `db:clear-test-data` and `db:migrate --production` | Adam | The TiDB logins in `~/.config/geekykey/` on his laptop |

At handover, each of Adam's jobs needs a new owner with the same access. `db:logins` makes the
database's logins from the TiDB cluster's root login, which Julian gave Adam. So whoever takes over
can get the root login from Julian and give themselves new migration logins with it.

## Production

Every push to `main` deploys the Event Service. `main` is protected, so the only push is a merged
pull request, docs included. Each merge starts a run of the deploy workflow (Actions, then Deploy),
which:

1. checks `apps/event-service` with the same checks as CI, and stops if one fails;
2. signs in to Google Cloud as production's deploy account, which only a run on `main` can use;
3. builds the image and pushes it to Artifact Registry;
4. migrates production's database, `geekykey`, with the migration login from Secret Manager;
5. deploys the image to `event-service` with the settings in `infra/production/settings.env` and
   the secret versions in `infra/production/deploy.env`, and sends all traffic to it.

A run takes about four minutes. The migration runs before the new version starts, so the old
version briefly meets the new tables. That's why every migration has to work with the version
before it (rule 2 below).

The same merge makes Workers Builds rebuild and deploy each Worker whose watch paths it touched, in
a few minutes (`infra/README.md`, steps 12 and 13). Only Julian can see those builds.

Production's logs are in Cloud Logging. They hold no keys or cookies, but they do hold every
request's full address, so a secret never goes in a URL.

**The warm instance.** With no instance running, the first request waits 1.3 to 2.0 seconds for
one to start. During the team's tests, and from the morning of setup on Mon 16 Nov to the end of
the showcase on Tue 17 Nov, one instance is kept running. Adam switches it on and off with the
commands in `infra/README.md`, under "The warm instance". A deploy doesn't undo it.

## Rolling back

If a deploy breaks the Event Service, send all traffic back to the revision before, then revert the
bad commit on `main`. Until the revert is on `main`, merge nothing else, or the bad commit comes
back with it. Never roll back past a change of secret, and never roll back the database. The
commands, and the reasons for both limits, are in `infra/README.md`, under "Rolling back".

A Worker rolls back by reverting the commit on `main`, which Workers Builds deploys in a few
minutes, or by Julian rolling back one version in the dashboard.

## Staging

`event-service-staging` runs the same code as production, in the same project, against its own
database, `geekykey_staging`, on GeeksHacking's TiDB cluster. Its logins can't touch production's
database. It has no domain and no warm instance, so the first request after a quiet spell takes two
or three seconds.

`geekykey-service-staging` is the one staging copy of a Worker (BAC-182). It lives on Adam's own
Cloudflare account, not GeeksHacking's, so the team can deploy it and read its logs without Julian.
It holds its own Durable Objects and its own three secrets. Nothing deploys it on a merge: run
`wrangler deploy --env staging` from `apps/geekykey-service` on the branch to try, with the secrets
in a file given to `--secrets-file`. Its settings point it at `event-service-staging`, but the two
shared keys there sit in Secret Manager, which nobody on the team can read. So BAC-182 tried it
against a local Event Service behind a `cloudflared` quick tunnel, with keys made for the test and
`--var` overriding `EVENT_SERVICES` and `CLAIMS_STAND_IN_URL`. Pairing it with
`event-service-staging` needs new keys in staging's `APP_SECRETS` and `GEEKYKEY_SERVICE_URL` in
`infra/staging/settings.env`.

Try a change on staging first when it touches how the server starts, its settings, its Google Cloud
setup or how it reaches the database. Nobody deploys from their laptop. To deploy a branch:

1. On GitHub, open Actions, then Deploy, then Run workflow.
2. Under "Use workflow from", pick the branch, and press Run workflow.

The run checks the code, builds the image, migrates `geekykey_staging` and deploys with
`infra/staging/settings.env` and `infra/staging/deploy.env` as the branch has them. Once it's green,
`/api/health` on staging's address answers `200`. Staging keeps running that branch until someone
runs the workflow again. To see which branch it has, find the latest successful run started by hand
under Actions, then Deploy.

- **A migration tried on staging stays,** even if its branch never merges, because
  `geekykey_staging` is never rolled back.
- **A bad secret version** fails the deploy step, and staging keeps answering from the version
  before. A version that starts but can't run never gets traffic either.
- **Keep test runs small.** TiDB bills each query in Request Units, and staging and production
  share GeeksHacking's free monthly allowance.
- **A test station** in `geekykey_staging` comes from `db:test-station`, run from
  `apps/event-service` with staging's migration login:

  ```bash
  mise exec -- pnpm db:test-station --production --env-file ~/.config/geekykey/tidb-staging-migration.env
  ```

  `--production` means GeeksHacking's cluster, and the login decides which database. It also adds a
  test participant holding one token, and prints the station key once and the token's UID. Keep
  both outside the repo.

## Clearing an event's data

`db:clear-test-data` gives a session a clean start. A pair connects only once and a name stays
taken, so leftover data changes what the next session does. It runs on production on the evening
of Thu 12 Nov, before the team's session on Fri 13 Nov, and on the evening of Mon 16 Nov, before
the showcase.

First, check that every station shows 0 saved taps on the station board. A tap saved before the
clear and sent after it would be judged afresh. Then, from the Mac with the production login:

```bash
cd apps/event-service
mise exec -- pnpm db:clear-test-data --production --env-file ~/.config/geekykey/tidb-migration.env
```

The command copies the database to `~/.config/geekykey/copies`, prints each table's row count, and
asks you to type the database's name (`geekykey` on production) at a terminal. Any other answer, a
failed copy, or a change to the counts while you type stops it with nothing emptied. It then
empties the tables in one transaction and prints the counts again. If a table has rows by then,
something wrote after the clear, such as someone logging in, and the command names the table and
exits with an error.

| Empties | Keeps |
| --- | --- |
| Taps and claims | Stations and passport settings |
| Every game's records: answers, connection requests and connections | Token kinds |
| Group members, and whether allocation has started | The groups themselves |
| Users and their first kinds | The event's settings, such as the connection rule and the challenge |
| | Used login links, which expire by themselves |

`scripts/clear-lists.ts` holds the two lists. If they disagree with the database's tables, the
command stops before changing anything, so run it from an up-to-date `main`.

Afterwards everyone logs in again and claims their tokens again, and any name used before is free.
The GeekyKey screens' session reads no database, so someone still signed in there stays signed in
for up to 12 hours, and can reach the Event screens from there.

To put rows back from the clear's copy, use `db:restore` ([Copies and restores](#copies-and-restores)).
To try the clear first, use staging's env file. With no options it clears `geekykey_dev`.

## Copies and restores

`db:backup` writes every table, the claims stand-in's included, to one JSON file in
`~/.config/geekykey/copies` that only you can read, and prints each table's row count. It changes
nothing in the database. Take one before a migration merges and at the end of an event day
(rule 7). `db:clear-test-data` takes its own.

```bash
cd apps/event-service
mise exec -- pnpm db:backup --production --env-file ~/.config/geekykey/tidb-migration.env
```

`db:restore` puts the tables you name back as they are in a copy, and leaves every other table as
it is, so restoring `taps` doesn't undo the claims, key replacements or stations disabled since.
`--tables` takes the names `db:backup` prints, separated by commas.

```bash
mise exec -- pnpm db:restore ~/.config/geekykey/copies/<file>.json --tables taps \
  --production --env-file ~/.config/geekykey/tidb-migration.env
```

A restored table holds exactly the copy's rows afterwards. Rows written to it since the copy are
deleted, and rows changed since go back to how they were in the copy. The `tap_stored` log lines
hold every tap stored since, so lost taps can be rebuilt from them, with a tool written only if
it's ever needed.

Before it changes anything, the command takes a copy of the database as it is now, so you can undo
a restore by restoring from that copy. It shows each table's count now and in the copy, then asks
you to type the database's name at a terminal. It stops with nothing changed if:

- the name is wrong;
- the copy is of another database, or doesn't hold a table you named;
- the copy has a column the table no longer has, because a migration changed the table since;
- a row would point at one that isn't there, such as a tap at a station the copy doesn't hold.
  Restore the two tables together;
- a table's count changes while you type.

It restores the tables in one transaction and prints the counts again. If a count differs from the
copy's, something wrote to that table after the restore, and the command names the table and exits
with an error.

On an event day Ethan reads the command before it runs (rule 8). To try it first, use staging's env
file. With no options it restores into `geekykey_dev`. Checkpoint 8 needs one try on production
before the showcase, while the data is still test data: back up, restore, compare the counts.

## Secrets

Secrets live in Google's Secret Manager and in Cloudflare's Worker secrets. None is ever committed,
kept in GitHub or pasted into a chat. GitHub holds no secret at all, not even a key for Google
Cloud: Google trusts the signed token GitHub gives each workflow run (`infra/README.md`, step 6).
Staging's deploy account accepts a run from any branch and reaches only staging. Production's
accepts only runs on `main`.

Each Cloud Run service has two secrets:

| Secret | Read by | What it is |
|---|---|---|
| `APP_SECRETS` | The service, at start-up | Four values in one JSON object: `SESSION_SECRET`, `DATABASE_URL` (the app login, which can read and write rows but not change tables), `EVENT_SERVICE_KEY` and `CLAIMS_STAND_IN_KEY` |
| `MIGRATION_DATABASE_URL` | The deploy workflow only | The migration login, which can also change tables |

The four values share one secret because Secret Manager bills each stored version. Locally they are
four separate settings. Staging's secrets are named `event-service-staging-…` and production's
`event-service-…`. Each service runs as its own Google account, which reads only its own
`APP_SECRETS`.

To change a secret:

1. Add a new version, keeping no copy (`infra/README.md`, "Changing a secret"). For `APP_SECRETS`
   that means all four values: Julian, who can read it, keeps the other three, or all four are made
   new.
2. Change the version number in that service's `deploy.env` in a pull request. The next deploy uses
   it, so staging can try a new value from its branch before it merges.

The GeekyKey Service's secrets, `SESSION_SECRET`, `CLAIMS_STAND_IN_KEY` and
`EVENT_SERVICE_KEY_SHOWCASE`, are Worker secrets that Julian sets. The two keys must match the
Event Service's.

### Where every credential lives

Where each one is, never its value.

| Credential | Lives in | Set by | If it leaks or is lost |
|---|---|---|---|
| TiDB root login | `~/.config/geekykey/tidb.env` on Adam's laptop. Never deployed | Julian | Ask Julian |
| TiDB app logins | Secret Manager, as `DATABASE_URL` in each service's `APP_SECRETS` | `db:logins`, added without keeping a copy | Give it a new password, add a new `APP_SECRETS` version, pin it in a pull request |
| TiDB migration logins | Secret Manager, as `MIGRATION_DATABASE_URL`, and `~/.config/geekykey/` on Adam's laptop | `db:logins` | Give it a new password and add a new version |
| `SESSION_SECRET`, one per service | Secret Manager in `APP_SECRETS`, and a Worker secret | A random value nobody keeps | A new one signs everyone out of that service |
| `EVENT_SERVICE_KEY`, `CLAIMS_STAND_IN_KEY` | Secret Manager in `APP_SECRETS`, and Worker secrets on the GeekyKey Service | Random values nobody keeps. Julian copied production's onto the Worker | Set a new one on both sides, outside an event. Taps fail with `503` until both match, and stations resend them |
| Station keys | Each station's setup mode, or its gitignored `secrets.h`. The database keeps only a hash | An organizer, on the station board | Replace the key on the station board, and give the station the new one with the setup mode |
| Wi-Fi details | Each station's setup mode, or its `secrets.h` | Whoever sets up the station | Change the password, and set the new one on each station |
| Token write password | `firmware/token_writer/secrets.h` (gitignored), and Adam's copy outside the repo | Zi Tao | Without it, written tokens can never be rewritten |
| Database copies | `~/.config/geekykey/copies` on Adam's laptop. Never GitHub, a workflow or a chat | `db:backup`, `db:restore` and `db:clear-test-data` | They hold user IDs, names and who tapped where |

`CLAIMS_STAND_IN_KEY` is deleted on both sides after the switch to the Portal, and the Portal's
client secret is added then. The spec's section 5.2 has the full list.

## The team's rules

1. **Every merge to `main` deploys.** Merge nothing you wouldn't want live in four minutes.
2. **Every migration works with the version still running.** Add first, switch the code, drop
   later.
3. **Staging first** for a change to how the Event Service starts, its settings, its Google Cloud
   setup or how it reaches the database.
4. **The freeze.** The last merge is on Sun 15 Nov. From then until the showcase ends on Tue 17 Nov,
   nothing merges to `main` except a fix Adam approves and announces in the team chat, so nothing
   deploys or migrates on setup day or the night before.
5. **Rolling back** follows [Rolling back](#rolling-back): the revision first, then the revert.
6. **The hand-off.** A change to `packages/handoff` works with the other service's previous
   version, because the two deploy separately.
7. **Copies.** Adam copies production's database with `db:backup` before a migration merges and at
   the end of an event day. `db:clear-test-data` takes its own before a clear. Copies stay off
   GitHub and out of chats ([Copies and restores](#copies-and-restores)).
8. **On an event day,** only Adam changes data, with a fresh copy first and Ethan reading the query
   before it runs. A counting or display bug is fixed by rolling back, not by changing data.
