# Does TiDB fit this backend?

Type: research
Status: resolved
Blocked by: none
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)
Findings: [research/tidb-fit.md](../research/tidb-fit.md)

## Question

What changes when this backend's Drizzle schema and queries move from SQLite (libSQL) to TiDB Cloud Starter, and does anything in TiDB block or complicate the move?

Find out, from primary sources:

- **Drivers.** Which drivers Drizzle supports for TiDB (`drizzle-orm/tidb-serverless`, `mysql2`, others), which of them run on Cloudflare Workers, and whether each supports transactions, including interactive ones.
- **Migrations.** Can drizzle-kit generate MySQL-dialect migrations and apply them to TiDB Starter, and from where (CI, a laptop)? Does TiDB's DDL accept what drizzle-kit produces, for example several statements in one migration, or changing a column's type?
- **Each SQLite-only feature the backend uses today, and its TiDB equivalent:**
  - `sqliteTable` and the column types. Timestamps are ISO text with an `strftime` default today. Compare text, `DATETIME(3)` and `TIMESTAMP(3)` on TiDB: sorting, defaults, and round-tripping to the wire format `2026-10-10T09:00:00.000Z`.
  - `.get()` for single-row selects, in `src/middleware/station-auth.ts`, `src/middleware/session-auth.ts` and `src/routes/auth.ts`.
  - `onConflictDoNothing()` in `src/services/taps.ts` and `scripts/seed.ts`. What are the MySQL options (`INSERT IGNORE`, `ON DUPLICATE KEY UPDATE`), and what else does `INSERT IGNORE` silence?
  - CHECK constraints. `tidb_enable_check_constraint` is `OFF` on our cluster. Can it be turned on for Starter? Otherwise, would `ENUM` columns or validation in the app do the job?
  - `taps.id` AUTO_INCREMENT. TiDB only promises increasing ids per server unless a table uses `AUTO_ID_CACHE 1`. What does Starter do, and can Drizzle declare that option? The admin tap log pages with a `before_id` cursor (API agreement section 9.3).
  - Foreign keys and unique indexes. Are foreign keys enforced on TiDB 8.5?
  - Text primary keys (UUID strings) and index length limits on `VARCHAR` and `TEXT` columns.
- **Anything else** in the schema or queries that behaves differently on TiDB, such as case sensitivity and collation in string comparisons (the token `uid` lookup, for example).

Read first: `apps/backend/src/db/schema.ts`, `src/db/client.ts`, `src/db/migrate.ts`, `src/services/taps.ts`, `src/services/me.ts` and `apps/backend/drizzle/`. What we already know about the cluster: [assets/tidb-probe.md](../assets/tidb-probe.md).

Read-only queries (`SELECT`, `SHOW`) against the cluster are fine, using the probe's env file. Do not create, change or drop anything there. List any question that needs a write to settle as open instead.

## Answer

Resolved 26 Sep 2026 with a few targeted lookups and read-only cluster queries. Full findings: [research/tidb-fit.md](../research/tidb-fit.md).

- Nothing blocks the move. Every SQLite-only feature has a TiDB replacement.
- `drizzle-orm/tidb-serverless` suits Workers and supports transactions. TiDB's driver calls interactive transactions experimental.
- drizzle-kit generates MySQL-dialect migrations, and Drizzle's TiDB migrator applies them from CI or a laptop.
- Foreign keys are enforced (generally available since v8.5.0). The default collation `utf8mb4_bin` compares strings like SQLite does.
- Left for "How is the database set up?": how to handle CHECK constraints (the switch is cluster-wide and untested on Starter), `VARCHAR(24)` or `DATETIME(3)` for timestamps, and whether `taps.id` needs `AUTO_ID_CACHE 1`.
