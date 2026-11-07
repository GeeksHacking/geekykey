# The grad tea: plans kept as history

Mr Tan and Mr Johari scrapped the grad tea pilot on 3 Nov 2026, so none of this applies. It moved here from section 6 of [the migration spec](spec.md) on 7 Nov 2026, word for word, because the spec's other sections still cite it for why decisions were made. "The answers game" stayed in the spec, with its own notes on what still holds.

Added 27 Oct (BAC-88). *Changed 27 Oct, later:* the grad tea is a pilot of the showcase's own games, not a contest between games, so no game is chosen there for our booth (section 2, "The 27 Oct answers, later"). It runs on Thu 12 Nov, from 3:30 to 6:30 pm in the MPH, with a Gatsby party look, while the showcase keeps its sci-fi look. It's the first real event on production, five days before the showcase, and it falls the day after the backend freezes. So every backend change it needs merges by Tue 10 Nov.

#### What it measures

*1 Nov:* what the grad tea measures follows the group's choice in BAC-114. *2 Nov:* the group chose people meeting people, so the measures become connections between groups, the exit question, and how many guests drop off between taking a token and their first connection (BAC-116). "The answers game", below, adds the hunt's own counts.

The problem both events test is that visitors stay with what they came for: guests with their own group at the grad tea, and parents at their own child's booth before they vote at the showcase (Mr Johari). A game that works moves people into areas they would otherwise skip.

- **People in each area.** Observers count the people in each area of the MPH every 15 minutes. The first half hour, before tokens go out, is the baseline.
- **From the taps:** how many passport stations each guest reached, how many connections were made, and, from 30 Oct, whether guests went to the next stop the station named. Both come from the copy Adam takes at the end of the evening, which is the source for Joshua's analysis.
- **The results** are shared at the meeting on Fri 13 Nov. They can change the clue cards and where the stations stand, which need no deploy, but no code after the freeze.
- ~~**The showcase is the field test.**~~ *Withdrawn 1 Nov* (the 1 Nov changes): Mr Pang and Ms Teo withdrew the showcase as GeekyKey's test, so the grad tea is the only one. What was planned: visitors with and without a token compared at the voting point, if the teachers allowed it, each booth's tally set beside last year's voting pattern, from Mr Johari, and student helpers handing tokens out at the entrance and counting the visitors who declined one.

#### The games

- **The passport,** at every station except the connection points, with the trail's clues on printed cards (BAC-94). A guest taps, collects the stamp, reads the station's card, and goes to the booth it describes. The passport already records the stamps, so the trail needs no code. At the showcase, the route crosses all three walled areas.
- **Connections** (BAC-83, BAC-86): two guests tap at the same connection point within a few seconds of each other, as checkpoint 7 settled. The map on the projector shows the count and the anonymous web. *30 Oct:* the point is hidden, or part of a partner's booth, and the two guests' tokens must be of different kinds. *Changed 2 Nov* (BAC-116): connections are the grad tea's Must, made first by two phones and each other's tokens, with the answers game on top ("The answers game", below). The connection point is added only if there's time. *3 Nov:* a connection shows the pair's percentage match, and a token's kind is its colour (HAR-30).
- *Dropped 30 Oct* (the 29 Oct answers, item 7): **Find Gatsby** (BAC-96, HAR-23, FRO-88), the stretch game, with a go or no-go at the meeting on Thu 5 Nov. One of the group carries a hidden station. The fixed stations sense its radio signal and say hot, warm or cold on a tap, and a participant who finds the person taps their key on the hidden station. If the radio readings misbehave on the night, Gatsby checks in instead. As he moves, he taps a crew key, a token owned by an organizer, at a fixed station. The phone and the map then show where he was last seen, such as "last seen near the drinks". At the showcase the game becomes "the android among us". UWB boards are ordered (HAR-22), and are shown first as a demo of their own on a laptop. They join the map only after a go.
- **One more game may join** (BAC-98, 28 Oct): the roaming station, which one of the group carries to the area with the fewest visitors, or students' picks, where exhibiting students tap the booths they'd recommend before the parents arrive. The meeting on Thu 5 Nov picks one or neither. *Changed 30 Oct:* neither. After a passport tap, the station names the visitor's next stop, the quietest booth they haven't stamped (BAC-98, BAC-111, HAR-28).
- **Token kinds** (30 Oct; BAC-113, HAR-29, FRO-103): each token's kind opens its own screen on the phone, and a connection counts only between two kinds. Joshua's outfit dresses each guest's avatar from their stamps (FRO-105); the showcase has the spaceship instead (FRO-104). *3 Nov:* at the grad tea the kind is the token's colour (HAR-30), and the avatar's base comes from the guest's answers, with a piece for each connection (FRO-109).
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

- **Backend:** BAC-89 (the booth on the station), BAC-90 (each station's game), BAC-119 (the answers, merged 3 Nov), BAC-120 (connections by phone and the match, merged 3 Nov), BAC-121 (the hunt, if there's time), BAC-83 and BAC-86 (the connection point, if there's time), BAC-96 and BAC-91 (Find Gatsby, cancelled 30 Oct), BAC-98 (the next stop, 30 Oct), BAC-111 (the station's lines), BAC-113 (token kinds) and BAC-99 (the group's link with the stamp, if it fits). The grad tea's name in `EVENT_SERVICES`, "Grad Tea", went in with the spec (BAC-88). BAC-92 (the quiz) and BAC-93 (the trail) are cancelled.
- **Content and the venue:** BAC-94 (the clue cards, the grad tea's printed by Wed 11 Nov and the showcase's by Sat 14 Nov) and BAC-95 (the MPH, with Mr Yaseer).
- **Screens:** FRO-83 (moving stations and setting their games), FRO-84 (the map shows each station's game), FRO-85 (the Gatsby look), FRO-88 (Find Gatsby, cancelled 30 Oct), FRO-103 (the token page per kind), FRO-104 (the spaceship, proposed), FRO-105 (Joshua's outfit at the grad tea), FRO-109 (the avatar from answers and connections), FRO-110 (the token page's half of a connection), FRO-111 (the questions), FRO-112 (the reveal and the match), FRO-113 (the web on the map) and FRO-89 (the button to the group's page, if BAC-99 merges). FRO-86 (the quiz) and FRO-87 (the trail) are cancelled.
- **Stations:** HAR-21 (the tests), HAR-22 (the hardware order, with the UWB boards), HAR-23 (Find Gatsby's firmware, cancelled 30 Oct), HAR-28 (the station shows its lines), HAR-29 (the token writer writes each kind, and the veteran tokens), HAR-30 (each grad tea token's kind is its colour), HAR-24 (the e-paper map card, as a report iteration), HAR-25 (the hexagon collectible, urgent) and HAR-26 (each partner station's NFC sticker and QR code).

Done when the grad tea has run on production, and the observers' counts and the copy taken at its end give its results.
