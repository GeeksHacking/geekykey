# The Event Service runs on Cloud Run, and the GeekyKey Service keeps no database

The Event Service runs on Google Cloud Run (v1), with TiDB as its database. The GeekyKey Service
stays on Cloudflare Workers and keeps no database of its own: it calls the Portal's APIs, the Event
Service's APIs, or both, and at most keeps a cache. Stations are registered by the Event Service, and
the tables the GeekyKey Service held move there. Decided 2 Oct 2026 by Julian, at the mentor meeting
and in the WhatsApp thread after it. This reverses the 25 Sep 2026 call that the whole backend runs on
Workers, not Cloud Run.

**Why.** Hyperdrive, Cloudflare's way for a Worker to keep database connections open between
requests, can't connect to TiDB Cloud: TiDB Cloud's gateway asks every client to sign in a second
time (a MySQL AuthSwitchRequest), and Hyperdrive doesn't support that. Without it, a Worker opens a
new TLS connection and signs in on every request. Measured from a Worker in Singapore, that cost
about 20 ms of CPU per tap with `mysql2`, and about 7 ms with TiDB's serverless driver. GeeksHacking's
Cloudflare account is on the free plan, which allows 10 ms of CPU per request. A server on Cloud Run
keeps an ordinary connection pool open between requests, so a tap doesn't sign in again. Julian also
holds that the GeekyKey Service has nothing of its own to store: everything it would keep is a copy
of something the Portal or an Event Service owns, and copies drift and clash.

**Considered options.**

- **Workers Paid ($5 a month) with `mysql2` straight to TiDB.** Workers Paid allows 30 s of CPU per
  request, and the code was nearly ready. Julian was told this after the meeting and still chose the
  split, so the GeekyKey Service is the only part on Workers and it stays on the free plan.
- **TiDB's serverless driver on the free plan.** It fits, at 7 ms of 10. But laptops and CI can't run
  it against TiDB in Docker, so production would run a driver that dev and CI never test.
- **Postgres on Neon through Hyperdrive, or D1.** Both work on Workers, but both replace TiDB, which
  the mentors set as the database on 24 Sep.

**Consequences.** We run on two platforms, so there are two ways to deploy, two places to read logs
and two sets of access to ask Julian for. The hand-off from the GeekyKey Service to our Event Service
goes over HTTPS instead of a service binding, the same way other teams' Event Services already reach
it. The event's screens stay on a Cloudflare Worker that forwards `/api` and `/auth` to Cloud Run over
HTTPS. Questions this leaves open, such as where token owners live before the Portal's tag APIs exist
and how a station is checked without a `stations` table, are tickets on the `db-hosting` map, redrawn
on 2 Oct 2026.

**Amended 7 Oct 2026,** once the redrawn map's tickets were answered. The `tokens` table didn't move
into the Event Service. It sits beside it on our Cloud Run server, as a claims stand-in that only the
GeekyKey Service calls, so token IDs still never reach an Event Service, and it is deleted when the
Portal's tag APIs take over after 18 Nov. The GeekyKey Service's only cache is a copy in memory of
the stations each Event Service has registered; it keeps no cache store before that switch. What
Julian meant by "v1" is still to be asked. The setup copies the Portal's, whose address is a Cloud Run
domain mapping, which only Cloud Run's v1 interface offers. The details are in the migration spec,
`.scratch/db-hosting/spec.md`, section 3.

**Asked on 8 Oct 2026:** Julian finds Cloud Run's v2 costs noticeably more, so we stay on v1 unless
we need a v2 feature. We read that as the v1 interface, which the domain mapping needs, and the
first-generation execution environment. Whether he meant both is still to confirm (the spec,
sections 2 and 12).
