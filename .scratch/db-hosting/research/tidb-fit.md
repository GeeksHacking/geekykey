# Does TiDB fit this backend?

Research for ticket 01, 26 Sep 2026. Done as a few targeted lookups to save tokens: TiDB and Drizzle docs, Drizzle 0.45.2's own source (the version in `apps/backend/package.json`), and read-only queries against our cluster.

## Answer

- **Nothing blocks the move.** Every SQLite-only feature the backend uses has a TiDB replacement. Three need a decision, listed at the end.
- **Driver: `drizzle-orm/tidb-serverless`.** It talks to TiDB over HTTPS, which suits Workers, and it supports transactions: `begin`, `commit` and `rollback` through TiDB's driver, with savepoints for nested ones (Drizzle 0.45.2 source, `tidb-serverless/session.js`). TiDB's driver calls its interactive transactions experimental. `mysql2` also works, over a normal connection, for anything that runs outside a Worker.
- **Migrations:** drizzle-kit generates MySQL-dialect SQL files, and Drizzle 0.45.2 ships a `tidb-serverless/migrator` to apply them. The migrator reads files from disk, so it runs from CI or a laptop, not inside the Worker.
- **Foreign keys are enforced.** They became generally available in TiDB v8.5.0, and our cluster has `foreign_key_checks = ON`. Each foreign key needs an index on both sides, and cannot sit on a `TEXT` column.
- **Strings compare the way they do today.** The cluster's default collation is `utf8mb4_bin`: case-sensitive and byte-by-byte, like SQLite's default. Token UID lookups behave as before.

## Findings

What each SQLite-only feature becomes:

| Today (SQLite) | On TiDB | Source |
|---|---|---|
| `sqliteTable`, `text` columns | `mysqlTable`. Keys and indexed columns must be `VARCHAR(n)`, not `TEXT`: MySQL-style indexes need a length, and foreign keys cannot use `TEXT` | TiDB foreign key docs |
| Timestamps as ISO text, default from `strftime` | Either keep ISO strings in `VARCHAR(24)` (sorts correctly, wire format unchanged, default set by the app) or use `DATETIME(3)` (native, but converted on every read and write) | Decision for ticket 07 |
| `.get()` for one row | Not in Drizzle's MySQL dialect: use `.limit(1)` and take the first row | Drizzle MySQL dialect |
| `onConflictDoNothing()` | `.onDuplicateKeyUpdate()` with a no-op update, or `.ignore()` (`INSERT IGNORE`). In MySQL, `INSERT IGNORE` also turns some other errors into warnings, so the no-op update is the safer duplicate check. Not re-checked on TiDB | MySQL behaviour |
| CHECK constraints | `tidb_enable_check_constraint` is `OFF` and can only be set cluster-wide (`GLOBAL` scope, read from our cluster). We have the `SUPER` privilege, but whether Starter accepts `SET GLOBAL` is untested. Alternatives: `ENUM` columns, or rely on the app's zod validation | Cluster query; TiDB constraints docs |
| `taps.id` AUTO_INCREMENT | By default ids only rise per TiDB server, allocated in batches of 30,000. `AUTO_ID_CACHE 1` makes them strictly increasing across servers (recommended since v6.5.0). Drizzle cannot declare this table option, so it would go into a hand-edited migration. Whether Starter honours it is untested | TiDB auto-increment docs |

Other facts about TiDB Cloud Starter: a transaction may last at most 30 minutes, and there can be up to 400 connections at once (Starter limitations page).

## What this means for the other tickets

- **"How is the database set up?"** decides three things:
  - CHECK constraints: the cluster-wide switch, `ENUM`, or zod alone;
  - timestamp columns: `VARCHAR(24)` or `DATETIME(3)`;
  - whether `taps.id` needs `AUTO_ID_CACHE 1`. `/me` already orders by `received_at`, but the admin tap log's `before_id` cursor (API agreement section 9.3) relies on id order.
  Migrations run with the TiDB migrator from outside the Worker.
- **"How do local dev, tests and CI get a runtime and a database?"** In-memory SQLite can no longer stand in, because the schema becomes MySQL-dialect.

## Open questions

These each need a quick write test in a throwaway database, which this read-only research did not do:

- Does Starter accept `SET GLOBAL tidb_enable_check_constraint = ON`?
- Does Starter honour `AUTO_ID_CACHE 1`?
- Does `INSERT IGNORE` behave on TiDB as MySQL documents?
