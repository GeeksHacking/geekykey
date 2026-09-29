# Message to Joshua: what the A/B analysis needs from the export

Draft for Adam to edit and send, from "Does the A/B analysis need token IDs or unclaimed-token taps?", 28 Sep 2026. The export's columns come from section 9.6 of [apps/API-AGREEMENT.md](../../../apps/API-AGREEMENT.md), and the experiment's design from section 5 of the Single Source of Truth.

---

Hi Joshua, I have a quick question about the CSV export organizers download, since it's the data for the A/B analysis in your report.

**What's changing.** We're splitting the backend in two. The GeekyKey Service reads a token and works out whose it is. The Event Service runs the event and keeps the taps. The Event Service only ever learns *who* tapped, never which token they used. So the export would lose two things:

- the `token_uid` column, which is the token's hardware ID;
- the rows for taps by a token nobody has claimed yet (status `unknown_token`). We would log those taps briefly and then throw them away.

Everything else stays. There's still one row per tap, with `tap_id, client_tap_id, station_id, station_name, user_id, display_name, status, source, tapped_at, received_at`.

**Our guess is that this is fine.** The Single Source of Truth measures "unique cross-group connections logged per user". That counts by `user_id`, which stays. Condition B scans QR codes, which have no token ID anyway. And even today, a tap by an unclaimed token never counts for anyone: it isn't credited when the token is claimed later.

**What I need from you**

1. Does the analysis use `token_uid` for anything?
2. Do you need the taps by unclaimed tokens? One use would be counting people who tapped before claiming their token, as a sign the setup confused them.
3. If yes to 2: is a count enough (for example, one per station), or do you need each tap with its station and time?
4. Does the analysis need anything that isn't in the columns above?

If you need the unclaimed-token taps, the GeekyKey Service can keep a short list of them for organizers, still without passing token IDs to the Event Service. That's extra work to build, so we'll only do it if the report uses it.

A one-line answer to each question is plenty. I need them by Wednesday 30 Sep, when the hosting plan is due.
