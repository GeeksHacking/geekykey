# TiDB write test, 28 Sep 2026

A write test for "How is the database set up?", run by Adam from his Mac against the cluster Julian provisioned. It created a throwaway database, ran four checks and dropped the database again. It changed no cluster setting and prints nothing secret: the host, user and password are masked in every line of output. Script: [tidb-write-test.ts](tidb-write-test.ts).

To run it again from the repo root:

```
deno run --no-config --allow-net --allow-env=TZ --allow-read=$HOME/.config/geekykey/tidb.env .scratch/db-hosting/assets/tidb-write-test.ts ~/.config/geekykey/tidb.env
```

## Results

| Check | Result |
|---|---|
| Strict mode | On. `STRICT_TRANS_TABLES` is in `sql_mode` for the session and globally |
| `ENUM` column given an unknown value | Rejected: `Data truncated for column 'status' at row 1` |
| `AUTO_ID_CACHE 1` | Kept: it appears in `SHOW CREATE TABLE` |
| Ids from three connections taking turns | Rose 1 to 12 in order, both with and without `AUTO_ID_CACHE 1` |
| `SELECT ... FOR UPDATE` | The second connection waited 1,529 ms for a lock the first held about 1,500 ms |
| Replay with a no-op `ON DUPLICATE KEY UPDATE` | No error. The stored row kept its status. Reported 1 affected row |
| `INSERT IGNORE` given an unknown `ENUM` value | No error, 1 warning, and an empty string stored |

## What the results mean

- `ENUM` columns can stand in for the CHECK constraints: strict mode makes TiDB refuse an unknown value.
- The ids rising in order without `AUTO_ID_CACHE 1` does not show the default is safe. The three connections probably reached the same TiDB server. The default only promises rising ids within one server, so the setting stays.
- Row locks work, so the cooldown can lock a station's row inside a transaction.
- `INSERT IGNORE` hides bad values as well as duplicates, so it must not replace `onConflictDoNothing()`. Use the no-op `ON DUPLICATE KEY UPDATE`.
- With `mysql2`'s default settings, a replay and a new row both report 1 affected row. Code cannot use the insert's result to tell them apart. Today's code does not try to: it finds replays by reading first.
