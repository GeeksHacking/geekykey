# TiDB probe, 25 Sep 2026

A read-only check of the TiDB database Julian provisioned, run by Adam from his Mac. It prints nothing secret: the host, user, password and database name are masked in every line of output. Script: [tidb-probe.ts](tidb-probe.ts).

To run it again from the repo root:

```
deno run --no-config --allow-net --allow-env=TZ --allow-read=$HOME/.config/geekykey/tidb.env .scratch/db-hosting/assets/tidb-probe.ts ~/.config/geekykey/tidb.env
```

## Results

| What | Result |
|---|---|
| Service | TiDB Cloud Starter: `8.0.11-TiDB-v8.5.3-serverless`, Community edition, TiKV storage |
| Where | Shared gateway on Alibaba Cloud, region ap-southeast-1 (Singapore) |
| Login | The cluster's root user (a `<prefix>.root` style name), port 4000, TLS verified against the system CA bundle |
| Permissions | `ALL` on `*.*` with `GRANT OPTION`: we can create databases, tables and users |
| Databases | Only TiDB's defaults (`INFORMATION_SCHEMA`, `PERFORMANCE_SCHEMA`, `mysql`, `sys`, `test`). No GeekyKey database yet |
| `tidb_enable_check_constraint` | `OFF`: CHECK constraints are accepted but not enforced |
| Time zone | `time_zone = SYSTEM`, `system_time_zone = UTC` |
| Transactions | `tidb_txn_mode = pessimistic` |
| `max_allowed_packet` | 64 MiB |
| Normal connection (mysql2 over TCP) | Connecting took 1,202 ms. After that, `SELECT 1` took 10 ms (median of 5, fastest 9) |
| Serverless driver (`@tidbcloud/serverless` over HTTPS) | The first query took 644 ms. After that, `SELECT 1` took 12 ms (median of 5, fastest 10) |

The timings are from a laptop in Singapore, not from Cloudflare. They show the gap between opening a new connection and reusing one, not what a Worker will see.

Before anything writes to the cluster, check that `TIDB_DATABASE` in the env file does not point at one of TiDB's system databases.
