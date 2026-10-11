# Cold starts and first numbers on event-service-staging, 10 and 11 Oct 2026

Measured for BAC-12 from Adam's Mac in Singapore, on `event-service-staging` (gen1, 1 vCPU, 512 MiB, request-based billing). Script: [cold-start.sh](cold-start.sh). Each round waited until the running instance had stopped, sent one request, and checked the logs for a new instance. All 13 rounds started one.

The tap carries a made-up station key, since the real one isn't kept on a laptop. It answers `invalid_station_key` after one station lookup, so it opens the first TiDB connection as a real tap does, but skips the tap's own transaction, which takes 68 to 92 ms warm (BAC-19).

To run it again from the repo root, with `gcloud` signed in:

```
.scratch/db-hosting/assets/cold-start.sh boost-on 4 >> results.tsv
```

## Cold starts

"Cloud Run" is the latency in Cloud Run's request log: what a caller next to Google would wait. "curl" is the whole request from the laptop, with DNS and a new TLS handshake.

| Startup CPU boost | When (UTC) | Request | Cloud Run | curl |
|---|---|---|---|---|
| On | 10 Oct 15:12 | health | 0.97 s | 1.39 s |
| On | 10 Oct 15:51 | tap | 1.62 s | 2.40 s |
| On | 10 Oct 16:07 | health | 0.99 s | 1.55 s |
| On | 10 Oct 16:23 | tap | 2.00 s | 2.60 s |
| Off | 11 Oct 02:22 | tap | 1.69 s | 2.48 s |
| Off | 11 Oct 02:38 | health | 0.69 s | 1.49 s |
| Off | 11 Oct 02:54 | tap | 1.31 s | 1.84 s |
| Off | 11 Oct 03:46 | tap | 2.05 s | 2.52 s |
| Off | 11 Oct 04:03 | health | 0.68 s | 1.34 s |
| On | 11 Oct 04:20 | tap | 1.43 s | 1.97 s |
| On | 11 Oct 04:36 | health | 0.99 s | 1.51 s |
| On | 11 Oct 04:51 | tap | 1.31 s | 1.82 s |
| On | 11 Oct 05:08 | health | 0.33 s | 0.85 s |

In short:

| | Cold tap, Cloud Run | Cold tap, curl | Cold health, Cloud Run |
|---|---|---|---|
| Boost on (4 taps, 4 health) | 1.31 to 2.00 s, mean 1.59 | 1.82 to 2.60 s, mean 2.20 | 0.33 to 0.99 s |
| Boost off (3 taps, 2 health) | 1.31 to 2.05 s, mean 1.68 | 1.84 to 2.52 s, mean 2.28 | 0.68 to 0.69 s |

- **Boost on is kept.** Its cold taps were a little faster, by less than the spread between rounds, so the two are close. The health check was faster without it, but nothing waits on a cold health check.
- **Day was no slower than night.** Boost on gave taps of 1.62 and 2.00 s at night and 1.43 and 1.31 s by day.
- **Where the time goes:** 0.9 to 1.3 s from Cloud Run starting the instance to Node listening. A tap then opens its first TiDB connection and runs its query. BAC-19's one cold tap with the real key took 1.32 s, inside the same range.
- **The 4-second deadline holds.** The slowest cold tap took 2.05 s on Cloud Run. Only the first call of a station request can land on a cold instance, so the hand-off after it is warm.

## A warm request

60 taps with made-up keys, one every 2 seconds, to a warm instance (11 Oct, 05:11 to 05:13 UTC):

- Cloud Run's latency: median 17 ms, slowest 656 ms. curl: median 79 ms.
- Cloud Monitoring billed 5.2 instance-seconds for the 60, about 0.09 s each. Cloud Run rounds billed time up to 100 ms, so a tap alone costs about 0.1 vCPU-second however little it does. Requests that overlap share their time, so a busy instance costs less per request.

Before these runs, staging's 13 requests from 7 to 10 Oct had billed 9.4 vCPU-seconds, mostly start-ups.
