# How do we notice trouble on event day, and who watches?

Type: grilling
Status: resolved
Blocked by: none
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

At the showcase on 18 Nov 2026, how do we find out that a service, the database, the Portal or a station has stopped working, and who acts on it?

What the resolved tickets already say:

- The GeekyKey Service logs every failed hand-off with the Event Service's ID, and every tap by an unclaimed token. It stores neither ("How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?", "Which parts of today's backend belong to the GeekyKey Service, and which to the Event Service?").
- Adam, Ethan and Zi Tao can read the logs of the Workers they were given. Invocation logs stay on unless the first deploy's check finds a key or a cookie in them ("How do deploys and secrets work?").
- A station sends a heartbeat every 60 seconds ("How do stations talk to the GeekyKey Service?"). The organizers' station board shows each station's status from the GeekyKey Service's status call, or "status unknown" when that call fails ("Which screens belong to which service, and how does each know who is logged in?").
- `main` is frozen from the evening before the event: fixes only, approved by Adam ("How do deploys and secrets work?").

**Settled by "How do we back up the database, recover it on event day, and clear the test data before the doors open?" (29 Sep):** the restore is tried once on production before the event, so a rehearsal of the day, if we hold one, includes it. The test data is cleared the evening before, and the morning check taps each station with an unclaimed token, expecting "Unknown token". The Event Service logs one line per stored tap. On the day, only Adam changes data, with Ethan reading the query.

**Settled by "How do we protect our public addresses without blocking the stations?" (29 Sep):** each rate limit that trips writes one log line naming the caller (a station ID, a user ID or an Event Service ID). A station that goes missing gets its key replaced by a GeekyKey admin before it is used again, and a GeekyKey admin can disable a station at once, which takes effect within a minute. Stations resend saved taps at most once a minute, so a station that keeps getting `429` or `503` shows up in the logs about once a minute, not in a flood.

Still open:

- Where errors show up on the free plan, and how long they are kept.
- Whether anything alerts us, or someone has to keep looking.
- Who watches what on the day, and who they call when the fault is the Portal's, Cloudflare's or TiDB's.
- How an organizer notices that a station has gone quiet.
- Whether we rehearse the day beforehand.

## Answer

Resolved 29 Sep 2026 by grilling with Adam.

**Decided**

- **No alerts: people at the venue watch.** On 18 Nov the team is in the room all day, and alerts only matter when nobody is looking. Nothing pages anyone between the first deploy and the showcase; problems before the day are found by using the system and by the rehearsal. Rejected: a scheduled check in the GeekyKey Service posting to the team chat, which takes one of the 5 Cron Triggers GeeksHacking's whole account gets on the free plan, a chat bot secret and code of its own, and goes down with the service it checks; and an outside uptime service, which catches only a whole service or Cloudflare going down, something everyone at the venue would notice within a minute, and would give a third-party account our addresses. Cloudflare's Health Checks and TiDB's built-in alerting aren't on the free plans anyway (see Facts).
- **Every log line our code writes is one JSON object with a fixed name,** such as `tap_stored`, `handoff_failed`, `rate_limited`, `unknown_token`, `no_event`, `link_changed`, `station_disabled` and `token_released`, so the Workers Observability dashboard can count and group them. Keys, cookies and names never appear, as already decided. **Three saved queries** are set up before the rehearsal and shared as one link, so nobody writes a query under pressure:
  - errors in the last 15 minutes, by name and Worker;
  - failed hand-offs, by Event Service;
  - responses of 500 or above, by Worker.
- **The station board puts the stations that need attention first.** Each station shows when it was last tapped, from the Event Service's own taps. A station turns red and moves to the top when it is offline (no request for 120 seconds), holding saved taps (so it can't get through), not in the passport, or its reader isn't responding. A station that is only quiet doesn't turn red: some corners are naturally quiet, and a red that is often wrong teaches people to ignore red. Instead, the desk looks down the last-tap column once an hour. The board already refreshes every 12 seconds.
- **The heartbeat reports the reader** (Adam chose this as well as the board; it's a request to Zi Tao, whose firmware it is). Before each heartbeat, the station asks the reader for its version, the check it already makes at boot, and sends `reader_ok: false` if the reader doesn't answer. The field is optional: the GeekyKey Service stores the latest value next to last seen, the status call passes it on, and the board shows "Reader not responding" in red. Without the field, from older firmware, the board shows nothing for it. The station's own screen shows `Reader error` / `Tell organizer`, so participants have something to report. Without this check, a station with a dead reader and working Wi-Fi shows as online, because the heartbeat proves only the Wi-Fi and the key.
- **Who watches on the day:**
  - **Adam:** the services, through the saved queries. He decides on fixes and is the only one who changes data, as "How do we back up the database, recover it on event day, and clear the test data before the doors open?" decided.
  - **Zi Tao:** the stations, walking to any that turns red.
  - **Ethan:** the screens, which he can roll back, and a second pair of eyes on the logs.
  - **Joshua:** runs the A/B study, and isn't a watcher.
  - **The desk:** one laptop keeps the station board open all day. Adam or Ethan is at the desk at every moment, and whoever leaves hands over first. The rota's times stay blank in the spec until the showcase's programme is out.
- **Adam, Ethan and Zi Tao are on the GeekyKey admin list for the showcase,** so a station can be linked or disabled while Adam is away. On the day they only link, unlink and disable stations. Replacing a key means reflashing the station, so that stays with Zi Tao, with Adam's agreement.
- **Who we call when the fault isn't ours:**
  - **The Portal** (logins fail): Qing Guan. At the showcase the Portal is only used to log in, so taps still count while it's down.
  - **GeeksHacking's Cloudflare account** (an upgrade to Paid on the spot, domains, a zone setting such as "I'm Under Attack" blocking the stations): Julian, then Qing Guan.
  - **TiDB** (the console, TiDB's own backup, the monthly allowance): Julian.
  - **Cloudflare itself:** nobody can fix it. Watch cloudflarestatus.com; stations keep their taps and resend them.
  - Julian and Qing Guan are asked to be reachable by phone during the event's hours.
- **The event-day sheet:** one page in the spec, printed and kept at the desk, with Julian's and Qing Guan's numbers if they agree:

  | What you see | Most likely | Who acts | What they do |
  |---|---|---|---|
  | Station red on the board: offline | Power or Wi-Fi | Zi Tao | Walks over. The station keeps its taps and resends them. |
  | Station red: online but holding saved taps | Hand-offs to the Event Service failing | Adam | Checks the failed hand-offs query. If a fix just went out, rolls back the Event Service. |
  | Station red: reader not responding | Dead or loose reader | Zi Tao | Swaps the station, or sends people to the next one. The QR fallback is at the desk. |
  | Station shows `Setup error` | Wrong key, or the station is disabled | A GeekyKey admin | Checks the station on the admin screens. |
  | Station shows `Not in an event` | Link missing | A GeekyKey admin | Links the station. |
  | Many `Not claimed yet` at stations | Participants haven't claimed their tokens | Whoever is at the desk | Helps them claim on their phones, or by typing the UID in My tokens. |
  | A busy station's last tap is long ago | A fault the reader check can't catch, or older firmware | Zi Tao | As for a dead reader. |
  | Passport or organizer screens broken | A bad screens deploy | Ethan | Rolls back `event-web` or `geekykey-web`. |
  | Logins fail, people already logged in are fine | The Portal | Adam calls Qing Guan | Taps still count. New people try again later. |
  | Error 1027 everywhere | The free day's requests are used up | Adam calls Julian | Julian upgrades to Paid. |
  | Database errors from both services | TiDB is down, or its monthly allowance is used up | Adam calls Julian | Julian checks the TiDB console. |
  | Nothing reachable | Cloudflare | Nobody | Watch cloudflarestatus.com. Stations keep their taps. |
  | A station has gone missing | Theft | A GeekyKey admin | Disables it. Its key is replaced before it is used again. |

- **If we're still on the free plan on 18 Nov,** nothing warns us before the day's allowance runs out:
  - Adam checks the account's Workers requests and Hyperdrive queries every hour from 08:00, when both reset. If either passes 70% before the event ends, he calls Julian to upgrade on the spot.
  - Adam asks Julian for read-only access to the TiDB project, so he can see the Request Units used himself. He checks them the evening before, with the clear. If less than twice what the rehearsal used is left, Julian raises TiDB's spending limit above $0.
  - On Paid, only the TiDB check stays.
- **One rehearsal on production, by Saturday 7 Nov,** so its numbers feed the Paid decision due 11 Nov and a week is left to fix what breaks. It runs the evening-before steps (the freeze, a copy, the clear), the morning check, the team using passports and tapping stations for an hour, the one restore try already required, one screens rollback, and pulling one station's power to watch it turn red. The watchers use the saved queries and the sheet as they would on the day. Then the data is cleared again.

**Accepted**

- Between the first deploy and the rehearsal, a fault is noticed only if someone happens to be using the system.
- If Adam and Ethan both leave the desk without handing over, a fault waits until someone looks.
- A dead reader on a station still running older firmware shows only as a stale last tap, found at the hourly look or when participants say so.
- On the free plan, a sudden rush can use up the day's allowance between two hourly checks.
- The rehearsal comes out of November's TiDB allowance, which the showcase also draws on.

**Facts** (checked 29 Sep 2026)

- Cloudflare's standalone Health Checks aren't on the free plan: none on Free, 10 on Pro ([Health Checks](https://developers.cloudflare.com/health-checks/)).
- The Workers free plan allows 5 Cron Triggers per account, shared with every other Worker in GeeksHacking's account; Paid allows 250. The free plan's 100,000 requests a day reset at midnight UTC, 08:00 in Singapore, and a Worker over the limit answers Error 1027 ([Limits](https://developers.cloudflare.com/workers/platform/limits/)).
- The Workers Observability dashboard searches Workers Logs, saves and shares queries, draws charts and gives links to single events. Nothing in it alerts on errors ([Query Builder, 9 Apr 2025](https://developers.cloudflare.com/changelog/post/2025-04-09-qb-workers-logs-ga/), [dashboard update, 6 Feb 2026](https://developers.cloudflare.com/changelog/post/2026-02-06-observability-ui-refresh/)).
- TiDB Starter has no built-in alerting. Budget emails exist only with a spending limit above $0, and go to the organization's owners and billing admins ([Limitations](https://docs.pingcap.com/tidbcloud/serverless-limitations/), [Budgets](https://docs.pingcap.com/tidbcloud/tidb-cloud-budget/)).
- The organizers' station board refreshes every 12 seconds (`POLL_STATIONS_MS` in `apps/frontend/src/lib/constants.ts`). The heartbeat carries only `firmware_version` and `buffered_taps` (API agreement 6.2). The station checks its reader once, at boot, with `PCD_DumpVersionToSerial()` (`firmware/geekykey_station/geekykey_station.ino`).

**Still to confirm:** the showcase's hours, and whether Adam or Ethan presents at set times (Adam doesn't know yet); that only Julian can use the TiDB Cloud console, carried over from "How do we back up the database, recover it on event day, and clear the test data before the doors open?".

**Passed on**

- The named log lines, the three saved queries, the station board's last-tap column and red rules, `reader_ok` in the heartbeat and the status call, the showcase's GeekyKey admin list, the event-day sheet, the rota rule, the hourly check of the free allowance and the rehearsal by 7 Nov: "Write the migration spec".
- `reader_ok` and the `Reader error` screen: [the message to Zi Tao](../assets/message-to-zi-tao-station-contract.md).
- Read-only TiDB access for Adam at the first deploy, and being reachable by phone on the day: [the message to Julian](../assets/message-to-julian-redirect-urls.md), parts 3 and 4.
- Whether we pay, and what the rehearsal's numbers say about it: "Staying on the free plan", still fog on the map.
