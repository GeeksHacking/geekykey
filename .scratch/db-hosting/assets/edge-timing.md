# Where a tap's time goes before Cloud Run, 21 Oct 2026

Measured for BAC-38 on production, from Adam's Mac and the main station in Singapore. On 15 Oct (BAC-37), Cloud Run spent 26 to 140 ms on each warm request, but `curl` took 1.4 to 1.9 s for most taps and 6.4 s for one. This page finds where the rest went.

Since checkpoint 4 (20 Oct), stations call the GeekyKey Service's Worker at `key-api.`, and `event-api.` answers a tap with `404`. So the taps here go through `key-api.`, as a station sends them. `event-api.`'s `/api/health` stands beside them as the direct way to Cloud Run.

## How it was measured

[edge-timing.mjs](edge-timing.mjs) sends rounds of three requests. Each request is a new `curl` over HTTP/1.1, so it pays for DNS, TCP and TLS, as a station's first tap does:

- **event-api health**: `GET event-api./api/health`, through Cloudflare's proxy and Google to Cloud Run.
- **key-api health**: `GET key-api./api/health`, which the Worker answers alone, without calling Cloud Run.
- **key-api tap**: `POST key-api./api/v1/taps` with the production test station's key and the default test token. The Worker asks the claims stand-in for the token's owner, then hands the tap to the Event Service, both on Cloud Run.

The `cf-ray` header names the Cloudflare data centre that answered each request. The script then reads Cloud Run's request log and puts its latency beside each request. For a tap, that is the owner lookup plus the hand-off, plus the stations list when the Worker had to fill an empty copy first. "Before Cloud Run" is the total minus Cloud Run's latency. The last column lists each of the Worker's calls, with when Cloud Run received it, counted from when the tap was sent, and how long it took there.

The station was the ESP32-S3 on production through `key-api.` (HAR-13), on Adam's phone hotspot. It keeps one HTTPS connection open between requests. Its time is from its "Sending N queued tap(s)" line to its "Backend answered" line, each stamped by the Mac as it arrived over serial. A station can't read `cf-ray`, so its data centre isn't known.

Two networks, 25 rounds each, on Tue 21 Oct between 06:27 and 06:43 UTC (2:27 to 2:43 pm in Singapore): the school's Wi-Fi, then the hotspot. Then 20 taps from the station on the hotspot, from 06:45 to 06:50 UTC. Every request is in [edge-timing/](edge-timing/), one file per set.

To run it again from the repo root, with `gcloud` signed in and the production test station's key and token in `~/.config/geekykey/production-test-station.env`:

```
node .scratch/db-hosting/assets/edge-timing.mjs send school 25 >> results.tsv
node .scratch/db-hosting/assets/edge-timing.mjs station station serial.log >> results.tsv
node .scratch/db-hosting/assets/edge-timing.mjs match results.tsv > matched.tsv
node .scratch/db-hosting/assets/edge-timing.mjs summary matched.tsv by-colo
```

`station` reads a serial log with each line stamped `<UTC time><tab><line>`.

## Results

Seconds, as the median and the range.

| Network | Request | Total | Cloud Run | Before Cloud Run |
|---|---|---|---|---|
| School | event-api health | 0.31 (0.06 to 0.54) | 0.00 (0.00 to 0.01) | 0.30 (0.06 to 0.54) |
| School | key-api health | 0.20 (0.06 to 0.39) | none | 0.20 (0.06 to 0.39) |
| School | key-api tap | 0.64 (0.20 to 1.06) | 0.10 (0.09 to 0.12) | 0.54 (0.11 to 0.96) |
| Hotspot | event-api health | 0.88 (0.10 to 1.71) | 0.00 (0.00 to 0.00) | 0.87 (0.10 to 1.70) |
| Hotspot | key-api health | 0.53 (0.13 to 0.84) | none | 0.53 (0.13 to 0.84) |
| Hotspot | key-api tap | 1.40 (0.30 to 3.73) | 0.10 (0.08 to 0.13) | 1.32 (0.17 to 3.63) |
| Station, hotspot | tap, connection kept open (18) | 0.58 (0.43 to 0.98) | 0.08 (0.08 to 0.09) | 0.50 (0.35 to 0.89) |

The same taps from the Mac, by the data centre that answered:

| Data centre | Taps from school | Taps from the hotspot | Total | Cloud Run |
|---|---|---|---|---|
| SIN, Singapore | 12 | 7 | 0.20 to 0.68 | 0.09 to 0.13 |
| HKG, Hong Kong | 8 | 0 | 0.64 to 0.98 | 0.09 to 0.12 |
| NRT, Tokyo | 4 | 3 | 0.85 to 1.06 | 0.10 to 0.13 |
| KIX, Osaka | 1 | 0 | 0.84 | 0.10 |
| MRS, Marseille | 0 | 7 | 1.26 to 3.31 | 0.08 to 0.12 |
| CDG, Paris | 0 | 8 | 2.65 to 3.73 | 0.08 to 0.12 |

Six data centres answered the 150 requests from the Mac. From the school, SIN answered 29, HKG 26, NRT 14 and KIX 6. From the hotspot, SIN answered 15, CDG 22, MRS 22, NRT 13 and KIX 3. The data centre changed from one request to the next on both networks.

## Where the time goes

**Cloudflare's choice of data centre.** Cloud Run spent 0.08 to 0.13 s on every tap, wherever it came from. A tap through SIN took 0.20 to 0.68 s in all, with a new connection. The same tap through CDG took 2.65 to 3.73 s.

**A new connection to a far data centre.** curl's breakdown shows the cost of opening the connection, TCP and TLS together, on all 150 requests: 0.02 to 0.10 s through SIN, 0.09 to 0.51 s through HKG, NRT or KIX, and 0.33 to 1.02 s through CDG or MRS. A station pays this once, since it keeps its connection open, and then each request costs one round trip to the same data centre. The Worker's own `/api/health`, which includes the new connection, took at most 0.84 s.

**The Worker's calls to Cloud Run, when it runs far away.** This is most of a slow tap. A Worker runs in the data centre that answered the request, and from there makes two calls to `event-api.`, one after the other. Cloud Run's log shows when each arrived:

- Through SIN, the hand-off arrived 0.01 to 0.06 s after the owner lookup had finished, and through HKG, NRT or KIX 0.07 to 0.21 s after.
- Through CDG or MRS it arrived 0.32 to 0.44 s after on 7 of the 15 taps, and 1.48 to 1.60 s after on the other 8.
- On 4 of those 7, the owner lookup was slow instead. Counted from the end of curl's TLS handshake, it arrived 1.82 to 1.96 s later, against 0.28 to 0.85 s on the other 11 taps through Europe.

So on 12 of the 15 taps through Europe, one of the Worker's two calls arrived about 1 to 1.5 s later than usual. Take a 2.65 s tap through CDG: the owner lookup reached Cloud Run 0.69 s after the tap was sent, and the hand-off reached it 1.52 s after the owner lookup had finished. A new connection from Europe to Google would explain the slow call, but nothing here shows that directly.

**Not Cloudflare to Google in Singapore.** `event-api.`'s health check through SIN took 0.06 to 0.22 s with a new connection, of which Cloud Run took 0.01 s at most.

The 15 Oct numbers fit this. Those taps also went through Cloudflare's proxy, but nobody wrote down which data centre answered them.

Cloudflare's docs say the set of data centres that can serve a domain "varies between Cloudflare customers". It can also change between requests, because of the visitor's ISP and Cloudflare's traffic engineering, and no zone setting changes it.

## The station

- **Its first 18 taps** went over the kept-open connection and took 0.43 to 0.98 s, median 0.58. Cloud Run took 0.08 to 0.09 s of each.
- **Its first heartbeat after start-up** took about 1.9 s. "Connected" came at 06:44:59.09 UTC and the clock was set at 06:45:02.02, and the station waits 1 s and starts mDNS before it sends the heartbeat, so the heartbeat's own start isn't logged. The Worker's stations copy was empty, so it asked Cloud Run for the list first. That call reached Cloud Run at 06:45:01.77, about 1.7 s after the heartbeat was sent, and took 0.015 s there. So nearly all of the 1.9 s went on the station's new connection to Cloudflare and the Worker's call reaching Cloud Run.
- **From 06:48:55 to about 06:50:00 UTC the station got no answers.** Its 19th tap got no answer within its 5 seconds (HTTP -11, a read timeout). The next two sends, the second with a 20th tap as well, failed after 9 s each (HTTP -1), and the heartbeat at 06:49:20 said "connection refused". Cloud Run's log has no request from the Worker in that time. Without Cloudflare's logs, it can't be told whether the 19th tap reached the Worker. The station kept the taps, as it should, and sent both at 06:50:02 over a new connection. They were answered in 4.0 s: Cloud Run spent 0.20 s on them, and the rest went before Cloud Run.

## What it means for the 5 seconds

No answered tap took more than 5 seconds. The slowest from the Mac took 3.73 s, through CDG with a new connection, and the slowest from the station took 4.0 s, after the network came back. The one tap without an answer in 5 seconds came while the station couldn't connect at all.

These taps all reached a warm Cloud Run. A cold start adds 1.3 to 2.0 s (section 11.3 of the spec, BAC-12). Added to a tap through CDG, the station's 5 seconds would run out. The Worker's own 4-second deadline could run out too: it starts at the key check and covers filling an empty stations copy, the owner lookup and the hand-off. On the hotspot, a tap through CDG took 3.16 s on average against 0.43 s through SIN, and the Worker's health check 0.61 s against 0.19 s. So the Worker's calls took about 2.3 s longer through CDG, before any cold start. A station that runs out of time shows `Tap saved` / `Will send later` and sends the tap again, so the tap is kept, but the participant doesn't see its result.

DNS only for `event-api.` (BAC-27) wouldn't change this. Since checkpoint 4 a station's tap always reaches a Worker first, so the Worker's calls to Cloud Run would still start wherever Cloudflare answered.

Cloudflare's Workers placement could. A placement hint, `"placement": { "region": "gcp:asia-southeast1" }` in the Worker's `wrangler.jsonc`, runs the Worker in the data centre closest to Cloud Run's region. That holds whichever data centre answered the station. Cloudflare's docs say placement is "available on all Workers plans". The station's own way to Cloudflare would stay as it is: a new connection through Europe costs 0.33 to 1.02 s, once. This is untested, and whether to try it is Adam's call.
