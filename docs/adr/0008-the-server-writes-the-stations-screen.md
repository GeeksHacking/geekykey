# The server writes the station's screen

A station's screen said the same thing whichever game it ran. HAR-47 made it show the two `lines`
its game sends after a tap. Two gaps remained. Nothing on the screen moved: team duels sends
`3 in, 12s left`, and the screen held that number until someone else tapped. And every station
idled on `Ready` / `Tap a tag`. Decided with Adam on 11 Nov 2026 and built for the agreement's
next version (BAC-181), before the showcase, because the relay (BAC-184) counts down a transfer's
20 seconds on its first station.

**Why.** The station hears from the server only in a tap's answer and in a heartbeat every 60
seconds. Games change often, and the firmware changes rarely: a reflash needs a USB cable at
each station. A screen whose words live in the firmware lags every new game by a reflash.

**Considered options.**

- **The firmware knows each game's screens.** Rejected: every new game, and every change of
  wording, needs a reflash of every station.
- **The station polls the server for its screen.** Rejected: a request a second from each station
  costs the Worker's CPU and the station's rate limit (60 requests a minute), and a tap read during
  a request is lost.
- **The server writes the screen, and the station runs a countdown itself.** Chosen. A tap's
  answer can give `countdown`: a number of seconds, lines with `{s}` for the seconds left, and the
  lines for zero. The heartbeat's answer gives the idle screen as `idle_lines`, which the GeekyKey
  Service takes from the registered stations it already keeps.

**Consequences.**

- The firmware knows no games. It keeps only the screens it has to show alone: the click on
  reading a tag, no Wi-Fi, a saved tap, a wrong key and setup mode.
- `seconds` counts from when the answer was made, not to a time of day, so a station with a wrong
  clock still counts correctly. It is at most 99, so `{s}` fits the 2 characters a line counts it
  as.
- A change of a station's game reaches its idle screen within about two minutes: up to one for the
  GeekyKey Service's copy of the registered stations, and up to one for the next heartbeat.
- News from somewhere else, such as a round's result or another station's transfer, can't reach
  the screen this way. It needs the server to push to the station, which BAC-182 adds with a
  held-open connection. The countdown stays for a screen that ticks, and the heartbeat's
  `idle_lines` stays as the idle screen of a station whose connection is down.
- The services go out before any firmware. A station ignores fields it doesn't know and shows
  `lines`, so no station needs a reflash on a deadline (HAR-50 adds both to the firmware).
