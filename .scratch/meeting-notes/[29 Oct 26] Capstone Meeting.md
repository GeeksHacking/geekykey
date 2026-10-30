# Connection points, the grad tea and the next two weeks, with Julian

Thu, 29 Oct 26, 9 PM, online

## If There Are Only 15 Minutes

1. **Mr Pang's feedback** (section 1): which games and features the showcase builds (1.5, BAC-112), and whether connections and Find Gatsby stay (1.4)
2. **How a connection point is laid out** (3.1 and 3.3), if connections stay
3. **What the QR fallback scans** (section 4): overdue since checkpoint 7

---

## 0. Progress since 23 Oct

- **25 to 26 Oct, checkpoint 7:** the Event Service's features are done and checked on production:
  - The passport runs as a game behind one game interface
  - Station board, creating a station and replacing its key, disabling and enabling it
  - Passport settings, tap log, QR fallback taps, stats and export
  - Each user limited to 60 requests a minute
  - The map's data (`GET /api/v1/map`), and the organizer screens call the Event Service for real
- **25 Oct:** the GeekyKey Service's Worker runs near Cloud Run for every tap, so a tap that Cloudflare answers in Europe is no longer slow (BAC-63)
- **23 to 28 Oct, stations:** a tap's result beeps (HAR-18), the station answers every tap at once (HAR-19) and sends a tap 40 ms sooner (HAR-27), and the firmware builds for the classic ESP32 too (HAR-15)
- **27 to 28 Oct, the grad tea's plan** is in the spec: it pilots the showcase's own games (passport, map, connections), the quiz and the trail are dropped, and Find Gatsby is the stretch game, with a go or no-go on 5 Nov
- **28 Oct:** each station holds its game and its booth, set by organizers before its first tap (BAC-90, BAC-89); a stamp gives its group's page link (BAC-99); Ethan approved agreement 0.7 and 0.8
- **27 Oct:** Find Gatsby's first radio test in a 14 m room: near and far separate clearly, 5 m and 10 m blur (HAR-21)
- About 25 fixes to the screens since 23 Oct, most of them from the review of checkpoint 6
- The showcase date is corrected to **Tue 17 Nov** (setup Mon 16 Nov); 18 Nov was wrong

Next: connections, which must merge by Tue 10 Nov

---

## 1. What We Heard from Mr Pang

**1.1 His feedback (29 Oct)**

- We have nothing to show anyone yet, only taps
- At GeeksHacking events the sponsors' booths sit next to each other, so Find Gatsby can't work there
- None of our games address the problem statement, and he can't see how they differ from pen and paper
- We haven't found out why people skip sponsors' booths in the first place. Often they simply aren't interested
- Most of our games end in a reward, such as finishing the passport or finding Gatsby first
- Nothing makes our solution clearly different. We are building a solution to something that already has one, and ours costs more and needs more upkeep
- He suggested reframing the problem statement around sustainability compared with pen and paper, or around something only the stations and NFC can do

Ethan's reading: it's closer to a set of gimmicks than one thing people look at and remember (Toyota is reliable, Porsche is luxury). Each extra feature adds steps that make it harder to take part.

**1.2 What we take from it**

- It's the third time we've heard this. "What does NFC unlock that paper cannot?" (2 Oct), "everything so far could be done with a phone" (23 Oct), and now Mr Pang. Each time we answered with another game
- The problem statement has three parts. Visitors don't spread out. Organisers and sponsors can't see or change where people go. Organisers rebuild their activities every year. Our games aim at the first part, and each ends in a reward
- What checkpoint 7 built answers the second and third parts, and paper can do neither: the tap log, the station board, stats and export, the map's data, games behind one interface, and stations given a new game with no reflash
- "Sustainable" holds up as reuse. The grad tea on 12 Nov and the showcase on 17 Nov run on the same stations and tokens, and the switch changes only the look and the event's name. As less waste, it needs numbers first: a paper passport is a few sheets, and our kit is boards, readers and power banks

**1.3 Proposed: one headline, and a problem statement that leads with organisers**

- The headline: an organiser sees where everyone is on a live map of the hall, and can act on it while the event runs. A visitor taps once, and the map changes within 2 seconds
- The problem stays the same, and its statement leads with organisers. A first draft for Joshua: "At multi-booth community events, organisers can't see where visitors go while the event runs, so quiet booths stay quiet, and each year's activities start again from nothing." "Visitors stay with what they came for" (spec, 27 Oct) stays as the reason organisers care
- We claim only what we measure. The map shows where people went, and the grad tea's baseline and the showcase's comparison at the voting point show whether the passport moved them
- The map screen comes first, with a mock layout, so there's something to show before the rehearsal on Sat 7 Nov

Tickets: BAC-102 (the problem statement, Joshua, by Thu 5 Nov), FRO-78 (the map, PR #192), BAC-107 (the report catches up)

Answer: Julian measures GeekyKey by engagement, not cost. A community that takes no money from its events depends on sponsors keen to sponsor again and participants keen to come again, and "the key term here is experience". He called "it can be done on a phone" reductive: the same game on a phone, a PC or a Switch is a different experience, and a token in the hand feels different from another app. The map is "a really interesting idea to use for analytics", depending on the event. At the showcase not every booth has a station, so he suggested a station per room, to show each room's engagement.

**1.4 Proposed: what stops, so the headline stays clear**

- Find Gatsby: no-go now rather than on 5 Nov. Booths sit side by side, and 5 m and 10 m already blur (HAR-21)
- Connections (section 3): paused until after the showcase. Two friends can pair, a printed card has to explain how it works, and on 23 Oct Julian put the sponsor side first and person-to-person second (23 Oct, 4.3). This frees Zi Tao's second reader, the agreement change and the backend work due by Tue 10 Nov
- The showcase's next game (5.4): the roaming station only, if any, as the organiser's way to act on the map by carrying a station to the quietest area. No game that needs explaining
- No claim about waste without numbers. Reuse is the claim instead, with the switch from the grad tea to the showcase timed as evidence

Tickets: BAC-103 (the spec records whatever is decided here), BAC-105 (the switch timed)

Answer:

- Find Gatsby wasn't discussed. Julian said whether booths sit side by side depends on the venue, and some sponsors come on one day only
- Connections are possible (3.1). Adam's notes: interesting, but we need to find what a connection unlocks that makes people want to do it. Julian doubted networking at a showcase. With two tokens registered as a pair, people may give up before finding each other. He couldn't think of a reason, at a showcase, to tap a token on someone else's phone, though in a game he could think of many
- The roaming station and the claim about waste weren't discussed

**1.5 Proposed: features that all come from the same tap (BAC-112, urgent)**

Ethan's question: which games and features would people remember, rather than gimmicks that add steps? Every idea is now checked against three things (spec, section 2, "The checks for a new idea"):

1. **The four checks.** It passes all four:
   1. Tapping is the only thing the visitor does. No second person, no timing, no card to read. A phone is needed once, to claim a token, and after that only to check progress
   2. Paper or a phone can't do it
   3. People nearby can see it
   4. It also gives the organiser something
2. **Mr Pang's feedback (1.1).** It's different from pen and paper, it answers why people skip booths rather than only rewarding a visit, it doesn't end only in a personal reward, it's worth its cost and upkeep, and it works with booths side by side
3. **No leaderboard (23 Oct).** Nothing ranks people, by points, time, wins or gear. A goal the whole room shares is fine

Connections and Find Gatsby fail the first check. The passport alone fails the second: it's how people take part, not the show. These pass, and none depends on how far apart the booths are, so they work at partner groups' booths at the showcase, the grad tea's areas, and sponsors' booths at Hackomania:

| Feature | What happens | Tickets | Needs |
|---|---|---|---|
| Light the hall | On the big screen, each booth lights up once enough people have visited it, and the hall celebrates when every booth is lit. The dark booths pull people to the quiet ones. At the grad tea it's "the party lights up", in the Gatsby look | FRO-97 | Screens only |
| Replay the night | At the showcase, the grad tea's real taps play on the map in about a minute: where the crowd went, and which booths stayed quiet | FRO-98 | Screens only, and the grad tea's export saved before the switch |
| The outfit, built from the crowd | Below | Not yet | A small agreement change, and the art for each look |
| The station knows you | Tap, and the station shows "Hi Alex!" and "3 of 6 stamps", with a tune of its own on the last stamp | BAC-111, HAR-28 | Agreement change, backend by Tue 10 Nov, firmware. Changes a call from 23 Oct (below) |
| The hexagon you keep | Six partner pieces on one token, taken home | HAR-25 | Zi Tao's prototype |

**The station knows you changes Adam's call of 23 Oct** (spec, the 23 Oct answers, items 3 and 6): the station was to show the visitor's own text only once it had an OLED or a TFT, and points on the station went with the leaderboard. Adam proposes changing the call: the station shows the name and progress on today's 16-character LCD, and progress isn't points. Julian's view first, then the spec changes (BAC-103).

**Joshua's idea: avatars, gear and battles (29 Oct)**

Every participant gets an avatar. Taps at booths drop random gear (outfits, armour, weapons, pets), some with stat buffs. Participants battle one to one by scanning each other's token with a phone, in a timing-bar game, once per pair. A big screen shows a leaderboard of duellists and a world boss that every avatar fights.

| Part | Against the checks |
|---|---|
| The world boss: one goal the room shares, on the big screen | Passes. It's the same idea as Light the hall, so it becomes that, in each event's look |
| An avatar that changes as you collect | Passes, simplified to one set piece per booth (the outfit, below) |
| Random drops and stat buffs | Fails Mr Pang's point about rewards, and paper can do a raffle. Buffs only matter for the battles |
| Phone battles with a timing bar | Fails the first check: a second person, a phone and a game to learn. A phone opens a token's page from its UID, so a shared link can battle from anywhere, and the once-per-pair rule still lets five friends play ten battles among themselves |
| Leaderboard of duellists and most-geared | Fails the third check (23 Oct) |
| Gatsby fit, and time | Armour and battles don't fit a 1920s party. Items, inventories, battles and the boss are the most new work of anything here, with the backend due Tue 10 Nov |

**The outfit, built from the crowd (proposed, from Joshua's avatar)**

- Six slots, one per partner booth. Your tap at a booth gives you its piece, and the passport draws your avatar wearing what you have. Only a tap at the booth gives you its piece
- What others give you: once a booth lights up (Light the hall), its piece turns gold for everyone who has it, and for everyone who gets it later. Other people's visits improve your outfit, so it pays to tell people about a booth you liked. Nobody has to find a second person, and there's nothing to swap or explain
- The same six slots at both events, with each look's own art: a hat, pearls, a bow tie, a cane, a feather and a glass at the grad tea; a helmet, a visor, armour, a gauntlet, a jetpack and a drone at the showcase. The switch still changes only the look and the event's name. At the showcase, the six slots match the hexagon's six pieces
- The big screen shows each booth's piece on the map, turning gold as the booth lights. No avatars or names on the big screen
- Built on the stamps the passport already has. The gold needs one addition: each stamp slot's visitor count in 8.1, and the lighting target as an event setting so the phone and the big screen agree. That's an agreement change, by Tue 10 Nov
- Against the checks: tap only; the crowd's gold needs live counts, which paper can't do; the gold shows on the big screen; organisers get the same per-booth counts; no ranking. Honestly, collecting the six pieces is still the passport with pictures; the shared gold is the new part

Questions:

- Which of these do we build? Who builds each?
- Light the hall: how many visitors should light a booth, at the grad tea and at the showcase?
- Replay the night: can we show the grad tea's taps at the showcase? They're anonymous on the map, but they're guests' taps
- The outfit: do we build it, in place of plain stamps? Who draws the twelve pieces, six for each look?
- The outfit: is the gold from the crowd enough of a reason to tell others about a booth?
- Joshua's idea: does Julian see a part worth keeping that the checks would cut?
- The station knows you: Adam proposes changing the 23 Oct call so the station uses today's LCD. Does Julian agree? If it goes ahead, may it show a first name, on a screen the next person in the queue can see, or progress only?
- The hexagon: still chosen on Thu 5 Nov, or now?
- At Hackomania, would sponsors want any of these at their booth?

Answer:

- Which to build is ours to choose. We should be able to tell the teachers why each one makes the showcase better for organizers and for participants
- Light the hall has "very little to do with the NFC". The key doesn't have to be part of the interaction
- Replay the night wasn't discussed as such. The analytics Julian wants are each person's path through the rooms (first, second, third), the most popular room, and the route most people took: clockwise, anticlockwise, at random, or to the food and back. Recording taps between people would make them more interesting
- The outfit, Joshua's idea and the station knows you weren't discussed, and nor was a name on the station's screen
- The hexagon: the physical design is "probably the most compelling part" of the showcase, because people can touch it, take it home and collect things on it. On Mr Pang's points, don't make it spiky, and put magnets in. A coin is the easiest. Julian's has a 0.4 mm base, a 2 mm layer with a 6.2 mm hole for a 6 mm magnet, and a 4 mm design layer
- Give one piece away free at registration, which hints that there are more. Visitors could collect the other pieces at our booth, since the system knows which booths a token has visited
- Choose the showcase's ideas and the token first, as soon as possible, and start producing the tokens
- At Hackomania, sponsors could hold different tokens from organizers, which unlock different interactions. Organizers could also work with sponsors so that every booth has an attractive item

**1.6 For Julian**

- At Hackomania and other GeeksHacking events, why do attendees skip sponsors' booths? What have you seen, or heard from sponsors?
  - Julian: sponsors and participants want different things. Sponsors come so that participants know them, but participants don't come to know sponsors. Sponsors know they aren't the main activity. If nobody interacts with them, they find the event not worth the budget, so part of the answer is channelling people to their booths
  - When a sponsor comes matters. During the hacking there's nothing for them to do; during registration people are waiting anyway, so there's much more
- What do sponsors ask organisers for after an event? Would a count of visitors at their booth, or of people who opened their link, be worth something to them? (BAC-106)
  - Julian: yes. "This many people visited your booth" helps GeeksHacking when it goes to sponsors: "we helped drive this many engagements". It's only fair if every booth has a station
- Does the headline in 1.3 match what GeeksHacking wants from GeekyKey? On 23 Oct (4.1) the answer was "a system that enhances GeeksHacking events with physical-digital interaction"
  - Julian: see 1.3. Engagement and experience come first, and the map is for analytics
- Is pausing connections all right, given the 23 Oct call to do the sponsor side first?
  - See 1.4 and 3.1. Julian didn't say whether to pause them
- Could we ask a few past attendees why they skipped booths, before Thu 12 Nov? For example, a short form in a GeeksHacking chat
  - Not discussed

---

## 2. Dates

| Date | What |
|---|---|
| Mon 2 Nov | Adam meets Mr Yaseer about the MPH (to confirm) |
| Thu 5 Nov, 12 PM | Next meeting: Find Gatsby go or no-go, the showcase's next game |
| Sat 7 Nov | Rehearsal on production |
| Tue 10 Nov | Last backend merge before the freeze |
| Wed 11 Nov | Backend freeze |
| Thu 12 Nov, 3:30 to 6:30 PM | Grad tea, MPH |
| Sun 15 Nov | Last merge of all (the switch to the showcase) |
| Mon 16 Nov | Setup |
| Tue 17 Nov | Showcase |

---

## 3. Connection Points (BAC-83)

Depends on 1.4. If connections pause, 3.1 to 3.7 wait until after the showcase.

**Settled on 23 Oct:** two different users who tap at a connection point within a few seconds of each other connect, a third user in that window voids it, a pair connects once, and every tap there is accepted. Connection points count only for connections, not for the passport. The map shows a count and an anonymous web. The one-page comparison is `.scratch/connections/bac-83-options.md`.

**3.1 Layout: one box, two readers (proposed)**

The options:

1. One station, both people tap it one after the other
2. Two linked stations side by side, one per person
3. One box with a second RC522 reader on its other side (Zi Tao has confirmed this works)
4. At a partner group's booth, a visitor and a group member tap together after the group's challenge question

Why the one box with two readers:

- The two readers show two people where to tap, so the station needs no text to explain itself
- To the server it's one station with one clock, so the window stays exact and the server code is the same as for one station
- If the second reader fails on the night, the box still works as a one-station point, with no deploy
- Two separate stations would need a lock across both and a longer window, since each clock is set from the server's time with no allowance for the network (up to 3.7 s off through Europe, BAC-38)
- The partner-booth layout needs a list of each group's members and a rule change, which is too much before 10 Nov

What it needs:

- Zi Tao wires the second reader (own SS and RST pins, same SPI bus) and the firmware reads both, tested before the rehearsal on Sat 7 Nov
- Two friends in a queue can still pair by chance, as with one station; a printed card asks people to tap together

Answer: the layout wasn't discussed. Julian: from a gameplay view, why put the point right in front? Hide it, or disguise it as part of a sponsor's booth, so that people have to go to the sponsor even if they don't want to talk to them. "These are possible ideas."

**3.2 The window**

About 10 seconds. The station reads no tap while it sends the first (usually under 1 s, at most 5 s).

Answer: nil

**3.3 What the second tap's station says**

Today the station shows "ACCEPTED / Points added" for every accepted tap, which is wrong at a connection point.

- (a) Firmware only: a connection point shows "Tap counted!". The pair see the map's count go up within 2 seconds, but not on the station.
- (b) A new optional `connected: true` on the tap's result, and "Connected!" with its own beep. Touches the Event Service, the GeekyKey Service and the firmware, and needs Ethan's approval by Mon 2 Nov.

Proposed: (b) if Ethan approves by Mon 2 Nov, otherwise (a).

Answer: nil

**3.4 A tap with no time from the station**

A tap sent before the station's clock is set has no `tapped_at`. Proposed: it never pairs, since its time isn't on the station's clock.

Answer: nil

**3.5 The map's web**

Each user gets a number in the order they first connected, so the screen keeps its layout between polls without user IDs. Question for Ethan's team: does that work for drawing it?

Answer: nil

**3.6 Showing a participant's own count on the passport**

Proposed: after the map screens (FRO-78, FRO-84), not now.

Answer: nil

**3.7 Connections at the partner booths (showcase only)**

A middle way: a one-box point beside a partner's booth, with the group's challenge question on its card. No member list and no new code; it costs a box per booth and tokens for the members. Proposed: decide on 5 Nov, once we know how many boxes there are.

Answer: nil

---

## 4. What the QR Fallback Scans (BAC-28, with Ethan)

The organizer form says "Scan the QR code on the participant's profile, or type the ID", but the passport shows no QR code. Typing the ID already works.

- Typing the ID only: the form's wording changes, nothing else
- The passport shows a QR code of the user's ID: a screen change for Ethan's team

Answer: nil

---

## 5. The Grad Tea

**5.1 The MPH (BAC-95)**

Mr Yaseer's Games Subcommittee students are on OLE this week, so Adam meets him next week. Five requests: the floor plan, the projector, three spots with power sockets, permission for our own router, and setup time before 3:30 PM. Also: a visit to the MPH before the day for the radio test. Anything to add?

Answer: nil

**5.2 Each group's page link**

Every partner station gets an NFC sticker and a QR code for its group's page (HAR-26), and the passport now offers the link after a stamp (BAC-99). We need each partner group's link by Mon 9 Nov.

Who collects them:

**5.3 Find Gatsby (go or no-go on 5 Nov)**

- Room test done (HAR-21); the run in a bag, against a body, and the 3.5-hour power bank run are still to do
- Hardware order: HAR-22
- Proposed go: two fixed stations reliably say hot, warm or cold through a crowd, and the backend can merge by Tue 10 Nov
- If go, the backend has four days, so it can't hold up connections

Answer: nil

**5.4 The showcase's next game (BAC-98, heads-up for 5 Nov)**

Candidates: the roaming station ("the android among us"), and students' picks (students tap the booths they'd recommend in the morning, and parents see "students' favourites" in the afternoon). Please bring other ideas on 5 Nov.

Answer: Julian's ideas are under Next Steps: hidden stations, different routes for different tokens, and finding the person with a special token.

**5.5 One question at the exit (from 1.2)**

Observers already count each area every 15 minutes, with a baseline before tokens go out. Proposed: guests also answer one question as they leave, on a card or a one-question form: "Which part of the hall did you skip, and why?" It gives us a first answer to Mr Pang's question from the people we're designing for.

Ticket: BAC-104

Answer: nil

---

## 6. Questions for Julian

**6.1 The stress test (BAC-21), on staging on 5 and 6 Nov**

Staging and production share TiDB's 50 million Request Units a month. How many have we used this month, so the test can be sized?

Answer: nil

**6.2 A run with real stations**

On 8 Oct you suggested a classroom run with other groups. Still wanted, beside the scripted test?

Answer: nil

---

## Next Meetings

- **Thu 5 Nov, 12 PM:** in person or online (Julian confirmed; he's out of the office that Friday). By then the showcase's idea should be more or less final
- **Fri 13 Nov, 12 PM:** after the grad tea; share results

## Julian's Ideas from This Call

- **Choose first, then produce.** Settle the showcase's ideas and the token, then start producing the tokens. Other ideas can come while they print
- **The token.** Something to play with and easy to carry. Nothing spiky; magnets instead. A coin is the simplest (1.5)
- **Different tokens, different experiences.** When a token is written, include an identifier for its type, such as a warrior token, or hand types out at random. Only the token opens its owner's page, so the next instruction can differ by token. Two examples: a bingo whose items appear one at a time (do the thing, tap again, get the next), or a route through the stations in a different order for each group. People only find out when they see someone else's token. Paper can't do this. Julian called it complex
- **Sponsor, organizer and teacher tokens.** Different tokens unlock different interactions, openly rather than as a surprise
- **Mock returning participants.** Nobody has a token from an earlier event, so give tokens to friends or other IDP groups before the showcase. A guest has to find them and ask to tap. We choose how visible their tokens are
- **Geocaching.** Hide stations around the venue, some near sponsors. Anyone who taps every one collects a reward
- **A station per room** where not every booth has one, and paths through the rooms as analytics (1.5)
- **Tap in and tap out.** Checking in and out was never practical before; with a token it may be (Julian's hypothesis)
- **From Adam's notes.** GeekyKey is a long-running system: swag collected online is very possible, such as limited pieces for one year's event only. GeeksHacking already uses QR codes for attendance and food, and GeekyKey should add to the experience

## Next Steps

- **Choose the showcase's features and the token, then start production (BAC-112, HAR-25)**
- **Redraft the problem statement around engagement (Joshua, BAC-102)**
- **Build the map screen with a mock layout (FRO-78, PR #192)**
- **Meet Mr Yaseer about the MPH (Adam)**
- **Collect each partner group's page link**
