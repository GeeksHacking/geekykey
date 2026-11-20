# Handover

The capstone team (Adam, Ethan, Joshua and Zi Tao) built GeekyKey with GeeksHacking from September
to November 2026, and ran it at the Capstone Showcase at Ngee Ann Polytechnic on Tue 17 Nov 2026.
This page hands it over to GeeksHacking. It says what runs where, what is unfinished, what costs
money, and what to change first.

Adam wrote it on 20 Nov 2026. The [README](../README.md) says what GeekyKey is and how to run it
locally.

## What you get

- The code in this repo, `GeeksHacking/geekykey`: two services, two sets of screens, the station and
  token writer firmware, and the updates site.
- Production, running and deployed from `main` ([What runs where](#what-runs-where)).
- The docs. Read them in this order:
  1. the [README](../README.md), for the parts and the quick start;
  2. [CONTEXT.md](../CONTEXT.md), for the words the code and docs use;
  3. [Operations](operations.md), for deploying, rolling back, secrets, copies and restores;
  4. the [API agreement](../apps/API-AGREEMENT.md), which wins over every other document and the
     code;
  5. the [ADRs](adr/), for the decisions that would be hard to undo;
  6. the runbook, [infra/README.md](../infra/README.md), for the Google Cloud and Cloudflare setup,
     command by command.
- The tickets, in the `geekykey` workspace on Linear ([Tickets](#tickets)).
- The station hardware and the tokens ([Hardware](#hardware)).

## What runs where

| Part | Runs on | Account |
|---|---|---|
| Event Service, `event-api.geekshacking.com` | Google Cloud Run, project `geekykey-b035a` | GeeksHacking's billing account |
| Event Service staging | The same project, `event-service-staging` | GeeksHacking's billing account |
| Database, `geekykey` and `geekykey_staging` | TiDB Cloud | GeeksHacking's cluster |
| Logins (Google and guest) | Firebase, in the same project `geekykey-b035a` | GeeksHacking's billing account |
| GeekyKey Service, `key-api.geekshacking.com` | Cloudflare Workers | GeeksHacking's Cloudflare account |
| GeekyKey screens, `key.geekshacking.com` | Cloudflare Workers | GeeksHacking's Cloudflare account |
| Event screens, `event.geekshacking.com` | Cloudflare Workers | GeeksHacking's Cloudflare account |
| GeekyKey Service staging | Cloudflare Workers | Adam's own Cloudflare account ([Access to remove](#access-to-remove)) |
| Updates site | Cloudflare Pages | See [apps/updates](../apps/updates/README.md) |

A merge to `main` deploys the Event Service through GitHub Actions, and Workers Builds deploys each
Worker the merge touched. Nobody deploys from a laptop. [Operations](operations.md) has the details.

## Access to remove

Julian already holds the production database's root login, so no password needs passing on. Once
GeeksHacking agrees the handover, take away the team's access:

- **Google Cloud.** Remove the team's roles on `geekykey-b035a`. Adam is an Editor, and Ethan has
  Logs Viewer. [Who can do what](operations.md#who-can-do-what) lists each job and the role it
  needs.
- **Database logins.** Adam's laptop holds the migration logins for production and staging. Give
  them new passwords with `db:logins`, run with the root login, and add the new versions to Secret
  Manager ([Secrets](operations.md#secrets)).
- **Database copies.** Adam's laptop holds copies of production that `db:backup` made. They hold
  names, user IDs and who tapped where. Adam deletes them once GeeksHacking confirms it doesn't
  need them.
- **GitHub.** Remove the team's write access to the repo, except for anyone who stays on.
- **The staging Worker.** It lives on Adam's own Cloudflare account. Either set up a staging Worker
  on GeeksHacking's account, or delete it and drop the `staging` environment from
  `apps/geekykey-service/wrangler.jsonc`.
- **Station keys.** Each station holds its own key. If the stations change hands, replace their keys
  on the station board and give each station its new key through the setup mode
  ([firmware](../firmware/README.md#a-replaced-key-or-a-move-to-another-event)).

## What costs money

- **The warm instance.** It's off. [Operations](operations.md#production) planned to keep one Event
  Service instance running through the showcase, but nobody switched it on, so the Event Service
  costs nothing while nobody uses it. With no instance running, the first tap after a quiet spell
  waits 1.3 to 2.0 seconds. For a large event, the runbook's
  [warm instance](../infra/README.md#the-warm-instance) section switches one on, and it costs money
  for as long as it runs.
- **The database.** TiDB bills each query in Request Units. Staging and production share
  GeeksHacking's free monthly allowance.
- **Stored versions.** Secret Manager bills each stored secret version, and Artifact Registry each
  stored image of the Event Service.
- **The Workers.** The three Workers, and the Durable Objects that carry station messages, run on
  GeeksHacking's Cloudflare plan.

## What is built

The README's [status at handover](../README.md#status-at-handover) has the list, and
[CONTEXT.md](../CONTEXT.md) defines each game. Participants claim tokens, collect stamps in the
passport, and connect with each other through the answers game and a challenge. Organizers split
them into groups and watch the map. Stations can also run team duels, the relay, the open seat and
the hint hunt. Showcase mode lets one booth demo connections again and again with the same tokens.

## Known problems

- **CI fails on `main`.** Two open seat tests in the Event screens use fixed dates, and the real
  clock passed them on 17 Nov (BAC-210). Every pull request shows a failed Event web check until
  someone fixes them.
- **Each tap on a phone opens a new browser tab** (FRO-132). Tapping a token opens its address in
  the browser, which opens a new tab each time. An installed web app (a PWA) stops this on Android
  only. An iPhone opens a link from an NFC tag in Safari whatever is installed, so stopping it on
  iPhones needs an app of some kind.
- **The hint hunt has two untried checks.** On 16 Nov the team played it on a real station on
  production, and rounds ended on time in wins and losses. Nobody has since tried on a station
  losing a round by three wrong taps, or hints arriving on time with no map open, which BAC-206
  fixed in code (HAR-55). Separately, a hint that arrives while a tap's result is on screen can
  show after the round is won (BAC-209).
- **The token writer's uploads are off** until someone sets the Worker secret
  `TOKEN_WRITER_KEY_HASH` on `geekykey-service` (HAR-31, and the runbook). Until then a GeekyKey
  admin loads the writer's log on the Token kinds screen.

## Planned changes

The README lists these under [status at handover](../README.md#status-at-handover):

- logins through the GeeksHacking Portal instead of Firebase;
- removing the claims stand-in once the Portal has its tag APIs;
- moving the Event Service and its screens to a repo of their own;
- infrastructure as code for the Google Cloud setup.

## Tickets

The team tracked its work in the `geekykey` workspace on Linear, with one team each for the backend
(`BAC`), the screens (`FRO`), the hardware (`HAR`) and the capstone report (`REP`). Every ticket
this page names is there. The showcase and testing plan is a Linear document, because this repo is
public.

The report tickets and the booth tickets ended with the capstone. The backlog still holds ideas
from the team and from Julian that nobody has started, such as the token page sending its owner to
the event that's on now (BAC-23) and a recruitment board (BAC-154).

## Hardware

| Item | What it is |
|---|---|
| Main Station | A station on an ESP32-S3, set up for production |
| Reader 2 | A station on a classic ESP32 (DOIT DevKit V1), set up for production |
| Token writer | A spare ESP32-S3 station that writes each token's address and logs its kind |
| Tokens | NFC tags (NTAG213) in printed cases, written and claimed by test users |

[firmware/README.md](../firmware/README.md) says how to flash a station, set its key and Wi-Fi,
and write tokens. The token write password sits in the token writer's gitignored `secrets.h`, and
Adam keeps a copy outside the repo. Without it nobody can rewrite a written token, so it goes to
whoever keeps the token writer.

## Still to agree

- **Who keeps the hardware**, and the token write password with it.
- **A licence.** The repo is public and has no licence, so nobody else may use, copy or change the
  code. GeeksHacking owns the repo, so it chooses one, after checking what the polytechnic's rules
  say about work done for a capstone.
- **Whether the team stays on** after the handover, and with what access.
