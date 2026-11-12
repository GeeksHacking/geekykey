# GeekyKey

Users claim NFC tokens and tap them at stations during GeeksHacking events. Each event runs one or
more games, such as the passport, where participants collect stamps and points.
This file names the domain. The wire format, field names and status codes live in
`apps/API-AGREEMENT.md`.

## Language

### Services

**Portal**:
GeeksHacking's identity service. It knows every GeeksHacking member, and will know which tokens each
user has claimed. Until it can, the claims stand-in holds them. At the showcase, people log in
through Firebase instead (ADR 0004).

**GeekyKey Service**:
The service that stations and tokens talk to. It checks each station's key against the stations
the Event Services have registered, asks who owns the token that was tapped (the claims stand-in,
later the Portal), and hands the tap to the Event Service that registered the station.
_Avoid_: NFC Key service, backend

**Claims stand-in**:
The temporary keeper of claims until the Portal can hold them. It answers the same questions the
Portal will, and only the GeekyKey Service talks to it. It sits beside our Event Service but is not
part of any Event Service.
_Avoid_: tokens service

**Event Service**:
The service that runs one event's games. It receives each tap as a user and a station, and
decides what the tap counts for.
_Avoid_: backend

**Hand-off**:
The GeekyKey Service passing a station's taps, as users, to the Event Service that registered the
station. The Event Service answers with a status for each tap.
_Avoid_: trigger, forward

**Event Service key**:
The secret one Event Service shares with the GeekyKey Service, which the GeekyKey Service sends with
everything it asks of that Event Service.
_Avoid_: API key

### Users, tokens and stations

**User**:
A person who has logged in: through Firebase at the showcase, through the GeeksHacking Portal at
later events. Their user ID comes from that login. At an event, a user is a participant or an
organizer.
_Avoid_: portal user, account

**Guest**:
A user who logged in at the showcase with one tap and no account. Being a guest is how someone
logged in, not a role: a guest can be a participant like anyone else. Their user ID lasts only as
long as the browser keeps their login. Signing out warns them, releases their tokens, logs them out
of both sets of screens and ends that login for good, and their connections and points stay as they
are. A guest who loses their login
any other way can't get their tokens back, and a GeekyKey admin releases them.
_Avoid_: anonymous user, visitor

**GeekyKey admin**:
A GeeksHacking person who can release other people's tokens, by tapping them, and load token
kinds. They can also inspect every token's UID and current claim, and remove an unclaimed
token from the kinds list (BAC-152). Not a role at any one event, and not in charge of stations, which belong to each event's Event Service.
_Avoid_: admin, organizer

**Token**:
A physical NFC tag claimed by one user and identified by its hardware UID. It stays theirs across
events, and a user may hold a few, up to a set number.
_Avoid_: tag, card

**Token kind**:
What sort of token a token is, written onto it with its address when it's made, such as one of
the showcase's houses or a veteran token. GeekyKey keeps it with the token across events, and each
event decides what a kind does there. A token's kind can be its colour (HAR-30). Otherwise it shows
only on screens and stations (ADR 0006).
_Avoid_: class, type; "house" is the showcase's name for four of its kinds

**Token design**:
The printed shape around a token's NFC tag, such as the hexagon or a keychain. It can change from
event to event, and it says nothing about the token's kind.
_Avoid_: shell, form factor

**Claim**:
Binding an unclaimed token to yourself by tapping it with your phone, or typing its UID, and logging
in.
_Avoid_: pair, register

**Release**:
Giving up a claim on a token, for example a lost one, so anyone can claim it again.
_Avoid_: unpair, revoke

**Owner**:
The user who has claimed a token, who may not be the person holding it.
_Avoid_: holder

**Token page**:
The GeekyKey Service's page that a phone opens when it taps a token. It lets a user claim an
unclaimed token, and shows the owner their own token with a way into each event. When anyone else
opens it, the page sends a half by itself and shows what came of it. They see that the token is
taken and, once the half is answered, the owner's name if they have one of their own (BAC-143) and
their bio if they have one (BAC-151). A GeekyKey admin sends no half, sees neither and can also
release the token there.

**Login link**:
A short-lived link from the GeekyKey Service's pages that logs a user in to an event's screens as
the same user, so they don't log in a second time. It is the only way a guest reaches an event. A
link also goes the other way, from an event's My tokens to the GeekyKey screens, so a guest whose
sign-in there is gone gets back to their own tokens (ADR 0007).
_Avoid_: hand-over, pass, which reads like passport

**My tokens**:
The GeekyKey Service's page listing the tokens a user has claimed, where they can release one they
can no longer tap, such as a lost token.

**Station**:
One tap point at one event, registered by that event's Event Service, with its own station key.
Its hardware lent to another event becomes a new station there. It runs one of the event's games,
or none, as an organizer chooses, and that game sets what a tap there counts for, such as its
station points. An organizer can change the station's game at any time, since each tap records
the game that counted it or held it back. An organizer can disable a station, turning away
everything it sends until it is enabled again.
_Avoid_: reader, device

**Station hardware**:
The box itself: the ESP32, its RC522 and its screen. It is one station at a time. Moved to another
event, it becomes a new station there, with that event's station key.
_Avoid_: reader, which means the RC522 alone

**Setup mode**:
How someone with a USB cable gives station hardware a new server address, station key or Wi-Fi
network without a reflash. A replaced key keeps it the same station; a move to another event makes
it a new one, so its saved taps are sent first and the rest are cleared.

**Setup page**:
A browser page that takes someone through a station's setup mode over a USB cable, without a
terminal.
_Avoid_: flasher, which would reflash the station

**Station key**:
The secret a station sends with every request to prove which station it is, issued by the Event
Service that registered it. It is shown once, when the station is created or its key is replaced.
Replacing the key keeps it the same station.
_Avoid_: API key, bearer key

**Registered stations**:
What an Event Service tells the GeekyKey Service about its stations: each enabled station and the
hash of its key, never the key itself. The GeekyKey Service checks station keys against its copy of
every Event Service's registered stations, and a station feeds the Event Service that registered it.
_Avoid_: station list

**Tap**:
One reading of a token at a station. A tap by a claimed token reaches the station's event, which
records it with a status whether or not it counts. A tap by an unclaimed token is turned away
before it reaches any event.

### Events

**Event**:
One GeeksHacking event, such as the capstone showcase, running one or more games.

**Game**:
One activity inside an event that stations feed, such as the passport or a treasure hunt.
_Avoid_: experience

**Participant**:
A person attending the event who gives a name and every answer before opening the event's screens
or connecting (BAC-144), then collects stamps by tapping a token at stations. At the showcase
that includes the parents and mentors who visit in the afternoon.
_Avoid_: visitor

**Organizer**:
Event staff who create the event's stations, look after them on the day and can log a tap on a
participant's behalf. A role at one event, not a kind of user: an organizer at the showcase can be
a participant at the next event.

**Station board**:
The organizers' screen showing each of their event's stations, whether it is working, and when it
was last tapped. Organizers also create stations there, replace their keys, and disable or enable
them.
_Avoid_: station list

**Map**:
The screen at the event's own booth that draws the floor plan, each station at its booth with the
game it runs, and a pulse as each tap arrives there. It shows counts, never names.
_Avoid_: big screen, which is only the display it runs on; dashboard

**Booth**:
A named place on the event's floor plan where a station stands. The floor plan says where each
booth is; each station says which booth it stands at, whatever game it runs, so a station can
move booth without becoming a different station.
_Avoid_: location, which is the text a participant reads in the passport; spot

**Connection**:
A link between two participants of different kinds, or, when organizers choose it, of different
groups (BAC-140). Since 5 Nov it's made when one taps their phone on the other's token and the other
accepts, with the Accept button or by tapping back (BAC-149). It joins two users, never two tokens,
so nobody connects to themselves, and a pair connects once however often they tap. Each new connection keeps one die roll per person,
chosen by the Event Service when they connect; the higher roll wins, and equal rolls win for
both (BAC-150). Older connections have no rolls. Since BAC-156 the Event Service picks the dice
or the reaction test at random for each new connection, unless organizers have chosen one
(BAC-161). In the reaction test each person taps
their own phone when it turns green, within 2 minutes of connecting, and the faster time wins.
_Avoid_: dual tap, link between tags

**Team duels**:
A station game where the first tap opens a round for 30 seconds. Everyone who taps in joins,
then the Event Service spreads each group across two teams and pairs opponents across groups
where it can. The round makes no connections. Players tap their opponents' tokens to connect.

**Round**:
One gathering of players at a team duels station. After 30 seconds its teams play the event's
chosen challenge. The team with more duel wins wins the round, and equal scores win for both
teams. A round where no duel was won is a win for nobody. One player alone gets no opponent and
no win.

**Duel**:
One pair of opponents on different teams playing the dice or the reaction test in a round.
With an odd number of players, one player on the smaller team plays two duels.
_Avoid_: connection, which players make separately

**Challenge**:
What a new connection or a team duels round plays: the dice or the reaction test. The connection
keeps its result, and a win or a tie can earn a reward. Organizers choose on the Groups screen whether each new connection
gets one at random, which a new event starts on, or always the dice, or always the reaction test.
A change applies to connections made after it (BAC-161). The API still calls the connection's
field `game`.
_Avoid_: game, which is an activity that stations feed

**Bio**:
A short piece of free text a user writes about themselves. The people they have connected with
see it, and so does anyone who taps their token. Anyone whose token they tap sees it in the
connection request. It's always the current value (BAC-147, BAC-151).

**Contact line**:
One line of free text a user writes so that people can reach them, such as a Telegram handle. It
shows only to the people they have connected with, beside their bio, and always the current value
(BAC-147).

**Connection rule**:
What two participants need to connect, which organizers switch on the Groups screen during an
event: different token kinds, which a new event starts on, or different groups, whatever their
tokens. The Event Service judges each tap and each accept by the rule and the groups at that
moment. Across groups, someone not placed in a group connects with nobody.
_Avoid_: mode, game type

**Half**:
One participant's phone tapped on the other's token. The first half sends a connection request, and
a half back accepts it.
_Avoid_: pending connection

**Connection request**:
What a half asks of the token's owner, who sees it on their dashboard with the tapper's name and
bio and accepts or declines it. It has no time limit, so it stays until they answer or the event is
cleared. Declining is silent, and tapping again sends a new one (BAC-149). Viewing someone's profile
needs no request.
_Avoid_: invitation, friend request

**Connection point**:
Where participants tap together to connect: one station, or a few stations linked to act as one.
Its stations count only for connections, not for the passport. Since 4 Nov it isn't planned
(BAC-83 was canceled).

**Answers game**:
The game on top of connections. Since 4 Nov it's variation 1, the token game, of the two variations
Mr Johari asked for. Each participant answers the event's multiple-choice questions, and a connection
shows the pair their **match**, the share of the questions both answered where they picked the same
choice. What they share is shown 2 minutes later, so they talk first. A participant's first
connection fixes their answers. It was first planned for the grad tea, which was scrapped on 3 Nov.
The hunt for one person to find was canceled on 4 Nov (BAC-121).
_Avoid_: quiz, which was the dropped speakeasy game

**Group**:
A set of participants at one event, made by organizers. A participant is in at most one group. It
isn't a hackathon team or a capstone group, which passport links also call a "group". Groups are
variation 2 of the two Mr Johari asked for; variation 1 is the answers game.

**Joining**:
A participant telling the event they're here, so they can be put in a group. It doesn't replace the
Portal's check-in.

**Allocation**:
Placing joined participants in groups, either all together when an organizer starts it, or one at a
time after that.

**Latecomer**:
A participant who joins after allocation has started.

**Phrase**:
A few words an organizer types on the Groups screen for participants to complete. An event has one
phrase or none, and with none the activity is off. Completing it adds no points and no avatar
piece.

**Word**:
One place in the phrase, which a participant in a group holds. A participant has their own word
and the word of each person they have a connection with. While the event connects across token kinds and has more than one group, no group's members hold
every word between them, so completing the phrase takes people from other groups. While it
connects across groups, that is so anyway, and a group may hold every word.
_Avoid_: clue, piece, which is part of the avatar

**Accepted tap**:
A tap that counts in at least one of the event's games, such as toward passport stamps and points.

### Passport

**Passport**:
All of one participant's stamp slots, one for each station the passport counts. The Event screens show it at `/passport`. The dashboard at `/` is another screen, and it's where a login link lands.
_Avoid_: stamp book

**Stamp slot**:
A station's place in a participant's passport, either empty or stamped.
_Avoid_: empty stamp

**Stamp**:
What fills a stamp slot, earned by the participant's first accepted tap at that station that the
passport counted. Another game's taps there never earn one.

**Next stop**:
The passport station a station names after a passport tap: the quietest one the participant
hasn't stamped yet, from the last few minutes' taps. It changes with the crowd, so two people at
the same station can be sent to different booths.
_Avoid_: route, which suggests a fixed order

**Station points**:
What one accepted tap at a station is worth in the passport. The passport sets it per station, so
one station can be worth different points at different events.

**Points**:
A participant's total: station points summed over all their accepted taps, so a repeat visit
after the cooldown earns again, plus 1 for each connection, whatever its match.
_Avoid_: score

**Cooldown**:
The window after an accepted tap during which the same participant's taps at the same station are
recorded but do not count. The Event Service's base keeps it, and each game chooses whether to use
it. The passport does. A game's cooldown starts only from the taps that game accepted.
