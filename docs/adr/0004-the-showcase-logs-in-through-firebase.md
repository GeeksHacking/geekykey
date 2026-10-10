# The showcase logs in through Firebase, not the Portal

At the capstone showcase, people log in through Firebase Authentication instead of the GeeksHacking
Portal: with Google, or with GeeksHacking's own login, added to Firebase as an OpenID Connect
provider, for people who have a GeeksHacking account. A user ID at the showcase is a Firebase UID.
The showcase's claims are deleted with the rest of its data, not copied to the Portal. Decided 8 Oct
2026 by Julian and Qing Guan at the meeting with Adam, with Adam's calls the same day. This narrows
[ADR 0002](0002-each-service-logs-in-through-the-portal.md): each service still logs users in
itself, but at the showcase the login is Firebase's.

**Why.** The showcase's visitors are mostly not GeeksHacking members. Logging them in through the
Portal would leave hundreds of one-day accounts in GeeksHacking's user database once the showcase is
taken down. Firebase keeps them in a project of their own. GeeksHacking's login stays available
inside Firebase for those who have an account (Julian). It also takes the Portal off the login's
path: the request for two OAuth apps had waited since 1 Oct, and the Sprint 2 A/B test needs a login.

**Considered options.**

- **The Portal for everyone,** as ADR 0002 planned. Rejected for the user-database mess, and because
  the Portal's GitHub-only login screens out casual visitors, which suits hackathons, not a showcase.
- **Google sign-in only.** Simpler, and still the fallback if Mr Pang doesn't want GeeksHacking's login
  offered at the showcase.

**Consequences.**

- We use our existing Firebase project, and Julian links GeeksHacking's billing account to it,
  because an OpenID Connect provider needs Firebase's Identity Platform upgrade. Google sign-in is free
  for up to 50,000 users a month; OpenID Connect sign-ins are free for 49 users a month, then
  US$0.015 each.
- How a service checks the login is provisional: the screens sign in with Firebase's SDK and send the
  ID token to their own service, which checks it against Google's public keys and sets its own cookie.
  It holds if a Worker can do this within the free plan's CPU time, which Adam checks before
  checkpoint 5.
- Because showcase users aren't Portal users, "Copy claims to the Portal" is dropped, and the Portal's
  tag APIs start empty after the switch. The QR fallback can't scan the Portal's participant QR code.
- Another team's Event Service at the showcase would log in through the same Firebase project, so its
  user IDs match ours.
- Events after the showcase log in through the Portal, as ADR 0002 describes, and Firebase's login
  is turned off once the showcase's data is deleted (Adam, 10 Oct 2026). Firebase is for the
  showcase's visitors only: after it, the GeekyKey Service finds token owners through the Portal's
  tag APIs, which know Portal users, not Firebase UIDs, and hackathon participants already have a
  Portal account. Nothing moves across, because the showcase's users and claims are deleted. The
  Firebase project itself stays, since it's also the Event Service's Google Cloud project.
- So only the step where someone proves who they are is Firebase's. The cookie each service sets
  afterwards doesn't depend on it, and the Portal's `/auth/login` and `/auth/callback` replace it
  after the showcase.
