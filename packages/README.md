# Shared packages

Code that both services use, so the two sides can't disagree. Each package is TypeScript source
with no build step: the services bundle it. Each has the same four checks, which CI's Event Service
job runs: `lint`, `format:check`, `typecheck` and `test`, for example
`mise exec -- pnpm --filter @geekykey/handoff test`.

## handoff

Zod schemas for what the GeekyKey Service sends an Event Service and what it answers: taps,
heartbeats, meetings and the registered stations ([the API agreement](../apps/API-AGREEMENT.md),
section 11).

`json-schema/` holds the same shapes as JSON Schema, for teams writing an Event Service in
another language. After changing a schema, regenerate it and commit what it writes:

```bash
mise exec -- pnpm --filter @geekykey/handoff json-schema
```

A test fails while the two differ.

The two services deploy separately, so a change here must work with the other service's previous
version.

## firebase-login

Checks a Firebase ID token's signature, issuer, audience and expiry against Google's public keys,
for each service's `POST /auth/firebase` (agreement 7.2). Its `testing` export fakes Google's keys,
so a service's tests can log in without them.

## login-link

Makes and reads login links (agreement 11.9). The GeekyKey Service makes one for its session's
user, signed with a key derived from the Event Service key, and the Event Service checks it and
logs that user in. Both services bundle this one package, so they can't disagree on the format or
the key.
