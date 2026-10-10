# Can a Worker check a Firebase login within the free plan?

Research for BAC-20, 10 Oct 2026. Measured from a throwaway Worker, `geekykey-firebase-check`, on Adam's free Cloudflare account, deleted afterwards. Its code, the sign-in page and the scripts are in [`assets/firebase-check/`](../assets/firebase-check/), on the branch `adam/bac-20-firebase-login-check` until it merges. The Worker imports the real check, `verifyFirebaseIdToken` in `apps/backend/src/lib/firebase-id-token.ts`, so what was measured is the code the services will run.

## Answer

- **Yes, easily.** Checking a Firebase ID token and setting a signed cookie takes a median of **1 ms of CPU** on a Worker with Google's keys cached, and **2 ms** when the keys are fetched for that request. The free plan allows 10 ms. A request that does nothing takes 0 ms.
- **The provisional design in spec checkpoint 5 holds:** the screens sign in with Firebase's web SDK, send the ID token to their own service, and the service checks it against Google's public keys and sets its own cookie. No paid plan is needed for it.
- **Google sign-in works on `localhost`** against `geekykey-b035a`, with a popup: Adam signed in, the Worker answered `204` with its cookie, and `GET /me` read the cookie back.
- **On Node it's smaller still:** a median of 0.09 ms with the keys cached, 1.3 ms with them fetched. Cloud Run has no CPU cap, so this was only a check.

## Findings

The Worker ran in Cloudflare's Singapore location (`SIN`) for 58 of the 72 recorded requests, and Hong Kong (`HKG`) for the rest. Every request succeeded.

| Case | Recorded | CPU, median | CPU, p90 | CPU, max | In-Worker wall, median | From the laptop, median |
|---|---|---|---|---|---|---|
| Baseline (`GET /noop`) | 26 | 0 | 0 | 0 | 0 | 31 to 47 |
| Check, keys cached | 23 | 1 | 4 | 11 | 1 | 18 to 46 |
| Check, keys fetched | 23 | 2 | 4 | 10 | 20 | 38 to 74 |

Times are in milliseconds. The laptop's medians are a range over three runs.

- **What a check is.** `POST /auth/firebase` with a real ID token: the RS256 signature checked against Google's keys, the issuer, audience, expiry, `iat`, `auth_time` and user ID checked, then an HMAC-SHA256 cookie signed as hono's `setSignedCookie` does. "Keys fetched" builds a new key set for the request, so it includes fetching and reading Google's four keys over HTTPS.
- **Where the numbers come from.** CPU and wall time are from `wrangler tail`, which reports whole milliseconds. 80 rounds of the three cases were sent, one request at a time, and tail recorded about a third of them, from each case alike; nothing points to the recorded ones being unusual. In-Worker wall time only advances across I/O, so it's the key fetch, not the check.
- **The two outliers,** 11 ms and 10 ms, were one request each, out of 46 checks. 4 ms or less was the rule. Workers' free plan tolerates occasional overruns, as the 2 Oct benchmark noted. With keys cached in each isolate, the fetch happens once an hour per isolate, or when Google names a new key.
- **Node,** from `node-check.ts` on Adam's laptop (Node 24.21): 200 checks with the keys cached, median 0.09 ms, p90 0.35, max 3.2; 20 with them fetched, median 1.3, p90 2.6, max 8.3. The first check in a new process took 33 ms, which is loading and compiling, once per Cloud Run instance.
- **The sign-in popup** first failed with `auth/cancelled-popup-request`, which Firebase raises when a second popup starts before the first finishes. With the button disabled while the popup is open, it worked. The screens should do the same.

## What it means for checkpoint 5

- The login stays as the spec has it: `POST /auth/firebase` on each service, taking `{ "id_token": "..." }`, answering `204` with the service's cookie. The API agreement gets it in a pull request for Ethan's review.
- Each service keeps one key set per process or isolate (`googleSigningKeys()`), never one per request.
- If Google's keys can't be fetched, `verifyFirebaseIdToken` throws rather than calling the token bad, so the route can answer `503` and the screens can say "try again".
