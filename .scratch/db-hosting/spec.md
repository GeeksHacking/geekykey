# Spec: GeekyKey on Cloudflare Workers, Cloud Run and TiDB

The hand-off spec for the map [Move GeekyKey to TiDB and Cloudflare](map.md), written on 29 Sep 2026 from its resolved tickets, and rewritten on 7 Oct 2026 after the map was redrawn. **Adam reviews this spec before any code changes.**

> **Rewritten 7 Oct 2026.** Checkpoint 2 couldn't be done as first written: Hyperdrive can't reach TiDB Cloud. On 2 Oct the Event Service moved to Google Cloud Run with TiDB, and the GeekyKey Service stays on Workers with no database ([ADR 0003](../../docs/adr/0003-event-service-on-cloud-run-geekykey-service-without-a-database.md)). The answers of the redrawn map's tickets are folded in here, from "What does Cloud Run "v1" mean, and what does running the Event Service there involve?" to "How is the Event Service built, deployed and staged on Cloud Run?". Checkpoint 1 is done. Several decisions are provisional until Adam meets Julian and Qing Guan on Thu 8 Oct; section 11.3 lists them.

> **Updated 8 Oct 2026,** after Adam met Julian and Qing Guan ([the agenda, with the answers](../meetings/2026-10-08-julian-and-qing-guan.md)). Five things changed: the showcase logs people in through Firebase, not the Portal ([ADR 0004](../../docs/adr/0004-the-showcase-logs-in-through-firebase.md)); the Google Cloud resources are set up by hand, with no infrastructure as code for now; a station takes a new key through a setup mode instead of a reflash; the backend freezes a week before the showcase; and a stress test comes before it. The claims stand-in and our own Google Cloud project are agreed. "The 8 Oct answers" in section 2 lists everything, and section 12 what's still open.

> **Updated 9 Oct 2026** (BAC-18): the Event Service's Google Cloud project is our existing Firebase project, `geekykey-b035a`, with billing on, rather than a new one. Adam is Editor there, which lets him create resources but not grant access. So he ran the runbook's steps 1 to 5 (the APIs, the image repository, the service accounts, the empty secrets and the two services, closed to callers), and the grants need more. So Julian, as Owner, gives Adam a role that can grant, and Adam runs the keyless sign-in, each account's access, opening the services and Logs Viewer himself (steps 6 to 8); Julian runs the domain mapping and the budget (steps 9 and 10), in the web console. Each deploy account reads only its migration login; each service reads its other secrets as its own account. Adam settled three more things the same day: the project's billing account is GeeksHacking's, Julian adds the DNS record for `event-api.` once we're ready, and Zi Tao doesn't get the logs.

> **Updated 13 Oct 2026** (BAC-30): each Event Service keeps its session secret, app login and two keys in one Secret Manager secret, `APP_SECRETS`, as JSON, at Julian's suggestion. The project then stores 4 secret versions instead of 10, inside Secret Manager's free 6. The migration login stays a secret of its own. Adam's account can no longer grant access or read a secret, so Julian gives each service access to its `APP_SECRETS` (section 12).

> **Updated 23 Oct 2026,** after Adam met Julian ([the agenda, with the answers](../meetings/2026-10-23-julian.md), and [the notes](<../meeting-notes/[23 Oct 26] Capstone Meeting.md>)). The showcase game is a collectible rather than a competition, so there's no leaderboard. Julian intends the Event Service and the Event screens to become a GitHub template after the repo split, so checkpoint 7 now draws a line in the code between the base every event gets and the showcase's own games and settings. The map on the big screen comes first, then connections between visitors. Adam moved timed games down to Could, and the station's own text waits on a bigger station screen. Guests are agreed. "The 23 Oct answers" in section 2 lists everything, checkpoint 7 the new scope, and section 12 what's still open. Later the same day, Adam settled how the map reads its data and how two participants connect; checkpoint 7's "The map and connections, in detail" has the design.

> **Updated 27 Oct 2026** (BAC-88). The A/B test runs at the grad tea on Thu 12 Nov, five days before the showcase, on the same Event Service. The grad tea tries several games at once, and the one that draws the most people becomes the game at our booth at the showcase. The showcase is on **Tue 17 Nov**, with setup on Mon 16 Nov: 18 Nov was wrong. The backend still freezes from Wed 11 Nov, and the last merge moves to Sun 15 Nov. "The 27 Oct answers" in section 2 lists the decisions, and section 6, "The grad tea", has the plan.

> **Updated 28 Oct 2026** (BAC-88), after a review of the project's direction with Adam on 27 Oct. The games lock to what Julian settled on 23 Oct: the passport at the partner stations, the map, then connections, which move up to Should. The grad tea runs them as a pilot, so no game is chosen there for the showcase. The quiz is dropped, the trail becomes printed clue cards on the passport, and Find Gatsby stays the stretch game, with a go or no-go on Thu 5 Nov. Each partner station links to its group's page through an NFC sticker and a QR code. "The 27 Oct answers, later" in section 2 lists the decisions, and section 6, "The grad tea", has the plan as it now stands.

> **Updated 30 Oct 2026** (BAC-103, BAC-112), after Adam met Julian on 29 Oct ([the notes](<../meeting-notes/[29 Oct 26] Capstone Meeting.md>)). Julian measures GeekyKey by engagement, whether participants and sponsors come back, and the token people keep is the showcase's centrepiece. Each token now has a kind, written onto it with its address, so a phone tapped on it opens a different screen for each kind ([ADR 0006](../../docs/adr/0006-a-token-carries-its-kind.md)). After a passport tap, the station names the visitor's next stop: the quietest booth they haven't stamped. Connections stay, hidden or at partner booths, and count only between two kinds. Find Gatsby is dropped, Light the hall becomes a very low Could, and the first of "The checks for a new idea" changes. "The 29 Oct answers" in section 2 lists everything.

- It says what we build, and in what order. Why we chose it, and what we turned down, is in the ticket each section links to.
- **Provisional** marks a decision that can still change, and says what would change it. Everything else is decided.
- **The spec's call** marks a gap that no ticket settled, which this spec had to fill to put the steps in order. Section 2 lists every one of them for review.
- Words such as token, claim, owner, registered stations and hand-off mean what [CONTEXT.md](../../CONTEXT.md) says. Field names and status codes live in [apps/API-AGREEMENT.md](../../apps/API-AGREEMENT.md), whose version 0.3 carries this rewrite and version 0.4 the Firebase login (section 7).

## Contents

1. [In short](#1-in-short)
2. [For Adam's review](#2-for-adams-review)
3. [The architecture](#3-the-architecture)
4. [Claims behind one module](#4-claims-behind-one-module)
5. [Settings, secrets and bindings](#5-settings-secrets-and-bindings)
6. [The migration plan](#6-the-migration-plan)
7. [The API agreement](#7-the-api-agreement)
8. [Edits to the README and other docs](#8-edits-to-the-readme-and-other-docs)
9. [What each person needs from us](#9-what-each-person-needs-from-us)
10. [Event day](#10-event-day)
11. [Provisional](#11-provisional)
12. [Still to confirm](#12-still-to-confirm)
13. [Sources](#13-sources)

---

## 1. In short

- **Three kinds of service.** The Portal, Qing Guan's, knows who every GeeksHacking user is. At the showcase, people log in through Firebase instead, with Google or with GeeksHacking's login (ADR 0004). The GeekyKey Service is what stations and tokens talk to: it checks each station's key against the stations the Event Services have registered, finds each token's owner, and hands taps on. An Event Service runs one event's games and registers that event's stations. We build the GeekyKey Service, and one Event Service for the capstone showcase, whose first game is the passport. The same Event Service runs the grad tea first, as a pilot of the showcase's games (27 Oct, later). Adam copies its data and then clears it before the showcase (27 Oct).
- **Two platforms.** The GeekyKey Service and both sets of screens are Cloudflare Workers in GeeksHacking's account, which Julian sets up, and the team has no access to it (1 Oct 2026). The Event Service is a Node server on Google Cloud Run, which GitHub Actions deploys on every merge to `main`, in a Google Cloud project of our own on GeeksHacking's billing account (8 Oct), which turned out to be our existing Firebase project, `geekykey-b035a` (9 Oct). Its resources are set up by hand for now, from written commands.
- **One TiDB database,** reached only from Cloud Run through an ordinary `mysql2` connection pool. The GeekyKey Service keeps no database: it keeps a copy in memory of the registered stations, and asks for everything else.
- **Claims stay on our side through the showcase,** in a claims stand-in on our Cloud Run server, behind one module, `Claims`, and the GeekyKey Service moves to the Portal's tag APIs after it (Julian agreed on 8 Oct). The showcase's claims are deleted with its data rather than copied, since its users are Firebase users (ADR 0004). The stand-in isn't part of the Event Service, so token IDs never reach one.
- **Four addresses,** chosen by Julian on 1 Oct 2026. Stations call `https://key-api.geekshacking.com`. People open `https://key.geekshacking.com` for the token page and My tokens, and `https://event.geekshacking.com` for the passport and the organizers' screens. `https://event-api.geekshacking.com` is the Event Service's own, called by the GeekyKey Service and by the Event screens' Worker.
- **Staging** is one copy of the Event Service, `event-service-staging`, beside it on Cloud Run, against its own database.
- **Move first, split second.** Today's backend already runs on TiDB (checkpoint 1). It moves unchanged to Cloud Run and is deployed. Then the line between the two services is drawn inside it. Then the GeekyKey Service is cut out as a Worker, and stations move to it. Login, the new features and getting ready for the day come after that. The whole move is eight checkpoints (section 6).
- **Dates.** The showcase is on Tue 17 Nov 2026 at Ngee Ann Polytechnic, with setup there on Mon 16 Nov. The rehearsal on production is by Sat 7 Nov, the backend freezes from Wed 11 Nov, the grad tea is on Thu 12 Nov, and the last merge is on Sun 15 Nov (27 Oct). GeeksHacking's Cloudflare account stays on the free plan, which Adam accepts for the showcase (7 Oct), and the rehearsal checks it (section 11.1).

## 2. For Adam's review

### The 8 Oct answers

From the meeting with Julian and Qing Guan on Thu 8 Oct, and Adam's calls on them the same day. [The agenda](../meetings/2026-10-08-julian-and-qing-guan.md) has each question beside its answer.

1. **Our own Google Cloud project,** on GeeksHacking's billing account. Julian creates it and sets up the keyless sign-in from GitHub. *Since 9 Oct:* it's our existing Firebase project, `geekykey-b035a`, where Adam is Editor (section 12). The roles are as proposed: Adam deploys, adds secret values and reads logs; Ethan gets Logs Viewer; Joshua gets none. Zi Tao was to get Logs Viewer too, until Adam dropped it on 9 Oct.
2. **No infrastructure as code for now.** Julian would rather the architecture firmed up and the MVP ran first: set the services up by hand, then turn the glue into code. Pulumi is "nice if we have the time but not really needed". So the resources are made by hand with `gcloud`, and every command goes into a runbook, `infra/README.md`, from which code can be written later (the spec's call). The GitHub Actions deploy with keyless sign-in stays (Adam), and it sets the service's settings and pins its secret versions from files in the repo (`--env-vars-file`, `--set-secrets`), so they still change through a reviewed pull request (the spec's call). The warm instance is switched with a `gcloud` command from the runbook, not a reviewed change.
3. **Cloud Run "v1".** Julian finds v2 costs noticeably more, so we stay on v1 unless we need a v2 feature. We read this as the domain mapping through Cloud Run's v1 interface, which the setup uses anyway, and the first-generation execution environment. The cold start is measured on the first generation only.
4. **The claims stand-in is agreed** ("it should be ok"), and the Portal's team agrees with the approach. After the switch, Julian asked whether the Cache API can keep an owner for an hour, or else to use Redis or KV. It can: it keeps an entry for as long as its `max-age`. But each data centre keeps its own copy, and a delete clears only the copy in the data centre that runs it, so the longer the time, the longer a release can go unseen elsewhere. The time is chosen at the switch (section 4).
5. **No reflash to move a reader.** Julian wants a station set up from a terminal or a browser page instead of being reflashed. So the firmware gains a setup mode that takes a new server address, station key and Wi-Fi network without a reflash (Adam added the Wi-Fi, since every venue has its own), and clears the saved taps when the station moves to another event (HAR-14, before checkpoint 4). Since 19 Oct, a replaced key for the same station keeps them instead, since they count once they're sent with the new key (API agreement 6.1). Stations move to `key-api.` through it at checkpoint 4, and a replaced key on event day goes in through it too. `no_event` stays retired.
6. **The showcase logs in through Firebase** ([ADR 0004](../../docs/adr/0004-the-showcase-logs-in-through-firebase.md)). Google sign-in for anyone, and GeeksHacking's login as an OIDC provider inside Firebase for people with a GeeksHacking account. Its users aren't stored in GeeksHacking's database, so taking the showcase down leaves no mess in the Portal. We use our existing Firebase project, and Julian links GeeksHacking's billing account to it, which the OIDC provider needs. A user ID at the showcase is a Firebase UID. Adam checks with Mr Pang about offering GeeksHacking's login at the showcase.
7. **The showcase's claims are thrown away,** with the rest of its data. A Firebase UID isn't a Portal user, so "Copy claims to the Portal" goes, and the Portal's tag APIs start empty.
8. **How each service checks a Firebase login is provisional:** whether a Worker can do it well enough (Adam: "it depends, see if Workers works out"). The spec's call, until the check before checkpoint 5 (BAC-20): the screens sign in with Firebase's SDK, send the ID token to their own service, which checks it against Google's public keys and sets its own cookie, so ADR 0002's rule that each service logs users in itself still holds. *Settled 10 Oct:* a Worker checks the login in about 1 ms of CPU, so this stays (BAC-20, checkpoint 5).
9. **Housekeeping.** Julian agreed to disconnect Workers Builds from `apps/backend`, and to make the repo public and protect `main`. The first looks done, since Workers Builds hasn't built `main` since 8 Oct. The second isn't done yet. His two diagrams in `assets/` may be public. He makes sure `key.geekshacking.com/t/` keeps working, and `key.` never changes. Only he can use the TiDB console, and he'll be at the showcase. At the split, the Event Service's repo goes under the GeeksHacking organisation.
10. **The freeze moves earlier** (Julian suggested two weeks; Adam chose one). The backend freezes from Wed 11 Nov: only fixes merge after it. The last merge of all is on Mon 16 Nov, so nothing deploys the night before the showcase. *Changed 27 Oct (Adam, BAC-88):* the showcase is on Tue 17 Nov, so the last merge moves to Sun 15 Nov, the day before setup. The freeze still starts on Wed 11 Nov, the day before the grad tea.
11. **A stress test before the showcase,** on staging, and rate limiting before it, which isn't built yet (checkpoint 8, BAC-21). Julian also raised a server-side queue for taps. It's in the backlog (BAC-22), and the stress test decides whether we need it (section 12).
12. **Two ideas stay open.** The meeting suggested a 15-minute cooldown in place of 5; it stays at 5 until Adam decides (section 12). The token page sending its owner straight to the ongoing event, and later the Portal listing active events, is in the backlog (BAC-23, section 3.7).
13. **Polling stays.** The screens keep polling every few seconds; server-sent events aren't needed at this size.

Still unanswered: the budget alert, what the QR fallback scans, how the team sees the GeekyKey Service on the day, the showcase's hours, and the Workers free plan questions (section 12).

### The 23 Oct answers

From the meeting with Julian on Fri 23 Oct, and Adam's calls on them the same day. [The agenda](../meetings/2026-10-23-julian.md) has each question beside its answer.

1. **What GeekyKey is for:** a system that adds physical and digital interaction to GeeksHacking's events, not just a fun token. For Hackomania 2027, whose theme is physical AI, Julian named a treasure hunt with hidden or roaming stations, an exploration game, or a game room that a token opens a set number of times.
2. **A GitHub template after the split.** Julian intends the Event Service and the Event screens to become a template that each event starts from, once they move to their own repo after the showcase (BAC-39). So checkpoint 7 separates the base from the showcase's own code (section 3.7).
3. **The showcase game is a collectible,** not a competition, so there's **no leaderboard**. A leaderboard only fits a competitive game, and one by time would make this one competitive. Agreement section 12 already leaves leaderboards out, and stays that way. The bonus that moved to the quietest area every 20 minutes, and points on the station, go with it.
4. **The showcase is a fair test for sponsors,** whose booths stay in one place. It doesn't yet test how individuals meet each other, so that comes second, if the first is done in time.
5. **The order:** the map on the big screen first, the showcase from end to end; then connections between visitors, shown as counts and a web of tag-to-tag links rather than who met whom, for PDPA; then other game ideas to show at our booth. A 3D model of the floor plan is preferred for the map.
6. **Adam's calls, after the meeting:** timed games and timed rules move down to Could. The station shows the visitor's own text only if it gets an OLED or a TFT, which can show at least the tap's answer and instructions.
7. **Guests are agreed** (ADR 0005).
8. **Adam's calls on the map and connections,** after the meeting: the map reads one new endpoint, open to organizers and the map screens only, every 2 seconds, and each station's booth is a passport setting. Two participants connect by tapping at the same connection point, with no phone. Whether a connection point is one station or two goes to the group and Julian. GeeksHacking is open to paying for Workers Paid if the day won't fit. Checkpoint 7, "The map and connections, in detail", has the design.

The meeting also set next steps outside checkpoint 7: the collectible token's physical design, scheduling the raise of Firebase's limit on new accounts for the showcase (checkpoint 5's runbook step 14), the team's access to Cloudflare's logs, and pinned dependency versions with a two-week lock-file window.

### The 27 Oct answers

Adam's calls on the grad tea, from 26 and 27 Oct (BAC-88). Section 6, "The grad tea", has the whole plan.

1. **The A/B test moves to the grad tea,** on Thu 12 Nov from 3:30 to 6:30 pm in the MPH. The Sprint 2 window it was meant for closed on 18 Oct (BAC-26, cancelled).
2. **The grad tea tries several games at once,** with a Gatsby party look. The game that draws the most people becomes the game at our booth at the showcase, which keeps its sci-fi look. *Changed 27 Oct, later:* the grad tea runs the showcase's own games as a pilot, so no game is chosen there.
3. **Engagement is unique people per game,** counted from each game's own records, and games swap between stations partway through the evening. *Changed 27 Oct, later:* the pilot counts the people in each area, and what the taps show, and nothing swaps (section 6).
4. **The games:** the speakeasy quiz, the green light trail on every station, and Find Gatsby as the stretch game. No passport at the grad tea. The e-paper map card is a prototype shown at the showcase, not a game. *Changed 27 Oct, later:* the passport, with the trail's clues on printed cards, and connections. The quiz is dropped, Find Gatsby stays the stretch game, and the e-paper card is an iteration in the report.
5. **Each station's game becomes organizer data,** and a station's booth moves from its passport settings onto the station. Both change the agreement, so Ethan approves them.
6. **One Event Service runs both events.** Each event's games and their content are in the code side by side, and organizers choose each station's game. Between the events, Adam copies the data and then clears it. The agreement's section 12 now says one event at a time.
7. **One pull request switches from the grad tea to the showcase:** the screens' look, the event's name on the token page, and the winning game's showcase content. It merges by Sun 15 Nov. Until then, the token page's button reads "Open Grad Tea". *Changed 27 Oct, later:* the look and the event's name only.
8. **The showcase is on Tue 17 Nov,** with setup on Mon 16 Nov. The backend freezes from Wed 11 Nov, and the last merge is on Sun 15 Nov.
9. **Tokens go back in a collection box** at the end of the grad tea, from participants who don't want to keep them.

### The spec's calls, 27 Oct

No ticket settled these. Writing the grad tea's plan (BAC-88) needed them, and section 6, "The grad tea", has each in place.

1. **The games swap once, around 5 pm,** halfway through the grad tea. *Dropped 27 Oct, later:* nothing swaps, since no games are compared.
2. **Joshua and Adam choose the winning game by Fri 13 Nov,** from the copy taken at the end of the grad tea, so the switch can merge by Sun 15 Nov. *Dropped 27 Oct, later:* no game is chosen.
3. **The grad tea's own content goes in `src/grad-tea/`,** beside `src/showcase/`. *Changed 27 Oct, later:* it holds the grad tea's settings, and Gatsby's if he goes ahead.
4. **A grad tea game merged after the rehearsal** runs on staging first, then the group tries it on production before the clear on Wed 11 Nov.
5. **The clear also empties every game's records,** and keeps every setting, such as each station's game.

### The 27 Oct answers, later

From a review of the project's direction with Adam on 27 Oct, and his calls on 27 and 28 Oct. BAC-88's note at the top has the same list, and section 6, "The grad tea", has each in place.

1. **The problem, as the report now puts it:** visitors stay with what they came for. Sponsors' booths at Hackomania (Julian), parents at their own child's booth before they vote at the showcase (Mr Johari, through Ethan), and guests with their own group at the grad tea.
2. **The games lock to what Julian settled on 23 Oct:** the passport at the partner stations, the map, then connections. All six partner groups said yes. At least one networking game is done for the showcase, so connections move up from Could to Should (BAC-83 and BAC-86, raised to High).
3. **The quiz is dropped** (BAC-92 and FRO-86, cancelled). It needed the phone at every tap. A phone is needed once, to claim a token, and after that only to check progress.
4. **The trail merges into the passport** as printed clue cards at each passport station (BAC-94), with no code (BAC-93 and FRO-87, cancelled). At the showcase, the route crosses all three walled areas.
5. **Find Gatsby stays the stretch game,** with a go or no-go at the meeting on Thu 5 Nov (BAC-96). BAC-91, HAR-23 and FRO-88 follow it. The UWB boards are ordered now, and shown first as a demo of their own on a laptop. They join the map only after a go (HAR-22).
6. **The grad tea is a pilot, and the showcase the field test.** At the grad tea, observers count the people in each area every 15 minutes, with the first half hour, before tokens go out, as the baseline, and the taps give the stations each guest reached and the connections made. At the showcase, visitors with and without a token are compared at the voting point, if the teachers allow it. No game is chosen at the grad tea, so the switch changes the look and the event's name only.
7. **Student helpers hand tokens out at the entrance** at the showcase.
8. **The hexagon collectible** is a token with six partner pieces, prototyped and chosen by Thu 5 Nov (HAR-25, urgent).
9. **The e-paper map card** is an iteration in the report and an item on the prototype table at our booth, never a game (HAR-24).
10. **A partner group's page, from its station** (28 Oct). A station can't make a phone open a page. So each partner station gets an NFC sticker and a QR code with the group's link now (HAR-26), and the passport offers the link as a button after a new stamp if it merges by Tue 10 Nov (BAC-99, FRO-89).
11. **One more game may join** (28 Oct): the roaming station or students' picks, chosen or dropped on Thu 5 Nov (BAC-98, Adam's).
12. **After the showcase,** the handover goes to the Hackomania 2027 team, and Julian manages it.

### The spec's calls, 27 Oct, later

1. **The helpers at the entrance count the visitors who decline a token,** so the showcase's comparison has a group without one.
2. **The NFC sticker sits at least 5 cm from the station's reader,** on the opposite face, since the RC522 would read a sticker in its field as a tap, over and over (HAR-26).
3. **Web Push stays out.** It's the only way to prompt a phone whose passport is closed, and iPhones allow it only for a site added to the home screen.

### The checks for a new idea (29 Oct)

Adam's call on 29 Oct, after Mr Pang's feedback that our games are gimmicks: they add steps, end in rewards and could be done on pen and paper. Every new game or feature idea is checked against these three before it gets a ticket, and the ticket or the meeting notes say how it fared. The 29 Oct meeting notes, 1.5, apply them to the ideas so far.

1. **The four checks.** It passes all four:
   1. Tapping is the only thing the visitor does at a station. No timing, no card to read. A phone is needed once, to claim a token, and after that only to check progress (the 27 Oct answers, later, item 3). A second person takes part only where meeting them is the point, as at a connection point. *Changed 30 Oct:* it said "no second person" until connections stayed in (the 29 Oct answers, item 6).
   2. Paper or a phone can't do it.
   3. People nearby can see it.
   4. It also gives the organiser something.
2. **Mr Pang's feedback (29 Oct).** It's different from pen and paper. It answers why people skip booths, rather than only rewarding a visit. It doesn't end only in a personal reward. It's worth its cost and upkeep beside what events already do. It works with booths side by side, as sponsors' booths are at GeeksHacking's events.
3. **No leaderboard** (the 23 Oct answers, item 3). Nothing ranks people, by points, time, wins or gear. A goal the whole room shares is fine.

### The 29 Oct answers

From the meeting with Julian on Thu 29 Oct, and Adam's calls on them on 29 and 30 Oct (BAC-112). [The notes](<../meeting-notes/[29 Oct 26] Capstone Meeting.md>) have each question beside Julian's answer.

1. **What GeekyKey is measured by.** Engagement, not cost. GeeksHacking takes no money from its events, and depends on sponsors keen to sponsor again and participants keen to come again: "the key term here is experience". Julian called "a phone could do it" reductive, since the same game on a phone, a PC or a console is a different experience. Sponsors come to be known and participants come for the event, so part of the answer is bringing people to sponsors' booths. The problem statement leads with that (BAC-102). The map stays, as the evidence for organizers and sponsors rather than the headline the notes proposed in 1.3.
2. **The token is the showcase's centrepiece** (HAR-25). Something people touch, take home and collect pieces on. Not spiky, with a magnet; a coin is the simplest. The design is chosen and production starts this week, before the meeting on Thu 5 Nov. Julian suggested giving one piece free at registration, which hints there are more, and handing out the others at our booth, since the system knows which booths a token has visited. HAR-25 settles that with the design.
3. **Each token has a kind** (Adam, 30 Oct; [ADR 0006](../../docs/adr/0006-a-token-carries-its-kind.md); BAC-113, HAR-29, FRO-103). The token writer writes a one-letter kind into the token's address, `/t/<UID>?k=E`, under the write password, and logs each UID with its kind. A phone tapped on the token opens the token page for that kind, so people see different screens and work out why by comparing them, as Julian described. The log goes into a list beside the claims stand-in, and the GeekyKey Service passes each tap's kind in the hand-off, and the login link carries it. So games use the server's list, never the address. At the showcase there are four kinds, the houses, and a fifth, `veteran` (item 8). All coins look the same, so a kind shows only on screens and stations. It changes agreement 8.1, 11.2 and 11.9, and drops section 12's "archetype quests", all for Ethan's approval. It replaces checkpoint 7's Could "token types, kept as this event's own data".
4. **The station names the visitor's next stop** (BAC-98). After a passport tap, the station's 16x2 LCD names the quietest passport booth the visitor hasn't stamped, from the last few minutes' taps. Paper can't know where the crowd is. This changes Adam's 23 Oct call (item 6 there): a station shows up to two lines from its game on today's LCD, without waiting for an OLED or a TFT (BAC-111, HAR-28). *Settled 30 Oct (Adam, BAC-111):* the station shows the participant's name, the first word of it, only while they have a name of their own. The roaming station and students' picks are dropped, and the clue cards (BAC-94) no longer point to a fixed next booth.
5. **No door or room stations** for tapping in and out. Julian suggested a station per room where not every booth has one, and paths through the rooms as analytics: which room first, second and third, the most popular, and the commonest route. Each person's path through the booths comes from the export instead.
6. **Connections stay a Should** (BAC-83, BAC-86). Julian called a connection point possible, and asked why we'd put one in plain sight: hide it, or make it part of a sponsor's booth, so people have to go there. His doubts were about networking that needs a phone, or a stranger whose token was paired with yours in advance. A connection now counts only between two people whose tokens are of different kinds, which gives people a reason to find someone from another house (BAC-113). The notes' proposal to pause connections is dropped. BAC-83's questions on the layout are still open, and its 3.3 is answered by BAC-111's lines.
7. **Find Gatsby is dropped** (BAC-96, BAC-91, HAR-23 and FRO-88, cancelled). Booths can sit side by side, and 5 m and 10 m already blur (HAR-21), which keeps only its power bank run. Whether HAR-22 still buys the UWB boards, as a demo only, is Zi Tao's and Adam's call there.
8. **Veteran tokens** (HAR-29). About ten tokens of the `veteran` kind go to friends, other IDP groups and teachers before the showcase. They're Julian's mock returning participants: people a visitor has to find and ask to tap with. The clear still releases every claim, so nobody is carried over from the grad tea.
9. **A spaceship at the showcase** (Adam, 30 Oct, proposed; FRO-104). Each participant starts with a base ship, drawn by their token's kind, which assembles in an animation at the first login. Each stamp and each connection adds a part, with an animation of it joining. At the grad tea, Joshua's outfit does the same job in the Gatsby look (FRO-105). Who builds the ship and who draws it are open. It needs the user's kind and connection count in 8.1, and Ethan's call on animating it on phones. Nothing ranks ships.
10. **Light the hall is a very low Could** (FRO-97). Julian said it has "very little to do with the NFC".
11. **Sponsors' counts** (BAC-106): yes. "This many people visited your booth" is what GeeksHacking takes to sponsors.

Not discussed, and still open: what the QR fallback scans (BAC-28), Replay the night (FRO-98), the TiDB usage that sizes the stress test, the classroom run, the exit question and the MPH.

### The spec's calls, 7 Oct

No ticket settled these. The rewrite needed them to put the steps in order.

1. **The order of the redrawn checkpoints** (section 6): checkpoint 2 is the move to Cloud Run, checkpoint 3 draws the line inside the one server, and checkpoint 4 cuts the GeekyKey Service out as a Worker. Stations call `event-api.` from checkpoint 2 and move to `key-api.` at checkpoint 4, through the setup mode since 8 Oct.
2. **Inside one server, the sides talk through their own requests.** At checkpoint 3, the GeekyKey side reaches the Event side and the claims stand-in through `app.request()` in the same process, with the same paths, bodies and keys it will send over HTTPS after the split. So the wire shapes and the key checks run on production before the split.
3. **`event_stations` goes.** The Event Service now owns `stations`, so the cooldown locks the station's own row, as checkpoint 1 already does.
4. **The heartbeat hand-off answers `204`,** and carries the station's optional fields as the station sent them (section 7).
5. **The claims stand-in's routes,** under `/claims-stand-in/v1` (section 4). The fifth, read-only route for "Copy claims to the Portal" went on 8 Oct.
6. **The Event Service's own rate limit is counted in each instance's memory,** since Cloud Run has no rate limiting binding. With at most two instances, one user can get up to 120 requests a minute through (section 5.1).
7. **Staging deploys through a second service account,** which can touch only `event-service-staging` and its secrets. That lets the staging workflow run from any branch while production's keyless sign-in stays limited to `main` (section 5.2).
8. **The token page's calls also get 4 seconds,** the same deadline as a tap, since a cold start lands on them too.
9. **The organizers' station endpoints keep the GeekyKey admin endpoints' shapes,** moved to the Event Service without the link (section 7).
10. **Before the evening-before clear, every station must show 0 saved taps,** because there are no links left to restart (section 6, checkpoint 8).

### The 29 Sep calls, and what became of them

1. ~~The single Worker is `geekykey-service` from its first deploy.~~ *Replaced on 7 Oct.* The first deploy is the Cloud Run server at `event-api.` `geekykey-service`, which Julian created on 1 Oct with `key-api.` attached, first deploys at checkpoint 4. The two screens Workers still first deploy at checkpoint 5, once login works.
2. **The order of the checkpoints:** redrawn on 7 Oct (call 1 above).
3. **New endpoints are built once, in the service that owns them.** Still holds. Checkpoints 1 to 4 add only what the split needs: the hand-off, the heartbeat and its hand-off, the registered stations and the claims stand-in's calls. Everything else waits for checkpoints 6 and 7.
4. **Reshaping the tables keeps the migration rule:** add first, switch the code, drop later. Still holds. Production holds only test data until the rehearsal, so rows that no longer fit are deleted, not converted.
5. ~~Adam deploys by hand until `main` is protected.~~ *Replaced on 1 Oct, then on 7 Oct:* GitHub Actions deploys the Event Service on every push to `main`, with its migrations in the same job, and Workers Builds deploys the Workers.
6. ~~`Claims.claim` gains `limit_reached`.~~ *Replaced on 5 Oct:* the claim route checks `tokensOf` before `claim` (section 4).
7. **Paths for the new endpoints, and three names.** Still holds: the GeekyKey Service's `GET /api/v1/me`, `token_taken`, and the Event Service's `/me` keeping `user.role`.
8. **Two table names.** `passport_stations` stays; `event_stations` goes (call 3 above).
9. **The rate limits' binding names and namespace IDs.** Three remain, on `geekykey-service` (section 5.1).
10. ~~Two more numbers for the decision on Paid.~~ *Replaced on 7 Oct:* the numbers that matter now are in section 11.1.
11. **The team's rules go in the README,** in a "Deploying" section. Still holds, rewritten for two platforms (section 8.1).

### Found while writing the spec, with Adam's answers (29 Sep)

- **The showcase's date:** setup on Tue 17 Nov and the showcase on Wed 18 Nov. The Single Source of Truth's roadmap still says 17 Nov, and needs correcting. *Changed 27 Oct:* the roadmap was right. The showcase is on Tue 17 Nov, with setup on Mon 16 Nov.
- **The Sprint 2 A/B test.** It isn't confirmed yet (section 12), so the checkpoints don't wait on it. *Changed 27 Oct:* it runs at the grad tea on 12 Nov instead (section 6).
- **Before the repo goes public,** Julian is asked whether his two diagrams in `assets/` can be public. `meeting-notes/` is never committed (BAC-7). *Changed 23 Oct:* the meeting notes are committed in `.scratch/meeting-notes` (PR #134).

---

## 3. The architecture

### 3.1 The services, and who owns what

| Service | Built by | Runs on | Owns | Its tables |
|---|---|---|---|---|
| **Portal** | Qing Guan | Cloud Run, in GeeksHacking's project | Who each GeeksHacking user is. After the switch, also who owns each token | The Portal's own |
| **Firebase Authentication** | Google, set up by Adam | Our existing Firebase project, on GeeksHacking's billing | Who each user is at the showcase: Google sign-in, and GeeksHacking's login as an OIDC provider (ADR 0004) | None of ours |
| **GeekyKey Service** | Adam | Cloudflare Workers | Checking station keys, the station's clock, finding each token's owner, handing taps and heartbeats on, the token page, My tokens, the GeekyKey admins | None. A copy in memory of the registered stations |
| **Claims stand-in** | Adam | Cloud Run, on our Event Service's server, until the switch | Who owns each token, until the switch | `tokens` |
| **Event Service** (the showcase) | Adam | Cloud Run | Its stations (IDs, keys, labels, health, disabling), taps, dropping replays, the cooldown, the passport (stamp slots, stamps, points), per-event users, the organizers, the station board, the tap log, stats, the export, the QR fallback | `stations`, `users`, `taps`, `passport_stations` |

The rules that hold the split together:

- The GeekyKey Service never knows about games, and keeps no database. The Event Service never sees a token's ID, only users.
- Each Event Service registers its own stations and issues their station keys. A station feeds the Event Service that registered it, so there are no links. A reader moved to another event becomes a new station there, given the new event's key through the firmware's setup mode, which clears its saved taps (8 Oct).
- A tap by an unclaimed token stops at the GeekyKey Service. It gets `unknown_token` and a log line, and is stored nowhere.
- The user ID is the one the login gives: a Firebase UID at the showcase (ADR 0004), and the Portal's user ID once events log in through the Portal. Every "user ID" below means this. The GeekyKey Service keeps no users.
- Organizer is a role at one event, from a list in the Event Service's settings, and organizers look after their event's stations. GeekyKey admin is a GeeksHacking role, from a list in the GeekyKey Service's settings, and its one job is releasing someone else's token. At the showcase they're the same people.
- Only the GeekyKey Service calls the claims stand-in, with a key of its own. It isn't part of what an Event Service offers, and other teams' Event Services never build one.

Sources: [Which parts of today's backend belong to the GeekyKey Service, and which to the Event Service?](issues/12-backend-split.md), [Which screens belong to which service, and how does each know who is logged in?](issues/15-screens-and-login.md), [Who registers stations, where is a station key checked, and how does the GeekyKey Service know which Event Service a station feeds?](issues/24-stations-without-a-database.md), [Where do token owners live until the Portal's tag APIs exist, and what does the token page do?](issues/23-token-owners-before-portal.md)

### 3.2 Where each part runs

| Part | Platform | Package | Serves | Address | Reaches |
|---|---|---|---|---|---|
| `geekykey-service` | Worker, from checkpoint 4 | `apps/geekykey-service` | Stations, and the GeekyKey screens' `/api` and `/auth` | `key-api.geekshacking.com` | Each Event Service, for its registered stations and the hand-offs, and the claims stand-in, all over HTTPS |
| `event-service` | Cloud Run, from checkpoint 2 | `apps/event-service`, which was `apps/backend` until 16 Oct (BAC-40) | The hand-offs, the registered stations, the claims stand-in, and the Event screens' `/api` and `/auth`. Until checkpoint 4, stations too | `event-api.geekshacking.com`, and its `run.app` address | TiDB, through one `mysql2` pool |
| `event-service-staging` | Cloud Run, from checkpoint 2 | The same | The same, for trying changes | Its `run.app` address only | `geekykey_staging` |
| `geekykey-web` | Worker, from checkpoint 5 | `apps/geekykey-web` | The token page and My tokens | `key.geekshacking.com`, also written on every token | `geekykey-service` through a service binding |
| `event-web` | Worker, from checkpoint 5 | `apps/event-web` | The dashboard, passport, activity and organizer screens, including the station board | `event.geekshacking.com` | `event-api.geekshacking.com` over HTTPS |

**The Workers.**

- Every Worker sets `workers_dev = false` and `preview_urls = false`, so its hostname is the only way in.
- Each screens Worker serves its files in single-page-app mode and forwards `/api/*` and `/auth/*` to its service, with `run_worker_first` for those paths. Browsers see one address per set of screens, so there is no CORS anywhere. `event-web` forwards over HTTPS with `redirect: "manual"`, so the login's redirects and the session cookie pass back to the browser unchanged. Each also forwards Firebase's sign-in pages, `/__/auth/*` and `/__/firebase/init.json`, to `https://geekykey-b035a.firebaseapp.com` without the cookie, so Google's sign-in names the screens' own address (agreement 7.2, FRO-72).
- Every `/api/*` and `/auth/*` response carries `Cache-Control: no-store`.
- They live in GeeksHacking's Cloudflare account. Julian creates each Worker, connects it to the repo with Workers Builds, and sets its secrets. Nobody on the team can deploy there, set its secrets or read its logs (Julian, 1 Oct 2026).

**The Cloud Run service** (agreed on 8 Oct; Julian mapped `event-api.` to it on 11 Oct).

- A Google Cloud project of our own, on GeeksHacking's billing account, so our roles never touch the Portal's: our existing Firebase project, `geekykey-b035a` (9 Oct). Its resources are made by hand with `gcloud`, and each command is written into `infra/README.md`, a runbook from which infrastructure as code can be written once the architecture settles (Julian, 8 Oct). Cloud Run's v1 interface and the first-generation execution environment, since v2 costs more (Julian, 8 Oct).
- `event-api.geekshacking.com` is a Cloud Run domain mapping behind Cloudflare's proxy, unlike the Portal's `portal-api.` Julian set it up that way, and Adam kept it (12 Oct), since a request sent the way a station sends one passes the zone's checks (BAC-27). Cloudflare answers with its own certificate, from one of the authorities the stations' 14 roots already cover, and passes each request on to Google, whose own certificate sits behind it. The `run.app` address stays open, so the limits and key checks in our own code still protect both. The trade-offs we accept: Cloud Run's logs show Cloudflare's addresses instead of each caller's, and Google's certificate renews from behind the proxy, which Google's docs warn can fail, so it's checked in December (`infra/README.md`, step 9). The fallback, if domain mapping lets us down, is a Google load balancer at about US$18 a month.
- Region `asia-southeast1`; 1 vCPU and 512 MiB; up to 80 requests at once per instance; request-based billing, with startup CPU boost on. At most 2 instances, which also caps TiDB connections at 20.
- No warm instance, except one on event days: the rehearsal (by 7 Nov), the grad tea on 12 Nov, and from the morning of setup on 16 Nov to the end of the showcase on 17 Nov. Adam switches it on and off with the `gcloud` command in the runbook.
- Logs go to Cloud Logging. Its request logs record no headers, so no keys or cookies, but they do record full URLs. Adam and Ethan can read them; Joshua and Zi Tao don't need to (9 Oct).
- **Staging** is `event-service-staging`, in the same project, on `geekykey_staging`. It has no warm instance and only its `run.app` address. Adam deploys it by hand, from any branch, by running the deploy workflow, and nobody else does unless he asks them to. Anyone with write access to the repo can run the workflow, so this is a team rule rather than a lock: staging runs one branch at a time, and a branch's migrations stay in `geekykey_staging` (12 Oct). The GeekyKey Service gets no staging copy at checkpoint 4 (Adam, 15 Oct): local `wrangler dev` and the smoke test cover it, and the stress test decides whether it needs one. The 1 Oct staging on Adam's own Cloudflare account was dropped on 7 Oct, before it was ever deployed.

**At the split, the Event Service and its screens move to a repo of their own,** at Julian's suggestion (1 Oct 2026), under the GeeksHacking organisation (8 Oct), taking the claims stand-in, `infra/` and the deploy workflow with them. The move happens after the showcase (Julian, 16 Oct, BAC-39), so checkpoints 4 to 8 keep one repo. How `packages/handoff` and the smoke test work across two repos is worked out then (section 12).

Sources: [How is the frontend set up, and how does the browser reach the backend?](issues/05-frontend-setup-and-routing.md), [Which screens belong to which service, and how does each know who is logged in?](issues/15-screens-and-login.md), [How do deploys and secrets work?](issues/09-deploys-and-secrets.md), [What does Cloud Run "v1" mean, and what does running the Event Service there involve?](issues/21-cloud-run-facts.md), [How is the Event Service built, deployed and staged on Cloud Run?](issues/27-event-service-on-cloud-run.md)

### 3.3 How a tap travels

From checkpoint 4:

```text
station ──HTTPS──▶ key-api.geekshacking.com (geekykey-service, a Worker)
                     │  key checked against its copy of the registered stations
                     ├──owners──────HTTPS──▶ claims stand-in ─┐
                     └──hand-off────HTTPS──▶ event-service ───┴─ event-api.geekshacking.com (Cloud Run) ──▶ TiDB
```

1. The station sends `POST /api/v1/taps` with its station key: one tap, or up to 500 saved ones.
2. The GeekyKey Service counts the request against the station's 60 a minute, then finds the key's hash in its copy of the registered stations (section 3.5). The station is the one whose hash matches, and it feeds the Event Service that registered it. A key on no list gets `401`. If one Event Service's list couldn't be fetched and the key isn't on the others, the answer is `503 event_service_unavailable` instead, since the key may be on the missing list.
3. One 4-second deadline starts, for the next two steps together. A cold start takes up to about 2.6 seconds of it (section 11.3).
4. It asks `Claims` for each token's owner: the claims stand-in until the switch, then the Portal. A token nobody owns gets `unknown_token`, and a log line. No answer in time, a `429` or `5xx`, or a body that doesn't parse fails the whole request with `503 claims_unavailable`.
5. It hands the rest to that Event Service in one call, `POST /geekykey/v1/taps` with the Event Service key: the station ID and, for each tap, its `client_tap_id`, the owner's user ID and `tapped_at` (null when the station sent none or it was wildly off). No answer within what's left of the 4 seconds, an answer that isn't a 2xx, a redirect, or a body the schema rejects fails the whole request with `503 event_service_unavailable`. Neither call is retried.
6. The Event Service locks the station's row, drops replays (`duplicate`), applies the cooldown and stores each tap as `accepted`, `cooldown` or `no_game`, writing a `tap_stored` log line for each. It also records when the station was last seen.
7. The GeekyKey Service puts every status back in request order and answers the station, which shows the result for about 2 seconds.

**Why taps wait.** Since 29 Sep the station saves each tap to flash before sending it, and deletes it only once a status comes back. A station that hears nothing within its 5 seconds, or gets a `503`, shows `Tap saved` / `Will send later`, and resends with the next tap or a minute later. So a slow or missing Event Service costs a participant the screen's answer, never the tap.

**The heartbeat** comes every 60 seconds, with the station key. The key is checked the same way. The GeekyKey Service answers `server_time` at once, and sends the firmware version, saved taps and `reader_ok` on to `POST /geekykey/v1/heartbeats` in `waitUntil()`, with no retry: a lost one is replaced a minute later. So a heartbeat sets the station's clock even while Cloud Run is down, as long as the station's key is in the copy.

**Until checkpoint 4,** stations call `https://event-api.geekshacking.com`, and the one Cloud Run server does every step itself. From checkpoint 3 its GeekyKey side already talks to its Event side and the stand-in only through these requests.

Sources: [How do stations talk to the GeekyKey Service?](issues/11-station-endpoints.md), [How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?](issues/14-event-service-triggers.md), [How do we protect our public addresses without blocking the stations?](issues/18-protecting-public-addresses.md), [Who registers stations, where is a station key checked, and how does the GeekyKey Service know which Event Service a station feeds?](issues/24-stations-without-a-database.md), [Does a station wait for the Event Service's verdict?](issues/25-wait-for-the-verdict.md)

### 3.4 How a phone claims a token

1. A phone taps a token and opens `https://key.geekshacking.com/t/<UID>`. The chip writes its own UID into that address each time it is read.
2. Someone not logged in sees a login prompt, and nothing is looked up. They log in (through Firebase at the showcase, ADR 0004) and land back on `/t/<UID>`. "Register the token (which will redirect to portal)", in Julian's words, is this login: claiming happens on our page.
3. The token page shows one of five things: a login prompt; **Claim** for a token nobody owns; your own token, with **Release** and a button for each event with a public address, such as "Open Capstone Showcase"; "This token belongs to someone else", with no name; or, for a GeekyKey admin, that line with a **Release** button.
4. My tokens, the home page of `key.geekshacking.com`, lists your tokens with **Release**, has a form to claim a token by typing its UID, and has the same button for each event.
5. A claim or a release that can't reach the claims stand-in, or later the Portal, says "Couldn't reach GeeksHacking. Try again." Usually nothing changes. But the stand-in can make the claim or the release and then answer too late, or with an error, so it may already have been made. Then trying a claim again answers that the token is yours, and trying a release again answers `not_found` (API agreement 8.2 and 8.3). *Changed 22 Oct (BAC-68, BAC-69):* it said nothing is saved, which the stand-in can't promise.
6. The passport, on `event.geekshacking.com`, logs in separately. Someone still signed in to Google, or to GeeksHacking, only picks their account again.

Sources: [What is a token's ID, and what URL is written on each token?](issues/13-token-id-and-url.md) ([ADR 0001](../../docs/adr/0001-token-id-is-the-hardware-uid.md)), [Which screens belong to which service, and how does each know who is logged in?](issues/15-screens-and-login.md) ([ADR 0002](../../docs/adr/0002-each-service-logs-in-through-the-portal.md)), [What does the GeekyKey Service need from the Portal's tag APIs?](issues/17-portal-tag-apis.md), [Where do token owners live until the Portal's tag APIs exist, and what does the token page do?](issues/23-token-owners-before-portal.md)

### 3.5 The registered stations

How the GeekyKey Service checks a station's key with no database.

- **What an Event Service serves.** `GET /geekykey/v1/stations`, called by the GeekyKey Service with that Event Service's key, lists its enabled stations, each with its station ID and the SHA-256 of its key, in hex. Nothing else: no label, no location, and never the key. A disabled station simply drops off the list.
- **Where the copy lives.** In memory, in each Worker isolate, as the 29 Sep key list did. It's free, needs no setup and behaves the same in tests. Each new isolate starts empty.
- **An empty copy is filled on the request path,** inside the same 4-second deadline as the owner lookup and the hand-off: one request to each Event Service in the settings.
- **A list more than a minute old** is asked for again before the request that finds it is answered, inside the same 4-second deadline. For a known key that's the list the key is on, and the other Event Services' old lists are refreshed in `waitUntil()`. Each Event Service is asked at most once a minute in each isolate, and every request that comes while its list is being asked for waits for the same answer. When a list doesn't come back, or its answer doesn't parse, its last good list is used and kept, with no time limit, and the failure is logged. When the wait uses up the deadline, the station gets `503 event_service_unavailable`, keeps its taps and resends them, since no time is left for the owners and the hand-off. *Changed 26 Oct (BAC-87):* the copy used to answer first and refresh afterwards, so a tap never waited. But each isolate keeps its own copy. An isolate that had sat idle let a disabled station's key in once, however old its copy, and BAC-85's proof saw a disabled key answered `200` 61.7 seconds after the disable.
- **An unknown key** waits for every list more than a minute old, and for any missing list not asked for in the last minute, before it gets its answer. A new station's key is therefore accepted within a minute of joining its Event Service's list, even when it's the only station tapping (the API agreement's 9.7). Junk keys can make us call Cloud Run at most once a minute for each Event Service, in each isolate. A list that has never come back is asked for again at most once a minute too, whatever keys arrive (BAC-50).
- **`401` or `503`.** Only when every list is in hand and the key is on none of them does the station get `401`. When a list is missing and the key isn't on the others, it gets `503 event_service_unavailable`, keeps its taps and resends them. A heartbeat is treated the same way: no `server_time` until its key is checked.
- **A station ID or key hash that appears twice,** in one list or in two, is refused and logged.
- **A new, replaced or disabled key** takes up to a minute to take effect, on every isolate.
- **`stations_copy_filled`,** a log line for each fill, says how long it took and whether every list came back.
- **The Cache API goes in behind memory only if the rehearsal shows the need:** a fill ran out of time and caused a `503`, or fills came more than about once every 10 minutes while stations were busy. Otherwise it stays out. KV, D1, Upstash and Redis are ruled out.
- **Tests.** One module owns the copy, the lists' ages and the refresh, with the clock and the fetch passed in. Each test makes its own instance. The tests cover the empty-copy fill, `503` against `401` when a list is missing, a stale list kept when an Event Service fails, an old list refreshed before the answer for a known key and for an unknown one, a refresh that runs out of time answering `503` and keeping the last good list, and an unknown key refreshing a list at most once a minute.

Sources: [Who registers stations, where is a station key checked, and how does the GeekyKey Service know which Event Service a station feeds?](issues/24-stations-without-a-database.md), [What does the GeekyKey Service cache, and in which store?](issues/26-what-to-cache.md), [Which cache can a Worker use for free?](issues/22-worker-cache-options.md)

### 3.6 The database

**Where it is.** GeeksHacking's TiDB Cloud Starter cluster, on Alibaba Cloud in Singapore, with one database, `geekykey`, holding the Event Service's tables and the claims stand-in's `tokens`. Only our Cloud Run server reaches it. Neither the Event Service's code nor the stand-in's reads the other's tables, and each imports only its own schema.

**The connection.** One shared `mysql2` pool of 10 connections per instance, made once at start-up, with `verifyIdentity`, so TiDB Cloud's certificate and hostname are both checked. Drizzle stays the ORM, through its `mysql2` adapter.

- Idle connections are dropped after a short time, because Cloud Run cuts the CPU between requests and the pool's timers stall.
- A query is retried once, but only when its connection was already dead before the query was sent. A query that failed partway is never retried.
- The pool is closed on `SIGTERM`, which Cloud Run sends 10 seconds before it stops an instance.

**Logins.** All carry the cluster's prefix:

- The **app login** can only read and write rows in `geekykey`. The Cloud Run service reads its connection URL from Secret Manager.
- The **migration login** can also change tables. The `db:` tasks use it, from Adam's laptop and from the deploy job, which reads it from Secret Manager.
- The **root login** created those two once and is never deployed.
- **Staging** has its own database on the same cluster, `geekykey_staging`, with its own app and migration logins that can't touch `geekykey`. Its queries count against the same free 50 million Request Units a month.

**Rules for the schema.** In force since checkpoint 1.

- Fixed sets of values are `ENUM` columns. There are no `check()` calls, because TiDB ignores them and the switch that would enforce them is cluster-wide.
- Timestamps are ISO strings in `VARCHAR(24)`, with a comment in the schema saying why, and the code sets their defaults.
- `taps` carries `/*T! AUTO_ID_CACHE=1 */`, added to the migration by hand, so a newer tap always has a higher `id`. MySQL ignores the comment.
- No foreign key crosses between the Event Service's tables and the stand-in's, or points at the Portal. Foreign keys inside one of them stay.
- `onConflictDoNothing()` is a no-op `ON DUPLICATE KEY UPDATE`, never `INSERT IGNORE`, which silently stores bad values. `.limit(1)`, never `.get()`. No `db.batch()`.
- The cooldown locks: each ingest is one short transaction that first locks the station's row in `stations` with `SELECT ... FOR UPDATE`, then reads, with `FOR UPDATE` too, decides and writes.

**Migrations.** A `db:migrate` task runs Drizzle's `mysql2` migrator with the migration login, from a laptop or the deploy job, never at start-up. Every migration must work with the version still running: add a column before the code uses it, and drop one only after the code stops.

**The tables after checkpoint 3.**

| Owner | Table | Columns | Notes |
|---|---|---|---|
| Event | `stations` | `id`, `api_key_hash` (unique), `label`, `disabled_at`, `created_at`, `last_seen_at`, `firmware_version`, `buffered_taps`, `reader_ok`, and, from the grad tea, `game` (BAC-90) and `booth` (BAC-89) | Today's table, reshaped. `label` is the device's name, such as "Reader 3"; its passport name, location and points move to `passport_stations`. `booth` says where the map draws the station, whatever game it runs, and is empty for none. `disabled_at` is empty while the station is enabled. Each hand-off sets `last_seen_at`, and a heartbeat's hand-off also sets the last three. This is the row the cooldown locks |
| Event | `users` | `id`, `display_name`, `created_at`, and `name_set_at` from checkpoint 5 | The per-event copy. `id` is the user ID, and the name is copied from the login. `portal_user_id` and `role` go. `name_set_at` is when the user set their own name, which a login then never replaces, and stays empty until they do (BAC-60) |
| Event | `taps` | `id`, `station_id`, `client_tap_id`, `user_id`, `source`, `status`, `tapped_at`, `received_at` | `source` is `ENUM('nfc', 'qr_fallback')` and `status` is `ENUM('accepted', 'cooldown', 'no_game')`. `(station_id, client_tap_id)` is unique. `user_id` is never empty and has no foreign key, so a tap by someone who has never logged in is still stored. `token_uid` goes |
| Event | `passport_stations` | `station_id`, `name`, `location`, `points`, `added_at`, and, from the grad tea, `link` (BAC-99) | The passport's settings. Only the stations among these that run the passport (`stations.game`) are stamp slots, in `added_at` order. `link` is the group's page, which the passport offers after a stamp there, and is empty for none. Since BAC-89 a station's booth is on `stations`, because the grad tea's stations run other games. Migration 0013 copied each booth there from this table, and 0014 dropped the old column (BAC-101) |
| Claims stand-in | `tokens` | `uid` (primary key), `user_id`, `claimed_at` | Only current owners: releasing deletes the row, so `revoked_at` goes. `user_id` is a user ID with no foreign key. Marked "GeekyKey's stand-in, removed after the switch", and dropped then |

Sources: [Does TiDB fit this backend?](issues/01-tidb-fit.md), [How is the database set up?](issues/07-database-setup.md), [How is the Event Service built, deployed and staged on Cloud Run?](issues/27-event-service-on-cloud-run.md), [Who registers stations, where is a station key checked, and how does the GeekyKey Service know which Event Service a station feeds?](issues/24-stations-without-a-database.md), [How do we notice trouble on event day, and who watches?](issues/20-event-day-monitoring.md)

### 3.7 Room to grow

- **The 24 Sep game ideas all fit.** Live interaction would add something that holds connections open, such as a Durable Object or the Cloud Run server itself. Trading needs transactions, which an ordinary `mysql2` pool keeps simple. Nothing may rely on `taps.id` order to pair two people's taps. A second game inside the Event Service keeps one status per tap: `accepted` if any game counted it, otherwise `cooldown` if a game held it back, otherwise `no_game`. Each game keeps its own record of what it counted, so a bingo-only tap can't earn passport points. Source: [Can the architecture carry the 24 Sep game ideas?](issues/04-future-ideas-fit.md)
- **The Portal's tag APIs.** Only the `Claims` module changes (section 4), and the claims stand-in is deleted.
- **Other teams' Event Services** get the same three requests (the registered stations, the hand-off and the heartbeat hand-off) over HTTPS, with their own Event Service key, a section of the API agreement and a JSON Schema generated from `packages/handoff`. They register their own stations and issue their keys. Their own statuses pass through to stations, which treat any status they don't know as recorded. They log users in themselves ([ADR 0002](../../docs/adr/0002-each-service-logs-in-through-the-portal.md)), through the same login as the GeekyKey Service, so the user IDs match. Adding one is a reviewed change to the GeekyKey Service's settings and a deploy.
- **Other events start from a template** (Julian, 23 Oct). After the repo split, the Event Service and the Event screens become a GitHub template, and each event's Event Service starts as a copy. What the copy keeps is the base, in `src/event/`, with the game interface in `src/event/games.ts`; what it replaces is `src/showcase/` (checkpoint 7). *Changed 25 Oct (BAC-72):* it put the interface in `src/games/`, but the base calls the games through it, and the lint rule stops the base importing from `src/games/`. A template copies the code once, with no link back, so a fix to the base doesn't reach events already made from it. That suits one event at a time. If many events run from it, the base could become a package they share, which the lint rule between the folders keeps possible.
- **Two events in turn on one Event Service** (27 Oct). The grad tea and the showcase share ours: both events' games are in the code, organizers choose each station's game, and Adam clears the data between them (section 6, "The grad tea"). Two events at once on one Event Service stay out of scope (agreement section 12).
- **Another event.** A reader moves by sending its saved taps, then taking a key from the new event's Event Service through the firmware's setup mode, which clears its saved taps (8 Oct).
- **The token page sends its owner to the ongoing event** (backlog, BAC-23, 8 Oct). Julian's idea: the token's one URL never changes, and after login the GeekyKey screens route the owner to the event on now, or show their tokens when none is. For the showcase, assume one event at a time. Later, the Portal could list active events with their Event Service addresses. One way to build it: each `EVENT_SERVICES` entry gains optional start and end times, the GeekyKey Service's `/me` says which event is on, and the token page redirects there, keeping **Release** one tap away on My tokens. Until it's picked up, the owner's view keeps its button for each event (section 3.4).
- **Later.** Once the stand-in is gone, the one database holds only our Event Service's data, and each Event Service can have a database of its own.

---

## 4. Claims behind one module

Claiming a token and finding who owns it go through one module in the GeekyKey Service, so switching from the claims stand-in to the Portal's tag APIs changes one implementation and nothing else.

```ts
/** Who owns each token: the claims stand-in until the switch, then the Portal's tag APIs. */
export interface Claims {
  /** The owners of up to 500 tokens, by UID, each with the token's kind. A UID missing from the map is unclaimed. */
  ownersOf(uids: string[], signal: AbortSignal): Promise<Map<string, { userId: string; kind: string | null }>>;
  /** Claims the token for the user. The first claim wins, and `claimedAt` is when the user's claim was made, for the claim route's answer. */
  claim(uid: string, userId: string, signal: AbortSignal): Promise<{ result: "claimed" | "already_yours"; claimedAt: string } | { result: "taken" }>;
  /** Releases the token, but only if `ownerId` still owns it. */
  release(uid: string, ownerId: string, signal: AbortSignal): Promise<"released" | "not_owner">;
  /** The user's tokens, oldest claim first. */
  tokensOf(userId: string, signal: AbortSignal): Promise<{ uid: string; claimedAt: string }[]>;
}
```

- **`StandInClaims`** calls the claims stand-in over HTTPS with `CLAIMS_STAND_IN_KEY`, and replaces `TokenResolver` and `LocalTokenResolver` in `apps/backend/src/claims-stand-in/token-lookup.ts`. Inside the one server at checkpoint 3, it calls the same routes through `app.request()`.
- **`PortalClaims`**, after the showcase, calls the tag APIs as the GeekyKey Service itself, with the client-credentials flow and its own OAuth app. It caches owners in Cloudflare's Cache API (provisional): owned tokens only, never "unclaimed", and a claim or release deletes the token's entry. For how long is chosen at the switch: 5 minutes was planned, and Julian asked for an hour (8 Oct). The Cache API keeps an entry for its `max-age`, but each data centre keeps its own copy and a delete clears only the local one, so a release can go unseen elsewhere for that long. If that's too long, the fallback is Redis or KV.
- **The deadline.** Each call gives up when its `signal` fires: the station request's shared 4 seconds, or, on a user's request from the screens, 4 seconds shared by all of that request's calls (Adam, 22 Oct). There's no retry.
- **When it can't answer** (no answer in time, a `429` or `5xx`, or a body that doesn't parse), it throws `ClaimsUnavailable`. The station route turns that into `503 claims_unavailable`, the same code before and after the switch, and the screens into "Couldn't reach GeeksHacking. Try again."
- **UIDs arrive normalised.** Who may release is decided by the routes: an owner passes their own user ID, and a GeekyKey admin passes the owner the token page found when it loaded, so a late or double click can't release a newer claim.
- **The cap** is 3 tokens, a GeekyKey Service setting, with no exemption for anyone. The claim route checks `tokensOf` before `claim`: a token already among them answers `200` as already yours, whatever the count, and otherwise a user at the cap gets `409 token_limit_reached`, even when the token is someone else's. Accepted: two claims by one user at the same instant could leave them with 4 tokens.
- **Every release writes a `token_released` log line** saying who released which UID from whom. With no history kept, it's the only trace. The release route writes it, not `Claims`, since only the route knows who's releasing.

**The claims stand-in** keeps the `tokens` table and offers the four calls we're asking the Portal for, in [part 2 of the tag APIs message](assets/message-to-qing-guan-tag-apis.md). Before the split it's simply today's `tokens` table and claim code, moved to Cloud Run with everything else. From checkpoint 3 it's a folder of its own on the Cloud Run server, `claims-stand-in/`, with its own schema file, marked "GeekyKey's stand-in, removed after the switch". Its routes are the spec's call. The fifth, read-only route for "Copy claims to the Portal" went on 8 Oct, with the copy. Each takes `Authorization: Bearer <CLAIMS_STAND_IN_KEY>`, compared in constant time:

| Method | Path | Body or answer |
|---|---|---|
| POST | `/claims-stand-in/v1/owners` | `{ "uids": [...] }`, up to 500. Answers `{ "owners": [{ "uid", "user_id", "kind" }] }`, leaving unclaimed UIDs out, with `kind` `null` for a token not in `token_kinds` |
| POST | `/claims-stand-in/v1/tokens/{uid}/claim` | `{ "user_id" }`. Answers `{ "result": "claimed" \| "already_yours" \| "taken", "claimed_at" }`, with `claimed_at` `null` when taken |
| POST | `/claims-stand-in/v1/tokens/{uid}/release` | `{ "owner_id" }`. Answers `{ "result": "released" \| "not_owner" }` |
| GET | `/claims-stand-in/v1/users/{user_id}/tokens` | Answers `{ "tokens": [{ "uid", "claimed_at" }] }`, oldest claim first |

They aren't in the API agreement: nothing but the GeekyKey Service calls them, and they go after the switch.

**The token kinds** (ADR 0006, BAC-113) are a second table beside the stand-in, `token_kinds` (`uid`, `kind`), which `pnpm db:token-kinds` fills from the token writer's log on Adam's laptop. `/owners` reads it with each owner, in the same query, so a tap makes no extra request. The clear between the grad tea and the showcase keeps it, since a kind belongs to the token. The Event Service keeps each user's first kind in its own `user_kinds`, which the clear empties with the users. At the switch, the list moves to the Portal or stays as GeekyKey's own. The switch is in section 6, "After the showcase".

Sources: [What does the GeekyKey Service need from the Portal's tag APIs?](issues/17-portal-tag-apis.md), [How do we protect our public addresses without blocking the stations?](issues/18-protecting-public-addresses.md), [Where do token owners live until the Portal's tag APIs exist, and what does the token page do?](issues/23-token-owners-before-portal.md), [Does a station wait for the Event Service's verdict?](issues/25-wait-for-the-verdict.md), [What does the GeekyKey Service cache, and in which store?](issues/26-what-to-cache.md)

---

## 5. Settings, secrets and bindings

Settings for a Worker live in its `wrangler.jsonc`. Settings for the Event Service live in its Cloud Run service's environment, set by the deploy workflow from a file in the repo. Either way, they change through a reviewed pull request. Secrets live only on the services: Julian sets the Workers', and Adam adds the Event Service's to Secret Manager. Names marked "suggested" are the spec's.

### 5.1 Each part

**`geekykey-service`** (a Worker, from checkpoint 4)

| Kind | Name (suggested) | Value |
|---|---|---|
| Custom domain | `routes` | `key-api.geekshacking.com`, which Julian attached on 1 Oct 2026 |
| Side doors off | `workers_dev`, `preview_urls` | Both `false` |
| Placement | `placement` | `{ "region": "gcp:asia-southeast1" }`, so the Worker runs near Cloud Run whichever data centre answered (BAC-63, section 11.3) |
| Binding | Rate limits | See the table below |
| Setting | `EVENT_SERVICES` | The list of Event Services. For each: an ID, a name, an `https://` address, and optionally a public address, `public_url`, for the token page's and My tokens' buttons, which show its name. For the showcase, one entry: `showcase`, "Capstone Showcase", `https://event-api.geekshacking.com`, `https://event.geekshacking.com`. Until the grad tea, the same entry is named "Grad Tea", and the switch after it puts "Capstone Showcase" back (section 6, "The grad tea") |
| Setting | `CLAIMS_STAND_IN_URL` | `https://event-api.geekshacking.com/claims-stand-in/v1`, until the switch |
| Setting | `GEEKYKEY_ADMINS` | User IDs. Adam, Ethan and Zi Tao for the showcase |
| Setting | `MAX_TOKENS_PER_USER` | `3` |
| Setting | `MAX_TAPS_PER_REQUEST` | `500` |
| Setting | `TAP_DEADLINE_MS` | `4000`, the shared deadline. A cold start takes up to about 2.6 seconds of it (section 11.3) |
| Setting | `FIREBASE_PROJECT_ID` | The Firebase project whose ID tokens it accepts, at the showcase (ADR 0004). The Portal's login settings replace it once events log in through the Portal |
| Secret | `SESSION_SECRET` | Signs `gk_session` |
| Secret | `EVENT_SERVICE_KEY_SHOWCASE` | One for each entry in `EVENT_SERVICES` |
| Secret | `CLAIMS_STAND_IN_KEY` | Until the switch |
| Secret | `PORTAL_CLIENT_SECRET` | From the switch, for the client-credentials flow |

Every secret it has goes under `secrets.required`, so a deploy fails if one is missing.

**`event-service`** (Cloud Run, from checkpoint 2; until checkpoint 4 it is the whole backend)

| Kind | Name (suggested) | Value |
|---|---|---|
| Address | | `event-api.geekshacking.com`, a domain mapping behind Cloudflare's proxy, and its `run.app` address |
| Size | | As in section 3.2. Minimum instances 0, and 1 on event days |
| Setting | `ORGANIZERS` | User IDs. `dev-organizer-1` locally |
| Setting | `MAP_SCREENS` | User IDs of the map screens, which may read the map's data (checkpoint 7). On production it lists the booth screen's account, Adam's second Google account, since 26 Oct (BAC-85) |
| Setting | `TAP_COOLDOWN_SECONDS` | `300`. 900 was suggested on 8 Oct, for Adam to decide (section 12) |
| Setting | `FIREBASE_PROJECT_ID` | As for the GeekyKey Service |
| Secret | `APP_SECRETS` | One JSON object holding the four values below, by name (13 Oct) |
| In `APP_SECRETS` | `SESSION_SECRET` | Signs `event_session` from checkpoint 4, and `gk_session` before that |
| In `APP_SECRETS` | `DATABASE_URL` | The app login's connection URL |
| In `APP_SECRETS` | `EVENT_SERVICE_KEY` | From checkpoint 3. The same value as the GeekyKey Service's `EVENT_SERVICE_KEY_SHOWCASE` |
| In `APP_SECRETS` | `CLAIMS_STAND_IN_KEY` | From checkpoint 3 until the switch |
| Secret | `MIGRATION_DATABASE_URL` | Read only by the deploy job, for `db:migrate` |

*Changed 19 Oct (Adam, BAC-46):* `MAX_TAPS_PER_REQUEST` left the Event Service with the station endpoints, since nothing there reads it. The hand-off's own limit of 500 taps is in `packages/handoff` (API agreement 11.2). The GeekyKey side's settings left with it: `TAP_DEADLINE_MS`, `EVENT_SERVICES` and `GEEKYKEY_ADMINS` are the Worker's only.

The service pins each secret to a version number in its `deploy.env` in `infra/`, which the deploy workflow reads, so changing one is a reviewed change and a new revision. The settings are read once at start-up, and a missing secret stops the server starting. The server unpacks `APP_SECRETS` into its four settings before it reads them, and checks each as before; an error in it names the setting, never a value. Locally the four stay separate settings. `event-service-staging` has the same names, with its own values and `geekykey_staging`.

Why one secret for four values (13 Oct): Secret Manager bills each stored version after the first 6 on the billing account, and one secret per value made 10. The migration login can't join them, because the deploy accounts read it and the services must not. The cost is in changing a value (section 5.2).

**`geekykey-web` and `event-web`** (Workers, from checkpoint 5)

| Kind | Value |
|---|---|
| Static assets | The Vite build, in single-page-app mode, with Firebase's web config as build variables (not secret) |
| `run_worker_first` | `["/api/*", "/auth/*", "/__/auth/*", "/__/firebase/init.json"]`. Without it, a browser going to `/auth/login` gets `index.html` and login silently breaks, and so does Firebase's sign-in popup |
| Reaching its service | `geekykey-web`: a service binding to `geekykey-service`. `event-web`: `fetch()` to the setting `EVENT_API_URL`, `https://event-api.geekshacking.com`, with `redirect: "manual"` |
| Custom domain | `key.geekshacking.com` and `event.geekshacking.com` |
| Side doors off | `workers_dev` and `preview_urls` both `false` |
| Build variable | `VITE_LIVE_API=1`, set in Workers Builds. Without it the build ships the mock client |
| Secrets | None |

**Rate limits.** On `geekykey-service`, each limit is its own binding over 60 seconds, with a `namespace_id` that no other Worker in GeeksHacking's account uses, because bindings that share one share their counts. The IDs go to Julian so he knows they're taken. Check their format against Cloudflare's [Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) page when checkpoint 6 adds them. The Event Service counts its one limit in each instance's memory (the spec's call).

| Where | Binding (suggested) | Counts | Keyed by | Limit a minute | `namespace_id` (suggested) |
|---|---|---|---|---|---|
| `geekykey-service` | `STATION_LIMIT` | A station | The SHA-256 of the key it sent, before the key check | 60 | `7101` |
| `geekykey-service` | `USER_LIMIT` | A user on its API | User ID | 60 | `7102` |
| `geekykey-service` | `TOKEN_LIMIT` | A user looking up and claiming tokens | User ID | 20, on top of the 60 | `7103` |
| `event-service` | In memory, per instance | A user on its API | User ID | 60 | None |

The status call's limit, `7104`, went with the status call on 5 Oct.

### 5.2 Where every credential lives

| Credential | Lives in | Set by | If it leaks or is lost |
|---|---|---|---|
| TiDB root login | `~/.config/geekykey/tidb.env` on Adam's laptop. Never deployed | Julian provided it | Ask Julian |
| TiDB app login | Secret Manager, as `DATABASE_URL` in `APP_SECRETS` | Adam creates it with the root login and adds it from his laptop, keeping no copy | Adam resets it, a new version of `APP_SECRETS` is made with it (below), and a reviewed change pins the service to it |
| TiDB migration login | Secret Manager, as `MIGRATION_DATABASE_URL`, and `~/.config/geekykey/` on Adam's laptop | Adam | Adam resets it, and adds a new version |
| Staging's two TiDB logins | Secret Manager, for `event-service-staging`, and the migration login in `~/.config/geekykey/` | Adam | Adam resets them. Neither can touch `geekykey` |
| `SESSION_SECRET`, one per service | A Workers secret on `geekykey-service`; Secret Manager for the Event Service | Julian, as a random value nobody keeps; Adam, with `openssl rand` piped into `APP_SECRETS`, never printed | A new one logs everyone out of that service |
| Event Service key, one per Event Service | A Workers secret on `geekykey-service`, and `APP_SECRETS` for ours | Adam generates 32 random bytes into `APP_SECRETS`, keeping no copy. Julian copies it from there into the Worker's secret himself, so it never passes through a chat (15 Oct). Another team's key goes to that team, and to Julian | Set the new one on both sides outside the event. Hand-offs fail with `503` until both match, and stations resend |
| `CLAIMS_STAND_IN_KEY` | As the Event Service key | As the Event Service key | As the Event Service key. Deleted on both sides after the switch |
| Portal client secret, from the switch | A Workers secret on `geekykey-service` | Qing Guan gives it to Julian, who sets it | Qing Guan and Julian replace it |
| The GeeksHacking OIDC client secret inside Firebase | Firebase's own settings, in our Firebase project | Qing Guan issues it, and whoever sets up the provider pastes it in | Qing Guan issues a new one |
| Station key | The station's gitignored `secrets.h`. Only its hash is in the Event Service's `stations` | An organizer creates it on the station board, shown once | An organizer replaces it, keeping the station's ID, and Zi Tao enters the new one through the station's setup mode |
| Token write password | `firmware/token_writer/secrets.h` (gitignored), and Adam's copy outside the repo | Zi Tao | Without it, tokens can never be rewritten |
| Wi-Fi details | Each station's `secrets.h` at first, then whatever the setup mode stored (HAR-14) | Zi Tao | Change the password, and enter the new one through the setup mode |
| Our database copies | Adam's laptop, outside the repo. Never GitHub, a workflow artifact or a chat | Adam | They hold user IDs, names and who tapped where |

**Changing one value in `APP_SECRETS`** (13 Oct). Secret Manager stores a whole new version, so the other three values go into it unchanged. Adam's account can't read them, so either Julian, who can, makes the new version in the console, or Adam makes one with every random value new: everyone is signed out, and from checkpoint 4 the keys are set again on the Worker. A leak of one value is a reason to replace all four anyway, since they're stored together.

**GitHub holds no secret at all.** The deploy signs in to Google Cloud without a key (Workload Identity Federation), through two service accounts (the spec's call):

- **production's,** usable only by this repo's `main` branch, can deploy `event-service` and read its migration login;
- **staging's,** usable from any branch of this repo, can deploy only `event-service-staging` and read only its migration login.

Neither reads the other secrets: each service reads its own `APP_SECRETS` (its session secret, app login and, from checkpoint 3, its two keys) as an account of its own, which can read nothing else (9 Oct, 13 Oct). Both push to one image repository, and the deploy runs each image by its digest, so staging's pushes can't change what production runs (accepted, 9 Oct).

So a workflow on another branch can't deploy production or read its migration login. No Cloudflare API token is kept in GitHub either, and nobody on the team holds a production Cloudflare secret.

### 5.3 Local development

| What | Where |
|---|---|
| The backend, until checkpoint 4 | `node --watch` on port 8000, where real stations already point (`http://A-Mac.local:8000`) |
| GeekyKey Service, from checkpoint 4 | `wrangler dev` on port 8000, so stations keep pointing there |
| Event Service, from checkpoint 4 | `node --watch` on port 8001 |
| Event screens | Vite on 5173, proxying `/api` and `/auth` to 8000 until the split, then to 8001 |
| GeekyKey screens | Vite on 5174, proxying to 8000 |
| Database | TiDB v8.5.3 in Docker from the root `compose.yaml`, with `geekykey_dev` and `geekykey_test`. The server connects to it with `mysql2` directly |
| Secrets | A gitignored `.env` for the Node server and `.dev.vars` for the Worker, each holding `SESSION_SECRET` and the local keys. Never in a deployed config. Each service's `pnpm dev` turns dev-login on itself, so a fresh clone runs with neither file |
| Logging in | dev-login signs in seeded users. Firebase works too, since it allows `localhost` by default |

From checkpoint 4, one root `pnpm dev` starts all four. Mock mode stays for work on screens.

Sources for section 5: [How do deploys and secrets work?](issues/09-deploys-and-secrets.md), [How do local dev, tests and CI get a runtime and a database?](issues/08-dev-test-ci.md), [How do we protect our public addresses without blocking the stations?](issues/18-protecting-public-addresses.md), [How do we back up the database, recover it on event day, and clear the test data before the doors open?](issues/19-backups-and-test-data.md), [How is the Event Service built, deployed and staged on Cloud Run?](issues/27-event-service-on-cloud-run.md)

---

## 6. The migration plan

Each checkpoint is one deliverable: Adam builds it, it's reviewed, and only then does the next one start. The order is the spec's call. Checkpoints 6 and 7 can swap, and checkpoint 5 can move after them if it runs late: they're built and tested locally with dev-login meanwhile.

| | Checkpoint | Done when | Waits on |
|---|---|---|---|
| 0 | The contract and the asks | **Done:** version 0.2 (29 Sep); version 0.3, for this rewrite (7 Oct); and version 0.4, the Firebase login, which Ethan approved and which merged on 10 Oct (PR #48). His approval covers 0.3 too (Adam, 12 Oct) | |
| 1 | Today's backend on workerd and TiDB | **Done** (BAC-1 to BAC-6) | |
| 2 | The move to Cloud Run | **Done** (BAC-8 to BAC-19, 12 Oct). A tap to `event-api.geekshacking.com` is stored in TiDB, after staging; the log check; the cold start is measured | Done: Julian's project, a role that can grant (9 Oct), disconnecting Workers Builds (8 Oct), and the DNS record (11 Oct) |
| 3 | The line drawn inside | **Done** (BAC-29 to BAC-37, 15 Oct). One server, with the GeekyKey side, the Event side and the claims stand-in talking only through their requests, on the new tables | Nothing outside the team |
| 4 | The GeekyKey Service cut out | **Done** (BAC-40 to BAC-46 and FRO-37, 20 Oct). `geekykey-service` runs at `key-api.`, the stations have moved to it, and the smoke test runs on every pull request | Julian: the Worker's secrets and Workers Builds (BAC-44). Done: the setup mode (HAR-14) and moving the stations (HAR-13), both taken over by Adam on 19 and 20 Oct |
| 5 | Login, and the screens deployed | **Done** (BAC-52 to BAC-60, FRO-56, FRO-59 to FRO-61 and FRO-31, 22 Oct). Both logins work through Firebase, the passport shows on a phone, the cookies are checked, the passport poll is measured | Qing Guan: an OIDC client for GeeksHacking's login, asked before Mr Pang (10 Oct). Julian or Qing Guan: two domains. Done: Google sign-in and the check that a Worker can verify its login (Adam, 10 Oct), and billing on the Firebase project (Julian, by 9 Oct) |
| 6 | The GeekyKey Service's features | **Done** (BAC-66 to BAC-71, FRO-30 and FRO-70, 23 Oct). On phones, tokens are claimed and released on production, by Google users and guests, and CI shows each limit holding | Done: the `geekykey-web` screens (FRO-30 and FRO-70) |
| 7 | The Event Service's features | **Done** (BAC-72 to BAC-81, BAC-84, BAC-85, BAC-87 and FRO-79, 26 Oct). On production, an organizer runs a station from creation to disabling, the map's data shows its taps, and the export matches the agreement. The map screens, the floor plan and connections, which are Should and Could, go on | Done: the `event-web` organizer screens (FRO-79) |
| | The grad tea | Its backend changes merge by Tue 10 Nov, it runs on production on Thu 12 Nov as a pilot of the showcase's games, and the observers' counts and its copy give its results (below, added 27 Oct, changed 27 Oct, later) | Mr Yaseer, for the MPH (BAC-95). Ethan's approval of the agreement changes |
| 8 | Ready for the event | The copy, restore and clear tasks work, the restore is tried, the stress test has run, the rehearsal is done by 7 Nov | The whole team |
| | After the showcase | The GeekyKey Service uses the Portal's tag APIs | Qing Guan's tag APIs, and events logging in through the Portal |

Three tracks run alongside the checkpoints: going public, the screens (Ethan's team) and the stations (Zi Tao). They're at the end of this section.

### Step 0. The contract and the asks

**Done for version 0.2.** The API agreement was rewritten for the two services and merged on 29 Sep, and amended on 1 Oct for Julian's hostnames. `CONTEXT.md` and `docs/adr/` are committed.

**Version 0.3,** for this rewrite, went to `main` on 7 Oct (section 7). **Version 0.4,** the Firebase login, followed in PR #48, which Ethan approved and which merged on 10 Oct. His approval of 0.4 covers 0.3 as well (Adam, 12 Oct), so checkpoint 3 and the station screens on `event-web` can build 0.3's shapes.

**Asked in person on Thu 8 Oct,** from [the agenda](../meetings/2026-10-08-julian-and-qing-guan.md). The answers are in section 2, and what's still open in section 12.

**Messages to send now:** [the station contract](assets/message-to-zi-tao-station-contract.md), with its notes of 5, 6 and 8 Oct, to Zi Tao. Part 2 of [the tag APIs message](assets/message-to-qing-guan-tag-apis.md) can wait: the Portal's team agrees with the approach, and nothing is needed before the showcase. [Logging in through the Portal](assets/message-to-qing-guan-login.md) is parked until events log in through the Portal (ADR 0004).

**Adam asks:** Mr Pang, whether the showcase offers GeeksHacking's login beside Google (built first since 10 Oct, and turned off if he says no); and the teachers, whether the showcase has a theme, for Joshua's games.

**Done on 8 Oct:** Julian makes sure `key.geekshacking.com` and its `/t/` path keep working for as long as tokens are in use.

~~**Once the Sprint 2 A/B test is confirmed,** decide which setup runs it (section 12).~~ *Changed 27 Oct:* it runs at the grad tea on production (section 6, "The grad tea").

### Checkpoint 1. Today's backend on workerd and TiDB

**Done** (BAC-1 to BAC-6). Today's five endpoints (`/api/health`, `POST /api/v1/taps`, `GET /api/v1/me`, `POST /auth/dev-login`, `POST /auth/logout`) run against TiDB, unchanged on the wire, and Deno is gone. BAC-9 and BAC-10 then readied production: the `geekykey` database with today's tables, its app and migration logins and a test station, and `geekykey_staging` with its own two logins.

What carries on: TiDB v8.5.3 in Docker from `compose.yaml`, with the `db:up`, `db:reset`, `db:down`, `db:migrate` and `seed` tasks; the MySQL schema and its rules (section 3.6) with one fresh migration; the cooldown's `FOR UPDATE` lock and its test; `Cache-Control: no-store`; ESLint, oxfmt and `tsc`; and CI's `check:migrations`.

What checkpoint 2 undoes, because the Event Service leaves Workers: `wrangler dev`, the Vitest plugin, the Hyperdrive binding, and CI's `check:build`, the dry-run deploy.

### Checkpoint 2. The move to Cloud Run

Today's backend, unchanged on the wire, runs as a Node server on Cloud Run at `https://event-api.geekshacking.com`, on production TiDB through a `mysql2` pool. Stations can tap it there until checkpoint 4.

**Before it, one small pull request:** Node 24 for the whole repo, in `.mise.toml`, `package.json` and CI, because one Node is pinned for every app. Node 26 waits until after the showcase.

**The code,** still in `apps/backend`:

- `src/worker.ts` becomes `src/server.ts` on `@hono/node-server`. Settings come from `process.env` and are still read once at start-up.
- `src/db/hyperdrive.ts` becomes the shared `mysql2` pool in section 3.6. The `FOR UPDATE` reads stay.
- The image: Rolldown bundles one file at build time (it replaced esbuild on 9 Oct, PR #44), and `node:24-slim` runs it.
- `wrangler.jsonc`, `worker-configuration.d.ts`, the `disableEval` setting and the compatibility flags leave `apps/backend`. A Worker comes back as the GeekyKey Service's own package at checkpoint 4.
- `node --watch` replaces `wrangler dev`, on port 8000, so the Vite proxy and the stations need no change. `pnpm dev` still turns dev-login on.
- **Tests:** plain Vitest on Node, in one project. `@cloudflare/vitest-plugin` and the `requireLikeNode` workaround go. TiDB in Docker stays.
- **CI:** `docker build` on the image, without pushing it, replaces "Build the Worker", proving the image and the bundle build. `typecheck` drops `wrangler types`.

**The infrastructure,** made by hand with `gcloud` (8 Oct), each command written into `infra/README.md` so it can be repeated and later turned into code: the Artifact Registry repository; `event-service` and `event-service-staging`; their secrets, created without values; the domain mapping for `event-api.`; the two deploy service accounts (section 5.2); Logs Viewer for Adam and Ethan, and Adam's roles to deploy, add secret values and read logs; the warm-instance switch; and a budget alert to Julian and Adam. Adam ran steps 1 to 5 on 9 Oct with his Editor role, and the grants, steps 6 to 8, the same day, once Julian gave him a role that can grant. Julian mapped the address, step 9, on 11 Oct. The budget alert, step 10, is still to confirm (section 12).

**The deploy workflow,** on every push to `main`, after the backend checks pass. One job:

1. builds the image and pushes it to Artifact Registry;
2. runs `db:migrate`, with the migration login read from Secret Manager;
3. deploys to Cloud Run.

Run by hand (`workflow_dispatch`) from any branch, the same workflow migrates `geekykey_staging` and deploys `event-service-staging`.

Before the first deploy, once:

- ~~Julian creates the project on GeeksHacking's billing account~~ (it's `geekykey-b035a`, 9 Oct), and gives Adam a role that can grant, so Adam sets up the keyless sign-in from GitHub and the grants in the runbook's steps 6 to 8 (agreed 8 Oct; Adam runs them, 9 Oct).
- ~~Julian disconnects Workers Builds from `apps/backend`, which builds every push to `main` and fails~~ (agreed 8 Oct; it hasn't built `main` since that day).
- ~~Adam adds each secret's value from his laptop, keeping no copy: `SESSION_SECRET`, `DATABASE_URL` and `MIGRATION_DATABASE_URL`, for production and for staging~~ (9 Oct, the runbook's step 11).
- ~~Julian adds the DNS record for `event-api.geekshacking.com` that the domain mapping asks for, with Cloudflare's proxy off, once we tell him it's ready~~ (11 Oct). He added it with the proxy on, which Adam kept (12 Oct, section 3.2).

Done when:

- **The proof:** with the test station's key, `curl` to `event-service-staging`'s `run.app` address, then to `https://event-api.geekshacking.com/api/v1/taps`, gets `unknown_token` for an unclaimed UID and `accepted` for the test token. The same `client_tap_id` sent again gets `duplicate`, and a new tap by the test token gets `cooldown`. Each tap is in the right database. Staging passed on 10 Oct (BAC-19), and production on 12 Oct (BAC-11), through `event-api.` and Cloudflare's proxy, using a second test station, since the first one's key was lost.
- **The log check,** in Cloud Logging, on staging and then production: no key or cookie in any log line, and no secret in a URL. Staging passed on 10 Oct (BAC-12), and production on 12 Oct (BAC-11).
- **The cold start is measured** on staging, with and without startup CPU boost, on the first-generation execution environment (Julian: stay on v1, 8 Oct). The faster is kept, and the 4-second deadline is revisited with the number. Done 11 Oct (BAC-12): boost stays on, and the deadline stays at 4 seconds (section 11.3).
- **The first numbers** are written down for section 11.1: Cloud Run's requests and CPU, and TiDB's Request Units after a day, which only Julian can see. Cloud Run's are in (11 Oct), and TiDB's (12 Oct, from Julian's screenshots).
- A real station taps `event-api.` over HTTPS (BAC-14). Passed on 12 Oct, with the HTTPS firmware (HAR-10, taken over from Zi Tao by Adam): its taps were stored in `geekykey_staging` through staging's `run.app` address, then in production through `event-api.`.

### Checkpoint 3. The line drawn inside

Still one Cloud Run server, but its code is now the GeekyKey side, the Event side and the claims stand-in, which talk only through their requests, on the tables in section 3.6, with every station rule from the tickets.

- **Three areas** inside `apps/backend/src`: `geekykey/`, `event/` and `claims-stand-in/`. The last two have their own schema files, and the first has none. None imports another; a lint rule can enforce it.
- **`packages/handoff`:** the Zod schemas for the three requests to an Event Service (the hand-off, the heartbeat hand-off and the registered stations), request and answer, with types from `z.infer`, and a JSON Schema generated with `z.toJSONSchema` for other teams. The Event side checks each request with them, and the GeekyKey side checks each answer.
- **The Event side:**
  - `POST /geekykey/v1/taps`, `POST /geekykey/v1/heartbeats` and `GET /geekykey/v1/stations`, each checking the Event Service key in constant time;
  - today's ingest, with replays dropped by station ID and `client_tap_id`, and the lock on the station's row in `stations`;
  - the heartbeat hand-off stores the firmware version, saved taps and `reader_ok`, and every hand-off sets `last_seen_at`;
  - `no_game` for a station without passport settings;
  - taps stored with the user ID and no token UID;
  - `users` keyed by the user ID;
  - organizers from the `ORGANIZERS` setting, checked on every request, with `dev-organizer-1` on the local list; the `users.role` column goes;
  - `/me` without `tokens`, with `user.role` worked out from the list, and stamp slots only for passport stations, in the order they were added.
- **The claims stand-in:** today's `tokens` table and claim code, reshaped as section 3.6 says, behind the routes in section 4.
- **The GeekyKey side:**
  - the copy of the registered stations (section 3.5), with `stations_copy_filled`;
  - `Claims`, with `StandInClaims` replacing `TokenResolver` (section 4);
  - `unknown_token` answered and logged, not stored;
  - the shared 4-second deadline, with `503 claims_unavailable` and `503 event_service_unavailable`, and no retry;
  - `POST /api/v1/stations/heartbeat`, answering `server_time` once the key is checked, and sending the heartbeat hand-off without waiting for it;
  - the `EVENT_SERVICES` list, with the showcase's entry reached through `app.request()` inside the same server until the split, carrying the keys (the spec's call), and the `GEEKYKEY_ADMINS` list.
- **The keys.** Adam adds `EVENT_SERVICE_KEY` and `CLAIMS_STAND_IN_KEY` to Secret Manager, inside each service's `APP_SECRETS` (section 5.1), for production and staging, so the key checks run from now on.
- **Log lines.** From here on, every log line either side writes is one JSON object with a fixed name, such as `tap_stored`, `unknown_token`, `handoff_failed`, `claims_unavailable` and `stations_copy_filled`, and never holds a key, a cookie or a name. `tap_stored` carries the station ID, `client_tap_id`, user ID, `tapped_at`, status and source, so a restore can rebuild lost taps, QR fallback taps included (BAC-78).
- **The tables** change to section 3.6's under the migration rule: add first, switch the code, drop in a later migration, so each change takes two merges. Test data that no longer fits is deleted, not converted. Station IDs and keys stay, so stations keep working throughout.
- **Tests** for each side, with the others faked at their requests, including one for each status a station can hear, the deadline, and `503` against `401` when a list is missing.

Done when CI is green and, on production, a test station's tap answers `unknown_token` for an unclaimed token and `accepted` for a claimed one, and a heartbeat sets its last seen. Until checkpoints 6 and 7 build claiming and the station screens, Adam claims tokens and creates stations with one-off scripts from his laptop.

**Done on 15 Oct** (BAC-37), on production through `event-api.`, once BAC-36 had deployed. Migration 0006 had already put BAC-11's test station in the passport, and the test participant still held the test token, so no script needed running. With the station's key, an unclaimed UID got `unknown_token` and was logged but not stored. The test token got `accepted`, stored with the participant's user ID. The same `client_tap_id` got `duplicate`, and a new tap got `cooldown`, stored the same way. A heartbeat got `server_time` and set the station's `last_seen_at`, firmware version, saved taps and `reader_ok`. Every log line our server wrote since the deploy is one JSON object with a fixed name (`server_started`, `server_stopping`, `stations_copy_filled`, `unknown_token` and `tap_stored`), and no log entry holds a station key, a cookie, an `Authorization` header or a user's name.

### Checkpoint 4. The GeekyKey Service cut out

The GeekyKey side becomes `geekykey-service`, a Worker at `key-api.geekshacking.com` with no database. The Cloud Run server keeps the Event side and the claims stand-in. Stations move to `key-api.`

**Changed on 1 Oct 2026:** at Julian's suggestion, the Event Service and its screens move to a repo of their own at the split. The folders, CI, the smoke test and `packages/handoff` below were written for one repo, and need rethinking before this checkpoint starts (section 12). On 16 Oct Julian agreed that the move happens after the showcase (BAC-39). This checkpoint splits the folders inside this repo, and its tickets (BAC-40 to BAC-46, and FRO-37 for Ethan) keep one repo.

- **Folders.** The GeekyKey side moves to a new `apps/geekykey-service`. `apps/backend` becomes `apps/event-service`, with the Event side and the stand-in. `apps/frontend` becomes `apps/event-web` now, not before, so Ethan's work in progress isn't disrupted (done 20 Oct, FRO-37). Each has its own `package.json`, tests and CI job.
- **The Worker.** Its own `wrangler.jsonc` (section 5.1), reading its settings once from `env`. Every call to Cloud Run is a `fetch()` to an address that must start with `https://`, with `redirect: "manual"`. The heartbeat hand-off, and the refreshes of the lists a request didn't wait for, go in `waitUntil()`.
- **The station endpoints leave the Event Service** in a later merge, once every station has moved (done 20 Oct, BAC-46).
- **Names.** The package names, root scripts, mise tasks and CI filters follow the new folder names.
- **Local dev:** the GeekyKey Service in `wrangler dev` on 8000 and the Event Service on 8001, started together by the root `pnpm dev`, with the Event screens' proxy now pointing at 8001.
- **CI:** one job per service, plus the end-to-end smoke test on every pull request, which starts both services and sends a station tap through to the database.
- **The README's layout and diagram** for the new folders (section 8.1).

The deploy, the first time:

1. Julian copies `EVENT_SERVICE_KEY` and `CLAIMS_STAND_IN_KEY` from production's `APP_SECRETS` in Secret Manager into the Worker's secrets `EVENT_SERVICE_KEY_SHOWCASE` and `CLAIMS_STAND_IN_KEY` himself, so no key passes through a chat (15 Oct). Adam's Editor role can't read a secret.
2. Julian sets the Worker's `SESSION_SECRET` to a random value nobody keeps, then connects `geekykey-service` to Workers Builds from `apps/geekykey-service`. The secrets go on first, because a deploy fails while one in `secrets.required` is missing. Its other settings are in its `wrangler.jsonc`, so there's nothing else to send him.
3. The merge deploys both: the Event Service through GitHub Actions, the Worker through Workers Builds.
4. A test station taps `key-api.`. Then Zi Tao sets each station's server to `https://key-api.geekshacking.com` through its setup mode, keeping its key.
5. A later merge removes `/api/v1/taps` and `/api/v1/stations/heartbeat` from the Event Service.

Done when the smoke test passes in CI, a station's tap on production goes through `key-api.` to Cloud Run, and **the log check** is done with Julian on `geekykey-service`: if the station key or the Event Service key shows in its invocation logs, turn them off there and replace the key.

**The proof passed on production on 19 Oct** (BAC-45), through `key-api.` on the Worker that Workers Builds deployed. With the test station's key, an unclaimed UID got `unknown_token` and was logged but not stored. The test token got `accepted`, stored with the participant's user ID. The same `client_tap_id` got `duplicate`, and a new tap got `cooldown`, stored the same way. A heartbeat got `server_time` and set the station's `last_seen_at`, firmware version, saved taps and `reader_ok`. Julian exported `geekykey-service`'s invocation logs for those requests. Cloudflare logs the `authorization` header with its value masked as `********`, and neither the station key nor its hash appears anywhere. The Worker's own calls to Cloud Run, which carry the other two keys, aren't in the invocation logs at all. So no key needed replacing, and invocation logs stay on. The CPU time is in section 11.1. The checkpoint stays open until the stations have moved to `key-api.` (HAR-13).

**The stations moved on 20 Oct** (HAR-13), and Adam did it, not Zi Tao. Production had registered only two stations, both test stations, so no registered station was left on `event-api.`. Neither key had been used since BAC-45's script on 19 Oct. The main station, the ESP32-S3 from BAC-11 and HAR-14, ran on a laptop's address with a development key and 0 saved taps. So it didn't keep its key: it had no production key to keep. Through the setup mode it took `https://key-api.geekshacking.com` with `server`, then the BAC-11 test station's key with `key`. Going from a development station to a production one is closer to `move`, but with 0 saved taps the two do the same. The heartbeat answered `OK`. After a restart, the test token got `accepted` and was stored on production. The station's row then had a new `last_seen_at`, 0 saved taps and `reader_ok` true. The station board itself wasn't checked, since the screens deploy at checkpoint 5. The board now shares the BAC-11 test station with BAC-45's script, so another run of that script adds taps and heartbeats under the same station. With no station left on `event-api.`, BAC-46 can remove the station endpoints from the Event Service.

**Checkpoint 4 is done on 20 Oct** (BAC-46). Step 5's merge took `POST /api/v1/taps`, `POST /api/v1/stations/heartbeat` and the GeekyKey side's code out of `apps/event-service`, with their tests, so a tap sent to `event-api.` gets `404` and a tap through `key-api.` still gets `accepted`. What's left there is the Event side and the claims stand-in, whose routes under `/geekykey/v1` and `/claims-stand-in/v1` didn't change. `event-service`'s settings on staging and production match section 5.1, and `APP_SECRETS` keeps all four values, since the Event Service still checks `EVENT_SERVICE_KEY` and `CLAIMS_STAND_IN_KEY`. It ran on `event-service-staging` from the branch before it merged, as revision `event-service-staging-00016-jjl`. With staging's test station key, a tap and a heartbeat got `404 not_found`, where the heartbeat had got `401` before the deploy. `GET /geekykey/v1/stations` and the claims stand-in still answered a request without a key with `401`. Ethan's team moved `apps/frontend` to `apps/event-web` the same day (FRO-37), so the folders are as this checkpoint names them.

### Checkpoint 5. Login, and the screens deployed

Changed on 8 Oct: the showcase logs in through Firebase, not the Portal ([ADR 0004](../../docs/adr/0004-the-showcase-logs-in-through-firebase.md)).

*Changed 21 Oct (BAC-54):* the showcase has guests, and login links ([ADR 0005](../../docs/adr/0005-guests-reach-the-passport-through-a-login-link.md)). The showcase's public segment, after lunch, brings parents and mentors whose phones are often not signed in to Google, and a tap is credited only once its token is claimed. So the GeekyKey screens offer "Continue as guest", through Firebase's anonymous sign-in, beside Google and GeeksHacking's login. A guest can't sign in on `event.`, where Firebase would make them a new guest, so the event buttons on the token page and My tokens open a login link that logs any user in there as the same user. The passport asks a user with no name what to call them. The desk still helps people claim in the afternoon. The shapes are in API agreement 0.5 (sections 7.2, 7.4, 8.6, 8.7 and 11.9). Built in BAC-58, BAC-59 and BAC-60, with the screens in Ethan's FRO tickets.

**Before it, the Firebase setup and one check:**

- Adam turns on Google sign-in in our Firebase project and adds `key.geekshacking.com` and `event.geekshacking.com` to its authorised domains (*done 10 Oct*, runbook step 14). Julian links GeeksHacking's billing account to the project, which the Identity Platform upgrade needs (*done by 9 Oct*). *Changed 10 Oct (Adam):* GeeksHacking's login is added now, and Mr Pang is asked afterwards. Qing Guan issues an OIDC client for Firebase's redirect URL, and Adam upgrades the project to Identity Platform and adds it as a provider (runbook step 14). If Mr Pang says no, the provider is turned off and the screens drop its button. OIDC sign-ins are free for 49 users a month, then US$0.015 each.
- **The check** (Adam, BAC-20): a Worker verifies a Firebase ID token against Google's public keys, and the CPU time per login is measured against the free plan's 10 ms. *Passed 10 Oct:* a median of 1 ms of CPU with Google's keys cached and 2 ms with them fetched, and Google sign-in works on `localhost` ([the check](research/firebase-login-check.md)).

- **Each service logs users in itself** ([ADR 0002](../../docs/adr/0002-each-service-logs-in-through-the-portal.md)), like this, firm since the check passed: the screens sign in with Firebase's SDK and send the ID token to their own service, which checks its signature, issuer, audience and expiry against Google's public keys, then sets its own cookie; after login the screens go to a relative `return_to` only, the rule `isSafeReturnTo` already applies; and `POST /auth/logout`. The API agreement's login section changed with it, in version 0.4 (10 Oct). Each has its own cookie (`gk_session`, `event_session`), its own `SESSION_SECRET`, and its client ID and redirect URL from its settings. The Event Service creates or updates the user's row with their display name at login. The GeekyKey Service keeps no users, so its session holds only the user ID and, since 0.5, the login's name, which a login link carries.
- **The GeekyKey Service's `/me`** (agreement 8.4), with the user's tokens and the events that have a public address. *Changed 21 Oct (BAC-55):* moved here from checkpoint 6, since the GeekyKey screens' "Am I logged in?" is this call, and checkpoint 5 is done only when logging in works on both hostnames. Its shape doesn't change.
- **Guests and login links** (BAC-54). Adam turns on Firebase's Anonymous provider and the automatic deletion of anonymous accounts after 30 days, and the limit of 100 new accounts an hour from one IP address is raised for the rehearsal and for 17 to 18 Nov (runbook step 14). *Changed 27 Oct:* Firebase holds one scheduled quota at a time. It's 800 an hour on 12 Nov for the grad tea (scheduled 21 Oct), so the rehearsal keeps the usual 100, and Adam schedules the showcase's for 17 Nov on 13 Nov or later (BAC-97). The login link's key is derived from the Event Service key (agreement 11.9), so there's no new secret. The Event Service keeps each used link's ID until it expires, in a new table, and `users` records whether the user set their name.
- **The forwarding Workers.** A small `worker/` folder in `apps/event-web` and in `apps/geekykey-web`, with its own Wrangler config (section 5.1). Adam writes them. Afterwards Ethan owns them, and Adam reviews any change to their list of paths.
- **`apps/geekykey-web`** exists by now, from the screens track, with at least its login and shell.

The deploy: Julian or Qing Guan attaches `event.geekshacking.com` to `event-web` and `key.geekshacking.com` to `geekykey-web`, and Julian connects both to Workers Builds from this repo, with the root directories `apps/geekykey-web` and `apps/event-web`, and `VITE_LIVE_API=1`. *Changed 20 Oct (BAC-48):* both come from this repo, since the Event Service's own repo waits until after the showcase (BAC-39). A pull request adds each domain to `routes` the same day.

Done when:

- logging in and out works on both hostnames, and the passport shows on a phone;
- on a phone, a guest logs in on `key.`, takes a token through a direct write to the claims stand-in, taps it, and opens the passport from "Open Capstone Showcase" as the same user, with their stamp; a Google user gets there without a second login. *Changed 22 Oct (Adam):* claiming from the token page is checkpoint 6's, so the token comes from a direct write here, as the Google user's did on 22 Oct, and a guest claiming from the screen moved to checkpoint 6's done-when;
- **the log check** for `Cookie`, with Julian on the three Workers and in Cloud Logging for the Event Service: if a cookie shows, turn invocation logs off on that Worker and replace the service's `SESSION_SECRET`, which logs everyone out;
- **the passport poll is measured** for section 11.1: Workers requests per poll, and the Event Service's time per poll.

**Checked on production on 22 Oct** (BAC-57), from 07:15 to 07:33 Singapore time. The first, third and fourth items passed. The second passed at about 13:00 the same day, once the guest and login-link screens (FRO-59, FRO-31 and FRO-60) were merged. **Checkpoint 5 is done.**

- **Logging in and out.** Adam logged in with Google on `event.` on his laptop and on an Android phone, and the passport showed on both. After he logged out, `/api/v1/me` answered `401`. On `key.` he logged in, saw My tokens and logged out.
- **A stamp.** Checkpoint 6 builds claiming, so Adam's Google user took the default test token through a direct write to the claims stand-in from his laptop. He tapped the token at the main station, the stamp showed on the phone's passport, and the token went back to the test participant afterwards.
- **The log check passed.** None of the Event Service's 84 log entries from 07:00 to 08:00 holds a cookie, an `Authorization` header or a Firebase token. *Changed 22 Oct (Adam):* for the Workers, a throwaway Worker on Adam's own account took the place of an export from Julian, since what Workers Logs records is Cloudflare's behaviour and not our code's. It had the same log setting as our three Workers, `"observability": { "enabled": true }`. It got requests with made-up `event_session` and `gk_session` cookies and a made-up `Authorization` header, and answered each with a made-up `Set-Cookie`. Its invocation logs show the `cookie` header as `REDACTED` and `authorization` as `********`, which is what BAC-45 saw on GeeksHacking's account. For the answer they record only its status, so the `Set-Cookie` isn't there. None of the made-up values appears anywhere. So invocation logs stay on, and no `SESSION_SECRET` needed replacing. The test can't rule out a setting on GeeksHacking's account that logs more, but no such setting is known.
- **The passport poll** is measured in section 11.1.
- **A guest's run** (about 13:00). In a private tab on a phone, Adam continued as a guest on `key.`, and the default test token went to the guest through a direct write to the claims stand-in from his laptop. My tokens listed it. He tapped it at the main station and pressed "Open Capstone Showcase". The passport opened on `event.` with no login screen, asked "What should we call you?", and showed the stamp. In a new private tab, his Google user opened the passport the same way without signing in again. The token went back to the test participant afterwards.

### Checkpoint 6. The GeekyKey Service's features

The endpoints behind the token page and My tokens, plus the station path's protections. Ethan's team builds the screens (see the tracks). The API agreement's section 8 has the shapes.

- **For users:** the token page's lookup, which says whether a token is unclaimed, yours or someone else's, and gives a GeekyKey admin the owner's ID to release with; claiming (`201`, or `200` if it's already yours, `409 token_taken`, `409 token_limit_reached` from the cap check); and releasing, by the owner or by a GeekyKey admin, each writing a `token_released` log line (section 4). *Changed 21 Oct (BAC-55):* `/me` moved to checkpoint 5.
- **For GeekyKey admins,** checked against `GEEKYKEY_ADMINS` on every request: only releasing someone else's token, from the token page. They have no station jobs.
- **The three limits** on this Worker (section 5.1). Each answers `429` with `{"error": "rate_limited"}` and `Retry-After: 60`, and writes one `rate_limited` log line naming the caller: a station ID once known, or a user ID, never a key.

Done when, on production: a phone claims a token from its token page and another by typing its UID, and a guest on a phone claims one from its token page (moved here from checkpoint 5 on 22 Oct); the owner's view opens the showcase; an owner and a GeekyKey admin each release one; and the tests show each limit tripping.

**Checked on production on 23 Oct** (BAC-71), from about 07:24 to 07:29 Singapore time, once FRO-70's screens had deployed at 07:24. Each item passed, in the ticket's order, with the default test token. **Checkpoint 6 is done.**

- **The admin's release.** Adam's Google user is the one in `GEEKYKEY_ADMINS`. On a phone, the test token's page said "This token belongs to someone else" and offered **Release**, and Adam released it from the test participant.
- **Both ways of claiming, and the showcase.** Adam claimed the token from the same page and pressed "Open Capstone Showcase". The passport opened on `event.` with no second login. On My tokens, Adam released it as its owner, then claimed it again by typing its UID.
- **A guest's claim.** Adam released it once more, pressed "Continue as guest" in a private tab, and claimed it from its token page. The claims stand-in recorded the guest's claim at 07:28:37. The token went back to the test participant at 07:32, through a direct write.
- **The limits.** CI on `main` at 5fb03b4 (22 Oct, run 39792765559) passed `station-routes.test.ts`, with `STATION_LIMIT`'s tests, and `user-limits.test.ts`, with `USER_LIMIT`'s and `TOKEN_LIMIT`'s. Each limit is tested as `wrangler.jsonc` sets it.
- **Not read.** The `token_released` log lines are in `geekykey-service`'s logs, which only Julian can open.
- **Found along the way.** Two screen changes, outside the done-when, are FRO tickets. After the guest's claim, the dashboard on `event.` still said "Tap your token with your phone to claim it", since it shows to anyone with no taps yet (FRO-73). And the UID box on My tokens could put a colon after each pair of characters as you type (FRO-74).

### Checkpoint 7. The Event Service's features

The organizers' screens, the rest of the passport, and the line between the base and the showcase's own code. Changed on 23 Oct, after the meeting with Julian (section 2, "The 23 Oct answers"). The showcase game is a collectible: a participant collects a stamp at each partner station, which the passport already does, so most of the game is built.

**Must:**

- **The organizers' station endpoints:** create a station, showing its key once; replace its key, keeping its ID, showing the new key once; disable and enable it. Each change writes a log line with who made it. A disabled station drops off the registered stations, so within a minute its key gets `401`.
- **The station board's endpoint:** every station of this event, from its own `stations`, with its passport settings, whether it's online (last seen within 120 seconds), its firmware version, saved taps, `reader_ok`, and its last tap. A station without passport settings is "Not in the passport".
- **Passport settings:** adding or changing a station's name, location, booth and points. Stamp slots follow the order stations were added. The booth is optional, and says where the map draws the station (below).
- **The tap log** without `token_uid`, **the stats**, **the export** with its ten columns and the statuses `accepted`, `cooldown` and `no_game`, and **the QR fallback**, which takes a `user_id` only and stores the tap through the same pipeline with `source = qr_fallback`.
- **The limit** of 60 requests a minute per user, counted in each instance's memory.
- **The base, apart from the showcase's own** (23 Oct). The base is what the GitHub template will copy (section 3.7). In `apps/event-service`:
  - `src/event/` keeps the base: stations and their keys, storing taps with their statuses and cooldown, the QR fallback, users, names and login links, organizers, the tap log, the stats and the export.
  - `src/games/` has one folder per game, each behind one interface, which is in `src/event/games.ts`: given a tap and its context, a game returns its status and keeps its own record of what it counted, and the pipeline combines the games' statuses as section 3.7 says. The passport moves here first, out of `src/event/tap-pipeline.ts`, with no change in behaviour.
  - `src/showcase/` holds this event's settings: which games run on which stations, and the booth texts.
  - A rule in `.oxlintrc.json` stops `src/event/` importing from `src/games/` or `src/showcase/`, tested in `areas.test.ts` like the existing areas.
- **The map's data** (settled 23 Oct): one read-only endpoint, read by organizers and the map screens only, with each passport station's booth and counts and no names. "The map and connections, in detail" below has the whole design.

**Should:**

- **The map on the big screen,** in the Event screens, which are Ethan's: one screen at our booth showing the hall, each passport station at its booth, and a pulse as its taps arrive, polling every 2 seconds. A 2D map first, then a 3D model of the floor plan drawn from the same data, once the teachers give us this year's floor plan, loaded on the big screen only. Both use the same booth names, so moving from 2D to 3D changes only the screen's files. The model is a plain file, which costs no Workers requests; the screen's polls do (section 11.1).
- **Progress toward the collectible** in the passport, such as "3 of 6", from its stamps.
- **Connections between participants,** second after the map (Julian, 23 Oct): counts, and an anonymous web of links on the map, with no names, for PDPA. Two participants connect by tapping at the same connection point within a few seconds of each other (settled 23 Oct, "The map and connections, in detail" below). It's a second game under `src/games/`. Agreement section 12 puts dual-tap connections out of scope, so this needs a change there, made once the map is done. Whether a connection point is one station or two, and the details that follow from it, are open (section 12). *Changed 27 Oct, later:* a Should, since the showcase needs at least one networking game (BAC-83, BAC-86). *30 Oct:* still a Should, with connection points hidden or at partner booths, and a connection counted only between two kinds of token (the 29 Oct answers, item 6).

**Could:**

- **Timed games and timed rules** (moved down by Adam, 23 Oct). An organizer sets a schedule before the day; each line names a game, its stations, a start and an end, and the game's rules for that period. A tap is judged by the games on its station at `tapped_at`, or at its arrival when the station sent none.
- **The station's own text after a tap,** such as the visitor's name, progress and instructions, only if the station gets an OLED or a TFT (Adam, 23 Oct). Which screen is Zi Tao's call. It's an optional field in the tap's answer (agreement 6.1) that the Event Service fills in its hand-off answer (11.2), so it needs Ethan's approval. Old stations ignore it, as the station contract already says. *Changed 30 Oct:* a Must for the showcase, on today's 16x2 LCD: up to two lines from the station's game, first the next stop (the 29 Oct answers, item 4; BAC-98, BAC-111, HAR-28).
- **Token types,** such as role or prize tokens, kept as this event's own data, since one token visits many events. *Changed 30 Oct:* a Must for the showcase, as token kinds, which GeekyKey keeps with each token rather than each event keeping its own ([ADR 0006](../../docs/adr/0006-a-token-carries-its-kind.md); the 29 Oct answers, item 3).
- **A theme for the showcase's screens,** from the showcase's theme, which we ask the teachers, with partner groups' logos fitting into it. Ethan's, and the screens' share of the line between the base and the showcase's own.
- **Other game ideas at our booth,** third after connections: custom tokens, a competitive variant, a role-playing variant, and the prototypes that led to the final design. Shown as mock-ups, unless there's time to build one. *28 Oct:* one more game for the showcase itself, the roaming station or students' picks, is chosen or dropped on Thu 5 Nov (BAC-98). *30 Oct:* neither; the station names each visitor's next stop instead (BAC-98).
- **The group's page after a stamp** (28 Oct): an optional link in passport settings, given with each stamp, which the passport offers as a button after a new stamp (BAC-99, FRO-89). Only if it merges by Tue 10 Nov. The NFC sticker and QR code on each partner station (HAR-26) cover the showcase without it.
- **The animation pass** on the screens, proposed to Ethan (the agenda's 3.5).

**Stretch:** a plugin system, with each game packaged on its own and chosen by the settings. Until then, the template does much of its job: a new event copies the base and adds a folder under `src/games/`.

**Dropped on 23 Oct:** the leaderboard, the bonus that moved to the quietest area every 20 minutes, and points shown on the station. **Not before the showcase:** more than one event at once in one Event Service (agreement section 12). The grad tea and the showcase run on it in turn (section 6, "The grad tea").

Done when, on production, an organizer creates a station, sets it up in the passport and watches its taps arrive, then disables it and sees its key refused within a minute, and the export's columns match the API agreement. The passport runs from `src/games/` with the existing tests passing unchanged, `areas.test.ts` fails an import of a game from `src/event/`, and the map's data, read with a map screen's login, shows the station at the booth its organizer set and a new tap within one poll.

**Checked on production on 26 Oct** (BAC-85), from 15:07 to 15:58 Singapore time. Adam was the organizer, listed in `ORGANIZERS` since #157, and his second Google account was the booth screen, listed in `MAP_SCREENS` since #158. Times come from the Event Service's log lines and from a heartbeat sent every 5 seconds with the station's key. Every step passed once BAC-87 was fixed. **Checkpoint 7 is done.**

- **Creating a station.** Adam created the station on the station board at 15:07:51. The key comes only in the create's answer (9.7), and the board's list has no key field (9.2). He entered the key into the ESP32-S3 through setup mode, and its first heartbeat reached the board at about 15:18.
- **The passport and its taps.** At 15:18:48 Adam added the station to the passport, named "Booth A" at booth "Booth A". A tap made at 15:19:01.7 was stored at 15:19:02.9 as `accepted`, and showed on the station board and in the tap log.
- **The map.** Read with the booth screen's login, the map's data listed the station at booth "Booth A". A tap stored at 15:20:53.8 was counted in the next read, at 15:20:57.7. The map reads the database on every call, with no cache, so a tap shows on the next 2-second poll.
- **Disabling and enabling.** The first try failed by a little: Adam disabled the station at 15:29:57, and the key was still accepted now and then until 15:30:59, 61.7 seconds later. Each Worker isolate answered once from its own copy of the registered stations, however old, so the minute wasn't a real bound (section 3.5). BAC-87 fixed it, and #161 went live at 15:50. On the second try Adam disabled the station at 15:54:27, and the last `200` came at 15:54:55, 28 seconds later. He enabled it at 15:57:24, and the last `401` came at 15:57:31, 7 seconds later. The station keeps its taps: Adam had also disabled and enabled it at 15:23 and 15:27, and the export downloaded at 15:27 still had every one of them.
- **The export.** Downloaded at 15:27, `geekykey-taps.csv` had exactly 9.6's ten columns, in order, with every line ending in CRLF. Its 696 rows each had ten values, ordered by `tap_id`, and included the station's six taps under "Booth A".
- **CI.** Run 40285708116 on `main` at dc1d156 passed. The passport runs from `src/games/`, and BAC-72 (e253a05) changed `tap-pipeline.test.ts` only to pass the games in, with none of its checks changed. `areas.test.ts` has "the base imports no game, and not the showcase's settings", which fails a file in `src/event/` that imports the passport. `user-limit.test.ts` has "the 61st request in a minute from one user gets 429 rate_limited".
- **Still to come in this checkpoint.** The map screen itself (FRO-78, then FRO-80 in 3D), the floor plan from the teachers (BAC-82), progress on the passport (FRO-76), animation (FRO-77) and connections (BAC-83 and BAC-86) are Should and Could, so they aren't part of this proof.

#### The map and connections, in detail

Settled by Adam on 23 Oct, after the meeting. Connections are a Could (a Should since 27 Oct, later), built after the map, but their rule is settled now because it shapes the game interface that is a Must.

##### Problem

Julian wants the showcase shown from end to end: a participant taps at a partner's booth, and the screen at our booth shows it happen. Today the only reads that cover stations and their taps are the organizers' station board (agreement 9.2) and stats (9.5). A public screen would then hold an organizer's login, which can disable stations and log taps for other people, and it would read two endpoints on every poll. Nothing says where a station stands in the hall, and the floor plan isn't known yet. For connections, the agreement leaves dual taps out of scope, and nothing says how two participants connect without a phone, or how the screen shows a web of links without showing who met whom (PDPA).

##### Solution

The Event Service gets one read-only endpoint for the map. It lists every passport station with its booth and counts, and never a name. Only organizers and the users on a short list of map screens may read it. The screen at our booth logs in as one of those users, so a leaked login there can read the map and nothing else. The screen's own floor plan, in 2D and later in 3D, names each booth and says where it is. Each station's passport settings say which booth it stands at, so an organizer can move a station on the day without a deploy. The screen polls every 2 seconds and pulses a station when its count of stored taps goes up.

Two participants connect by tapping their tokens at the same connection point within a few seconds of each other. A connection point is one station, or a few stations linked to act as one, used only for connections. Once connections are built, the same endpoint adds a connection count and an anonymous web, and the screen redraws the web without marking which link is new.

##### User stories

1. As a participant, I want my tap at a partner's booth to show on the map at our booth within a few seconds, so that I can see the system respond to me.
2. As a participant, I want the map to show no names, so that standing near the screen tells nobody where I have been.
3. As a participant who taps again during the cooldown, I want the map to pulse anyway, so that the screen doesn't look broken when I try it.
4. As a participant, I want the map to show how many people have visited each booth, so that I can see which booths are busy.
5. As a partner group, I want our booth's pulse and count on the map, so that visitors at the GeekyKey booth see our booth is active.
6. As an organizer, I want to set which booth a station stands at in its passport settings, so that the map draws it in the right place.
7. As an organizer, I want to move a station to another booth on the day without a deploy, so that a late change of layout doesn't need a pull request during the freeze.
8. As an organizer, I want a passport station with no booth, or a booth name the floor plan doesn't know, to show beside the map rather than vanish, so that I notice and fix it.
9. As an organizer, I want a disabled station to stay on the map, marked and with no pulse, so that its counts are still shown and its state is clear.
10. As an organizer, I want to read the map's data with my own login, so that I can check it from the desk.
11. As Adam, I want to add the booth screen's user to a list of map screens, so that it can read the map without being an organizer.
12. As Adam, I want any other user who asks for the map to get `forbidden`, so that participants' phones don't poll it all day.
13. As the person running our booth, I want the map screen's login to be unable to disable a station or log a tap, so that a screen left in public is no risk to the event.
14. As Ethan's team, I want one endpoint with everything the map draws, so that each poll is one request.
15. As Ethan's team, I want the booth names in the endpoint to match the booth names in our floor plan files, so that 2D and 3D draw from the same data.
16. As Ethan's team, I want to swap the 2D plan for the 3D model without any change to the Event Service, so that the model can arrive late.
17. As Ethan's team, I want a stored-tap count per station, so that the screen can tell a new tap by comparing two polls.
18. As Ethan's team, I want the map's poll to stay well inside the 60 requests a minute per user, so that the screen never gets `rate_limited`.
19. As GeeksHacking, I want the map's requests counted at the rehearsal, so that we know before the day whether to pay for Workers Paid.
20. As a participant, I want to connect with someone by tapping our tokens at a connection point together, so that meeting someone at the showcase leaves a mark.
21. As a participant, I want a connection to need no phone, so that the token does something a phone can't.
22. As a participant with several tokens, I want my own tokens never to connect to each other, so that the count means people met.
23. As a participant, I want tapping with the same person again to add nothing, so that the web shows who has met, not how often.
24. As a participant, I want two strangers who happen to tap near me not to be connected to me, so that the web is honest.
25. As a participant, I want the web on the map to give no hint of which link is mine, so that someone who watched us tap can't follow my other links.
26. As a guest, I want to connect like anyone else, so that logging in with one tap costs me nothing.
27. As Julian, I want connections shown as counts and an anonymous web, never who met whom, so that the showcase stays inside PDPA.
28. As an organizer, I want a tap at a connection point to count only for connections, so that the passport's stamps and points stay as they are.
29. As a builder of the next event, I want connections to be a game in the games folder, with its connection points in the event's own settings, so that the template keeps it or drops it without touching the base.
30. As a builder of the next event, I want the game interface to let a game read other users' recent taps at its own stations, so that games that pair people need no change to the base.

##### Implementation decisions

The map's data:

- **One new endpoint on the Event Service,** with its path and shape fixed in a change to agreement section 9, which Ethan approves before the screen is built. A suggested path is `GET /api/v1/map`.
- **Its shape:** for each passport station, in stamp-slot order, its station ID, its name in the passport, its booth or `null`, whether it is disabled, its count of stored taps (`accepted` and `cooldown`), its unique participants, and its last tap's time. It gives no user IDs, user names or token IDs.
- **Who may read it:** organizers, and the users on a new setting that lists the map screens' user IDs, read once at start-up like the organizers' list. Anyone else signed in gets `forbidden`, and no session gets `unauthenticated`. It counts toward the user's 60 requests a minute; at one poll every 2 seconds the screen makes 30.
- **The booth** is a new optional field in passport settings (agreement 9.1), shown in the station board's passport object (9.2) and in the map's data. It is free text. The screen matches it to a booth name in its floor plan, and treats a name it doesn't know like a missing booth. The existing `location` stays the text participants read in the passport.
- **The floor plan is the screen's own,** as static files in the Event screens: a 2D plan first, then a 3D model, both naming the same booths. The Event Service stores no coordinates.
- **A pulse** is the screen seeing a station's stored-tap count go up between two polls.
- **Polling every 2 seconds** while the screen is shown. WebSockets and server-sent events stay out (agreement 12). An open socket bills Cloud Run for as long as it is open, and Cloud Run's instances share nothing, so a tap stored on one instance would have to be found by another. Workers Paid is the fallback if the day's requests don't fit (section 11.1).

Connections, built after the map:

- **A connection is between two users, never two tokens.** A user can't connect to themselves, and a pair connects once.
- **The rule, per connection point:** taps by exactly two different users within the window make a connection. A third user inside the same window makes none. Taps are compared by `tapped_at`, from the station's own clock, never by `taps.id` or arrival order, since saved taps arrive late (section 3.7).
- **A connection point** is one station or a few linked ones, listed in this event's settings under `src/showcase/`. Its stations aren't in the passport, so the passport ignores their taps.
- **Every tap at a connection point gets `accepted`** from the connection game, whether or not it pairs, since a tap's status is fixed when it arrives and taps can't be edited (agreement 12). The connection is the game's own record, written when the later of the two taps is stored. The first tap's status never changes.
- **Two taps arriving at once,** on two Cloud Run instances or from two linked stations, must not both miss each other. The check reads the connection point's recent taps under a lock (`FOR UPDATE`, as TiDB needs for lock-then-read).
- **The game interface** in `src/games/` gives a game the tap, its station and a way to read other users' recent taps at the game's own stations, and the game writes its own record in the same transaction. The passport, which needs none of this, keeps its behaviour.
- **On the map,** the endpoint adds the connection count and the web's links between anonymous nodes. The screen redraws the web without marking new links, and the pulse stays on the station.
- **Agreement section 12** drops "dual-tap connections" from its list in the same change that adds them. That change waits until the map is done.

##### Testing decisions

- **One seam, the Event Service's HTTP app,** as `testApp()` gives it, against the Docker TiDB. A test calls the endpoints the screens and the GeekyKey Service call, and checks only what they answer. It never checks a query, a table's columns or a module's insides.
- **The map's data:** like `me-routes.test.ts`, write stations, passport settings and taps straight into the tables, then read the endpoint. That covers each status's count, unique participants, stamp-slot order, a disabled station, a missing booth, and the absence of any user or token ID in the body.
- **Who may read it:** an organizer and a listed map screen get `200`; another user gets `forbidden`; no session gets `unauthenticated`.
- **The booth:** set through the passport settings endpoint, then read on the map and on the station board.
- **A tap end to end:** sent through the hand-off route, as `handoff-routes.test.ts` does, and seen in the next read of the map. This is the Done-when line.
- **Connections, when built,** go through the hand-off route too: two users within the window connect; one user's two tokens don't; three users in the window make none; a pair tapping again adds none; two taps sent in the opposite order to their `tapped_at` still connect; and every tap at a connection point answers `accepted`.
- **The passport's move to `src/games/`** is checked by the existing `tap-pipeline.test.ts` passing unchanged. The import rule is checked in `areas.test.ts`, as today.
- **The screens** are tested by Ethan's team against the agreement's shapes, as for the other screens.

##### Out of scope

- Push to the screen: WebSockets, server-sent events and webhooks.
- The map on participants' phones at the showcase.
- Names, user IDs or token IDs anywhere on the map.
- Connecting by phone, in any form. It goes against the teacher's point that GeekyKey shouldn't be something a phone could do alone, and iPhone Safari can't read NFC from the web.
- Marking which link in the web is new.
- Coordinates in the Event Service, or a way to edit the floor plan from a screen.
- The leaderboard (dropped on 23 Oct).

##### Further notes

- The layout of a connection point is open, for the group and Julian (section 12): one station both people tap, or two linked stations side by side, one each. The rule above covers both, so the choice is about hardware and the ritual at the booth.
- Also open (27 Oct, later, on BAC-83): a visitor and a member of the partner group tapping together at the partner's booth, after the group's challenge question. It would bring connections to the partner stations, but it breaks the rule above that a connection point is used only for connections.
- With it, and also open: the window's length, which two stations need longer, since their clocks are each set from `server_time` with no NTP; whether a tap with no `tapped_at` can pair (suggested: no); what the second tap's answer and beep say, given that the first tap is answered before anyone knows a pair is coming, and that station text waits on an OLED or a TFT; how the web's anonymous nodes are named so the screen keeps a steady layout between polls without user IDs; and whether a participant sees their own connection count in the passport.
- This year's floor plan is still to come from the teachers (section 12). Until then the 2D plan can use the layout we know.

### The grad tea

Added 27 Oct (BAC-88). *Changed 27 Oct, later:* the grad tea is a pilot of the showcase's own games, not a contest between games, so no game is chosen there for our booth (section 2, "The 27 Oct answers, later"). It runs on Thu 12 Nov, from 3:30 to 6:30 pm in the MPH, with a Gatsby party look, while the showcase keeps its sci-fi look. It's the first real event on production, five days before the showcase, and it falls the day after the backend freezes. So every backend change it needs merges by Tue 10 Nov.

#### What it measures

The problem both events test is that visitors stay with what they came for: guests with their own group at the grad tea, and parents at their own child's booth before they vote at the showcase (Mr Johari). A game that works moves people into areas they would otherwise skip.

- **People in each area.** Observers count the people in each area of the MPH every 15 minutes. The first half hour, before tokens go out, is the baseline.
- **From the taps:** how many passport stations each guest reached, how many connections were made, and, from 30 Oct, whether guests went to the next stop the station named. Both come from the copy Adam takes at the end of the evening, which is the source for Joshua's analysis.
- **The results** are shared at the meeting on Fri 13 Nov. They can change the clue cards and where the stations stand, which need no deploy, but no code after the freeze.
- **The showcase is the field test.** Visitors with and without a token are compared at the voting point, if the teachers allow it (section 12), and each booth's tally is set beside last year's voting pattern, from Mr Johari. Student helpers hand tokens out at the entrance, and count the visitors who decline one (the spec's call), so there's a group without tokens to compare.

#### The games

- **The passport,** at every station except the connection points, with the trail's clues on printed cards (BAC-94). A guest taps, collects the stamp, reads the station's card, and goes to the booth it describes. The passport already records the stamps, so the trail needs no code. At the showcase, the route crosses all three walled areas.
- **Connections** (BAC-83, BAC-86): two guests tap at the same connection point within a few seconds of each other, as checkpoint 7 settled. The map on the projector shows the count and the anonymous web. *30 Oct:* the point is hidden, or part of a partner's booth, and the two guests' tokens must be of different kinds.
- *Dropped 30 Oct* (the 29 Oct answers, item 7): **Find Gatsby** (BAC-96, HAR-23, FRO-88), the stretch game, with a go or no-go at the meeting on Thu 5 Nov. One of the group carries a hidden station. The fixed stations sense its radio signal and say hot, warm or cold on a tap, and a participant who finds the person taps their key on the hidden station. If the radio readings misbehave on the night, Gatsby checks in instead. As he moves, he taps a crew key, a token owned by an organizer, at a fixed station. The phone and the map then show where he was last seen, such as "last seen near the drinks". At the showcase the game becomes "the android among us". UWB boards are ordered (HAR-22), and are shown first as a demo of their own on a laptop. They join the map only after a go.
- **One more game may join** (BAC-98, 28 Oct): the roaming station, which one of the group carries to the area with the fewest visitors, or students' picks, where exhibiting students tap the booths they'd recommend before the parents arrive. The meeting on Thu 5 Nov picks one or neither. *Changed 30 Oct:* neither. After a passport tap, the station names the visitor's next stop, the quietest booth they haven't stamped (BAC-98, BAC-111, HAR-28).
- **Token kinds** (30 Oct; BAC-113, HAR-29, FRO-103): each token's kind opens its own screen on the phone, and a connection counts only between two kinds. Joshua's outfit dresses each guest's avatar from their stamps (FRO-105); the showcase has the spaceship instead (FRO-104).
- **Dropped on 27 Oct, later:** the speakeasy quiz (BAC-92, FRO-86), which needed the phone at every tap, and the green light trail as a game of its own (BAC-93, FRO-87), which the clue cards replace. A phone is needed once, to claim a token, and after that only to check progress.
- **The e-paper map card** (HAR-24) is an iteration in the report and an item on the prototype table at our booth, not a game.

The passport and connections are folders under `src/games/`, behind the game interface (`src/event/games.ts`). Find Gatsby would be a third, and only it needs the two calls that let the phone read a participant's state in a game and send their moves (BAC-91), so BAC-91 follows its go or no-go. *30 Oct:* Find Gatsby is dropped, and BAC-91 with it. The next stop is the passport's own, given in its lines for the station (BAC-111).

#### Both events on one Event Service

Settled by Adam on 27 Oct.

- **One Event Service, one database.** The grad tea runs on our Event Service at `event-api.`, with the same stations and keys as the showcase.
- **Both events' settings are in the code.** The games are shared under `src/games/`. Each event's own settings sit beside the other's: the grad tea's stations, connection points and Gatsby in `src/grad-tea/`, and the showcase's in `src/showcase/` (the folder names are the spec's call). The lint rule keeps the base from importing either.
- **Organizers choose each station's game,** as data (BAC-90): the station's `game`, set through the agreement's 9.11, and fixed once a game has counted or held back a tap there. The event's list of games is code, in `src/showcase/games.ts`. So going from one event to the other needs no deploy.
- **Copy, then clear, between the events.** Adam takes a copy at the end of the grad tea, which is the source for Joshua's analysis. The evening-before clear on Mon 16 Nov then empties the grad tea's taps, claims and game records (checkpoint 8).
- **The agreement follows** (BAC-88, for Ethan's approval). Its section 12 said "One Event Service runs one event", and now says one event at a time. Its section 1 says ours runs the grad tea, then the showcase, and its scope gives the showcase as 17 November.

#### The switch from the grad tea to the showcase

Settled by Adam on 27 Oct. *Changed 27 Oct, later:* no game is chosen at the grad tea, so the winning game's content goes. Two things show which event is on, and neither of them is data.

- **The Event screens' look:** Gatsby for the grad tea, sci-fi for the showcase (FRO-85, FRO-77). "Theme" already means light and dark in `globals.css`, so this is called the event's look. Ethan may choose another name.
- **The event's name on the token page and My tokens,** which comes from `EVENT_SERVICES` in `geekykey-service` (section 5.1). The entry says "Grad Tea" from BAC-88's merge, so the button reads "Open Grad Tea", and takes "Capstone Showcase" back at the switch. A banner may replace the name later (Adam, 27 Oct). Its ID stays `showcase`, with the same key.

One pull request after the grad tea changes both, and merges by Sun 15 Nov. It's a planned exception to the backend freeze, like a fix Adam approves. It changes content and settings only, never how a game works. Organizers then set each station's game for the showcase.

#### The room and the stations

- **Stations:** three on the MPH's power sockets, the portable station with its battery and 4G module, and more on power banks over Wi-Fi.
- **The network** is our own router or hotspot on a fixed Wi-Fi channel, for the internet (and for Find Gatsby's signal, until it was dropped on 30 Oct), since a station can't sign in through a Wi-Fi login page. Each station takes it through its setup mode.
- **Testing** (HAR-21): Gatsby's signal through a crowd, and a full evening on a power bank. *30 Oct:* the power bank run only, since Find Gatsby is dropped. Zi Tao's hardware order is HAR-22.
- **The booth moves onto the station** (BAC-89). The map has to draw stations that aren't in the passport, such as connection points.
- **Which game a station runs** shows on a printed card and on the map on the MPH's projector (FRO-84). The station's 16x2 LCD shows the game's name only if there's time.
- **Moving a station:** organizers pick a booth from a menu first, and drag stations on the map later (FRO-83).
- **Four of the group** run the stations.
- **The MPH.** Adam emailed Mr Ng, Subject Head of Student Leadership, and Kyle, the student council chair, on 27 Oct. Mr Ng replied and copied the student council teachers. Mr Yaseer is the teacher in charge of games, so the requests go through him (BAC-95): the floor plan, the projector, three places with power sockets, using our own network, and time to set up before 3:30 pm.
- **Tokens.** At the end of the evening, a collection box takes back the tokens participants don't want to keep (Adam, 27 Oct). The clear releases every claim, so a returned token is claimed afresh at the showcase. Tokens that go home can't be used again, and Zi Tao's order (HAR-22) allows for them. The hexagon collectible, a token with six partner pieces, is prototyped and chosen by Thu 5 Nov (HAR-25). Its print run, up to 100 hexagons and 600 triangle pieces, is the risk. *30 Oct:* Julian asked for a token that isn't spiky, with a magnet, chosen and in production this week. Every token is written with its kind (HAR-29), and all coins look the same.
- **A partner group's page, from its station** (28 Oct), for the showcase. A station can't make a phone open a page, so each partner station gets an NFC sticker and a QR code with the group's link (HAR-26). The sticker sits at least 5 cm from the reader, which would otherwise read it as a tap. If BAC-99 merges by Tue 10 Nov, the passport also offers the link as a button after a new stamp (FRO-89). Web Push stays out: iPhones allow it only for a site added to the home screen.

#### What it needs from each checkpoint

| Checkpoint | For the grad tea |
|---|---|
| 1 to 4 | The tap path through `key-api.` to Cloud Run. Done |
| 5 | Logging in, guests and login links. Done. Firebase's limit on new accounts is 800 an hour on 12 Nov (runbook step 14, scheduled 21 Oct) |
| 6 | Claiming tokens on phones. Done |
| 7 | Creating stations, their keys, disabling them and the station board, the map's data and the passport. Done. The map screen (FRO-78), a Should for the showcase, is a Must for the grad tea, on the projector, showing each station's game (FRO-84). Connections (BAC-83, BAC-86) are a Should since 27 Oct, later |
| 8 | The copy and clear tasks, with the clear also emptying every game's records. The stress test and the rehearsal by Sat 7 Nov come before the grad tea. The rehearsal runs the grad tea's games that have merged by then; a game merged after it runs on staging first, then the group tries it on production before the clear on Wed 11 Nov (the spec's call). The warm instance is on for the grad tea |
| The grad tea's own | The tickets below |

#### The tickets

Every backend ticket merges by Tue 10 Nov, and needs Ethan's approval of its part of the agreement.

- **Backend:** BAC-89 (the booth on the station), BAC-90 (each station's game), BAC-83 and BAC-86 (connections), BAC-96 and BAC-91 (Find Gatsby, cancelled 30 Oct), BAC-98 (the next stop, 30 Oct), BAC-111 (the station's lines), BAC-113 (token kinds) and BAC-99 (the group's link with the stamp, if it fits). The grad tea's name in `EVENT_SERVICES`, "Grad Tea", went in with the spec (BAC-88). BAC-92 (the quiz) and BAC-93 (the trail) are cancelled.
- **Content and the venue:** BAC-94 (the clue cards, the grad tea's printed by Wed 11 Nov and the showcase's by Sat 14 Nov) and BAC-95 (the MPH, with Mr Yaseer).
- **Screens:** FRO-83 (moving stations and setting their games), FRO-84 (the map shows each station's game), FRO-85 (the Gatsby look), FRO-88 (Find Gatsby, cancelled 30 Oct), FRO-103 (the token page per kind), FRO-104 (the spaceship, proposed), FRO-105 (Joshua's outfit at the grad tea) and FRO-89 (the button to the group's page, if BAC-99 merges). FRO-86 (the quiz) and FRO-87 (the trail) are cancelled.
- **Stations:** HAR-21 (the tests), HAR-22 (the hardware order, with the UWB boards), HAR-23 (Find Gatsby's firmware, cancelled 30 Oct), HAR-28 (the station shows its lines), HAR-29 (the token writer writes each kind, and the veteran tokens), HAR-24 (the e-paper map card, as a report iteration), HAR-25 (the hexagon collectible, urgent) and HAR-26 (each partner station's NFC sticker and QR code).

Done when the grad tea has run on production, and the observers' counts and the copy taken at its end give its results.

### Checkpoint 8. Ready for the event

- **Three tasks** in TypeScript with `mysql2`, run from Adam's laptop with the migration login, and tested in CI against the Docker TiDB:
  - `db:backup` writes every table, the stand-in's included, to a file on Adam's laptop, a few MB for the whole showcase;
  - `db:restore <file> --tables <names>` puts back chosen tables only, so restoring taps doesn't undo claims, key replacements or stations disabled since;
  - `db:clear-test-data` takes a copy itself, prints the row counts, asks Adam to type the database name, empties `taps` and `tokens`, and prints the counts again, expecting 0 taps and 0 claims. It keeps `stations`, `users` and `passport_stations`. *Changed 27 Oct:* it also empties every game's records, such as connections and, if it runs, Find Gatsby's finds, and keeps every setting, such as each station's game. It runs before the grad tea and again before the showcase (section 10.1).
- **Before the clear, every station shows 0 saved taps** on the station board (the spec's call). With no links left to restart, a test tap saved before the clear and sent after it would be judged afresh, usually as `unknown_token`, since the clear empties `tokens`.
- **The saved queries.** In Cloud Logging, for the Event Service: errors in the last 15 minutes by name, and responses of 500 or above. In Workers Observability, for the GeekyKey Service, for whoever can open it (section 12): failed hand-offs and owner lookups by Event Service, responses of 500 or above, and `stations_copy_filled`.
- **The lists for the day:** Adam, Ethan and Zi Tao in `ORGANIZERS` and `GEEKYKEY_ADMINS`, and the showcase's other organizers in `ORGANIZERS`. The passport shows each user's user ID, so a helper can send theirs to Adam.
- **The stress test** (8 Oct, BAC-21), on `event-service-staging` with a staging `geekykey-service` if there is one, after the rate limits of checkpoints 6 and 7 are in: many stations' taps, many passports' polls and the big screen's polls at once, more than the showcase expects. It says whether Cloud Run and TiDB keep up inside the 4-second deadline, and so whether the server-side tap queue in the backlog is needed (section 12). It draws on the same TiDB allowance as production, so it's kept short.
- **The warm instance,** switched on by Adam with the runbook's command on the morning of the rehearsal, of the grad tea and of setup on 16 Nov, and off after each event.
- **The event-day sheet** from section 10, printed for the desk.

Done when the restore has been tried once on production (back up, restore, compare the counts), the stress test has run, and the rehearsal in section 10 has run by Sat 7 Nov. After it, `stations_copy_filled` decides whether the Cache API goes in for the registered stations (section 3.5), and the day's Workers requests whether the free plan holds (section 11.1).

### After the showcase: the switch to the Portal's tag APIs

Waits on Qing Guan's tag APIs, and on events logging in through the Portal. Julian agreed to the claims stand-in on 8 Oct.

- `PortalClaims` (section 4), with its owners cache, and the Portal client secret on `geekykey-service`.
- **Changed on 8 Oct: nothing is copied.** The showcase's users are Firebase users (ADR 0004), so its claims don't belong to Portal users. They're deleted with the showcase's data, and the Portal's tag APIs start empty. "Copy claims to the Portal" and the stand-in's fifth route are gone.
- **The login moves to the Portal too** (Adam, 10 Oct, ADR 0004). Each service gets `GET /auth/login` and `GET /auth/callback`, as the API agreement has them, and drops the Firebase route. Firebase's sign-in providers are turned off once the showcase's users are deleted; the project stays, as the Event Service's Google Cloud project.
- The order: deploy the version with `PortalClaims`; then delete the stand-in's routes and folder, drop `tokens` in a later migration, and delete `CLAIMS_STAND_IN_KEY` on both sides.
- The API agreement doesn't change: `503 claims_unavailable` already covers the Portal.

### The tracks alongside

**Going public** (Julian). Nothing can be taken back once the repo is public.

1. **Done:** Zi Tao dealt with the Wi-Fi password in git history (HAR-8), and `meeting-notes/` is never committed (BAC-7). *Changed 23 Oct:* the meeting notes are committed in `.scratch/meeting-notes` (PR #134).
2. Julian makes the repo public, and protects `main` (a pull request with CI passing). He agreed on 8 Oct, along with making his two diagrams public.
3. From then on, only a merge that passed CI can deploy, on either platform. GitHub needs no `production` environment: the Event Service's deploy reads the migration login from Secret Manager, and only `main` can sign in as production's deploy account.

Until then, anyone with write access could push to `main` and deploy, so the team's rule is pull requests only.

**The screens** (Ethan's team). They build against the mock client from the API agreement, and wire each screen as its endpoint lands. `apps/event-web/CLAUDE.md`, under "The real backend", says how to check a screen against the service.

- **`apps/geekykey-web`:**
  - the token page at `/t/<UID>`, with its five views, landing back on it after login, and a button for each event in the owner's view;
  - My tokens, the home page, with **Release**, the form to claim by typing a UID, and a button for each event;
  - "Couldn't reach GeeksHacking. Try again." on `claims_unavailable`, and "You already have 3 tokens. Release one on My tokens first." on `token_limit_reached`;
  - "Someone else already claimed this token." on `token_taken`, and on the token page, the view from a fresh lookup underneath, whatever it answers;
  - no GeekyKey admin screens: a GeekyKey admin releases a found token on its token page.
- **In `apps/event-web`:**
  - **Done:** the passport without pairing, the Portal user ID to copy, passport stations only, the tap log and export of version 0.2, the QR fallback by user ID, and passport settings from the station board.
  - **The station board, changed by version 0.3:** it reads the Event Service's own stations, so "status unknown", "no longer linked" and `status_known` go. Organizers create a station (its key shown once), replace its key, and disable or enable it there, so the station dialogs stay in `event-web` rather than moving to `geekykey-web`. Stations that are offline, holding saved taps, not in the passport, or whose reader isn't responding still turn red and go first.
  - `429`: screens that poll keep showing their last data.

**The stations** (Zi Tao): the station contract, HTTPS, the heartbeat, the token writer, the setup mode, and moving to `key-api.` through it at checkpoint 4, in section 9.

Sources for section 6: every ticket in section 13, in particular [How is the Event Service built, deployed and staged on Cloud Run?](issues/27-event-service-on-cloud-run.md), [How do deploys and secrets work?](issues/09-deploys-and-secrets.md) and [How do local dev, tests and CI get a runtime and a database?](issues/08-dev-test-ci.md).

---

## 7. The API agreement

The agreement wins over every other document, including this one. Step 0 rewrote it as version 0.2, merged on 29 Sep. The redraw's changes are made in the agreement itself, as **version 0.3**, which went to `main` on 7 Oct and is agreed with Ethan's approval of 0.4 on 10 Oct; its changelog lists them. Every endpoint they touch is a `Checkpoint N` one, so a pull request from either side may change it (the agreement's section 1). In short:

- **New, in the section for Event Service builders and in `packages/handoff`:** the registered stations, `GET /geekykey/v1/stations`, and the heartbeat hand-off, `POST /geekykey/v1/heartbeats`, answering `204` (the spec's call).
- **Gone:** the status call, `GET /api/v1/event-service/stations`, with its limit of 120 a minute and its "status unknown" case; the status `no_event`; links; and the GeekyKey admins' station endpoints.
- **Moved to the Event Service's organizer endpoints:** creating a station, replacing its key, and disabling and enabling it, keeping their shapes without the link. The station board reads the Event Service's own stations.
- **`503 claims_unavailable`** replaces `portal_unavailable`, from checkpoint 3.
- **One 4-second deadline** for the owner lookup and the hand-off together replaces the 3-second limit (provisional).
- **The heartbeat** answers `server_time` without waiting for the Event Service, and a missing list gives `503` rather than `401`.
- **The screen table's "no answer" row** says `Tap saved` / `Will send later`, and the `no_event` row goes.
- **Addresses:** the Event Service gets `https://event-api.geekshacking.com`; stations call it until checkpoint 4. The checkpoint table follows section 6.
- **Added in version 0.4** (10 Oct, PR #48): the Firebase login, `POST /auth/firebase` on both services (section 6, checkpoint 5).

The endpoint index is the agreement's section 5.

Sources: [Write the migration spec](issues/10-migration-spec.md) for version 0.2, and for version 0.3 the tickets in section 3.

---

## 8. Edits to the README and other docs

### 8.1 The README

Each change lands with the checkpoint that makes it true. Checkpoint 1's are done (BAC-6).

**Checkpoint 2:**

- The repo layout: `infra/` and the deploy workflow; `apps/backend` loses `wrangler.jsonc` and gains a `Dockerfile`.
- The stack table: the backend is "Hono on Node, on Google Cloud Run, Drizzle ORM, TiDB".
- "Inside the backend": the entry point is `src/server.ts`; the pool; the bundle and the image.
- The task table and "Running the backend": `dev:backend` runs `node --watch` with dev-login on; `test:backend` runs Vitest on Node; CI's `docker build` replaces `check:build`.
- "Settings": settings are environment variables, and local secrets live in a gitignored `.env`.
- **A new "Deploying" section** (BAC-13), with each part's folder, platform and address; how the Event Service and its staging copy deploy; where each credential lives, from section 5.2, never its value; and the team's rules:
  1. **Every merge to `main` deploys.** The Event Service's deploy job migrates the database first, then deploys. From checkpoint 4, Workers Builds deploys the Workers.
  2. **Every migration works with the version still running:** add first, switch the code, drop later.
  3. **Staging first.** A change to how the server starts, its config, its infrastructure or its database access runs on `event-service-staging` before it merges.
  4. **The freeze.** From Wed 11 Nov, the day before the grad tea, only fixes merge to the backend, and the planned switch from the grad tea to the showcase (section 6, "The grad tea"). The last merge of all is on Sun 15 Nov: from then until the showcase ends on Tue 17 Nov, nothing merges to `main` except a fix Adam approves, announced in the team chat, so nothing deploys on setup day or the night before. Since every merge migrates, the freeze stops migrations too. *Changed 27 Oct:* the last merge was Mon 16 Nov, when the showcase was thought to be on 18 Nov.
  5. **Rolling back.** The Event Service: Adam sends all traffic back to the previous revision, with `gcloud run services update-traffic` or the console, and Julian as the backstop. A Worker: revert the commit on `main` and Workers Builds deploys the revert in a few minutes, or Julian rolls back one version. Either way, revert the bad commit straight after, or the next deploy brings it back. One version back is safe, because every migration works with the version before it, unless the bad deploy changed a secret's version: never roll back past a change of secret, since the older version uses the older value, which may no longer work or may be the one that leaked. A bad deploy that changed a secret is fixed forward instead, with a new pull request pinning a version that works (12 Oct). The database is never rolled back. Tried on staging on 12 Oct (BAC-13); the rehearsal tries it on production.
  6. **The hand-off.** A change to `packages/handoff` must work with the other service's previous version.
  7. **Copies.** Adam takes one with `db:backup` before merging a migration, just before the test data is cleared, and at the end of the event day. They stay on his laptop, never in GitHub or a chat.
  8. **On the event day,** only Adam changes data, with a fresh copy first and Ethan reading the query. A counting or display bug is fixed by rolling back, not by changing data.

  Where a rule needs something that doesn't exist yet, such as `db:backup` or `packages/handoff`, the README says it's coming.

**Checkpoint 4:** the layout, the stack table and the diagram for `apps/geekykey-service`, `apps/event-service`, `apps/geekykey-web`, `apps/event-web` and `packages/handoff`; the four local ports; and one `pnpm dev`.

**When Zi Tao's HTTPS firmware lands:** "Station firmware" says the server setting is a full base URL: `http://A-Mac.local:8000` locally, `https://event-api.geekshacking.com` until checkpoint 4, and `https://key-api.geekshacking.com` after it.

### 8.2 Other docs

- **`apps/event-web/CLAUDE.md`,** for Ethan to update: the backend is Node on Cloud Run, not a Worker; the station screens (creating a station, its key, disabling it) stay on the organizers' station board; there is no status call. *27 Oct:* its key dates now give the grad tea and the showcase on 17 Nov (BAC-88), and FRO-85 adds how the event's look is picked.
- **`apps/geekykey-web/CLAUDE.md`:** no GeekyKey admin screens; a GeekyKey admin releases a found token on its token page.
- **The Single Source of Truth** still says Docker on Cloud Run with SQLite; it's the team's to correct. Its date for the showcase, 17 Nov, was right (27 Oct).

---

## 9. What each person needs from us

### Julian

- **Agreed on 8 Oct, to do:** ~~give Adam a role that can grant, so Adam runs steps 6 to 8 of `infra/README.md` himself (the keyless sign-in, each account's access, and Logs Viewer; [what to ask him, and Adam's own steps](assets/cloud-run-setup-who-does-what.md))~~ (9 Oct); ~~the domain mapping for `event-api.` (step 9, which needs `geekshacking.com` verified with Google), in the web console (the project itself is `geekykey-b035a`, 9 Oct); add the DNS record for `event-api.` once we're ready (9 Oct)~~ (11 Oct); ~~disconnect Workers Builds from `apps/backend`~~ (no build since 8 Oct); make the repo public and protect `main`; ~~link GeeksHacking's billing account to our Firebase project~~ (done by 9 Oct); keep `key.geekshacking.com/t/` working for as long as tokens are in use.
- **Still to ask:** the budget alert; how the team sees the GeekyKey Service on the day (section 12); the showcase's hours.
- **At checkpoint 4:** set `geekykey-service`'s `SESSION_SECRET`, as a random value nobody keeps, and copy the two keys into it from Secret Manager himself (15 Oct); then connect it to Workers Builds from `apps/geekykey-service` (BAC-44); a screen share for the log check; note the three rate-limit namespace IDs we use (section 5.1). ~~And the Event Service's new repo, if it moves then.~~ (After the showcase, BAC-39.)
- **At checkpoint 5:** attach `key.geekshacking.com` to `geekykey-web` and `event.geekshacking.com` to `event-web`, and connect both.
- **On the day, and before it:** at the showcase himself (8 Oct), and reachable by phone, with his number on the event-day sheet if he agrees; upgrade to Workers Paid on the spot if we pass 70% of the free day; roll a Worker back when we ask, and roll the Event Service back if Adam can't; check TiDB's Request Units the evening before; restore TiDB's backup if the cluster is lost. How the team sees the GeekyKey Service's logs and the account's usage is still open (section 12).
- **Keep off:** Bot Fight Mode on geekshacking.com, which could challenge every station.

### Qing Guan

- **Now, before Mr Pang is asked** (Adam, 10 Oct): [an OIDC client for our Firebase project](assets/message-to-qing-guan-firebase-client.md), with Firebase's redirect URL; its client ID and secret; and whether the ID token carries the user's name. The Portal's issuer is `https://hackomania-api.geekshacking.com/`, which offers the code flow and `openid profile email`.
- **Parked until events log in through the Portal** (ADR 0004): [logging in through the Portal](assets/message-to-qing-guan-login.md), with its two OAuth apps.
- **The tag APIs,** after the showcase: his team agrees with our approach (8 Oct). Part 2 of [the tag APIs message](assets/message-to-qing-guan-tag-apis.md) goes when they start.
- **On the day:** reachable by phone, for the Portal and the zone. His custom rule for `key-api.` is already on (BAC-8).

### Ethan

- ~~**Review version 0.3 of the API agreement**~~ (section 7). *Done:* his approval of 0.4 on 10 Oct covers it (Adam, 12 Oct).
- **The screens track** in section 6, with his team, the Linear tickets the rewrite changes (listed in "Fold the answers into the spec"), and the edits to `apps/event-web/CLAUDE.md` (section 8.2).
- **Own the two forwarding Workers** once Adam has written them. Adam reviews any change to their list of paths.
- **Access:** none on Cloudflare (Julian, 1 Oct 2026); his screens deploy when his pull requests merge, and roll back by reverting. Logs Viewer on Google Cloud, for the Event Service's logs, and no deploy role there.
- **Install Docker** to run the backend locally.
- **The Firebase login on both sets of screens,** now that the check has passed (checkpoint 5, FRO-33).
- **The map** (checkpoint 7): approve the agreement change that adds the map's endpoint and the passport's `booth`, then build the map with a floor plan whose booth names match.
- **The grad tea** (section 6): approve the agreement changes in BAC-89, BAC-90 and connections (BAC-86), and in BAC-91, BAC-96 and BAC-99 if they go ahead, in time for them to merge by Tue 10 Nov; the screens in FRO-83 to FRO-85, FRO-88 after a go and FRO-89 if BAC-99 merges, with the map on the MPH's projector a Must; and the event's look, switched to sci-fi in the pull request that merges by Sun 15 Nov.
- **On the day:** watch the screens and roll them back by reverting; a second pair of eyes on the Event Service's logs; read any query Adam runs to change data; at the desk whenever Adam isn't; an organizer who disables and enables stations, and a GeekyKey admin who releases found tokens.

### Zi Tao

- **[The station contract](assets/message-to-zi-tao-station-contract.md),** with its notes of 5 and 6 Oct: the address and HTTPS with the 14 roots, the heartbeat with `reader_ok` and the clock, the statuses and the screen table, the resend pace, and the three rules for the station key. Since 5 Oct, `no_event` is retired and organizers issue station keys. Since 8 Oct, a reader moves to another event by sending its saved taps, then taking the new event's key through the setup mode. Since 6 Oct, the "no answer" row says `Tap saved` / `Will send later`.
- **The firmware already follows the contract's queue rules,** checked on 6 Oct: any status removes a tap, a `400` drops the batch, and saved taps go together at most once a minute. It still has to be tried on a real station (HAR-9).
- **HTTPS (HAR-10):** passed on a real station on 12 Oct, in Adam's PR #53, since Adam took the ticket over: `SERVER_URL` is a full base URL, `https://event-api.geekshacking.com` until checkpoint 4, then `https://key-api.geekshacking.com`, checked against the 14 roots in `ca_roots.h`. `event-api.` answers with Cloudflare's certificate, as `key-api.` does, so the same 14 roots cover both.
- **The heartbeat (HAR-11),** once checkpoint 3 adds it.
- **The setup mode,** before checkpoint 4 (8 Oct): a station takes a new server address, station key and Wi-Fi network from a serial terminal, without a reflash. Since 19 Oct it takes a key in two ways: `key`, a replaced key for the same station, keeps the saved taps, and `move`, a key from another event, sends them and then clears any left. Adam took HAR-14 over on 19 Oct. Since 20 Oct the setup page (HAR-16), one HTML file in `firmware/setup_page/`, does the same from Chrome or Edge, for anyone who would rather not use a terminal. Its proof passed on 20 Oct: through the page, the main station moved to staging with `move`, and a tap was stored `accepted` there, then moved back to production, where a tap was stored `accepted` too. The Wi-Fi network stayed `Pixel_4936`, so only the tests show the page changing it.
- **At checkpoint 4:** set each station's server to `key-api.` through the setup mode, keeping its key (HAR-13). Done on 20 Oct by Adam for the main station, the only board on production, which took the BAC-11 test station's key rather than keeping a development one (checkpoint 4 in section 6). A board set up for production from now on gets `https://key-api.geekshacking.com`, which `secrets.example.h` now gives as production's address.
- **[The token writer](assets/message-to-zi-tao-token-writer.md)** (HAR-12): every token written before the rehearsal, and Adam keeps a copy of the password.
- **Access:** none on Cloudflare (Julian, 1 Oct 2026), and none on Google Cloud (Adam, 9 Oct).
- **The grad tea** (section 6): the hardware order (HAR-22), counting the tokens that go home after the grad tea; the radio and power bank tests (HAR-21); Find Gatsby's firmware (HAR-23), after a go on Thu 5 Nov; the e-paper map card (HAR-24), as a report iteration; the hexagon collectible (HAR-25), with Joshua, chosen by Thu 5 Nov; and each partner station's NFC sticker and QR code (HAR-26).
- **On the day:** watch the stations and walk to any that turns red; an organizer who disables and enables stations; enter a replaced key through the setup mode, with Adam's agreement.

### Joshua

- The game ideas from 8 Oct, and whether the showcase has a theme, which Adam asks the teachers. *Since 29 Oct:* a new idea goes through "The checks for a new idea" (section 2) before it gets a ticket.
- The export keeps ten columns, as he confirmed in [Does the A/B analysis need token IDs or unclaimed-token taps?](issues/16-ab-analysis-export.md). The end-of-day copy feeds his analysis.
- He runs the A/B study on the day, and isn't a watcher.
- ~~The Sprint 2 A/B test's setup, with Adam (section 12).~~ *Changed 27 Oct:* the A/B test runs at the grad tea (section 6). He confirms who each game counts as engaged, writes the questions and clues with the group by Mon 9 Nov (BAC-94), and chooses the winning game with Adam from the grad tea's copy by Fri 13 Nov. *Changed 27 Oct, later:* he writes the clue cards with the group (BAC-94), runs the observers' counts at the grad tea, and shares its results at the meeting on Fri 13 Nov. No winning game is chosen.

---

## 10. Event day

The showcase is on Tue 17 Nov 2026 at Ngee Ann Polytechnic, with setup there on Mon 16 Nov. *Changed 27 Oct:* it said Wed 18 Nov, with setup on Tue 17 Nov. The grad tea on Thu 12 Nov runs the same way, with the steps below.

### 10.1 The run-up

- **By Sat 7 Nov, the rehearsal on production,** with the warm instance on. It runs the evening-before steps (the freeze, the saved-taps check, a copy, the clear), the morning check, the team using passports and tapping stations for an hour, the one restore try, one rollback of the Event Service by revision and one of a screens Worker by reverting, and pulling one station's power to watch it turn red on the board. The watchers use the saved queries and the sheet as they would on the day. Then the data is cleared again, and the warm instance switched off. Its numbers decide the Cache API for the registered stations and whether the Workers free plan holds (section 11.1). It comes out of November's TiDB allowance, which the showcase also draws on.
- **The freeze:** only fixes merge to the backend from Wed 11 Nov, and nothing merges after Sun 15 Nov (section 8.1).
- **The grad tea** (section 6, "The grad tea"):
  - **the evening of Wed 11 Nov:** every station shows 0 saved taps on the board, and Adam runs `db:clear-test-data`, which takes its own copy first;
  - **Thu 12 Nov:** Adam switches the warm instance on in the morning. The group sets up in the MPH before 3:30 pm and does the morning check below. The check looks at each station's game as well as its passport settings (BAC-90). The grad tea runs from 3:30 to 6:30 pm. Tokens go out after the first half hour, and observers count the people in each area every 15 minutes. Afterwards, Adam takes a copy, the source for Joshua's analysis, and switches the warm instance off;
  - **Fri 13 Nov:** the group shares the results at its meeting;
  - **by Sun 15 Nov:** the switch's pull request merges, and organizers set each station's game for the showcase. Adam schedules Firebase's limit on new accounts for the showcase on 13 Nov or later (runbook step 14, BAC-97).
- **The morning of Mon 16 Nov:** Adam switches the warm instance on, before setup.
- **The evening before, Mon 16 Nov,** after the day's setup at the venue: every station shows 0 saved taps on the board; Adam runs `db:clear-test-data`, which takes its own copy first; and from then on nobody makes a test claim or taps a claimed token. If we're still on TiDB's free allowance, Julian checks its Request Units, which only he can see: if less than twice what the rehearsal used is left, he raises TiDB's spending limit above $0.
- **The morning,** before check-in: tap each station with an unclaimed token and expect `Not claimed yet`, which proves the station's Wi-Fi, key, certificate and registration and stores nothing. The station board shows any station missing passport settings. The organizers' stats still show 0 taps.
- **Check-in:** tokens are handed out and claimed (provisional). *27 Oct, later:* student helpers hand them out at the entrance, and count the visitors who decline one. Team members who play claim again like everyone else.
- **The end of the day:** Adam takes a copy, the source for Joshua's analysis. The freeze ends when the showcase does, and Adam switches the warm instance off.

### 10.2 Who watches

- **Adam:** the services, through the Event Service's logs in Cloud Logging and the station board. He decides on fixes, rolls the Event Service back, and he's the only one who changes data. The GeekyKey Service's logs are Julian's to open (section 12).
- **Zi Tao:** the stations, walking to any that turns red.
- **Ethan:** the screens, which he can roll back, and a second pair of eyes on the Event Service's logs.
- **Joshua:** runs the study: the observers' counts at the grad tea, and the comparison at the showcase's voting point. Not a watcher.
- **The desk:** one laptop keeps the station board open all day. Adam or Ethan is at the desk at every moment, and whoever leaves hands over first. Once an hour, the desk looks down the last-tap column. The rota's times stay blank until the programme is out.
- **Organizers and GeekyKey admins on the day:** Adam, Ethan and Zi Tao. As organizers they disable and enable stations; a replaced key goes in through the station's setup mode, so it stays with Zi Tao, with Adam's agreement. As GeekyKey admins they release found tokens.
- **If we're still on the Workers free plan:** someone checks the account's Workers requests every hour from 08:00, when they reset, and if they pass 70% before the event ends, Julian upgrades on the spot. Only Julian can see them today (section 12).

### 10.3 Rules for touching data

- The freeze covers migrations: no migration runs on the day, and a fix that needs one waits until the event is over.
- A counting or display bug is fixed by rolling back, not by changing data. Stamps and points are worked out from taps every time they're read.
- Only Adam decides to change data, with a repair query or `db:restore` for chosen tables. He takes a fresh copy first, and Ethan reads the query before it runs. If Adam can't be reached, nobody changes data, and Ethan can still roll back the screens.
- If TiDB or Cloud Run is down, nothing is restored. Stations keep their taps and resend them, their heartbeats still set their clocks, and we wait.
- If the whole cluster is lost: Julian restores TiDB's latest daily backup into a new cluster; Adam creates the two logins there, adds their new URLs to Secret Manager and deploys a revision pinned to them; then he restores our own copy on top, if it's newer. Probably under an hour.
- Taps lost to a restore come back from the `tap_stored` log lines, kept 30 days in Cloud Logging. The tool that replays them is written only if it's ever needed.

### 10.4 The event-day sheet

One page, printed and kept at the desk, with Julian's and Qing Guan's numbers if they agree.

| What you see | Most likely | Who acts | What they do |
|---|---|---|---|
| A station red on the board: offline | Power or Wi-Fi | Zi Tao | Walks over. The station keeps its taps and resends them |
| A station red: online, but holding saved taps | Hand-offs or owner lookups failing | Adam | Checks the Event Service's logs, and asks Julian about the GeekyKey Service's. If a fix just went out, sends traffic back to the previous revision |
| Many stations show `Will send later` | The Event Service is down, slow or cold, or TiDB is | Adam | Checks Cloud Run and the warm instance. Stations keep their taps |
| A station red: reader not responding | A dead or loose reader | Zi Tao | Swaps the station, or sends people to the next one. The QR fallback is at the desk |
| A station shows `Setup error` | A wrong key, or the station is disabled | An organizer | Checks the station on the station board |
| Many `Not claimed yet` at stations | Participants haven't claimed their tokens | Whoever is at the desk | Helps them claim on their phones, or by typing the UID in My tokens |
| A busy station's last tap is long ago | A fault the reader check can't catch, or older firmware | Zi Tao | As for a dead reader |
| The passport or organizer screens are broken | A bad screens deploy, or the Event Service | Ethan, then Adam | Reverts the last screens merge, or asks Julian to roll back `event-web` or `geekykey-web`. If the Event Service is at fault, Adam rolls it back |
| Logins fail, and people already logged in are fine | Firebase, or GeeksHacking's login inside it | Adam checks Firebase's status, and calls Qing Guan for GeeksHacking's login | Taps still count. New people try Google sign-in, or again later |
| Error 1027 everywhere | The free day's Workers requests are used up | Adam calls Julian | Julian upgrades to Paid |
| Database errors from the Event Service | TiDB is down, or its monthly allowance is used up | Adam finds Julian, who is there | Julian checks the TiDB console |
| Nothing is reachable | Cloudflare | Nobody | Watch cloudflarestatus.com. Stations keep their taps |
| A station has gone missing | Theft | An organizer | Disables it on the station board. Its key is replaced before it's used again |
| The morning of 16 Nov, and after 17 Nov | The warm instance | Adam | Switches it on, then off, with the runbook's command |

Accepted: between the first deploy and the rehearsal, a fault is noticed only if someone happens to be using the system; if Adam and Ethan both leave the desk without handing over, a fault waits until someone looks; a dead reader on a station with older firmware shows only as a stale last tap; and on the free plan, a sudden rush can use up the day between two hourly checks.

Sources for section 10: [How do we notice trouble on event day, and who watches?](issues/20-event-day-monitoring.md), [How do we back up the database, recover it on event day, and clear the test data before the doors open?](issues/19-backups-and-test-data.md), [How do deploys and secrets work?](issues/09-deploys-and-secrets.md), [How is the Event Service built, deployed and staged on Cloud Run?](issues/27-event-service-on-cloud-run.md)

---

## 11. Provisional

### 11.1 Staying on the free plans

**Cloudflare.** GeeksHacking's account stays on the free plan, and Adam accepts it for the showcase (7 Oct), because fewer people are expected than the worst case. Since 23 Oct, GeeksHacking is open to paying for Workers Paid if the day won't fit (Adam), so the request count no longer limits the design. The rehearsal still measures it.

- **What counts** against the 100,000 Workers requests a day, shared by every Worker on the account and reset at 08:00 Singapore time: taps and heartbeats at `key-api.`, the GeekyKey screens' calls, and every passport and organizer poll that `event-web` forwards to Cloud Run. Only plain files are free. A showcase day should use about 60,000 to 90,000, mostly the organizers' screens, which poll all day ([the estimate](assets/message-to-julian-workers-requests.md), part 3). Going over stops every Worker on the account until 08:00 the next day: stations keep their taps, but nobody gets a stamp.
- **The big screen** (checkpoint 7, 23 Oct) adds its own polls: one endpoint every 2 seconds, about 10,800 in 6 hours. With the day's upper estimate of 90,000, that's just over the 100,000, which is why Workers Paid is the fallback. Participants' phones can't read the map, so it adds nothing else. A 3D model of the floor plan is a plain file, which Cloudflare serves free and doesn't count. The stress test and the rehearsal include the big screen.
- **What we measure:** the passport poll at checkpoint 5 (done 22 Oct, below), and a whole day at the rehearsal. Also our log events against Workers Logs' 200,000 a day, now that `tap_stored` is written on Cloud Run. The GeekyKey Service's CPU time was measured at checkpoint 4 (below).
- **The GeekyKey Service's CPU time** (BAC-45, 19 Oct). The free plan allows a request 10 ms of CPU. Cloudflare lets a Worker go over now and then, but stops requests with error 1102 once it goes over most of the time. On production, the 500-tap batch used 18 ms, the single taps 5 to 22 ms and the heartbeat 7 ms, and every request finished. More requests to a throwaway copy of the Worker on Adam's own account found two causes:
  - Zod's checks of a batch's 500 taps, and of the Event Service's 500 results, were most of a batch's own work. A plain check is to run first, with Zod checking only what it isn't sure of (PR #82, in review). The median batch fell from 12 to 15 ms to 6 or 7 ms.
  - The first request on a fresh isolate, while V8 compiles our code for the first time, uses 10 to 31 ms however small it is. Single taps sent a few seconds apart, each on a new connection, landed on fresh isolates about a third of the time. Steady traffic reuses isolates, so the showcase should see fewer. The rehearsal checks that no request is stopped, and Workers Paid raises the limit to 30 seconds if many are.
- **The passport poll** (BAC-57, 22 Oct, on production). A passport asks `GET /api/v1/me` every 10 seconds while its tab is visible, and each ask is one Workers request. `event-web` runs its Worker only for `/api/*` and `/auth/*` and forwards each request with one `fetch`, and Cloudflare's proxy in front of `event-api.` isn't a Worker. The count comes from the code, since Adam didn't read Cloudflare's own count. Cloud Run's log agrees: while a screen stayed open, its `/me` calls came 10 seconds apart. So an open passport costs at least 360 Workers requests an hour. Each return to the tab adds one more, since the screens refetch on focus.
  - On Cloud Run, 30 logged-in polls took 20 to 72 ms, 33 ms in the middle. The first poll after a login, or after a few minutes with no poll, took about 180 ms.
  - The Event screens also poll `/me` every 10 seconds while nobody is logged in, for example on the login page. Each of those polls answers `401` in 2 to 3 ms on Cloud Run, but it is still a Workers request. The first of the hour took 980 ms, while Cloud Run started an instance.
- **Outside requests:** a station request makes up to three calls to Cloud Run (the registered stations on a fill, the owners and the hand-off), far under the free plan's 50. Before the switch the GeekyKey Service uses no cache store, so no other free limit applies.
- **Ways to fit, if the rehearsal says so:** poll the organizers' screens less often, or poll only while a screen is on show, which TanStack Query already does for hidden tabs. A push design was ruled out by the mentors on 24 Sep unless a game needs it.
- **Or pay.** Workers Paid starts at $5 a month, and GeeksHacking is open to it (23 Oct). A flood from many addresses could still use up the free day, which the rate limits can't stop. With the free plan accepted, the 29 Sep decision on Paid by 11 Nov is moot unless the rehearsal passes about 70,000 requests.

**Cloud Run.** The free tier is 2 million requests and 180,000 vCPU-seconds a month, shared across GeeksHacking's billing account, and a showcase day fits. One warm instance on event days costs cents. A budget alert goes to Julian and Adam (still to confirm, 8 Oct).

- **The first numbers** (staging, 11 Oct, BAC-12). A tap is one request, and a warm one takes 68 to 92 ms on Cloud Run (BAC-19). 60 warm taps sent 2 seconds apart billed 5.2 vCPU-seconds, about 0.09 each. They carried made-up keys, so they stopped at the station lookup and answered in a median of 17 ms. A real tap should bill about the same, a little under 0.1 vCPU-second, though that wasn't measured. Requests that overlap share their billed time, so a busy instance costs less per request. A cold start bills its start-up too, about 1 to 2 seconds. [The measurements](assets/cold-start.md).
- **What a showcase day's requests use:** the 60,000 to 90,000 Worker requests above, nearly all of which reach Cloud Run, at about 0.1 vCPU-second each when warm, come to at most 9,000 vCPU-seconds: about 5% of the month's free CPU and 4.5% of its free requests, each day.
- **Not yet known: the warm instance.** Kept from the morning of 16 Nov to the end of 17 Nov, about 40 hours, plus the rehearsal and about 10 hours for the grad tea, it is up to about 190,000 instance-seconds. If Cloud Run bills its idle time as vCPU-seconds against the free tier, that alone is more than the month's 180,000, and the rest is paid. Google's billing page doesn't say how idle time is billed under request-based billing, so it's measured before the rehearsal: `--min=1` on staging for an hour, then `billable_instance_time` read for that hour.

**Firebase.** Google sign-in is free for up to 50,000 users a month. GeeksHacking's login, as an OIDC provider, is free for 49 users a month, then US$0.015 each, on GeeksHacking's billing account.

**TiDB.** Starter's free 50 million Request Units a month, after which TiDB refuses new connections. The passport's and organizers' polls reach it from Cloud Run, and staging draws on the same allowance. Only Julian can see the console. A spending limit above $0 would also keep backups for up to 30 days, at a time we choose, instead of one day at a random time.

- **The first numbers** (the whole cluster, both databases, about 10 to 12 Oct, from Julian's screenshots of the console's metrics, BAC-12). Two days of staging's and production's first taps, the cold-start rounds and the station's HTTPS taps used Request Units in short bursts of up to about 9 a second, and none in between: at most a few tens of thousands of the month's 50 million. No query failed, no transaction waited on a lock, a transaction took under 4 ms on average and about 40 ms at worst, and no more than one connection was open at once.
- **What a showcase day uses** isn't known from this. The bursts of about 9 a second came with under 0.15 queries a second, so a request, with the sign-in when it opens a connection, may cost tens of Request Units. At 60 each, a day's 60,000 to 90,000 requests would use about 5 million, a tenth of the month. The rehearsal measures it, and Julian's check the evening before (section 10.1) stays.

### 11.2 After the event

What happens to the showcase's data once it ends. Julian suggested keeping a per-event copy of user details and deleting it afterwards. The showcase's users are Firebase users (ADR 0004), so nothing about them reaches GeeksHacking's database, and its claims are deleted with its data rather than copied to the Portal. Stations are the Event Service's own, so there's nothing to unlink. The end-of-day copy on Adam's laptop feeds Joshua's analysis, and our copies are deleted along with the event's data. The Single Source of Truth plans the documentation and code handover to GeeksHacking for 19 and 20 Nov, which bears on who runs the deletion.

### 11.3 Other provisional decisions

Settled on 8 Oct, and so no longer here: the claims stand-in (agreed), our own Google Cloud project (agreed), Pulumi in TypeScript (no infrastructure as code for now), and moving a reader by a reflash (a setup mode instead). Settled on 10 Oct: how each service checks a Firebase login, since a Worker does it in about 1 ms of CPU (BAC-20). Settled on 11 Oct: the 4-second shared deadline, by the cold start below. Settled on 12 Oct: `event-api.` as a Cloud Run domain mapping, which works, behind Cloudflare's proxy (BAC-11). Dropped on 27 Oct, later, with the quiz: who the quiz counts as engaged.

| Decision | Firm when | Fallback |
|---|---|---|
| GeeksHacking's login offered at the showcase, inside Firebase | Mr Pang agrees. Built before he's asked (Adam, 10 Oct), once Qing Guan issues the OIDC client | The provider turned off: Google sign-in only |
| No server-side tap queue | The stress test (checkpoint 8) | A queue, from the backlog (section 12) |
| The showcase on the Workers free plan | The rehearsal's day of requests | Slower organizer polling, or Workers Paid |
| The Cache API for the registered stations: not used | The rehearsal's `stations_copy_filled` | Added behind memory |
| Owners cached in the Cache API after the switch, for 5 minutes to an hour | Built at the switch | No cache, if the Portal keeps up; Redis or KV, if a per-data-centre cache is too loose |
| Tokens claimed at check-in | Adam decides ("still up to discussion") | Release only the team's own claims instead of emptying `tokens` |
| Find Gatsby's hot, warm or cold from the hidden station's radio signal | HAR-21's test through a crowd, in a large room | The check-in by crew key, which is always there, so switching needs no deploy |
| The clear as a laptop task | Adam decides | A manual workflow, once copies have a private home such as a Cloud Storage bucket |

**The cold start, measured** on `event-service-staging` on 10 and 11 Oct (BAC-12), in 13 rounds that each woke a new instance. "Cloud Run" is the latency in its request log; "curl" is the whole request from a laptop in Singapore, with a new TLS handshake. The tap carried a made-up key, so it opened the first TiDB connection but skipped the tap's own transaction (about 0.1 s warm). [Every round](assets/cold-start.md).

| Startup CPU boost | Cold tap, Cloud Run | Cold tap, curl | Cold health check, Cloud Run |
|---|---|---|---|
| On (4 taps, 4 health checks) | 1.31 to 2.00 s, mean 1.59 | 1.82 to 2.60 s, mean 2.20 | 0.33 to 0.99 s |
| Off (3 taps, 2 health checks) | 1.31 to 2.05 s, mean 1.68 | 1.84 to 2.52 s, mean 2.28 | 0.68 to 0.69 s |

Boost stays on, as the runbook already has it: cold taps were a little faster with it, though by less than the spread between rounds. Day was no slower than night. The slowest cold tap took 2.05 s on Cloud Run and 2.60 s at curl, which leaves at least 1.3 seconds of the deadline even with the tap's own transaction. While the claims stand-in and the passport share one Cloud Run service, only the owner lookup can wake it, so the hand-off after it is warm. Another team's Event Service brings its own cold start, and should keep warm on event days, as the agreement asks. The 4 seconds stay.

**Where a tap's time goes before Cloud Run, measured** on production on 21 Oct (BAC-38), through `key-api.` as stations send taps since checkpoint 4. From Adam's Mac, 25 rounds on the school's Wi-Fi and 25 on a phone hotspot, each request on a new connection; from the main station, 18 taps on the hotspot over its kept-open connection. "Before Cloud Run" is the whole request less the latency in Cloud Run's request log. [Every round, and how it was measured](assets/edge-timing.md).

| From | Tap, whole request | Cloud Run | Before Cloud Run |
|---|---|---|---|
| The Mac, school Wi-Fi | 0.20 to 1.06 s, median 0.64 | 0.09 to 0.12 s | 0.11 to 0.96 s |
| The Mac, hotspot | 0.30 to 3.73 s, median 1.40 | 0.08 to 0.13 s | 0.17 to 3.63 s |
| The station, hotspot | 0.43 to 0.98 s, median 0.58 | 0.08 to 0.09 s | 0.35 to 0.89 s |

The extra time goes on Cloudflare's choice of data centre. A Worker runs in the data centre that answers the request, and makes its two calls to Cloud Run from there. Six data centres answered the Mac's requests, changing from one request to the next. Through Singapore a tap took 0.20 to 0.68 s, through Hong Kong or Japan 0.64 to 1.06 s, and through Paris or Marseille 1.26 to 3.73 s. Paris and Marseille answered 44 of the hotspot's 75 requests. Cloud Run's time was the same wherever the tap came from. Through Europe, a new connection to Cloudflare cost 0.33 to 1.02 s, and on 12 of 15 taps one of the Worker's two calls reached Cloud Run about 1 to 1.5 s later than usual. No answered tap took more than 5 seconds. But a cold start (1.3 to 2.0 s) on top of a tap through Europe would run out the station's 5 seconds, and could run out the Worker's 4. One station tap got no answer in 5 seconds, while the station couldn't connect at all for about a minute. The station kept it and sent it again once it could connect, as designed. DNS only for `event-api.` (BAC-27) wouldn't help, since the Worker's calls would still start in Europe. A Workers placement hint near Cloud Run's region could, and BAC-63 tried it (below).

**A tap through Europe, with and without the placement hint,** measured on 23 Oct (BAC-63), from Adam's home server. Adam's hotspot wasn't needed. A Worker on Adam's own account runs near Paris and relays each request, so Cloudflare answers it in Paris whatever network it was sent from, and Cloudflare answered every one of them there. The relay's fetches can share a connection, as a station's requests do, so these times leave out the new connection that curl paid for on 21 Oct, and don't compare directly with that day's 2.65 to 3.73 s through Paris. [Every round, and how it was measured](assets/edge-timing.md#through-europe-with-and-without-the-placement-hint-23-oct).

| Through Paris | Without the hint | With `gcp:asia-southeast1` |
|---|---|---|
| A probe Worker making two calls to staging's Cloud Run, 20 rounds each: the whole request | 0.60 to 0.98 s, median 0.68 | 0.23 to 0.49 s, median 0.27 |
| The same probe's two calls added together | median 0.65 s | median 0.07 s |
| A tap on production, 26 | 25 answered in 0.73 to 2.39 s, median 2.19, of which Cloud Run took 0.09 to 0.24 s. The other ran out the Worker's 4 seconds and got `503` | Not timed yet |

The same 25 rounds sent straight from the server, which Cloudflare answers in Singapore, took 0.20 to 0.55 s for a tap, median 0.32, with 0.09 to 0.12 s on Cloud Run. Cloud Run's log confirms BAC-38's finding: through Paris, on 23 of the 25 taps, one of the Worker's calls reached Cloud Run 1.09 to 1.55 s after the call before it had finished, against 0.30 to 0.43 s for the other calls and 0.01 to 0.04 s through Singapore. The two taps without a late call took under 0.8 s. The `503` came from an empty stations copy whose fill took 1.99 s on a warm instance, followed by a late hand-off, which arrived after the Worker had answered, and was stored anyway. With the hint, the probe's `cf-placement` header said `remote-SIN` on every request, so it ran in Singapore although Paris answered. A copy of the GeekyKey Service's Worker with the hint, on Adam's account and pointed at staging, also ran in Singapore (`remote-SIN`). It had made-up keys, so staging refused its first call to Cloud Run, and it never reached a tap's owner lookup. Production is the first place a real tap runs with the hint. After the merge, Adam times taps through Paris again, the same way, beside Cloud Run's latency. With the hint, the request crosses from Paris to Singapore once, inside Cloudflare, before the Worker starts. That took about 0.2 s for the probe. It counts against the station's 5 seconds but not the Worker's 4, so the station's margin over the Worker's deadline is about 0.2 s smaller for a tap through Europe. Without the hint, a tap through Paris spent about 2 s after the Worker started.

---

## 12. Still to confirm

**Facts to check:**

- ~~**Who adds the DNS record for `event-api.geekshacking.com`,** with Cloudflare's proxy off, and how we ask when ready.~~ *Answered 9 Oct:* Julian adds it, once we tell him it's ready. He added it on 11 Oct.
- ~~**`event-api.`'s record with Cloudflare's proxy off** (BAC-27).~~ *Answered 12 Oct:* it had the proxy on, and Adam kept it, since a request sent the way a station sends one passes through (section 3.2).
- **The budget alert** on the project, to Julian and Adam (asked 8 Oct, not answered).
- **What Secret Manager costs us** (Julian asked, 13 Oct). Google bills about US$0.06 a month for each stored version of a secret, a disabled one included, and US$0.03 for each 10,000 reads, after 6 versions and 10,000 reads free each month, shared across the billing account. We have 10 versions, so it's $0.24 a month if the free 6 are ours, and $0.60 if other projects on GeeksHacking's billing account use them. Reads stay free: each instance start reads 4. Julian can see in Billing → Reports, filtered to Secret Manager, whether other projects use the free 6. *Settled 13 Oct:* each service's four runtime values go into one secret, `APP_SECRETS` (section 5.1), at Julian's suggestion, so we store 4 versions and each instance start reads 1. That's free unless other projects on the billing account use 3 or more of the 6.
- ~~**Which roles Adam gets to make the resources by hand,** or whether Julian makes them from the runbook.~~ *Answered 9 Oct:* Adam is Editor on `geekykey-b035a`, which creates resources but grants nothing. He made the resources (steps 1 to 5). Julian, as Owner, gives him a role that can grant, so he runs the grants too (steps 6 to 8); Julian runs the domain mapping and the budget (steps 9 and 10). *Found 13 Oct:* that role was taken away after 9 Oct, so any grant since is Julian's, such as each service's access to its `APP_SECRETS` (BAC-30). Editor can't read a secret's value either.
- **That "v1" means what we read it as** (section 2, answer 3): the v1 interface and the first-generation execution environment.
- **Whether the Portal's web app is on GeeksHacking's Cloudflare account, and runs a Worker on each page load,** which would count against the same free day (asked 8 Oct, not answered).
- **The showcase's hours,** and whether Adam or Ethan presents at set times.
- **What the QR fallback scans.** It takes a user ID only, and the showcase's users aren't Portal users, so the Portal's participant QR code no longer fits. Likely a QR code of the user ID on the passport, which Ethan's team would add.
- **This year's floor plan of the showcase hall,** with where the booths stand, from the teachers. The map on the big screen is drawn from it (checkpoint 7), and the layout we know, three walled areas of about 3, 6 and 5 booths, is from an earlier year.
- **The showcase's theme,** from the teachers, for the screens' theme (checkpoint 7). *26 Oct:* the teachers have no theme for the showcase, so the group chose sci-fi, which the teachers haven't seen yet.
- **The MPH for the grad tea** (BAC-95): its floor plan, the projector, three places with power sockets, using our own network, and time to set up before 3:30 pm, all asked of Mr Yaseer. The trail's clues, the map and the plan for the stations wait on the floor plan.
- **The comparison at the showcase's voting point:** whether the teachers allow us to ask visitors, as they vote, whether they carried a token, and last year's voting pattern, from Mr Johari.
- **Each partner group's link** for its station's sticker and QR code (HAR-26), by Mon 9 Nov.

- ~~**Julian's and Qing Guan's agreement to guests** (ADR 0005), asked at the meeting on Fri 23 Oct, since guests add a way to sign in to what they decided on 8 Oct.~~ *Answered 23 Oct:* yes, guests are OK.

**Open, for Adam:**

- ~~**How the big screen reads the map's data** (checkpoint 7). The station board (agreement 9.2) has each station's location and last tap, and the stats (9.5) count each passport station's taps and participants, so a first map needs no change to the agreement. But the screen at a public booth would then hold an organizer's login, which can disable stations, and each poll reads two endpoints. The other way is one read-only endpoint with counts and no names, read once per poll, which is a change to the agreement and needs Ethan's approval. The spec suggests the endpoint. Settle it before Ethan's team builds the map.~~ *Settled 23 Oct* (Adam): one read-only endpoint, read by organizers and a list of map screens only, polled every 2 seconds. Each station's booth is a new optional passport setting, and the floor plan is the screen's own. Checkpoint 7, "The map and connections, in detail", has the rest. It needs Ethan's approval of the agreement change.
- ~~**How two tokens connect,** if connections between visitors go ahead (checkpoint 7, Could). Without a phone: two tokens tapped on one station within a few seconds become a link, though at a busy station two strangers can pair, which the station's own text could prevent ("Now tap your partner's key"). With a phone: one visitor's phone reads the other's token, which a phone can do on its own, the teacher's objection. Either way, nothing may rely on `taps.id` order to pair two taps (section 3.7). Settle it once the map is done.~~ *Settled 23 Oct* (Adam): no phone. Two users connect by tapping at the same connection point within a few seconds, a pair connects once, and every tap there is `accepted`. Checkpoint 7, "The map and connections, in detail", has the rule.
- **How a connection point is laid out,** for the group and Julian (Adam, 23 Oct): one station both people tap, or two linked stations side by side, one each. Two stations stop two people on the same side pairing, and their layout tells people what to do without station text, but they cost a second box (or a second reader, Zi Tao's call) and need a longer window, since their two clocks differ. With it: the window's length, whether a tap with no `tapped_at` can pair, what the second tap's answer and beep say, how the web's anonymous nodes are named, and whether the passport shows a participant's own connection count. Settle it before connections are built, after the map. *27 Oct, later:* connections are a Should, so this is needed sooner. A third layout is open too: a visitor and a partner group's member tapping together at the partner's booth (checkpoint 7's further notes).
- **Find Gatsby, go or no-go** (BAC-96), at the meeting on Thu 5 Nov, from HAR-21's radio results and the UWB demo. BAC-91, HAR-23 and FRO-88 follow it.
- **One more game for the showcase** (BAC-98, Adam's), at the same meeting: the roaming station, students' picks, or neither.
- ~~**Running the GeekyKey Service's Worker near Cloud Run** (BAC-38, 21 Oct; tried in BAC-63).~~ *Settled 23 Oct (BAC-63), on a probe's numbers:* the Worker takes the hint, `"placement": { "region": "gcp:asia-southeast1" }` (section 5.1). Answered in Paris, a probe Worker on Adam's own account made two calls to staging's Cloud Run. Without the hint they took a median of 0.65 s together. With it they took 0.07 s, and the probe ran in Singapore on every request (section 11.3). No real tap could run with the hint before production, since nobody can read staging's keys for a copy of the Worker. So the merge deploys it to production, and then Adam times production's taps through Paris again, beside Cloud Run's latency, and checks the real station's tap and heartbeat. What was asked: a tap that Cloudflare answers in Europe took up to 3.73 s, against 0.68 s through Singapore, because the Worker's two calls to Cloud Run start from Europe. The choices were to try the hint, on Adam's own account first as BAC-44 did, then time taps again through a European data centre; or to leave it and accept that a tap through Europe plus a cold start shows `Tap saved` / `Will send later`.
- **The cooldown.** The meeting suggested 15 minutes instead of 5. Every accepted tap after the cooldown earns the station's points again, so the cooldown sets how often one person can earn at one station: 12 times an hour at 5 minutes, 4 at 15. It's one setting, `TAP_COOLDOWN_SECONDS`, so it can change up to the freeze.
- **A server-side tap queue** (backlog, BAC-22, Julian, 8 Oct). Taps would be put on a queue and stored a moment later, so a burst can't overwhelm TiDB. The catch: the station waits for each tap's verdict, for amber "too soon" and "claim this token" ("Does a station wait for the Event Service's verdict?"), and a queue can't give a verdict at once. The stress test decides whether we need one; if we do, the options to weigh are a queue inside the server with the verdict still worked out first, or Cloud Tasks or Pub/Sub with the station answered "recorded".
- ~~**Getting the keys onto the Worker at checkpoint 4** (13 Oct).~~ *Settled 15 Oct:* Julian copies each value from Secret Manager into the Worker's secrets himself, and section 5.2 and checkpoint 4 say so. What was asked: its step 1 had Adam read `EVENT_SERVICE_KEY` and `CLAIMS_STAND_IN_KEY` once and send them to Julian, but Adam's Editor role can't read a secret. The same goes for any later replacement, such as one the log check calls for. The choices: Julian, as Owner, copies each value from Secret Manager into the Worker's secrets himself, so no key ever passes through a chat (suggested); or Julian gives Adam read access to production's two keys for the day. Settle it before checkpoint 4.
- **Seeing the GeekyKey Service without access** (Julian, 1 Oct 2026), asked again on 8 Oct with no answer. The Event Service's logs and the station board are ours, on Google Cloud. What the team still can't see is the GeekyKey Service's logs (failed key checks, owner lookups and hand-offs, `stations_copy_filled`) and the account's Workers requests. The choices: ask Julian for read-only access to Workers Observability and the account's usage; Julian, who will be at the showcase, or someone he names, watches them on the day; or rely on what the stations and the station board show. Settle it before the rehearsal. *23 Oct:* the meeting's next steps include confirming the team's access to Cloudflare's logs.
- **Two repos at the split** (Julian, 1 Oct 2026). The Event Service's repo goes under the GeeksHacking organisation (8 Oct). At the move: how both repos get `packages/handoff`'s schemas; whether the end-to-end smoke test still runs on every pull request, and in which repo, now across two platforms; the move of `apps/event-web` for Ethan's team; and the claims stand-in, `infra/` and the deploy workflow, which go with the Event Service. The keyless sign-in trusts only this repo's ID (`1310668143`), so the new repo needs the provider's condition and both deploy accounts' bindings redone (the runbook's step 6), which takes a role that can grant (13 Oct). *Settled 16 Oct* (Julian, BAC-39): the move happens after the showcase on 17 Nov, for example during the handover on 19 and 20 Nov. Checkpoint 4 splits the folders inside this repo, and these questions wait until the move. *23 Oct:* Julian intends the Event Service and the Event screens to become a GitHub template at the move (section 3.7).
- ~~**Whether the GeekyKey Service gets a staging copy,** decided at the split. The stress test would use it.~~ *Settled 15 Oct:* none at checkpoint 4. Local `wrangler dev` and the smoke test cover it. Whether to add one is decided with the stress test (BAC-21), the only thing that needs it.
- ~~**The Sprint 2 A/B test.**~~ *Settled 27 Oct* (Adam, BAC-88): it runs at the grad tea on Thu 12 Nov, on production, and the window below closed on 18 Oct (BAC-26, cancelled). Section 6, "The grad tea", has the plan. What was asked: the roadmap runs the A/B/C test at an SSTInc or CCA event between 5 and 18 Oct, on a date Mr Pang gives. It isn't confirmed yet, so nothing waits on it until it is. Condition A needs claimed tokens, stations and the passport; Condition B needs QR scanning and the passport; both feed the export. Participants see their passports only by logging in, and dev-login only signs in seeded users. Since 8 Oct, the login no longer waits on the Portal: Firebase's Google sign-in can be set up by Adam alone. The choices, for Adam and Joshua:
  - **on production:** checkpoints 2 to 7 and the Firebase login, within one to three weeks;
  - **on a laptop at the venue,** as in the 23 Sep test: today's backend, with the stations over `http://`, and Firebase's Google sign-in added to it;
  - **later:** a date late in Sprint 2 or after it, if the course allows.

## 13. Sources

The map: [Move GeekyKey to TiDB and Cloudflare](map.md). Its tickets, in the order the map lists them:

- [Does TiDB fit this backend?](issues/01-tidb-fit.md)
- [What does running the backend on Workers involve?](issues/02-workers-runtime.md)
- [How can the frontend run on Cloudflare and reach the backend?](issues/03-cloudflare-frontend.md)
- [Can the architecture carry the 24 Sep game ideas?](issues/04-future-ideas-fit.md)
- [How is the frontend set up, and how does the browser reach the backend?](issues/05-frontend-setup-and-routing.md)
- [Which hostnames, and which OAuth redirect URLs?](issues/06-hostnames-and-oauth-redirects.md)
- [Which parts of today's backend belong to the GeekyKey Service, and which to the Event Service?](issues/12-backend-split.md)
- [How is the database set up?](issues/07-database-setup.md)
- [How do local dev, tests and CI get a runtime and a database?](issues/08-dev-test-ci.md)
- [What is a token's ID, and what URL is written on each token?](issues/13-token-id-and-url.md)
- [How do stations talk to the GeekyKey Service?](issues/11-station-endpoints.md)
- [How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?](issues/14-event-service-triggers.md)
- [Which screens belong to which service, and how does each know who is logged in?](issues/15-screens-and-login.md)
- [Does the A/B analysis need token IDs or unclaimed-token taps?](issues/16-ab-analysis-export.md)
- [How do deploys and secrets work?](issues/09-deploys-and-secrets.md)
- [What does the GeekyKey Service need from the Portal's tag APIs?](issues/17-portal-tag-apis.md)
- [How do we back up the database, recover it on event day, and clear the test data before the doors open?](issues/19-backups-and-test-data.md)
- [How do we protect our public addresses without blocking the stations?](issues/18-protecting-public-addresses.md)
- [How do we notice trouble on event day, and who watches?](issues/20-event-day-monitoring.md)
- [Write the migration spec](issues/10-migration-spec.md)
- [What does Cloud Run "v1" mean, and what does running the Event Service there involve?](issues/21-cloud-run-facts.md)
- [Which cache can a Worker use for free?](issues/22-worker-cache-options.md)
- [Who registers stations, where is a station key checked, and how does the GeekyKey Service know which Event Service a station feeds?](issues/24-stations-without-a-database.md)
- [Where do token owners live until the Portal's tag APIs exist, and what does the token page do?](issues/23-token-owners-before-portal.md)
- [Does a station wait for the Event Service's verdict?](issues/25-wait-for-the-verdict.md)
- [What does the GeekyKey Service cache, and in which store?](issues/26-what-to-cache.md)
- [How is the Event Service built, deployed and staged on Cloud Run?](issues/27-event-service-on-cloud-run.md)
- [Fold the answers into the spec](issues/28-fold-into-the-spec.md)

Decision records: [ADR 0001, tokens are identified by their hardware UID](../../docs/adr/0001-token-id-is-the-hardware-uid.md); [ADR 0002, each service logs users in through the Portal itself](../../docs/adr/0002-each-service-logs-in-through-the-portal.md); [ADR 0004, the showcase logs in through Firebase](../../docs/adr/0004-the-showcase-logs-in-through-firebase.md); [ADR 0005, guests at the showcase reach the passport through a login link](../../docs/adr/0005-guests-reach-the-passport-through-a-login-link.md); and [ADR 0003, the Event Service runs on Cloud Run, and the GeekyKey Service keeps no database](../../docs/adr/0003-event-service-on-cloud-run-geekykey-service-without-a-database.md).

Research: [Cloud Run](research/cloud-run.md), [a Worker's cache](research/worker-cache.md), [Node, Bun and Deno, and how the Portal runs](research/backend-runtimes.md), and [Hyperdrive's alternatives](research/hyperdrive-alternatives-benchmark.md).

Meetings: [Julian and Qing Guan, 8 Oct, with the answers](../meetings/2026-10-08-julian-and-qing-guan.md).

Messages: [what to ask Julian and Qing Guan on 8 Oct](assets/message-to-julian-workers-requests.md), [to Julian, hostnames and deploys](assets/message-to-julian-redirect-urls.md), [to Julian and Qing Guan, the tag APIs](assets/message-to-qing-guan-tag-apis.md), [to Qing Guan, logging in](assets/message-to-qing-guan-login.md), [to Zi Tao, the station contract](assets/message-to-zi-tao-station-contract.md), [to Zi Tao, the token writer](assets/message-to-zi-tao-token-writer.md), [to Zi Tao, the Wi-Fi password](assets/message-to-zi-tao-wifi-password.md), and [to Joshua, the export](assets/message-to-joshua-ab-export.md).

Outside the map: the Single Source of Truth's roadmap (`Centralised-Capstone-Folder/01_Project Management/Geekykey Single Source of Truth.docx`, gitignored), and the station firmware as of 6 Oct 2026 (`firmware/geekykey_station/geekykey_station.ino`).
