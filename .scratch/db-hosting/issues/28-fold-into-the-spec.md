# Fold the answers into the spec

Type: task
Status: open
Blocked by: 21, 22, 23, 24, 25, 26, 27
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

Once the redraw's other tickets are resolved, update [spec.md](../spec.md) so every section matches [ADR 0003](../../../docs/adr/0003-event-service-on-cloud-run-geekykey-service-without-a-database.md) and their answers. At the least, that's:

- section 1, in short
- section 3, the architecture (the services, the Workers and Cloud Run, how a tap travels, claiming, the database)
- section 4, `Claims`
- section 5, settings and secrets
- section 6, the checkpoints from checkpoint 2 on
- sections 8 and 9, the docs and what each person needs from us
- section 10, event day
- sections 11 and 12, provisional and still to confirm

Also:

- update `CONTEXT.md` where a term changed meaning, such as GeekyKey Service, Link and GeekyKey admin;
- amend ADR 0003 if a ticket changed it;
- list which Linear tickets need rewriting, with what, for BAC-11, 12, 13 and 15 (paused 2 Oct) and the HAR tickets;
- add a changelog line if the plan visibly changed.
- from "Who registers stations, where is a station key checked, and how does the GeekyKey Service know which Event Service a station feeds?" (5 Oct): in the API agreement, add the station list (`GET /geekykey/v1/stations`) and the heartbeat hand-off (`POST /geekykey/v1/heartbeats`) to the section for Event Service builders, and to `packages/handoff`; remove the status call (`GET /api/v1/event-service/stations`), its 120-a-minute limit, `no_event`, the link columns and the GeekyKey admins' station endpoints; and move creating a station, replacing its key, and disabling and enabling it to the Event Service's organizer endpoints and the station board;
- from "Where do token owners live until the Portal's tag APIs exist, and what does the token page do?" (5 Oct 2026): `LocalClaims` becomes `StandInClaims`, calling the claims stand-in on Cloud Run with `CLAIMS_STAND_IN_KEY` (sections 3.1 to 3.4, 4, 5 and the checkpoints); the stand-in's routes, folder and tables in the Event Service's server, marked for removal after the switch; `claim` loses `limit_reached`, which the claim route returns after checking `tokensOf`; `503 claims_unavailable` from day one in the API agreement, replacing `portal_unavailable`; the token page's owner view gains a button per event; GeekyKey admins keep only releasing others' tokens; "After the showcase" copies claims from the stand-in, then deletes it;
- from "Does a station wait for the Event Service's verdict?" (6 Oct 2026): taps still wait; one 4-second deadline for the owner lookup and the hand-off together replaces 1.5 s and 3 s (provisional, until the first deploy measures a cold start); the heartbeat answers `server_time` at once and sends the heartbeat hand-off in `waitUntil()` with no retry, so it succeeds while the Event Service is down; the screen table's "no answer" row becomes `Tap saved` / `Will send later`; one warm instance on event days;

Resolved when the spec has no section that still assumes Hyperdrive, a `stations` or `tokens` table in the GeekyKey Service, or four Workers.
