# A token carries its kind

Each token has a kind, such as one of the showcase's four houses or a veteran token. The token
writer writes the kind into the token's address as a one-letter code, `/t/<UID>?k=E`, and logs
each UID with its kind. That log becomes a list beside the claims stand-in. The token page reads
the code from its address, so a phone tapped on the token opens that kind's screen before anyone
logs in. The GeekyKey Service reads the kind from its list, and passes it to the Event Service
with each tap and in the login link. Games use only the list. Decided 30 Oct 2026 by Adam, after
the meeting with Julian on 29 Oct (BAC-112, BAC-113). The agreement's part waits for Ethan's
approval.

**Why.** Julian wants different tokens to open different experiences: one group gets one set of
instructions, another a different set, and people only work out why when they see someone else's
screen. Paper can't do that. For the surprise to work, the first screen has to differ already,
before the visitor logs in or answers anything, and nothing on the outside of the coin gives the
kind away. All coins look the same.

The token page looks nothing up before login (API agreement 8.5), so the phone has to learn the
kind from the token itself. The token writer already writes each token's address under a write
password (`firmware/token_writer`), so a code added to it can't be changed with a phone. The
code fits in the 56 bytes the writer already uses.

**Considered options.**

- **Each event gives its users a kind,** in turn or at random, at their first tap or first visit
  to the passport. The cheapest: no change to GeekyKey, the stations or the hand-off. Rejected
  because the first screen can't differ, and a kind that the passport has to ask for ("what colour
  is your coin?") gives the surprise away.
- **The stations read the code from the token and send it with each tap.** The token is the only
  copy, so nothing can disagree with it. Rejected for the showcase because it changes every
  station's firmware and the station's tap upload (agreement 6.1), when Zi Tao already has the
  second reader for connections, the station's lines (HAR-28) and the coins.
- **A lookup by UID before login,** so the token page asks the GeekyKey Service for the kind.
  Rejected: it's a new call with no login, and the address already carries the code for free.
- **The code in the address, and a list on the server.** Chosen. The phone gets the kind with no
  server call, and the server has a copy a browser can't edit.

**Consequences.**

- The kind is kept in two places: in the token's address and in the list. The token writer makes
  both in the same step, so they match. A token written with the wrong kind is fixed in the list,
  and its address is rewritten with the password.
- Someone who edits `k` in their browser changes only what their own phone shows. Every game reads
  the kind from the list, through the hand-off and the login link.
- The kind belongs to the token, not to one event. GeekyKey keeps it across events, and the clear
  between the grad tea and the showcase keeps the list. Each event decides what a kind means: at
  the showcase, four houses and `veteran`. Julian's sponsor, organizer and teacher tokens, and
  tokens limited to one year's event, would be kinds too.
- The token's ID is still its hardware UID ([ADR 0001](0001-token-id-is-the-hardware-uid.md)), and
  an Event Service still never sees a UID (agreement 11.8). It sees only the kind.
- A token written before 30 Oct has no code, so its page shows today's screen, and the hand-off
  gives `kind: null` until it's rewritten.
- The agreement changes: 8.1, 11.2 and 11.9 gain an optional `kind`, and section 12 drops
  "archetype quests". Ethan approves before BAC-113 merges.
- After the showcase, when claims move to the Portal's tag APIs, the list moves too, or stays as
  GeekyKey's own. That's decided at the switch.
