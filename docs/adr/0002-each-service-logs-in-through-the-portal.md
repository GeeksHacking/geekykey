# Each service logs users in through the Portal itself

The GeekyKey Service and every Event Service each log users in through the GeeksHacking Portal on
their own, with their own `/auth/callback`, their own redirect URL registered with the Portal, and
their own session cookie on their own hostname. Neither trusts the other's login. The Portal is the
only identity provider, and an Event Service built by another team, on a domain we don't control,
has to log in the same way ours does. Decided 28 Sep 2026 by Adam, in the wayfinder ticket "Which
screens belong to which service, and how does each know who is logged in?".

**Considered options.** The Event Service could trust the GeekyKey Service's login, either through
a cookie shared on a parent domain or through a signed ticket the GeekyKey Service passes across.
Both would make the GeekyKey Service a second identity provider, and a shared cookie could not reach
an Event Service on another domain.

**Consequences.** Someone who uses both services' screens, for example claiming a token and then
opening the passport, logs in twice. If the Portal remembers them, the second login is only a quick
redirect. Each service has its own `SESSION_SECRET`, and the two cookies have different names
(`gk_session` and `event_session`), because cookies on `localhost` ignore the port and would
otherwise overwrite each other in local development.
