# How do we protect our public addresses without blocking the stations?

Type: grilling
Status: resolved
Blocked by: none
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

All three of our addresses are public:

- `geekykey-api.geekshacking.com`, for stations and Event Services;
- `geekykey.geekshacking.com`, for the token page, My tokens and the GeekyKey admin screens;
- `showcase.geekshacking.com` (provisional), for the passport and organizer screens.

Which rate limits and firewall rules stop abuse on the free plan without blocking the stations? Which of them live in the zone, where Qing Guan or Julian adds them, and which in our code?

What the resolved tickets already say:

- Our addresses are under geekshacking.com, so the zone's rules can apply to them, and Bot Fight Mode is off. Stations have a hostname of their own, so zone rules can target it alone ("How do deploys and secrets work?").
- A `429` makes a station keep its taps and retry later. Meanwhile it shows "Not recorded" and "Please tap again" ("How do stations talk to the GeekyKey Service?").
- The token page is public and token addresses can be guessed, so claims need a limit per user. My tokens' form for claiming by typing a UID shares that limit ("What is a token's ID, and what URL is written on each token?").
- Event Services make their status calls to `geekykey-api.geekshacking.com` with an Event Service key, and a limit there must not block them ("How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?").
- Every request counts against the free plan's 100,000 Workers requests and 100,000 Hyperdrive queries a day, so abuse also eats the day's allowance ("How do deploys and secrets work?").

Still open:

- What the free plan offers: rate limiting rules, custom rules, and a rate limit inside a Worker.
- The numbers: per station, per user and per IP address. At the venue, the stations and many phones may share one IP address.
- What a blocked caller sees at each address.
- Whether a station whose key leaks needs anything beyond replacing its key.
- What we ask Qing Guan or Julian to set up.

## Answer

Resolved 29 Sep 2026 by grilling with Adam.

**Decided**

- **What the limits are for:** stopping one misbehaving caller before it reaches the database, such as a station stuck resending, a passport in a loop, or a participant with a script. On the free plan they cannot stop a flood from many addresses from using up the day's allowance. 100,000 requests a day is about 1.2 a second, and any limit per IP address loose enough for a venue full of phones behind one address lets a single client through at many times that. That risk is accepted and joins the decision on paying, due 11 Nov. Cloudflare's automatic DDoS protection handles large attacks on every plan.
- **No side doors.** All four Workers set `workers_dev = false` and `preview_urls = false` in their Wrangler files, so our three hostnames are the only way in and every public request passes through the zone. `event-service` then has no public address at all, only its two bindings. It still checks the Event Service key on the hand-off, because other teams copy the sample.
- **The limits live in our code,** with the Workers rate limiting binding, counted per caller (a station, a user or an Event Service), never per IP address. We don't ask for the zone's one rate limiting rule. On the free plan it matches only the path, so it can't tell our hostnames from GeeksHacking's other sites. It counts per IP address, lumping the venue's stations and phones together. And its 10-second block barely slows a script. Our code knows who is calling and shapes its own `429`.
- **The numbers:**

  | Caller | Counted by | Limit |
  |---|---|---|
  | A station | the hash of the key it sent, before the database | 60 requests a minute |
  | A user, on each service's API | Portal user ID | 60 requests a minute |
  | A user, looking up and claiming tokens on the GeekyKey Service | Portal user ID | 20 a minute, shared, on top of the 60 |
  | An Event Service, calling for its stations' status | Event Service key | 120 a minute |

  A queue taps at most every 2 seconds, since each result shows for 2, so a busy station sends about 32 requests a minute with its heartbeat and a resend. The passport polls about 6 times a minute, an organizer's screens about 18. Twenty token lookups a minute covers an organizer at the desk tapping tokens in a rush, and stops a script from checking thousands of UIDs an hour. The hand-off needs no limit, because the stations' limits pace it. Requests from someone not logged in never reach the database: the token page shows a login prompt without looking anything up, and the Portal callback checks its `state` before calling the Portal.
- **Junk station keys are turned away from memory.** Each GeekyKey Service instance keeps a list of which key hash belongs to which station, refreshed on a timer at most once a minute, never because a key wasn't found. A script sending random keys, whose format anyone can read once the repo is public, never reaches the database, and real heartbeats save a query. Links and everything else are still read fresh on each request. Accepted cost: a new, replaced or disabled key takes up to a minute to take effect, so a brand-new station shows "Setup error" for up to a minute. Rejected: counting failed key checks per IP address, because the binding can't read a count without adding to it, so every junk key would still reach the database until the count tripped.
- **Stations resend at most once a minute.** After a `429`, a `5xx` or no answer, a station resends its saved taps alongside the heartbeat, and no more often. A new tap is still sent at once, carrying the saved ones with it, because someone is waiting. Without this, 20 stations resending every second while the Event Service is down would make 72,000 requests an hour.
- **A user holds at most 3 tokens,** a setting on the GeekyKey Service, with no exemption for GeekyKey admins or organizers. This is the limit per user that "What is a token's ID, and what URL is written on each token?" asked for. It bounds how many people one account can grief by claiming their tokens first, and a GeekyKey admin releases those tokens.
- **What a blocked caller sees:**
  - Every limit answers `429` with `{"error": "rate_limited"}` and `Retry-After: 60`.
  - A station shows `Not recorded` / `Please tap again`, as decided, and resends once a minute.
  - The passport and other screens that poll keep showing the last data and try again at the next poll. One missed poll shows no error.
  - The token page, the claim form and My tokens say "Too many tries. Wait a minute and try again."
  - The Event Service's status call counts it as a failure, so the station board shows "status unknown", as decided.
  - A fourth claim gets `409` with `{"error": "token_limit_reached"}`: "You already have 3 tokens. Release one on My tokens first."
  - Each limit that trips writes one log line naming the caller: a station ID, a user ID or an Event Service ID, never a key.
- **A leaked station key is replaced.** Whoever holds it can post taps as that station for any UID they guess, earning stamps for other people's tokens within the cooldown and the 60-a-minute limit. They can also learn which UIDs are claimed, and send fake heartbeats. The likeliest leak is a station unplugged from its table and its flash read over USB, where the key and the WiFi password sit as plain text. So a station that goes missing gets its key replaced by a GeekyKey admin before it is used again. Fake taps already stored stay, unless Adam removes them under the event-day rule for changing data. Encrypting the flash is out of scope: it burns permanent eFuses, and the firmware is Zi Tao's.
- **GeekyKey admins can disable a station** (Adam's idea), on the GeekyKey admin screens. A disabled station's key is refused with `401`, so the station shows `Setup error` / `Tell organizer` and keeps its taps. Its key, link and history stay, and enabling it again needs no reflash. It's for a station that has gone missing and may turn up, or one that is misbehaving out of reach. If it may have been tampered with, its key is replaced before it is enabled. Disabling and enabling are logged with who did it, like link changes, and take effect within a minute because of the key list in memory. Rejected: unlinking alone, which leaves a leaked key sending heartbeats and showing online; and disabling as retiring a station for good.
- **One ask of Qing Guan, raised later** (Adam: the agreements can be talked about later). It is a custom rule: when the hostname is `geekykey-api.geekshacking.com`, skip Browser Integrity Check, Security Level (which includes "I'm Under Attack") and all rate limiting rules. Zone settings are GeeksHacking's. If Qing Guan turns on "I'm Under Attack" to defend another site, stations and the Event Service's status call would get challenges they can't solve, and stations would show "Not recorded" all day. The rule uses one of the zone's five custom rules. Managed rules stay on, and DDoS protection can't be skipped. The other two hostnames don't need it, because browsers solve challenges. No message is drafted: the ask goes into the spec, raised when the custom domains are added. Until then, stations rely on the zone's defaults, which let them through today (see Facts).

**What follows without a further decision**

- Each limit is its own binding, with a `namespace_id` no other Worker in GeeksHacking's account uses, because bindings that share one share their counts, even across Workers. The spec lists the IDs so Julian knows they are taken.
- The limits count separately at each Cloudflare location, and roughly, so a few requests over a limit can get through. That is fine for what they are for.
- `stations` gains a column saying since when a station is disabled, empty while it is enabled.
- The firmware needs no change for a disabled station: to the station it is a `401`.
- A heartbeat costs one query instead of two, the last-seen write, because the key is found in memory. Twenty stations over 10 hours make about 12,000 queries, not 24,000.
- After the switch to the Portal, the 3-token cap counts through the `Claims` module's `tokensOf`.

**Facts** (checked 29 Sep 2026)

- Rate limiting rules on the free plan: one per zone. Its expression can use only the path and Verified Bot, it counts per IP address, and its period and its block both last 10 seconds. Blocked requests get `429` with Cloudflare's page, since a custom response needs Pro ([Rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/), [Create a rate limiting rule](https://developers.cloudflare.com/waf/rate-limiting-rules/create-zone-dashboard/)).
- Custom rules on the free plan: five per zone, every action except Log, no regular expressions ([Custom rules](https://developers.cloudflare.com/waf/custom-rules/)). A rule with the Skip action can skip the rate limiting rules, the managed rules, and products including Browser Integrity Check and Security Level, but not Bot Fight Mode ([Skip options](https://developers.cloudflare.com/waf/custom-rules/skip/options/)).
- Browser Integrity Check is on by default. It challenges visitors without a user agent, or with a non-standard one ([Browser Integrity Check](https://developers.cloudflare.com/waf/tools/browser-integrity-check/)). On 29 Sep, `https://geekshacking.com/` answered `200`, with no challenge, to the user agent `ESP32HTTPClient`, which the station's `HTTPClient` sends because the firmware sets none, and to a request with no user agent.
- The Workers rate limiting binding, generally available since 19 Sep 2025: each binding sets a limit over 10 or 60 seconds and counts any string we choose as its key. Counts are kept separately at each Cloudflare location and are "permissive, eventually consistent". Cloudflare advises against using IP addresses as keys, since many users share one. It needs Wrangler 4.36.0 or later. The page names no plan it is limited to and no price ([Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)).
- Zone rules don't cover `workers.dev` or preview addresses, which sit outside our zone. Turning off `workers.dev` doesn't turn off preview addresses. From Wrangler 4.44.0, a `preview_urls` left unset follows `workers_dev`, and a `workers_dev` left unset becomes `false` once `routes` are set ([workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/), [changelog, 23 Oct 2025](https://developers.cloudflare.com/changelog/post/2025-10-23-preview-url-default-behavior/)). Setting both explicitly avoids depending on either rule.

**Glossary**

`CONTEXT.md`: **Token** now says a user may hold a few, up to a set number. **Station** can be disabled by a GeekyKey admin.

**Assets**

- [Message to Zi Tao](../assets/message-to-zi-tao-station-contract.md) gains the once-a-minute resend and what a disabled station sees.

**Passed on**

- The four Workers' `workers_dev` and `preview_urls`, the rate limiting bindings and their namespace IDs, the key list in memory, the 3-token cap, disabling and enabling on the GeekyKey admin screens, the `stations` column, the ask of Qing Guan, and the API agreement's changes (`429 rate_limited` with `Retry-After`, `409 token_limit_reached`, the stations' resend pace, `401` for a disabled station): "Write the migration spec".
- One log line for each tripped limit, and disabling a station or replacing its key when it goes missing: "How do we notice trouble on event day, and who watches?".
- A flood from many addresses can still use up the free day, and a heartbeat now costs one query: the fog "Staying on the free plan".
