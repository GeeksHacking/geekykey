# Thu 8 Oct 2026: meeting with Julian and Qing Guan

Adam's agenda for the in-person meeting: a progress update first (section 0), then the asks. The asks gather everything waiting on Julian or Qing Guan from [the spec](../db-hosting/spec.md) (sections 6, 9, 11.3 and 12), the hosting map's tickets 23, 24 and 27, and the message drafts in `../db-hosting/assets/`. The drafts hold the longer wording; this page is the list to work through, with room to write the answers.

Checked against the repo on 8 Oct: `apps/backend` on `main` has no `wrangler.jsonc` any more (BAC-17), the repo is still private, and `main` has no branch protection.

## 0. Progress since the 2 Oct meeting

Open with this, in about three minutes, then go on to the asks. Taken from the updates site's changelog (2 to 7 Oct), `git log`, merged PRs #32 to #43, and the research notes in `../db-hosting/research/`.

### The short version, to say first

Since the last meeting we've replanned the backend for two platforms, as agreed on 2 Oct, and the backend now runs as a Node server in a container, ready for Cloud Run. The plan had a few twists on the way, mostly from the GeekyKey Service having no database. What's left before the first deploy is our Google Cloud project, which is the first ask today.

### Where we left off on 2 Oct

- That morning, Hyperdrive couldn't sign in to TiDB Cloud: TiDB's gateway asks every client to sign in a second time (an AuthSwitchRequest), and Hyperdrive doesn't support that.
- At the meeting: the Event Service moves to Cloud Run, the GeekyKey Service keeps no database, and its tables move to the Event Service. On WhatsApp after: Cloud Run "v1" with TiDB, and the GeekyKey Service on Workers, with any cache to be decided.

### What's done

**Planning (3 to 7 Oct)**

- The hosting plan was redrawn around eight new questions and all eight are answered.
- The spec was rewritten for two platforms.
- Version 0.3 of the API agreement is drafted, for Ethan's review.
- The Linear tickets were rewritten to match (BAC-16 to 19, HAR-13, FRO-32).

**Backend**

- The whole repo runs on Node 24 (PR #42).
- The backend runs as a Node server, built into the container image Cloud Run will run. It answers stations and screens exactly as before, and it checks that an idle database connection still works before reusing it, since Cloud Run pauses the server between requests. CI builds and starts the image on every pull request (PR #43, BAC-17).
- The production database on TiDB was set up on 2 Oct (BAC-10), with today's tables, two limited logins and a test station.

**Screens (Ethan)**

- The GeekyKey screens have their own API client, on a mock, and sign in and out (PRs #40 and #41).
- Organizers add a station to the passport or change its settings (PR #39). Only passport stations count as stamps.
- Polled screens keep their last data when rate-limited. The tap log and the CSV export show passport names.
- The Event screens no longer pair tokens (PR #32), since claiming moved to the GeekyKey screens.

**Stations**

- 2 Oct: the reader no longer starts switched off on about half of its starts.
- 6 Oct: each result shows for 2 seconds instead of more than 4. This builds, but hasn't been tried on a station yet.

**Upkeep**

- All three web apps moved to Tailwind 4 to clear a security advisory with no fixed version (PR #38). Each screen was compared with the old build.
- `sharp` was bumped for another advisory.

### The twists and turns

1. **Getting past Hyperdrive.** Before the meeting we measured the two ways a Worker could reach TiDB without it. `mysql2` used about 20 ms of CPU per tap, twice the free plan's 10 ms. TiDB's serverless driver used 7 ms, which only just fits. That supported moving the database work to Cloud Run.
2. **No database in the GeekyKey Service raised two questions.**
   - **Stations** now belong to the Event Service that registers them. The GeekyKey Service keeps each event's list of station keys in memory, refreshed every minute, so a fake key still never reaches the database. The cost is that moving a reader to another event means reflashing it (ask 2.2).
   - **Token owners** have nowhere to live until the Portal's tag APIs exist, so they go in a claims stand-in on our Cloud Run server until just after 18 Nov (ask 2.1).
3. **Should a station wait for the event's verdict?** We considered not waiting. The station keeps waiting, because amber for "too soon" and "claim this token on a phone" both need the answer. One 4-second deadline now covers the owner lookup and the hand-off, inside the station's 5 seconds. When the server is slow, the station saves the tap and shows "Will send later". The heartbeat no longer waits at all.
4. **Julian's Redis idea.** We don't cache owners before the switch, because the stand-in sits next to the hand-off and a cache could show a token claimed a moment ago as unclaimed. After the switch, claimed tokens' owners are cached in Cloudflare's Cache API for up to 5 minutes. It's free and needs no new account. Redis would need a fresh connection and sign-in on every Worker request.
5. **Which runtime on Cloud Run.** Node, Bun and Deno all ran the backend unchanged and tied on speed: the database sets the pace. Bundled into one file, Node starts as fast as Bun (about 87 ms). Node won because the tests, CI and every other app already use it.
6. **A scare about the free Workers plan.** The first estimate was about 430,000 Worker requests a day, against a free limit of 100,000. It assumed every passport stays on screen for 4 hours. Our screens stop polling in a hidden tab, so the recount is 60,000 to 90,000, mostly from organizer screens. We're staying on the free plan, and the rehearsal will measure the real number (section 5.1 has the details).
7. **Staging.** On 7 Oct we set up a staging copy on Adam's own Cloudflare account and dropped it the same morning. Staging becomes a second Cloud Run service instead (BAC-19).

### Also in progress, nothing decided

- **Battery stations.** We're looking at stations that run on two protected 18650 cells, with a 4G modem so they don't need the venue's Wi-Fi. If we go ahead, the station needs HTTPS through the modem (HAR-10) first.

### Fill in before the meeting

- **Joshua:** the game concept and the 4 to 5 person playtest from the 2 Oct next steps. [Fill in]
- **Zi Tao:** the saved-taps check on a real station (HAR-9), and the token and scanner shape from 2 Oct. [Fill in]

### What's next

- **Checkpoint 2:** deploy to Cloud Run as soon as the project exists.
- **Checkpoint 3:** split the GeekyKey side from the Event side inside one server.
- **Dates:** the rehearsal by 7 Nov, and the showcase on 18 Nov.

---

## If there are only 15 minutes

1. **The Google Cloud project and its keyless sign-in** (1.1). Checkpoint 2 (BAC-18, BAC-11, BAC-19, BAC-12) can't start without them.
2. **The Portal's login details and the two OAuth apps** (3.1). Checkpoint 5 and the Sprint 2 A/B test both wait on them, and the request has been open since 1 Oct.
3. **The claims stand-in** (2.1). Checkpoint 3 builds it, so it needs a yes or no before then.

---

## 1. Setting up the Event Service on Cloud Run (Julian and Qing Guan)

What we propose: run the Event Service the way the Portal runs. One Cloud Run service in Singapore, deployed by GitHub Actions on every push to `main`, no key stored in GitHub, secrets in Secret Manager, and its address through a Cloud Run domain mapping. Today's backend moves there first, unchanged, on Node (done in code, BAC-17), and the GeekyKey Service is cut out as a Worker afterwards. Longer wording: [part 1 of the 7 Oct notes](../db-hosting/assets/message-to-julian-workers-requests.md).

### 1.1 Our own Google Cloud project

- Is a project of our own, on GeeksHacking's billing account, OK? (Fallback: a stack in the Portal's project.)
- Who creates it?
- Who sets up the keyless sign-in from GitHub (Workload Identity Federation), limited to `GeeksHacking/geekykey` and its `main` branch? It's done once.

**Answer:** Yes: our own project, on GeeksHacking's billing account. Julian creates it and sets up the keyless sign-in.

### 1.2 Roles

- Adam: deploy the service and its staging copy, add secret values, read logs.
- Ethan and Zi Tao: Logs Viewer, since station health now lives in the Event Service.
- Joshua: none.

**Answer:** Agreed as proposed.

### 1.3 The infrastructure tool (mainly Qing Guan)

- Our pick is Pulumi in TypeScript: Qing Guan's tool, in the team's language. Would Qing Guan rather have C#, as the Portal uses, or something else?
- Would Qing Guan review `infra/` (BAC-18)?
- Fallbacks: Pulumi in C#, Terraform or OpenTofu, or plain `gcloud` commands at first.

**Answer:** Pulumi is nice if we have the time, but not needed. Julian would rather the architecture firmed up and the MVP ran first: set the services up by hand, then turn the glue into code. Adam's call after: resources by hand with `gcloud`, each command in a runbook (`infra/README.md`), and the GitHub Actions deploy with keyless sign-in stays.

### 1.4 The address

- A DNS record for `event-api.geekshacking.com` pointing at Google, with Cloudflare's proxy off, as for `portal-api.`. Who adds it, and how do we ask when we're ready?
- Confirm the domain mapping is fine, rather than a Google load balancer at about US$18 a month.

**Answer:** Not settled: to confirm when we're ready. The domain mapping wasn't questioned.

### 1.5 A budget alert

- On the project, sent to Julian and Adam. At most 2 instances; one kept warm only on event days (the rehearsal by 7 Nov, and 17 to 18 Nov).

**Answer:** Not settled: to confirm.

### 1.6 "Cloud Run v1"

- What did Julian mean on 2 Oct? Our guess: the domain mapping, which only exists in Cloud Run's v1 interface. The setup uses it either way.

**Answer:** Julian finds v2 costs noticeably more, for reasons that aren't clear, so stay on v1 unless we need a v2 feature. We read it as the v1 interface (the domain mapping) and the first-generation execution environment.

---

## 2. Two provisional decisions (Julian)

### 2.1 The claims stand-in, until the switch after 18 Nov

The Portal's tag endpoints haven't started, so for the showcase the claims sit in a small "claims stand-in" on our Cloud Run server, in the same TiDB database. It offers exactly the four calls asked of the Portal, only the GeekyKey Service can reach it, and it isn't part of what an Event Service builds, so token IDs never reach an Event Service. After the showcase we copy the claims to the Portal with the normal claim call, point the GeekyKey Service at the Portal and delete the stand-in.

Why not the Portal at the showcase: every tap would wait on a Portal lookup, the station gives up after 5 seconds, and the Portal runs as one instance taking one request at a time that sleeps when idle.

On Julian's Redis idea (2 Oct): no owner cache at the showcase, since the stand-in sits next to the hand-off and a cache could show a just-claimed token as unclaimed. After the switch, owners are cached in Cloudflare's Cache API for up to 5 minutes, claimed tokens only, cleared on claim or release. Redis Cloud would cost a fresh connection and sign-in per Worker request, too much of the free plan's 10 ms of CPU.

- Is the stand-in OK?
- Fallback if not: switch to the Portal before the showcase, only if the tag APIs are live by 28 Oct, with a warm Portal instance that takes several requests at once.

Longer wording: [part 1 of the tag APIs message](../db-hosting/assets/message-to-qing-guan-tag-apis.md).

**Answer:** "It should be ok." After the switch, Julian asked whether the Cloudflare cache can keep an owner for 1 hour, and if not, Redis or another KV cache. (Checked after: the Cache API keeps an entry for its `max-age`, but per data centre, and a delete clears only the local copy.) Adam's call after: since the showcase logs in through Firebase (3.1), its claims are thrown away, not copied to the Portal.

### 2.2 Moving a reader to another event

Each Event Service now registers its own stations and issues their keys, so there are no links. To move a reader: it sends its saved taps to the old event, then it's flashed with its flash erased and a key from the new event. It becomes a new station there.

- Is a reflash acceptable, given Julian wanted pointing stations at a new event to be easy (27 Sep)? Fallback: a firmware setup mode that takes a new key without USB.
- Is retiring the `no_event` status OK, with the flash erased on each move?

**Answer:** No reflash: a station should be set up from a terminal or a browser page instead. So the firmware gets a setup mode (Zi Tao, before checkpoint 4). `no_event` retired: no objection.

---

## 3. Qing Guan: the Portal

### 3.1 Logging in through the Portal

Sent on 1 Oct as [the login message](../db-hosting/assets/message-to-qing-guan-login.md); still no reply in the spec. Checkpoint 5 waits on it, and so does the Sprint 2 A/B test (between 5 and 18 Oct, date from Mr Pang): participants see their passports only by logging in, and dev-login only signs in seeded users.

- The two OAuth apps and their redirect URLs:

  | App | Redirect URLs |
  |---|---|
  | The GeekyKey Service | `https://key.geekshacking.com/auth/callback`, `http://localhost:5174/auth/callback` |
  | The Event Service | `https://event.geekshacking.com/auth/callback`, `http://localhost:5173/auth/callback` |

- Does the Portal accept `http://localhost` redirect URLs?
- The issuer, each app's client ID, which claim carries the display name, and whether there's a client secret.
- Roughly when? It decides whether the A/B test can use production or a laptop.

**Answer:** OIDC, but a separate login for the showcase: Firebase, so the showcase's users don't end up in GeeksHacking's database after teardown. Google sign-in for anyone, and GeeksHacking's login as an OIDC provider inside Firebase for those with an account. (The Portal's GitHub-only login cut about 90% of "food tourists" from hackathons.) Adam checks with Mr Pang about GeeksHacking's login at the showcase, and sets up Firebase. Adam's calls after: our existing Firebase project, which Julian links to GeeksHacking's billing account; how a service checks the login depends on whether a Worker can do it (ADR 0004).

### 3.2 The participant QR code

- What does the Portal's participant QR code hold? The QR fallback scans it and takes `user_id` only.

**Answer:** Not settled. With Firebase at the showcase, the Portal's QR code no longer fits (spec section 12).

### 3.3 The tag APIs

- Did part 2 of [the tag APIs message](../db-hosting/assets/message-to-qing-guan-tag-apis.md) reach Qing Guan? If it went out before 7 Oct, the follow-up at its end (the shared 4-second deadline, and the owner cache) still needs sending.
- Roughly when might the APIs be ready? No rush: claims stay on our side until just after 18 Nov.
- What happens to a user's tags if their account is deleted?
- For events that use the tag APIs, could the Portal keep an instance warm and take more than one request at a time?

**Answer:** Not sent yet, but the Portal's team agrees with our approach: claims stay with us until after the showcase. The other questions weren't answered.

---

## 4. Housekeeping (Julian)

- **Workers Builds:** please disconnect it from `apps/backend`. `wrangler.jsonc` left that folder with BAC-17, so every push to `main` now builds and fails. It's connected again for the GeekyKey Service's own folder at checkpoint 4.
- **Going public:** make the repo public and protect `main`. Workers Builds needs a protected `main` (1 Oct), and the keyless sign-in trusts `main`, so its protection matters. Can Julian's two architecture diagrams in `.scratch/db-hosting/assets/` be public?
- **`key.geekshacking.com/t/`** must keep working for as long as tokens are in use, since the URL is written on every token.
- **The TiDB console:** confirm only Julian can use it, and so only Julian can restore a backup on the day.
- **Seeing the GeekyKey Service on event day.** The Event Service's logs are ours on Google Cloud, but the team can't see the GeekyKey Service's Worker logs or the account's request count. Which does Julian prefer: read-only access to Workers Observability and the account's usage; Julian, or someone Julian names, watches them on the day; or we rely on the stations and the station board? Settle before the rehearsal.
- **The Event Service's own repo at the split** (checkpoint 4): who creates it, and under which organisation?
- **The showcase's hours** on 18 Nov, and setup on 17 Nov, if Julian knows them.

**Answers:**

- Workers Builds: sure, Julian disconnects it.
- Going public: sure, and the diagrams can be public.
- `key.geekshacking.com/t/`: Julian makes sure it keeps working, and `key.` never changes.
- The TiDB console: yes, only Julian, and he'll be at the showcase.
- Seeing the GeekyKey Service on the day: not settled. Settle before the rehearsal.
- The Event Service's own repo: under the GeeksHacking organisation.
- The showcase's hours: not known yet.

Also from the meeting:

- **The token's URL** is always `https://key.geekshacking.com/t/<UID>`. Julian's idea: the GeekyKey screens check the login, then route the owner to the ongoing event, or show their profile. For the showcase, assume one event at a time; later, the Portal lists active events with their Event Service addresses. Adam's call after: a backlog idea (spec section 3.7).
- **The cooldown:** 5 minutes now, a setting per event; 15 minutes suggested. Open for Adam.
- **Polling, not server-sent events,** is fine at this size.

---

## 5. Only if it comes up

### 5.1 Will the free Workers plan last the showcase day?

Adam accepted the free plan on 7 Oct. In short: the event's screens forward their API calls through a Worker, and every forwarded call counts against the free plan's 100,000 requests a day, shared by every Worker on GeeksHacking's account. A showcase day should use about 60,000 to 90,000, mostly organizer screens polling all day. Going over stops every Worker on the account until 8 am; stations keep their taps but nobody gets a stamp. We can poll less often, and the rehearsal gives the real number. The workings are in [part 3 of the 7 Oct notes](../db-hosting/assets/message-to-julian-workers-requests.md).

- Is the Portal's web app on the same Cloudflare account, and does a page load run a Worker?
- Are other GeeksHacking Workers on that account busy on a showcase day?

**Answer:** Discussed, not answered: the two questions stay open.

### 5.2 Event day

The spec asks Julian to be reachable by phone on the day, to upgrade to Workers Paid on the spot past 70% of the free day, to roll back a Worker when asked, and to check TiDB's Request Units the evening before (spec section 9). These come later, but it's fine to mention them now.

**Answer:** Julian will be at the showcase. Freeze the backend about two weeks before (Adam's call after: one week, from Wed 11 Nov, and the last merge on Mon 16 Nov), with no deploys the night before. Stress-test before the showcase, in a classroom with other groups or by spamming the backend; rate limiting isn't built yet. Julian also raised a server-side queue for taps (backlog).

---

## After the meeting

For each answer, update where the decision lives:

- [x] Spec section 11.3: move each agreed decision out of "Provisional", or switch to its fallback. Section 12: close "Cloud Run v1", the localhost redirects, the TiDB console and anything else answered.
- [x] Spec section 6: checkpoint 2's "Waits on" column.
- [x] Tickets 23 and 24 (and the map's entries for them): record Julian's answers on the stand-in and the reflash.
- [x] If the reflash is agreed, drop "provisional" from [the message to Zi Tao](../db-hosting/assets/message-to-zi-tao-station-contract.md); if not, plan the setup mode with Zi Tao.
- [x] Linear: BAC-18 (the tool, the project), BAC-11 and BAC-19 (the project, the DNS record).
- [x] An ADR if the project or the tool changes from what ticket 27 assumed.
- [x] Changelog lines on the updates site for each decision settled.

Done on 8 Oct: the spec's section 2 has "The 8 Oct answers"; the reflash wasn't agreed, so the message to Zi Tao now asks for a setup mode; ADR 0004 records the Firebase login (the tool change gets no ADR, being easy to undo); tickets 23, 24 and 27 have notes; Linear and the changelog are updated.
