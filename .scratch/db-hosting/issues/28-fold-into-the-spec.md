# Fold the answers into the spec

Type: task
Status: resolved
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
- from "How is the Event Service built, deployed and staged on Cloud Run?" (7 Oct 2026): everything under its "Passed on". In short: the Event Service on Node 24 on Cloud Run, as one bundled file in a container with one `mysql2` pool; tests on Vitest on Node and `docker build` in CI; GitHub Actions deploying every push to `main` with migrations in the same job, so "migrate before you merge" and "Migrate production" go for the Event Service; secrets in Secret Manager; `event-service-staging`; `event-api.` as a Cloud Run domain mapping with the proxy off; at most 2 instances, one warm on event days; logs and rollbacks on Google Cloud; and the four Linear tickets it names (BAC-11, 12, 13 and 15). Mark our own project, Pulumi in TypeScript and the domain mapping provisional until 8 Oct.

Resolved when the spec has no section that still assumes Hyperdrive, a `stations` or `tokens` table in the GeekyKey Service, or four Workers.

## Answer

Resolved 7 Oct 2026, for Adam's review. The spec no longer assumes Hyperdrive, a `stations` or `tokens` table in the GeekyKey Service, or four Workers. Five decisions in it stay provisional until Adam meets Julian and Qing Guan on Thu 8 Oct (spec section 11.3).

**What changed**

- **[spec.md](../spec.md), rewritten.** Two platforms: the GeekyKey Service and both screens Workers on Cloudflare, the Event Service on Cloud Run at `event-api.`, with the claims stand-in beside it. The checkpoints from 2 on are redrawn: 2 moves today's backend to Cloud Run, 3 draws the line inside that one server, 4 cuts the GeekyKey Service out as a Worker and moves the stations to `key-api.` Checkpoint 1 is marked done. Section 3 gains "The registered stations" (3.5); section 4 becomes `StandInClaims` with the stand-in's routes; section 5 covers Secret Manager and the Cloud Run settings; section 7 now only summarises version 0.3 of the API agreement; sections 8 to 12 follow ticket 27's "Passed on".
- **[apps/API-AGREEMENT.md](../../../apps/API-AGREEMENT.md), version 0.3 (draft).** Everything this ticket's Question lists from tickets 23 to 27, with a changelog line. Every endpoint it touches is a `Checkpoint N` one, so it goes in a pull request from either side, which Ethan reviews.
- **[CONTEXT.md](../../../CONTEXT.md):** **Event Service key** is now sent only by the GeekyKey Service, since the status call is gone. The other terms (Link removed, GeekyKey Service, GeekyKey admin, Claims stand-in, Registered stations) were already reworded by the tickets that changed them.
- **[ADR 0003](../../../docs/adr/0003-event-service-on-cloud-run-geekykey-service-without-a-database.md), amended:** `tokens` went to the claims stand-in, not into the Event Service; the GeekyKey Service's only cache is the copy of the registered stations in memory; and what "v1" meant is still to be asked.
- **The updates site's changelog:** `move-redrawn-planned`.

**The spec's calls** (spec section 2), for Adam's review: the order of the redrawn checkpoints; the sides talking through `app.request()` inside one server at checkpoint 3; `event_stations` dropped; the heartbeat hand-off answering `204`; the stand-in's five routes; the Event Service's rate limit counted per instance; a second deploy service account for staging, so staging can run from any branch while production's sign-in stays limited to `main`; 4 seconds for the token page's calls too; the organizers' station endpoints keeping the GeekyKey admin endpoints' shapes; and 0 saved taps on every station before the evening-before clear, since no links are left to restart.

**Linear tickets to rewrite** (checked 7 Oct; **rewritten in Linear the same day**, at Adam's request)

Done in Linear on 7 Oct: BAC-11 to BAC-14 rewritten; BAC-15 cancelled, replaced by BAC-19 (staging); new BAC-16 (Node 24), BAC-17 (the Node server and image) and BAC-18 (`infra/` and the deploy workflow, which staging needs before it can run by hand); HAR-9, 10 and 11 changed, and HAR-13 for the reflash; FRO-21, 25 and 29 cancelled; FRO-24, 26 and 28 rewritten for organizers; FRO-32 for the v0.3 board, in a new milestone, "The Event screens on the v0.3 contract"; FRO-18, 20, 22, 23, 27 and 30 gained `claims_unavailable`. The milestones of "Move to TiDB and Cloudflare" from checkpoint 2 on now follow the spec, and checkpoint 4's is "the GeekyKey Service cut out".

- **BAC-11** "The first deploy: a tap to key-api is stored in TiDB through Hyperdrive" becomes "The first deploy: a tap to event-api is stored in TiDB on Cloud Run": the spec's checkpoint 2 on production. The project and keyless sign-in from Julian or Qing Guan, Adam's secret values, the deploy workflow on `main`, the DNS record, the same `curl` checks, and the Cloud Logging check. Hyperdrive, Julian's Workers steps and the pull request for the Hyperdrive ID go.
- **BAC-12** "Check the logs for keys, and write down the first numbers, on staging" becomes the checks on `event-service-staging`: no key or cookie in a Cloud Logging line and no secret in a URL; the cold start with and without CPU boost, on both generations, keeping the fastest and revisiting the 4 seconds; and the first numbers for spec 11.1 (Cloud Run's requests and CPU, TiDB's Request Units from Julian). Invocation logs and Hyperdrive queries go. The 500-tap CPU check moves to checkpoint 4.
- **BAC-13** "The README explains how we deploy" follows spec 8.1: GitHub Actions with migrations in the deploy job, staging by running the workflow by hand, Secret Manager, rollbacks by revision, and the Workers parts marked as coming at checkpoints 4 and 5. Its branch, `adam/bac-13-the-readme-explains-how-we-deploy`, predates this.
- **BAC-15** "Staging: a tap to the workers.dev copy is stored in TiDB through Hyperdrive" (In Progress) is cancelled; its `env.staging` was dropped on 7 Oct (32a5bba). A new ticket, "Staging: a tap to event-service-staging is stored in geekykey_staging", covers the staging service, its service account, running the workflow by hand and staging's secret values.
- **BAC-14** "A real station taps production": the address is `event-api.` until checkpoint 4, it tries staging's `run.app` address first, and it's blocked by the new BAC-11.
- **New BAC tickets for checkpoint 2:** Node 24 for the whole repo; the server on Node (`src/server.ts`, the pool, the image, tests on Node, CI's `docker build`); and `infra/` in Pulumi (provisional until 8 Oct). The milestone "Checkpoint 2: the first deploy" becomes "Checkpoint 2: the move to Cloud Run".
- **HAR-9** "Check the saved-taps queue on a real station": point it at the local server rather than `wrangler dev`, and drop `no_event` from the statuses with their own screen.
- **HAR-10** "The station talks HTTPS to a full server URL": production is `https://event-api.geekshacking.com` until checkpoint 4, then `key-api.`; staging is `event-service-staging`'s `run.app` address, not `workers.dev`; Google Trust Services, which issues `event-api.`'s certificate, is among the 14 roots.
- **HAR-11** "The station sends a heartbeat and sets its clock from it": the heartbeat arrives at checkpoint 3, on the one server, and is answered even while the Event Service is down.
- **HAR-12:** no change.
- **A new HAR ticket for checkpoint 4:** reflash every station with `https://key-api.geekshacking.com` as its server, keeping its key.
- **Ethan's FRO tickets,** for him to rewrite: FRO-25 (linking) and FRO-21 (every station for GeekyKey admins) are cancelled; FRO-24, FRO-26 and FRO-28 become organizers creating a station, disabling and enabling it, and replacing its key, on `event-web`'s station board (9.7 to 9.9); FRO-29 "The Event screens stop creating stations" is reversed and cancelled; a new ticket reads version 0.3's board (no `status_known` or `linked`, which undoes FRO-15's "status unknown", and `disabled_at` shown); and FRO-18, 20, 22, 23, 27 and 30 gain the `claims_unavailable` message.

**Map:** the destination is reached. The four fog patches are carried by the spec as provisional or still to confirm (sections 11 and 12), not by new tickets.
