# GeekyKey

GeekyKey is the NFC token system for GeeksHacking events. Each person claims a physical token, an
NFC tag with an address written on it. They tap it at ESP32 reader stations to collect stamps and
points, and tap their phone on someone else's token to connect with them. Organizers run the event
from the Event screens: stations, groups, the tap log and a map of the hall.

A capstone team built it with GeeksHacking for the Capstone Showcase at Ngee Ann Polytechnic on
Tue 17 Nov 2026, and is handing it over to the GeeksHacking team.

## The pieces

```text
NFC token ──tap──▶ ESP32 station ──▶ GeekyKey Service ──▶ Event Service ──▶ TiDB
                                     (Cloudflare Worker)   (Node on Cloud Run)
phone ──▶ GeekyKey screens ──────────────────┘                  ▲
phone ──▶ Event screens ────────────────────────────────────────┘
```

Each part has its own README:

| Part | What it does | Address | Read |
|---|---|---|---|
| GeekyKey Service | What stations and tokens talk to. Checks station keys, finds each token's owner and hands taps on. Keeps no database. A Cloudflare Worker | `key-api.geekshacking.com` | [apps/geekykey-service](apps/geekykey-service/README.md) |
| GeekyKey screens | The token page a phone opens when it taps a token, and My tokens | `key.geekshacking.com` | [apps/geekykey-web](apps/geekykey-web/README.md) |
| Event Service | Runs one event's games (the passport, connections) and keeps the database. Node on Google Cloud Run, with TiDB | `event-api.geekshacking.com` | [apps/event-service](apps/event-service/README.md) |
| Event screens | The participant's dashboard and passport, and the organizer console | `event.geekshacking.com` | [apps/event-web](apps/event-web/README.md) |
| Shared packages | The hand-off's schemas, the Firebase login check and login links, used by both services | | [packages](packages/README.md) |
| Stations and tokens | The ESP32 station, the token writer and the setup page. Arduino sketches, outside the pnpm workspace | | [firmware](firmware/README.md) |
| Cloud setup | The runbook for Google Cloud and the Cloudflare builds | | [infra](infra/README.md) |
| Updates site | A public timeline of the project for the capstone mentors | | [apps/updates](apps/updates/README.md) |

The GeekyKey Service is the part every GeeksHacking event shares. Each event runs its own Event
Service, and this repo has the one for the showcase. Until the GeeksHacking Portal can store who
owns each token, a claims stand-in on the Event Service's server keeps that list. The words used
here (claim, kind, station key, connection and so on) are defined in [CONTEXT.md](CONTEXT.md).

## Quick start

You need [mise](https://mise.jdx.dev), which installs the pinned Node and pnpm, and Docker for the
database.

```bash
mise install           # the pinned Node and pnpm
mise run install       # every package's dependencies
mise run db:up         # TiDB in Docker, with its two databases
mise run seed          # a station and two dev users; prints a curl command that sends a tap
mise run dev           # both services and both sets of screens
```

Then open the Event screens at http://localhost:5173 and the GeekyKey screens at
http://localhost:5174. To work on the Event screens alone, skip Docker and run
`mise run dev:event-web`, which runs on mock data.
[Getting started](docs/getting-started.md) goes through each step and what to do when one fails.

## Documentation

Besides each part's README:

| Read | For |
|---|---|
| [docs/getting-started.md](docs/getting-started.md) | Setting up a laptop, running everything locally, sending a tap, the mise tasks |
| [docs/operations.md](docs/operations.md) | Deploying, staging, rolling back, clearing an event's data, secrets, who can do what |
| [apps/API-AGREEMENT.md](apps/API-AGREEMENT.md) | The contract between the screens, the services and the stations. It wins over every other document, and over the code |
| [CONTEXT.md](CONTEXT.md) and [docs/adr/](docs/adr/) | The glossary, and the decisions that would be hard to undo |
| [.scratch/db-hosting/spec.md](.scratch/db-hosting/spec.md) | The plan the services were built to, with the reasons behind each choice |

Work is tracked in Linear, in the `geekykey` workspace. `docs/agents/` says how tickets and labels
work, and `AGENTS.md` holds the rules for coding agents in this repo.

## Status at handover

Built and running in production since October 2026:

- claiming tokens, by tapping or by typing a token's UID, as a Google user or a guest
- stations sending taps and heartbeats, and organizers creating, disabling and replacing the keys of
  stations on the station board
- the passport: stamps, points, and the next stop, which the station's answer names
- connections between participants: a connection request, the answers game's match, and a
  challenge (dice or a reaction test)
- groups: organizers split participants into groups, and latecomers are placed as they join
- token kinds, loaded by a GeekyKey admin from the token writer's log
- the map of the hall, and the export of every tap

Temporary by design, and planned to change after the showcase:

- **Logins** go through Firebase (Google, or a guest). Later events log in through the GeeksHacking
  Portal ([ADR 0004](docs/adr/0004-the-showcase-logs-in-through-firebase.md)).
- **The claims stand-in** goes when the Portal's tag APIs exist. The order of that switch is in the
  spec, section 6, "After the showcase".
- **One repo.** The Event Service and its screens move to a repo of their own, under the
  GeeksHacking organisation, so another event can copy them as a template.
- **Google Cloud is set up by hand** from the commands in `infra/README.md`, with no
  infrastructure as code yet.
- **Database copies.** Only `db:clear-test-data` takes a copy, and nothing restores one:
  `db:backup` and `db:restore` aren't built.

Some steps can only be run from Adam's laptop, which holds the production database logins.
[Operations](docs/operations.md#who-can-do-what) lists them.
