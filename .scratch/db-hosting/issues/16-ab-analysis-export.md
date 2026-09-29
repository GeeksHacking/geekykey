# Does the A/B analysis need token IDs or unclaimed-token taps?

Type: task
Status: resolved
Blocked by: 12
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

"Which parts of today's backend belong to the GeekyKey Service, and which to the Event Service?" decided that the Event Service never sees a token's ID, and that taps by unclaimed tokens stop at the GeekyKey Service, which logs them and stores nothing. So the CSV export (`GET /api/v1/admin/export.csv`, the data feed for the Sprint 2 A/B analysis) loses its `token_uid` column and its `unknown_token` rows.

Adam asks Joshua, who owns the report:

- Does the A/B analysis use `token_uid`, or count taps by unclaimed tokens (for example, people who tapped before claiming)?
- If it does, is a count enough, or does it need each tap?

If the analysis needs them, the fallback is for the GeekyKey Service to keep its own short list of unclaimed-token taps for organizers, still without passing token IDs to the Event Service. Record Joshua's answer and which export columns stay.

## Answer

Resolved 28 Sep 2026. Joshua, who owns the report, answered [the message to Joshua](../assets/message-to-joshua-ab-export.md): none of it is necessary (relayed by Adam).

**Decided**

- **The A/B analysis needs neither the token IDs nor the taps by unclaimed tokens.** This matches our guess: the Single Source of Truth counts connections per `user_id`, and Condition B's QR scans have no token ID.
- **The export keeps ten columns, in this order:** `tap_id, client_tap_id, station_id, station_name, user_id, display_name, status, source, tapped_at, received_at`. It drops `token_uid` and has no `unknown_token` rows, as "Which parts of today's backend belong to the GeekyKey Service, and which to the Event Service?" planned. It is still one row per tap the Event Service stores.
- **The fallback isn't built.** The GeekyKey Service keeps no list of unclaimed-token taps. It writes them to its Workers logs and stores nothing, as already decided.

**What follows without a further decision**

- The `status` column holds only what the Event Service stores: `accepted`, `cooldown` or `no_game`.
- Nobody can count afterwards how many people tapped before claiming their token. If the claim step confuses people, only the survey or someone watching at the event will show it.

**Assets**

- [Message to Joshua](../assets/message-to-joshua-ab-export.md): what the split takes out of the export, and the four questions. Sent by Adam.

**Passed on**

- Section 9.6 of the API agreement loses `token_uid` from its column list, and its "all statuses" becomes the three the Event Service stores: "Write the migration spec".
