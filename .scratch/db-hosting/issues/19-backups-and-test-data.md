# How do we back up the database, recover it on event day, and clear the test data before the doors open?

Type: grilling
Status: resolved
Blocked by: none
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

A rollback swaps only a Worker's code, never the database ("How do deploys and secrets work?"). With one TiDB database, TiDB going down takes both services down ("How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?"). And with no staging, production is also where we test before the event.

- **Backups.** What does TiDB Cloud Starter back up, how often, and how far back? How is a backup restored: in place or into a new cluster, how long does it take, and who can do it? Do we also keep a copy of our own, for example before a risky migration or on the night before the event?
- **Recovery on event day.** If a migration or a bug damages data during the showcase, what do we do, who decides, and what is lost? Stations keep the taps they couldn't send, but a tap the Event Service accepted exists only in TiDB.
- **Clearing the test data.** Before the doors open, which tables are emptied (taps, stamps, per-event users?) and which are kept (stations with their keys and links, and claims in the `tokens` stand-in)? What clears them (a task, or a GitHub Actions workflow like "Migrate production"), who runs it and when, and how do we check it worked? What happens to the team's own test claims?

**Settled by "What does the GeekyKey Service need from the Portal's tag APIs?" (28 Sep):** the showcase's claims live in the `tokens` table, not the Portal, so they are event data to back up, and clearing the test data must not remove participants' real claims. The table keeps only current owners, with no history of released claims.

## Answer

Resolved 29 Sep 2026 by grilling with Adam.

**Decided**

- **We keep copies of our own.** Two tasks, `db:backup` and `db:restore`, written in TypeScript with `mysql2` and tested in CI against the Docker TiDB. Adam runs them from his laptop with the migration login, which he keeps in `~/.config/geekykey/` next to the root login as well as in GitHub's `production` environment. A copy is every GeekyKey table written to a file: about 3 MB for 300 participants tapping 40 times each, about 0.5 MB compressed, and near 10 MB even for 1,000 participants. It takes a few seconds over a direct connection, so it costs no Hyperdrive queries and only a sliver of TiDB's Request Units. Rejected: relying on TiDB's backup alone (see Facts), and TiDB's export, which needs the TiDB Cloud console or an API key from Julian.
- **Copies stay on Adam's laptop,** outside the repo, never in GitHub or a chat: they hold Portal user IDs, display names and who tapped where and when. Once the repo is public, a workflow's artifacts and logs can be read by anyone, so a copy can never be a workflow artifact.
- **When copies are taken:** before every "Migrate production" run, just before the test data is cleared, and at the end of the event day. The last one is the source for Joshua's A/B analysis and for "Copy claims to the Portal".
- **TiDB's own backup is the fallback for losing the whole cluster,** nothing more. No spending limit is asked for now; backup retention is looked at again with the decision on paying, due 11 Nov.
- **Event-day rules for touching data:**
  - The freeze covers "Migrate production" too: no migration runs on event day, and a fix that needs one waits until the event is over.
  - A counting or display bug is fixed by rolling back the Worker, not by changing data, since stamps and points are worked out from taps every time they're read.
  - Only Adam decides to change data during the event, with a repair query or a restore. He takes a fresh copy first, and Ethan reads the query before it runs. If Adam can't be reached, nobody changes data; Ethan can still roll back the screens.
  - If TiDB is down, nothing is restored. Stations keep their taps (`503` means keep and resend), and we wait.
- **The Event Service logs one line for every tap it stores:** station ID, `client_tap_id`, user ID, `tapped_at` and status, with no names and no token IDs. Workers Logs keeps it for 3 days, so taps lost to a restore can be rebuilt. The tool that replays the lines is written only if we ever need it. Accepted costs: one log event per tap against the free plan's 200,000 a day, and user IDs in logs that Ethan can read.
- **A restore works table by table,** for example `db:restore <file> --tables taps`, so putting back a copy from 10:00 at 14:00 doesn't also undo the claims, key replacements and link changes made in between. Lost taps come back from the log lines by inserting them again; the unique index on station and `client_tap_id` turns any repeat into a harmless replay.
- **If the whole cluster is lost:** Julian restores TiDB's latest daily backup into a new cluster, Adam creates the app and migration logins there and points the Hyperdrive config at it, then restores our own copy on top if it is newer. Probably under an hour. Stations keep their taps meanwhile, as many as their memory holds.
- **The restore is tried once on production before the event,** while the data is still test data: back up, restore, compare the counts.
- **Tokens are handed out and claimed at check-in on 18 Nov** (provisional: Adam, "still up to discussion"). So every claim before the doors open is a test claim, including the team's, and team members who play claim again at check-in like everyone else.
- **What the clear empties and keeps:**

  | Service | Table | |
  |---|---|---|
  | GeekyKey Service | `stations` (IDs, keys, labels, links, last seen) | kept |
  | GeekyKey Service | `tokens` stand-in | emptied |
  | Event Service | `taps` | emptied |
  | Event Service | per-event users | kept: names only, and a team member with an older session would otherwise lose their name in the export until they logged in again |
  | Event Service | the passport's station settings and lock rows | kept |

  The clear also moves every station's link start to the moment of the clear, so saved test taps a station sends later get `no_event` and can't land in the event. If some participants turn out to claim earlier, the fallback releases only the claims of the team's Portal user IDs instead of emptying `tokens`.
- **The clear runs the evening before, together with the freeze,** straight after the last merge. The morning setup check taps each station with an unclaimed token and expects "Unknown token": that proves the station's Wi-Fi, key, certificate and link and stores nothing. The organizers' station board shows any station missing passport settings. From the clear on, no test claims and no taps with claimed tokens. Rejected: clearing on the morning after a check with claimed tokens, which proves each station's whole path but has Adam changing data at the venue, on venue Wi-Fi, just before the doors open.
- **A `db:clear-test-data` task on Adam's laptop runs it** (provisional). It takes a copy itself, so the copy can't be skipped; prints the row counts; asks Adam to type the database name; clears; and prints the counts again, expecting 0 taps and 0 claims. The next morning, before check-in, the organizers' stats should still show 0 taps. The alternative: a manual GitHub Actions workflow like "Migrate production", which would record who ran it and when and wouldn't depend on Adam's laptop. It becomes worth it if copies get a private home, such as an R2 bucket or a copy encrypted to Adam's key. Adam: "the details can be sorted out later on".

**Facts** (checked 29 Sep 2026)

- TiDB Cloud Starter, free: one automatic backup a day, at a fixed time TiDB picks at random, kept for 1 day. With a spending limit above $0: kept up to 30 days, at a time you choose. No manual backups and no point-in-time restore on Starter. A restore always creates a new cluster and brings no logins or permissions across; it "typically completes within a few minutes". The docs don't say which roles can restore ([Backup and restore](https://docs.pingcap.com/tidbcloud/backup-and-restore-serverless/)).
- TiDB's export writes a consistent copy of chosen tables as SQL, CSV or Parquet, to a download kept 2 days or to S3, GCS, Azure or OSS, from the console or the `ticloud` CLI ([Export](https://docs.pingcap.com/tidbcloud/serverless-export/)).
- Workers Logs: 200,000 log events a day kept 3 days on the free plan; 20 million a month kept 7 days on Paid ([Workers Logs pricing](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)).
- Stamps and points are worked out from taps on every read (`apps/backend/src/services/me.ts`).

**Still to confirm:** that only Julian can use the TiDB Cloud console, and so restore TiDB's backup (assumed, not confirmed).

**Passed on**

- Trying the restore once before the event, as part of rehearsing the day: "How do we notice trouble on event day, and who watches?".
- `db:backup`, `db:restore` and `db:clear-test-data`, the log line per stored tap, the migration login on Adam's laptop, the freeze covering "Migrate production", and the evening clear with the morning checklist: "Write the migration spec".
- Deleting our copies along with the event's data: "After the event", still fog on the map.
- Backup retention and a TiDB spending limit: the decision on paying by 11 Nov, in the fog "Staying on the free plan".
