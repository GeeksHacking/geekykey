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
long as the browser keeps their login, so a guest who loses it can't get their tokens back, and a
GeekyKey admin releases them.
_Avoid_: anonymous user, visitor

**GeekyKey admin**:
A GeeksHacking person who can release other people's tokens, by tapping them. Not a role at any
one event, and not in charge of stations, which belong to each event's Event Service.
_Avoid_: admin, organizer

**Token**:
A physical NFC tag claimed by one user and identified by its hardware UID. It stays theirs across
events, and a user may hold a few, up to a set number.
_Avoid_: tag, card

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
unclaimed token, and shows the owner their own token with a way into each event. Anyone else sees
only that the token is taken; a GeekyKey admin can also release it there.

**Login link**:
A short-lived link from the GeekyKey Service's pages that logs a user in to an event's screens as
the same user, so they don't log in a second time. It is the only way a guest reaches an event.
_Avoid_: hand-over, pass, which reads like passport

**My tokens**:
The GeekyKey Service's page listing the tokens a user has claimed, where they can release one they
can no longer tap, such as a lost token.

**Station**:
One tap point at one event, registered by that event's Event Service, with its own station key.
Its hardware lent to another event becomes a new station there. What a tap there counts for, such as
its station points, is set by the event's games, not by the station. An organizer can disable a
station, turning away everything it sends until it is enabled again.
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
A person attending the event who collects stamps by tapping a token at stations. At the showcase
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

**Accepted tap**:
A tap that counts in at least one of the event's games, such as toward passport stamps and points.

### Passport

**Passport**:
All of one participant's stamp slots, one for each station the passport counts.
_Avoid_: stamp book

**Stamp slot**:
A station's place in a participant's passport, either empty or stamped.
_Avoid_: empty stamp

**Stamp**:
What fills a stamp slot, earned by the participant's first accepted tap at that station.

**Station points**:
What one accepted tap at a station is worth in the passport. The passport sets it per station, so
one station can be worth different points at different events.

**Points**:
A participant's total: station points summed over all their accepted taps, so a repeat visit
after the cooldown earns again.
_Avoid_: score

**Cooldown**:
The passport's window after an accepted tap during which the same participant's taps at the same
station are recorded but do not count.
