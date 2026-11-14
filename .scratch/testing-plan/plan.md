# Testing plan: coverage reporting and journey checks

For FRO-167 (coverage and CI reporting) and BAC-178 (cross-service and physical journeys). Drafted by Adam with Claude on Sat 14 Nov 2026, for the team to agree. It adds to the [showcase and testing plan](https://linear.app/geekykey/document/showcase-and-testing-plan-53253683443c) and doesn't replace it. That document still decides readiness for the showcase.

The dates that shape it: last merge Sun 15 Nov, setup and rehearsal Mon 16 Nov, showcase Tue 17 Nov, report Thu 19 Nov. After that, the work goes to the Hackomania 2027 team with Julian.

## What the evidence shows, and what it doesn't

| Evidence | Shows | Doesn't show |
| --- | --- | --- |
| Unit tests (Vitest) and their coverage | Which lines and branches the tests run, in each app on its own, with the other services faked | That the services agree with each other, that a test would fail on wrong behaviour, or anything about phones and stations |
| Browser tests (Playwright on the mock dev server) | The Event screens' start-up, routing and login link in real Chromium | Anything behind the mock: the services, Firebase, a real phone's NFC |
| The smoke test in CI (both services, TiDB in Docker) | A station's tap and heartbeat cross from the GeekyKey Service to the Event Service and land in the database | Phone journeys, login, Cloud Run, Cloudflare's network, TiDB Cloud |
| Firmware laptop tests (`firmware/*/test/*.cpp`) | The station's timing, screen, socket and message rules | The reader, the screen, the buzzer and Wi-Fi on a real board. CI doesn't run them yet |
| Checks on production with real phones and stations | The journey works on the day's setup | Anything at a large event, over several years, or under load |

Mock browser tests are never evidence that a real phone, station or deployed service works. Only the last row is.

## Coverage baseline, 11 Nov

Measured locally on 11 Nov, at about commit `c47fe70`, with Vitest's V8 coverage passed on the command line. No config in the repo produces it yet.

| App | Lines | Branches | Notes |
| --- | --- | --- | --- |
| Event Service, `src/` | 96.9% (1561 of 1611) | 92.7% (1022 of 1103) | Application code |
| Event Service, `scripts/` | 46.9% (245 of 522) | 38.7% (75 of 194) | Operational scripts. The smoke test is one of them, and runs as its own CI job |
| Event Service, together | 84.66% | 84.57% | The figure BAC-178 quotes. The scripts pull it down |
| GeekyKey Service | 99.24% | 94.65% | Runs in workerd |
| Event web | 90.10% | 88.17% | |
| GeekyKey web | 95.94% | 89.45% | |

Instrumentation and environments differ, so compare each app with its own earlier figure, never one app with another.

The baseline is already out of date: 67 commits have merged since, among them the relay (BAC-184), station messages (BAC-182), the open seat (BAC-190) and the avatar look (BAC-191). Step 5 below measures it again on the showcase commit.

### The gaps worth closing, from the baseline

Ranked by what a failure would cost, not by how many lines are missed.

1. **The screens' handling of service errors.** GeekyKey web's `src/api/http/client.ts` has 64% of branches run, and Event web's misses 4 branches. These map the agreement's error codes to the wording in its section 13, so a missed branch can show a person the wrong sentence.
2. **The booth's fallbacks.** Event web's `fallback-form.tsx` (64% of branches) is the organizer form that logs a tap by user ID when a station fails. `taps-screen.tsx` (60%) is the tap log beside it.
3. **Team duels' rules.** `games/team-duels/team-duels.ts` misses 14 branches, the most of any game.
4. **The Event Service's settings at start-up.** `src/config.ts` has 68% of branches run. A wrong setting here stops a deploy from starting.
5. **The route guard.** `require-role.tsx` has no unit test. The browser test "participant cannot open organiser routes" covers it, so this is low.

The avatar's 3D drawing (`voxel-world.ts`, `sticker-3d.ts`, `confetti.tsx`) has almost no coverage, which is fine: screenshots (`pnpm shot`) check it, and a unit test of WebGL output would prove little. It goes on the exclusion list below.

## Decision: report coverage in CI, don't gate on it

Proposed for the team to agree.

- **Each Vitest app writes a coverage report in CI.** The Event Service, the GeekyKey Service, Event web and GeekyKey web each add `@vitest/coverage-v8` and a `test:coverage` script. CI runs that in place of `test`, uploads `coverage/` as an artifact kept for 30 days, and writes the four totals into the job summary, so a reviewer sees them on the PR without downloading anything.
- **No thresholds.** A threshold would block merges on Sun 15 Nov for a number nobody has argued for, and it rewards tests that run lines without checking them. A reviewer compares the summary with the last run on `main` and asks about a big drop. The Hackomania 2027 team can set thresholds once they've lived with the numbers.
- **The Event Service reports `src/` and `scripts/` apart.** Its scripts are run by hand against a database, and the smoke test is a script with its own job.
- **The exclusion list** is test support and code only a person can judge: the mock clients (`src/api/mock/**`), `dev-login-form.tsx`, `main.tsx`, and the avatar's 3D drawing. Each exclusion carries a comment saying why.
- **The screens' Workers (`apps/*/worker/`) get no coverage figure.** Their tests start `wrangler dev` and send it requests, so V8 coverage in the test process never sees the Worker's code. Their tests stay as behaviour checks.
- **The updates site gets no coverage figure.** It has no unit tests. Its build is its check: it fails on a bad entry, a dash or a missing changelog line.
- **The firmware's laptop tests join CI.** They are six C++ files that compile with `c++ -std=c++17` and print `All passed`. A job that runs them costs seconds. This is the one CI gap the coverage work turned up that isn't about coverage.

## Journeys to check on real phones and stations

Owners follow the showcase plan: Adam for integration, Zi Tao for stations and tokens, Ethan for the screens, Joshua for recording evidence. Each journey runs on production with the team's real tokens, because the tokens point there.

| ID | Journey | Expected | Owner | When | Done so far |
| --- | --- | --- | --- | --- | --- |
| J1 | Claim a token on a phone, then tap it | The token page names its owner | Adam | Mon 16 | 23 Oct (checkpoint 6), 5 and 11 Nov |
| J2 | A visitor's own phone taps a teammate's token, logs in as a guest, gives a name and answers, joins, taps again, and the teammate presses Accept | Both phones show the connection | Adam | Mon 16, on one iPhone and one Android phone that aren't ours | 5 Nov with the old two-tap rule; Accept since then by hand only |
| J3 | After Accept, the challenge plays | The match shows new questions, the dice or the reaction test runs, and a win adds an avatar piece | Ethan | Mon 16 | BAC-170 (8 Nov) |
| J4 | An organizer makes groups, then a latecomer joins | The latecomer is placed in a group | Adam | Mon 16 | 5 and 11 Nov |
| J5 | Two people in different groups connect | The map's web draws the line on the booth's plan | Ethan | Mon 16 | FRO-95 on production |
| J6 | A tap at a real station running the passport | The LCD shows the line, the buzzer sounds, and the stamp shows on that person's passport at its next poll | Zi Tao | Mon 16 | HAR-52 (13 Nov) |
| J7 | The same token at the same station again, inside 5 minutes | "Already counted" on the LCD, and no second stamp | Zi Tao | Mon 16 | Checkpoint 2 with a test station's key |
| J8 | The station loses Wi-Fi, takes 3 taps, then gets Wi-Fi back | Each tap arrives once, and the idle line says when Wi-Fi is gone | Zi Tao | Mon 16, on the booth's own hotspot | HAR-9 (10 Nov), HAR-49 |
| J9 | Change the challenge setting, and switch a station from the passport to the relay or the open seat | The next connection plays the new challenge, and the station's next tap plays the new game, with no deploy | Adam | Mon 16 | HAR-52; HAR-53 by Sun 15 |
| J10 | Each fallback: the QR code on My tokens, the organizer form for a failed station, a spare plain token, and the rehearsal recording | Each one gets the demo past its failure | Adam | Mon 16 | Not yet run as a set |
| J11 | Each token design read a fixed number of times on an iPhone, an Android phone and a station, with a plain token to compare | Reads per design, with failures | Zi Tao | Overdue (HAR-42, due Thu 12) | Not run |
| J12 | Reset between demo runs: the guest signs out and sets up again with a new name | Time taken, and that the next run starts clean | Adam | Mon 16 | Not timed |

The three-minute demo running twice in a row with no developer help (BAC-165) runs J1 to J6 and J9 in order, so most rows are checked by running it, not separately. J8, J10, J11 and J12 need their own time.

### Recording results and failures

One shared sheet for the team, kept off the repo because the repo is public. One row per run: journey ID, date and time, server (production or staging), phone or station, who ran it, the result (pass, fail or not run), the evidence (a video and its timestamp, or a log time) and a ticket for any failure. A failure on Mon 16 Nov gets a ticket and a fallback, not a code change, since the last merge is Sun 15 Nov.

The showcase plan's Testing section links to the sheet and keeps "done" separate from "planned", as BAC-178 asks.

## What the visitors did, without PostHog

FRO-168 asked whether PostHog could watch the test session. It was cancelled on 11 Nov with the Fri 13 Nov session, and the question came back for the showcase, where visitors use their own phones (BAC-168). The answer is still no, for a new reason.

Every step a visitor takes already stores a time in the Event Service: the guest is created (`users.created_at`), names themself (`users.name_set_at`), fixes their answers (`answers.fixed_at`), joins a group (`group_members.joined_at`), sends their half of a request (`meeting_halves.a_met_at` and `b_met_at`) and connects (`connections.connected_at`). Those give the visitor funnel PostHog would have given: how many reached each step, and how long each step took. They come from our own database, with no third party and no extra code on production.

What PostHog adds beyond that is time spent on a screen before giving up, and replays. Both need the automatic capture and session replay that FRO-168's evaluation of 11 Nov says to switch off, because they can send token addresses and login links to PostHog. Adding an SDK the day before the last merge would also put an untested change on the screens visitors use.

So after the showcase, before anyone clears the event, Adam runs a read-only query on a backup (`db:backup`, BAC-174) that counts visitors at each step and the median time between steps. Only the counts and times go into the report. FRO-168 stays cancelled, with a comment saying why.

## Cross-service tests to add

The smoke test (BAC-43) runs three checks on every PR: a claimed token's tap is stored with its owner, an unclaimed token gets `unknown_token`, and a heartbeat sets `last_seen_at`. Each reads the database, not only the answer. Every other journey crosses the two services only in unit tests with the other side faked. In order of risk:

1. **Connecting through both services.** A phone's meeting (`POST /api/v1/tokens/{uid}/meet` on the GeekyKey Service) reaches the Event Service as a request, and the other person's Accept makes one connection. This is the booth's main journey (J2), and today only people have run it across both services.
2. **The Event Service is down, then comes back.** A tap while it's down gets `503 event_service_unavailable`. The same tap resent after it restarts is stored once, and resent again gets `duplicate`. That is the station's retry path, run without a station.
3. **The login link.** A link made by the GeekyKey Service logs the person in on the Event Service once, and a second use is refused.
4. **A station message.** The Event Service sends a message, and a station connected to the GeekyKey Service's socket receives it (BAC-182, HAR-51).

Event isolation, also in BAC-178, isn't tested because there is only one event. The second isolated event was dropped from the showcase plan on 6 Nov.

Stand-ins these tests still use: the claims stand-in for the Portal, dev login for Firebase, TiDB in Docker for TiDB Cloud, and `wrangler dev` for Cloudflare's network. Cloud Run's cold start (up to about 2.6 s, checkpoint 2) isn't reproduced. The stress test (BAC-21) is still to run.

## Mutation testing

Coverage says a line ran, not that a test would fail if the line were wrong. A trial of StrykerJS on a few rules would measure that: the connection rule across groups, the cooldown and duplicate checks in the tap pipeline, the group split, and team duels' scoring. Record how many changed copies of the code the tests failed to catch, and how long a run takes. This is for the Hackomania 2027 team, after the report.

## Order of work

| # | What | Owner | When |
| --- | --- | --- | --- |
| 1 | Agree this plan, including the CI decision | Team | Sat 14 Nov |
| 2 | Set up the results sheet, and run J11 (HAR-42) | Joshua, Zi Tao | Sun 15 Nov |
| 3 | J1 to J12 at the rehearsal, recorded in the sheet | Adam, Zi Tao, Ethan | Mon 16 Nov |
| 4 | Backup, then the visitor funnel query | Adam | Tue 17 Nov evening |
| 5 | Coverage in CI (the decision above), merged after the showcase. Its first run on `main` is the new baseline for the report | Adam | Wed 18 Nov |
| 6 | Report text: B4.3, B4.4 and Component C (below) | Joshua, with Adam's drafts | Thu 19 Nov |
| 7 | Tickets for the next team: the cross-service tests, the firmware CI job, the unit gaps, the Stryker trial | Adam | Thu 19 Nov |

Nothing here changes app code before the showcase. Steps 5 and 7 change CI and tests only, after it.

## For the report

**Component B, B4.3 (subsystem testing).** The four-layer table becomes the five rows of "What the evidence shows" above, each with its tool and where it runs. The coverage table goes beside it with the warning about comparing apps. Four sentences now in B4.3 are wrong and need fixing whatever else happens:

- B4.3.1 says the backend's tests run in workerd. Only the GeekyKey Service's do. The Event Service's run on Node against TiDB in Docker.
- B4.3.1's "160 passed assertions across 11 test files" and its health test for `geekykey-backend` are from the first backend, before 2 Oct. The Event Service alone has 49 test files now.
- B4.3.2 calls the amber Cooldown badge "HTTP 429 / Rate Limited". In the agreement, `cooldown` is a tap result that is stored and doesn't count, and `429 rate_limited` is a different answer for too many requests.

**Component B, B4.4 (integration).** Add the smoke test as the check that runs on every PR, with what it covers and what it doesn't, and the rehearsal's journey results from the sheet.

**Component C, C1.2 (test of the prototype).** The journey IDs J1 to J12 become the test-case rows the table already has (scenario, input, expected outcome, result), next to the 5 Nov TC rows. The sheet gives the results.

**Component C, C2.1 (functionality and consistency audit).** The CI checks that run on every PR, the coverage figures, and "What the evidence shows" as the honest limit of each.

**Component C, C1.4 and C5 (weaknesses and limitations).** Mock tests aren't evidence about real devices, the services are tested together only for station taps, the stand-ins listed above, no stress test, and coverage measures lines run, not correct behaviour.

**Component C, C3 (the showcase).** The visitor funnel's counts and times, as the evidence for what visitors did on their own phones.

**A method decision worth a paragraph.** Choosing our own database over PostHog for the visitor funnel, and why: the same counts, no third party seeing token addresses, and no untested code on the screens on the day. It shows privacy weighed against measurement, which C4 or C5 can use.

Component C now holds two structures, "C. Evaluation" and "C. Project/System Functionality", and the second has C1 twice. Joshua should pick one before this text goes in.
