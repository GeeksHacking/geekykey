# An Event Service's login link logs a user in on the GeekyKey screens

Login links went one way: the GeekyKey Service made them, and an Event Service took them
([ADR 0005](0005-guests-reach-the-passport-through-a-login-link.md)). Now they go both ways. My
tokens on the Event screens asks the Event Service for a link, and opens it on the GeekyKey
screens, which log the same user in. Built 9 Nov 2026 for the agreement's next version (BAC-157),
after FRO-141 put it off on 6 Nov.

**Why.** A guest's sign-in lives in one browser on one hostname. A guest who signed out on `key.`,
switched browsers or cleared site data has no way back to their tokens there: the GeekyKey login
offers "Continue as guest", which makes a new guest who owns none of them. Their Event session
still knows who they are for up to 12 hours, so it can vouch for them.

**Considered options.**

- **A plain link to My tokens, as before.** Nothing to build. A Google user signs in again and is
  the same user, but such a guest can't release or see their tokens. A GeekyKey admin at the desk
  has to release them.
- **The Event Service logs the user in by calling the GeekyKey Service.** Rejected: Event Services
  never call the GeekyKey Service (API agreement section 3), and a call would need a new key.
- **A signed link, as in ADR 0005, the other way.** Chosen. Its key is derived from the Event
  Service key with its own HKDF info, so nobody sets a new secret, and a link made for one
  service's screens can't be used on the other's.

**Consequences.**

- The GeekyKey Service keeps no database
  ([ADR 0003](0003-event-service-on-cloud-run-geekykey-service-without-a-database.md)), so it can't
  remember which links were used. It asks the Event Service that made the link to mark it used
  (agreement 11.11), and the Event Service keeps the `jti` beside those of its own links. If that
  Event Service doesn't answer within 4 seconds, nobody is logged in.
- An Event Service that makes these links can log anyone in on the GeekyKey screens, so it can
  claim and release any user's tokens. The GeekyKey Service takes links only from an Event
  Service whose entry in its settings says `"login_links_to_geekykey": true`. Another team's Event
  Service leaves it out, unless GeeksHacking trusts it with every user's tokens.
- A leaked Event Service key now logs anyone in on both sets of screens, not only that event's.
  Replacing the key cancels every link not yet used, in both directions.
- A guest who arrives this way has no Firebase sign-in on `key.`. When the 12-hour session ends,
  they come back through My tokens on the Event screens again, while that session lasts.
