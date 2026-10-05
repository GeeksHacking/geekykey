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

Resolved when the spec has no section that still assumes Hyperdrive, a `stations` or `tokens` table in the GeekyKey Service, or four Workers.
