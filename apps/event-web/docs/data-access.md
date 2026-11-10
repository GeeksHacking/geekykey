# Data access

## Mock and live builds

Screens consume the single `ApiClient`, whether the app uses the mock or the HTTP client.
Keep data access in `src/api/`; no screen, hook or query key branches on the client mode.
The mode switch and local setup are in [the README](../README.md#mock-and-live-builds).

Build types and response schemas against [the agreement](../../API-AGREEMENT.md), including
the root [rule for drafts](../../../AGENTS.md#source-of-truth). Keep transport and response
validation in `src/api/http/client.ts`. Display the service's stamps, points and cooldowns
without recalculating them in screens.

## Server state

TanStack Query owns API data. A feature hook wraps a client method, with a key from
`src/api/keys.ts` and polling intervals from `src/lib/constants.ts`.
`src/features/stations/use-station-board.ts` is the polling example.

Choose the write pattern by what the response contains:

- When a write returns no updated record, invalidate the affected keys. Follow
  `src/features/fallback/use-log-fallback-tap.ts`: a tap changes both the log and totals.
- When a write returns the updated record, cancel an in-flight read before merging the response
  into the cache. Otherwise a late poll can overwrite the write. Follow
  `src/features/passport/use-update-me.ts`.

Read Query's pending, error and fetch state in screens. Keep API data in the cache. The
previous-render snapshot for animations is the exception described in
[design direction](design-direction.md).

The session is the `["me"]` query. A 401 returns `null` rather than throwing; `undefined` means
not fetched yet. Poll only while signed in. Sign-out clears other cached queries so the next
person on a shared laptop sees none of the previous person's data.

A login link must be sent before the first `/me` read. Keep that write inside the query function
in `src/lib/session-provider.tsx`, rather than in a separate mutation that could race the read.
See agreement [7.4](../../API-AGREEMENT.md#74-post-authlogin-link-on-the-event-service-implemented).

The scan log needs two queries: a polled head without a cursor, merged by `id` with older pages
fetched only on demand. Polling a plain infinite query would refetch every loaded page each tick.
Follow `src/features/taps/use-scan-log.ts` and agreement section 9.3.

Keep retry policy in `src/lib/query-client.ts`. Tests use the client with retries off from
`src/test/providers.tsx`.

## Errors

Read agreement [section 2](../../API-AGREEMENT.md#2-conventions) for error codes and
[section 13](../../API-AGREEMENT.md#13-screen-to-endpoint-map) for wording and screen behaviour.
[The screen rows](screens.md) describe action-specific placement and recovery.

Keep a forbidden view at the current address; redirect an unauthenticated user to login with
`return_to`. For field validation, map each issue to its field, using section 13's sentence
where one is set. `src/lib/form-errors.ts` is the shared helper.

Treat a failed arrival login link separately from a lost session. Every failure of the link
exchange uses section 13's expired-link notice above whichever screen the existing session
shows. Retrying a single-use link cannot recover it.
