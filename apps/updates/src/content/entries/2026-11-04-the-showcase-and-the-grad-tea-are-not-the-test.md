---
title: "The showcase and the grad tea aren't the test any more: a timed trial replaces them"
date: 2026-11-04
window:
  from: 2026-10-21
  to: 2026-11-04
sprint: 4
authors: [adam]
summary: >-
  Mr Pang and Ms Teo withdrew the capstone showcase as GeekyKey's testing ground around 1 Nov,
  and the grad tea pilot was scrapped on 3 Nov, so no live event is left to test GeekyKey. We now
  have two variations: a token game where two people connect by tapping each other's tokens, for
  Julian as the client, and participant groups, from Mr Tan's brief. A timed internal trial on
  Thu 5 Nov tests both, and the report's results will come from it.
areas: [backend, frontend, firmware, hardware, research, admin]
asks:
  - who: Julian
    what: >-
      At the meeting on Thu 5 Nov, tell us whether the token game is the deliverable you want, and
      whether groups have a place beside it.
  - who: Mr Pang and Ms Teo
    what: >-
      What our own booth at the showcase should show: whether it still shows GeekyKey to the
      people there and, if so, which part.
---

## What moved

The plan changed on 1, 2, 3 and 4 Nov, so most of this entry is under Decisions. In the same two
weeks, checkpoints 5, 6 and 7 finished on production, and most of that work carries over.

Against the last update's goals: Adam finished checkpoint 5 on 22 Oct, with both sets of screens
online at event.geekshacking.com and key.geekshacking.com since 21 Oct. Checkpoints 6 and 7
followed on 23 and 26 Oct. The stress test on staging didn't happen, and has no date now, because
the rehearsal on 7 Nov was for the grad tea and the showcase. Both sets of screens sign in with
Firebase, and My tokens claims a token by typing its code. The team found a place for the mock
test at the grad tea, then lost it (see Decisions), and the trial on 5 Nov takes its place. This
entry has no update on Zi Tao's portable NFC scanner, or on Joshua's editing of the report.

### How the plan changed

- **23 Oct:** after meeting Julian, the showcase game became a collectible with no leaderboard.
  The map on the big screen came first, then connections. Sponsors' booths came before people
  meeting people, because the showcase's fixed booths could test them.
- **27 and 28 Oct:** the grad tea on 12 Nov became the pilot for the showcase's games.
- **29 Oct:** GeeksHacking told us it judges an event by whether participants and sponsors come
  back. Each token got a kind, and the station got a next stop.
- **Around 1 Nov:** the showcase stopped being the test, which left the grad tea as the only live
  test.
- **2 Nov:** the group chose people meeting people. We met the grad tea team the same day, and Mr
  Pang proposed the percentage match.
- **3 Nov:** Mr Johari and Mr Tan told the group to settle the direction, after too many changes.
  Mr Tan gave the brief for groups, and we scrapped the grad tea pilot.
- **4 Nov:** Mr Johari asked for a few variations instead of one, and we wrote them down.

### Backend

- **Checkpoints 5 to 7 are done on production.** People log in through Firebase, with Google or as
  a guest. Claiming and releasing tokens works on phones, with rate limits. Organizers create
  stations, replace keys, set up the passport, read the scan log and download the export.
- **A tap got faster for stations far from Singapore.** The GeekyKey Service's Worker now runs near
  Cloud Run, whichever Cloudflare data centre answers a station (23 Oct).
- **Each token has a kind** (30 Oct). The token writer writes it into the token's address, and the
  server keeps its own list of kinds, which games trust.
- **The Event Service has the token game.** Every participant gets 5 multiple-choice questions, and two
  people connect by each tapping their phone on the other's token within 2 minutes (3 Nov). On 4
  Nov the whole game worked on two real phones on production.
- **Groups have a first path** (4 Nov). Organizers create groups by name and press Allocate, and a
  participant who presses Join waits, then sees their group and its members.

### Frontend

**Ethan:**

- **22 Oct:** My tokens got its form to claim a token by typing its code, and My tokens and the
  token page got a button that opens each event's screens without a second login.
- **27 to 30 Oct:** a rate-limited summary keeps its numbers, the organizer tabs fit a phone, the
  station board shows each station's game and booth, and a new stamp offers the group's page.
- **3 and 4 Nov:** the token page makes one side of a connection, and the passport asks the 5
  questions one at a time.

**Also:**

- The map on the big screen draws each station at its booth and pulses it on each tap (29 and 30
  Oct). Since 4 Nov it also shows the connection count and a web of numbered nodes, with no names.
- After a connection, the dashboard and the passport show the percentage match. Two minutes later a
  button lists the answers the two people share (4 Nov).
- The dashboard has an avatar, using Joshua's drawings, which a participant can save as a sticker
  for WhatsApp. It was built for the grad tea, which no longer needs it.

### Firmware

- A station now clicks and shows "Sending..." about 80 ms after it reads a token, before the server
  answers. Before, a result took 0.25 to 1.6 seconds, with nothing on the screen (27 Oct).
- A station with a buzzer beeps as it shows a result, so people nearby can hear it (23 Oct).
- The station sketch builds for the classic ESP32 as well as the ESP32-S3 (26 Oct).

### Hardware

Zi Tao is making a token in three pieces, red, grey and blue, shaped as a hexagon with a keyring
hole. Whether its colour should show its kind, so people can see who they can connect with, is still
undecided. When this was written,
we didn't yet know how many would be ready for the trial.

## Decisions

**The capstone showcase is no longer GeekyKey's test, and no partner group's booth gets a station.**
Mr Pang and Ms Teo made this call around 1 Nov. Why: what GeekyKey does and what the showcase is
didn't match. Mr Pang added these points. The map and the next stop only pay off at a venue the size
of an expo, and bringing people to a booth is traffic, not engagement. Julian's point from 29 Oct supports them: hackathons are held in tight spaces, and participants leave their laptops at
their desks, so booths can sit side by side and leave the next stop little to choose between. What goes:
the partner stations, their stickers and QR codes, and the comparison at the showcase's voting point.

**People meeting people became the focus, with sponsors second** (the group, 2 Nov). Why: on 23 Oct
sponsors' booths went first only because the showcase's fixed booths could test them, and that
reason had gone. Joshua suggested the change on 1 Nov, because it's easier to get people interested
in each other than in a product. Sponsors stay in through a token kind of their own. Rejected:
people visiting booths, which kept the passport, the next stop and the map, tested only at the grad
tea's areas. The cost: the station no longer names a next stop, which we built on 30 Oct.

**Two people see a percentage match, and no longer hunt for whoever gave an answer** (Mr Pang and
Adam, 2 Nov). Each person answers 5 multiple-choice questions. A connection shows only the share of
answers the two have in common, and which answers they share appears 2 minutes later, so they talk
first. Why: Mr Pang wanted two people to see how much they have in common. It also answers a question
asked on 2, 23 and 29 Oct, of what a tap adds over paper. The answers stay hidden until two people
meet, and the tap proves they met, where friends can sign a paper bingo card for each other.
Rejected: one free-text answer and a hunt for the person who gave it, which we designed earlier the
same day. The hunt stays in the backlog, only if there's time.

**The grad tea pilot is scrapped, and a timed internal trial replaces it** (3 Nov). Our supervisors
recommended it, and as a team we decided the pilot felt force fit and wasn't feasible without more planning. We told the grad tea team. The
trial runs on Thu 5 Nov from 9 am, among our group and other capstone groups, and should take 1 to
2 hours, before the meeting with Julian's team at about 12 pm. The cost: the report's results come
from people who know the project, not from people at a real event.

**There are two variations, because the client and the brief ask for different things** (4 Nov). Mr
Tan's brief asks for a web app where organizers create, tag and manage groups, with each participant
in exactly one group. Uneven sizes, odd numbers and late arrivals must all work, and latecomers are
placed automatically. Julian is the client. Julian told us on 3 Nov that a game started by two people
tapping tokens could be quite interesting, that about 15% of participants sign up alone, and that
forming teams is quick, so solo team formation isn't a real pain.

- **Variation 1, the token game,** is our reading of the client's criteria, and is the minimum for
  the trial. Julian's answer on 5 Nov tells us whether we read them correctly.
- **Variation 2, groups,** is the extension. It also has to work for someone with no token.

The trial tests both. Rejected: groups as the one deliverable, because the brief alone gives the
token no use.

**What carries over.** Whichever variation stays, these remain: tokens, stations, the path a tap takes from a station to
the Event Service, token kinds, the map and the export. The map now draws connections, and connections count only between two
different kinds, so each token in the trial needs a kind on the server's list.

**Smaller calls:** parents and mentors can continue as a guest with one tap and no account (21 Oct).
Ethan approved GSAP for the map's animations, and phones never download it (26 Oct). Find Gatsby, a
hidden station that participants track down, was added on 27 Oct and dropped after the meeting on
29 Oct.

## Blockers and asks

- **No live event is left.** The trial shows whether the system works and how long each step takes.
  It can't show whether participants and sponsors come back, which is how GeeksHacking judges an
  event, so the report can't claim that as a result.
- **The direction waits on Julian's answer.** If the meeting on 5 Nov changes the choice, this entry
  gets a follow-up (see the asks above).
- **Groups aren't finished.** Allocate's agreed rules are in progress, and placing latecomers
  automatically hasn't started. The trial tests what's ready by 9 am, so a failure there may only
  mean the work isn't done yet.
- **The 5 questions are still placeholders.** The grad tea team was going to help write them by 9
  Nov, so the job needs a new owner.
- **Our own booth at the showcase** is still open, with Mr Pang and Ms Teo (see the asks above).

## What we learned

- **The group:** the 23 Oct plan depended on one venue's booths, so losing the venue reopened the
  plan. Because we had written that order down as an order of work, and not as a finding, we could
  choose again within a day.
- **The group:** the question of what a tap adds over paper came up on 2, 23 and 29 Oct, and our answer for the tap itself is from 1 Nov.
- **Adam:** a slow tap was mostly about which Cloudflare data centre answered it. Cloud Run spent
  about 0.1 seconds on a tap, while the whole tap took under 0.7 seconds through Singapore and up to
  3.7 through Paris or Marseille. Running the Worker near Cloud Run took its two calls to Cloud Run
  from 0.65 seconds to 0.07 in a trial answered in Paris.

## Next window

- **Adam:** run the trial on 5 Nov and log what failed and why, finish groups' allocation and
  latecomers, and bring the API agreement, the spec and `CONTEXT.md` up to the 3 and 4 Nov decisions.
- **Ethan:** the rest of the Groups screen and what a participant sees of their group, once the allocation
  rules are in.
- **Zi Tao:** tokens for the trial, each with its kind.
- **Joshua:** reword the problem statement for the variations, then update the report's sections,
  with results from the trial.
- **The team:** settle the direction with Julian's answer, and write the 5 real questions if the
  token game stays.
