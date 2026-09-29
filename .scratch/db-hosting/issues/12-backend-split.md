# Which parts of today's backend belong to the GeekyKey Service, and which to the Event Service?

Type: grilling
Status: resolved
Blocked by: none
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

Julian's architecture splits today's single backend in two. For everything the backend does today, which service owns it?

- **Stations and station keys.** Which service keeps the station records and checks a station's key?
- **Deduplication and late uploads.** Where do deduplication by `client_tap_id` and late batch uploads live?
- **The cooldown.** Is it a game rule (Event Service) or a platform rule (GeekyKey Service)?
- **Taps, stamps, points and the passport.** Which service stores taps, and which works out stamps and points?
- **Users.** Is the `users` table a per-event copy of Portal identity inside the Event Service? Julian suggested "cache separately per event then teardown".
- **Tokens and claims.** Which service holds the `tokens` stopgap until the Portal's tag APIs exist?
- **Organizer actions.** Logging a tap on a participant's behalf, and the admin screens' data.
- **Stations and games.** Does a station belong to one game, or to the event, so that one tap can count in several games?
- **Databases.** Which service uses TiDB, and what small store does the GeekyKey Service need (for example, which Event Service each station belongs to), given that neither keeps a long-term database?
- **The order of the move.** Two Workers from the start, or one Worker with a clean line inside it first ("move first, split second")?

If the split holds, `CONTEXT.md` may need to become two contexts with a `CONTEXT-MAP.md`.

## Answer

Resolved 28 Sep 2026 by grilling with Adam. Julian's two messages that day, passed on by Adam, are quoted where they shaped the answer.

**Decided**

- **The GeekyKey Service passes taps on; the Event Service decides what they mean.** The GeekyKey Service checks the station key, treats a `tapped_at` that is wildly off as missing (today's rule: more than 7 days old or 5 minutes ahead), accepts single taps and late batches, looks up each token's user, and hands each tap to the station's Event Service as a user ID and a station ID. It stores no taps. The Event Service stores taps, drops replays by `client_tap_id`, applies the cooldown, and works out stamps and points. A GeekyKey tap log would not spare the Event Service from replays: a hand-off that fails after the log was written reaches the Event Service twice when the station retries. So every Event Service, ours or another team's, must drop replays itself.
- **A station is split between the two.** The GeekyKey Service owns the station itself: its ID, key, a device label ("Reader 3"), which Event Service it feeds, and when it was last seen (heartbeat, online light). The Event Service owns what the station means in its games, keyed by station ID: the name and location participants see, station points and stamp slot order.
- **A station feeds exactly one Event Service at a time,** and that Event Service decides which of its games a tap counts in. The GeekyKey Service never knows about games. Moving a station to another event is changing its one link. Anything that must count across events belongs to the Portal, as in Julian's food example, not to a second hand-off.
- **Only stations given passport settings are stamp slots.** At the showcase every reader gets them, so the passport looks as it does today.
- **The Event Service returns one verdict per tap,** however it combines its games. While the passport is the only game, its verdict is the station's and the tap log keeps one status per tap. When a second game arrives the rule becomes "accepted if any game counted it", and each game keeps its own record of what it counted, so a bingo-only tap cannot earn passport points.
- **The Event Service never sees a token's ID, only users.** A tap by an unclaimed token gets `unknown_token` from the GeekyKey Service, which writes it to its Workers logs and stores nothing. The admin log and the export lose their `token_uid` column and their `unknown_token` rows; whether the A/B analysis can live with that is "Does the A/B analysis need token IDs or unclaimed-token taps?".
- **Users:** the Portal's user ID is the user ID everywhere; our own `users.id` and the separate `portal_user_id` go away. The Event Service keeps a per-event copy of each user: the display name, copied from the Portal at login, and the role. A tap by someone who has never logged in is stored against their Portal user ID. **Organizer is a role at one event,** held by the Event Service. The GeekyKey Service keeps no users.
- **Tokens:** the Portal stores which user each token belongs to, and the GeekyKey Service sets and queries it through the Portal's APIs. Julian, 28 Sep: "Portal should store it, and the GeekyKey service sets or queries using the portal APIs." Until those APIs exist, the GeekyKey Service keeps the `tokens` stand-in behind the one module that will later call them (today's `TokenResolver`, grown to also claim and release tokens). Nothing else reads the table.
- **Organizer actions:** the tap log, stats and CSV export belong to the Event Service. Creating a station and showing its key once belong to the GeekyKey Service; adding its passport settings to the Event Service. The GeekyKey Service owns last seen, and the Event Service can ask it for the status of its own stations.
- **One TiDB database, for now.** It holds both services' tables. Each table belongs to one service and neither service's code reads the other's, so the GeekyKey Service's tables can move out later. Julian asked why we would need a permanent database now, and we don't: the `tokens` stand-in is temporary, and the ~20 stations only need to last the showcase. A second event reusing the readers can move or re-create them.
- **Move first, split second.** Port today's backend unchanged to one Worker on TiDB and deploy it, then draw the line inside it, then split it into two Workers joined by a service binding. Julian gets a Worker to deploy soonest, the risky runtime and database move is proven on working code, and reshaping tables afterwards is cheap because no data carries over.
- **One glossary.** `CONTEXT.md` stays one file, grouped by the service that owns each term, with a new Services section for the Portal, the GeekyKey Service and the Event Service.

**Ruled out of scope**

- Whether to keep the QR fallback is a product decision, not a hosting one. If it is built, it belongs to the Event Service, taking a user ID and writing straight into its tap pipeline with `source = qr_fallback`.

**What follows without a further decision**

- The per-station lock the cooldown needs (see `#oneAtATime` in `apps/backend/src/services/taps.ts`) moves with the cooldown to the Event Service.
- The GeekyKey Service still looks up the token for a replayed tap before the Event Service drops it. Harmless, as long as the lookup is cheap.
- `/me` can no longer list a user's tokens from the Event Service's own data.

**Glossary**

`CONTEXT.md` was regrouped on 28 Sep: a Services section; Station now feeds one event at a time and leaves its points to the games; Tap says an unclaimed token's tap is turned away before any event; Accepted tap counts in at least one game; Organizer is a role at one event; the Passport has one slot per station it counts; Cooldown moved under Passport.

**Passed on**

- No games in a station's link, no token ID in the hand-off, dropping replays as part of every Event Service's contract, the set of verdicts, and asking for a station's status: "How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?".
- Which statuses the station hears from the Event Service and which from the GeekyKey Service, and heartbeats going to the GeekyKey Service: "How do stations talk to the GeekyKey Service?".
- Where the token list moves now `/me` cannot hold it, how an organizer sets up a station across both services, the online light, and the per-event organizer role: "Which screens belong to which service, and how does each know who is logged in?".
- One database with tables kept apart by service, users keyed by the Portal's user ID, and whether each service gets its own login: "How is the database set up?".
- Running one Worker first, then two: "How do local dev, tests and CI get a runtime and a database?".
- The order of the move: "Write the migration spec".
- Deleting the event's data afterwards takes the `tokens` stand-in with it: "After the event", still fog on the map.
