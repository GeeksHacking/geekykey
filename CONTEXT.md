# GeekyKey

Participants at a GeeksHacking event tap NFC tokens at stations to collect stamps and points.
This file names the domain. The wire format, field names and status codes live in
`apps/API-AGREEMENT.md`.

## Language

### Event

**Participant**:
A person attending the event who collects stamps by tapping a token at stations.

**Organizer**:
Event staff who run the stations and can log a tap on a participant's behalf.

**Station**:
One tap point at the event, a physical NFC reader with its own station key, worth a fixed number
of station points.
_Avoid_: reader, device

**Station key**:
The secret a station sends with every request to prove which station it is, shown once when the
station is created.
_Avoid_: API key, bearer key

**Token**:
A physical NFC tag paired to one participant and identified by its hardware UID. A participant
may hold several.
_Avoid_: tag, card

**Tap**:
One reading of a token at a station, recorded with a status whether or not it counts.

**Accepted tap**:
A tap that counts toward stamps and points.

**Cooldown**:
The window after an accepted tap during which the same participant's taps at the same station
are recorded but do not count.

### Passport

**Passport**:
All of one participant's stamp slots, one per station.
_Avoid_: stamp book

**Stamp slot**:
A station's place in a participant's passport, either empty or stamped.
_Avoid_: empty stamp

**Stamp**:
What fills a stamp slot, earned by the participant's first accepted tap at that station.

**Station points**:
What one accepted tap at a station is worth.

**Points**:
A participant's total: station points summed over all their accepted taps, so a repeat visit
after the cooldown earns again.
_Avoid_: score
