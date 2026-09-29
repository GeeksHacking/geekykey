# How is the database set up?

Type: grilling
Status: resolved
Blocked by: 01, 02, 04, 12
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

How do our services use TiDB Cloud Starter? Which service's data lives there comes from "Which parts of today's backend belong to the GeekyKey Service, and which to the Event Service?". This covers:

- **The connection.** Does the Worker use the TiDB serverless driver or Hyperdrive? Weigh the cost of opening a connection on a tap, and whether future features need interactive transactions.
- **The schema.** How to handle the CHECK constraints (turn on TiDB's setting, use `ENUM` columns, or validate in the app), which column types timestamps use, and how `taps.id` ordering works.
- **Access.** Create a `geekykey` database and a limited login instead of deploying with the root login. Does each service get its own login, allowed only its own tables?
- **Migrations.** Where and when they run, since a Worker cannot read migration files at startup.
- **Tokens, for now.** TiDB holds event data, not the long-lived mapping from tokens to users, which will live in the Portal. Julian allows GeekyKey to keep its `tokens` table in TiDB until the Portal's tag APIs exist (27 Sep, from "Which hostnames, and which OAuth redirect URLs?").

**Settled by "Which parts of today's backend belong to the GeekyKey Service, and which to the Event Service?" (28 Sep):** one TiDB database for now holds both services' tables, each table belonging to one service, and neither service's code reads the other's. The Event Service keys users by the Portal's user ID. The cooldown's per-station lock (today's `#oneAtATime`) moves to the Event Service, and on several Worker instances it needs a database lock such as `SELECT ... FOR UPDATE` inside a transaction, which bears on the choice of connection.

## Answer

Resolved 28 Sep 2026 by grilling with Adam, then a write test on a throwaway database in the cluster: [assets/tidb-write-test.md](../assets/tidb-write-test.md).

**A fact that changed.** "What does running the backend on Workers involve?" found TiDB missing from Hyperdrive's supported list. Hyperdrive's MySQL support became generally available on 7 Aug 2026, and Cloudflare's docs now say it connects to "any MySQL database". TiDB is still not named. Hyperdrive is on the free plan with 100,000 queries a day, and unlimited on the paid plan.

**Decided**

- **The Workers reach TiDB through Hyperdrive, with `mysql2` under Drizzle.** Drizzle stays the ORM, through its `drizzle-orm/mysql2` adapter; `mysql2` is the driver beneath it. Hyperdrive keeps connections to TiDB open, so a tap does not pay to open one, and transactions are ordinary rather than experimental. The deciding reason is that the same driver runs in the Worker, on a laptop and in CI against a local TiDB or MySQL, so the tests exercise what production runs. Hyperdrive's query cache is turned off, so polls never see stale taps. Hyperdrive cannot run MySQL prepared statements, but Drizzle's adapter sends ordinary queries and transactions through `mysql2`'s `query()`, which does not use them. **Provisional** until a deployed Worker reaches TiDB through Hyperdrive, the first checkpoint of the migration. The fallback is TiDB's serverless driver.
- **The cooldown's per-station lock is a database lock.** Each ingest runs in one short transaction that first locks the station's row with `SELECT ... FOR UPDATE`, then reads, decides and writes. Before the split the row is in `stations`; after it, the Event Service keeps one row for each station that feeds it. This replaces `#oneAtATime`, which only orders requests inside one copy of the Worker, and costs about three more round trips per request. Hyperdrive holds one connection for a whole transaction, so nothing slow happens inside it. A Durable Object per station would also work, but only by keeping today's in-memory queue inside it, because a Durable Object lets other requests in while it waits on an outside database. The lock keeps the guarantee next to the data, needs no new Cloudflare feature, and keeps transactions in use, which trading will need.
- **Fixed sets of values are `ENUM` columns:** the role, the tap source and the tap status, built from the lists already in the schema. The `check()` calls go, because TiDB ignores them while its CHECK setting is off, and that setting is cluster-wide on GeeksHacking's cluster, so we leave it alone. Adding a value later is a one-line migration.
- **Timestamps stay ISO strings in `VARCHAR(24)`,** as today, with a comment in the schema saying why. The code, the sort order and the API's output do not change, which suits moving first and splitting second. The app sets default times, since the database cannot. The A/B analysis reads the CSV export, so it loses nothing.
- **The taps table uses `AUTO_ID_CACHE 1`,** so a newer tap always has a higher `id` and the admin tap log's `before_id` cursor and live feed stay in time order. By default TiDB only promises rising ids within one server. Drizzle cannot declare this, so it is added to the migration by hand.
- **One `geekykey` database with two logins,** each carrying the cluster's prefix. The app login can only read and write rows in `geekykey` and is shared by both Workers for now. The migration login can also change tables and is used only when migrations run. The root login creates them once and is never deployed. A login per service waits until the GeekyKey Service's tables move out; until then the split keeps the services apart in code, each Worker importing only its own schema.
- **Migrations run through a `db:migrate` task,** with Drizzle's `mysql2` migrator and the migration login, from a laptop or CI and never inside a Worker. They run before the Worker code that needs them is deployed, and every migration must work with the Worker version still running: add a column before the code uses it, and drop one only after the code stops. The two SQLite migrations are deleted and one fresh MySQL migration starts the history again, since no data carries over.
- **No foreign key crosses between the two services' tables, or points at the Portal.** User ID columns hold the Portal's user ID with no foreign key, including the `tokens` stand-in's `user_id` and the Event Service's `taps.user_id`, so a tap by someone who has never logged in can still be stored. Station IDs in the Event Service's tables do not point at the GeekyKey Service's `stations`. Foreign keys inside one service stay as they are.

**Checked by the write test**

- Strict mode is on, so an `ENUM` column rejects an unknown value.
- Starter keeps `AUTO_ID_CACHE 1`. Ids rose in order with and without it, which probably means all three test connections reached one TiDB server, so the test cannot show the problem the setting prevents. The setting stays.
- `SELECT ... FOR UPDATE` works: a second connection waited 1,529 ms for a lock held about 1,500 ms.
- A replay with a no-op `ON DUPLICATE KEY UPDATE` raises no error and leaves the stored row alone. `INSERT IGNORE` stored an empty string for an unknown `ENUM` value with only a warning. So `onConflictDoNothing()` becomes the no-op update, never `.ignore()`.

**What follows without a further decision**

- From "Does TiDB fit this backend?": `sqliteTable` becomes `mysqlTable`, keys and indexed columns become `VARCHAR(n)`, and `.get()` becomes `.limit(1)`. Strings compare as they do today (`utf8mb4_bin`).
- The `tokens` stand-in stays among the GeekyKey Service's tables behind `TokenResolver`, as "Which parts of today's backend belong to the GeekyKey Service, and which to the Event Service?" decided.
- With `mysql2`'s default settings a replay and a new row both report one affected row, so code must not use the insert's result to spot replays. Today's code reads first, so nothing changes.

**Passed on**

- Tests and local dev using `mysql2` against a local TiDB or MySQL, and `AUTO_ID_CACHE`, which MySQL does not know: "How do local dev, tests and CI get a runtime and a database?".
- Who creates the Hyperdrive config in each environment, where the two logins are kept, whether CI runs `db:migrate` before deploying, and which plan: "How do deploys and secrets work?". On the free plan, Hyperdrive's 100,000 queries a day last roughly 55 hours of passports left open. That's 55 participants for one hour, since the passport polls `/me` every 10 seconds at about five queries a poll. The paid plan removes the limit.
- Creating the database and the two logins with the root login as a one-off, the Hyperdrive proof as the first checkpoint, and the hand-edited `AUTO_ID_CACHE 1`: "Write the migration spec".
