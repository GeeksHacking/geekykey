# Guests at the showcase reach the passport through a login link

At the capstone showcase, someone can log in on the GeekyKey screens as a guest: one tap, no
account, through Firebase's anonymous sign-in. The event buttons on the token page and My tokens
then open a login link, which logs the user in on the Event screens as the same user. Every user
gets the link, not only guests. Decided 21 Oct 2026 by Adam (BAC-54), to be agreed with Julian and
Qing Guan on 23 Oct, since it adds a way to sign in to
[ADR 0004](0004-the-showcase-logs-in-through-firebase.md).

**Why.** The showcase has two segments: the judges' booth visits in the morning, and the public
segment after lunch, when parents and mentors visit. A tap by an unclaimed token is never stored,
so it can't be credited after a claim (API agreement 8.2), and every participant logs in and
claims a token before their first stamp. On a phone that isn't signed in to Google, which is common
in Safari on an iPhone even when the Gmail app is, Google sign-in means typing an email address, a
password and perhaps a second step. That is where a casual visitor gives up.

A guest's sign-in lives in one browser on one hostname, because Firebase keeps a sign-in per
hostname. A guest who signed in on `key.` would be a different guest on `event.`, with an empty
passport. So guests need a way across, and the login link is it.

**Considered options.**

- **Google sign-in only, with helpers at a desk.** Nothing to build, but it needs several helpers
  at the start of the public segment, and a visitor who won't sign in gets no stamps. The desk
  stays anyway, for people who want help and for releasing a lost guest's token.
- **Storing taps by unclaimed tokens, and crediting them at the claim.** Ruled out. The GeekyKey
  Service has no database to keep them in
  ([ADR 0003](0003-event-service-on-cloud-run-geekykey-service-without-a-database.md)), and the
  Event Service never sees a token's ID.
- **A Firebase custom token, as the way across.** The Event Service wouldn't change. Rejected
  because it needs a Google service-account key on the GeekyKey Worker that can mint a login for
  any user, which an organisation policy may block, and RSA signing that hasn't been measured
  against the free plan's 10 ms of CPU.
- **A signed login link, as the way across.** Chosen. It costs a new route on the Event Service
  beside `POST /auth/firebase`, but a leaked key can only log someone in to that one Event
  Service, and HMAC signing costs next to no CPU. Its key is derived from the Event Service key,
  so nobody sets a new secret.

**Consequences.**

- A guest's user ID lasts as long as their browser keeps the sign-in. In private browsing, or
  after clearing site data, it's gone, and so is their claim. A GeekyKey admin at the desk releases
  that token so they can claim it again.
- The GeekyKey screens log a returning user in again by themselves while Firebase still has them,
  because the login would otherwise make a new guest.
- Guests start only on the GeekyKey screens. The Event screens don't offer a guest sign-in.
- A guest's login carries no name, so anyone can set the name the event shows, and a name a user
  sets is never replaced by a login. A new user with no name is `Guest`.
- In Firebase, the Anonymous provider is turned on, and anonymous accounts are deleted after 30
  days. Firebase allows 100 new accounts an hour from one IP address, so the limit is raised for
  the rehearsal on 7 Nov and for 17 to 18 Nov, when visitors share the venue's Wi-Fi.
  *Changed 27 Oct 2026 (BAC-88):* Firebase holds one scheduled limit at a time, and it's 800 an
  hour on Thu 12 Nov for the grad tea, which runs on the same Event Service before the showcase.
  So the rehearsal keeps the usual 100 an hour, and Adam schedules the showcase's raise, for
  Tue 17 Nov, on 13 Nov or later, once the grad tea's has ended (BAC-97).
- A guest can't be turned into a Google account at the showcase. That waits in the backlog.
- After the showcase, guests and login links go with Firebase's login. A login link between the
  GeekyKey screens and an event could still be useful with the Portal, which is decided then.
