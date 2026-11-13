# The GeekyKey Service carries station messages in a Durable Object

Each station holds one WebSocket open to the GeekyKey Service. An Event Service can send a station
a **station message**, one or two lines for its screen with an optional countdown and beep, with no
tap. The GeekyKey Service passes it down that station's socket. The sockets live in a Durable
Object, the GeekyKey Service's first, which holds connections and nothing else. Decided by Adam on
11 Nov 2026, when he triaged BAC-182 for the relay (BAC-184), and built on 13 Nov 2026. It amends
[ADR 0003](0003-event-service-on-cloud-run-geekykey-service-without-a-database.md), which says the
GeekyKey Service keeps no database.

**Why.** A station heard from the server only in a tap's answer and a heartbeat's
([ADR 0008](0008-the-server-writes-the-stations-screen.md)). The relay needs one station's screen
to change when someone taps at the other. Team duels plays its rounds on phones, so the station
can't show who won. An organizer's change of game takes about two minutes to reach the idle screen.

**Considered options.**

- **A bounded check-back.** A tap's answer tells the station to ask again in 10 seconds, a few
  times. Rejected: a station asks only after a tap of its own, so a tap at one station can never
  change another, which is what the relay needs. A tag read during a request is also lost.
- **A WebSocket held by the Worker itself.** Rejected: Cloudflare drops the connection when the
  Worker's isolate is evicted, and its docs say to hold long-lived connections in a Durable Object.
- **A Durable Object with the Hibernation API.** Chosen. Cloudflare keeps a hibernating object's
  sockets connected and doesn't bill it for duration while it sleeps. A message wakes it. The
  station's `ping` gets an automatic `pong` without waking it. SQLite-backed Durable Objects are on
  the free plan, which GeeksHacking's account uses. Each station has its own object, so a message
  can only reach the station it names.

**The rules stay in the Event Service.** The object knows no games. It doesn't decide what a message
says, when it goes, or what happens when it's missed. Each game lives in one Event Service, with its
state in TiDB, and the GeekyKey Service would need a copy of that state to decide anything. ADR 0003
rejected copies, because they drift and clash. Other teams' Event Services can send messages for
their own games the same way, without a change to the GeekyKey Service.

**It holds no data.** The object never writes to its storage. It holds the open sockets, which close
when a station goes away, and keeps nothing for a station that isn't connected. A message for a
station with no socket is dropped, not saved, and the Event Service is told. So ADR 0003's rule
still holds in substance: the GeekyKey Service keeps no record of its own.

**Consequences.**

- The Event Service calls the GeekyKey Service for the first time (the agreement's 11.12). It
  sends the Event Service key it already shares, so no new secret is needed.
- A game must work without its messages. A station whose socket is down, or firmware from before
  the socket, still shows each tap's answer and the heartbeat's idle screen.
- The firmware holds a second long-lived TLS connection and reconnects when the venue's Wi-Fi drops
  it (HAR-51).
- The Worker gets a Durable Object binding and a migration in `wrangler.jsonc`. A staging copy of
  the Worker, `geekykey-service-staging`, gets them first, deployed by hand. Until now there was no
  staging copy of the Workers.
- Each station's object is placed near Singapore, where Cloud Run runs, so a message from the Event
  Service doesn't cross the world on its way to the station.
