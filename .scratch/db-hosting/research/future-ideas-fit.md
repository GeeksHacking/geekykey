# Can the architecture carry the 24 Sep game ideas?

Research for ticket 04, 26 Sep 2026. Done as a few targeted lookups to save tokens, building on the findings for "Does TiDB fit this backend?" and "What does running the backend on Workers involve?". Designing the mechanics is out of scope; this only checks the architecture leaves room.

## Answer

- **Every idea fits the planned stack.** None needs a different database or host. Most are new tables and endpoints on the same backend.
- **Live interaction is the one that needs an extra Cloudflare feature.** Workers can accept WebSockets (Cloudflare's WebSockets docs), but one Worker request cannot reach another person's connection. A Durable Object, a small stateful Worker that many connections can share, is the usual meeting point. Durable Objects are on the free plan with SQLite storage, and their Hibernation API cuts the cost of mostly idle connections (Durable Objects pricing page). Polling stays the first version.
- **Trading needs transactions,** so an item cannot leave one person without reaching the other. Drizzle's TiDB serverless adapter supports them, and TiDB locks rows pessimistically. TiDB's driver calls interactive transactions experimental, so test them before a trading feature relies on them.
- **Two open decisions could get in the way:** picking a database connection without transactions, and relying on `taps.id` order to pair two people's taps. Both belong to "How is the database set up?".
- **Phone registration:** Web NFC only works in Chrome on Android (not re-checked), so iPhone users would need the token's QR code.

## Findings

| Idea | What it needs from the backend | Fits? |
|---|---|---|
| Live interaction ("Ambitions") | Pushing updates to many people at once | Yes, with a Durable Object that WebSockets connect to |
| Human bingo, collecting rewards | New tables over existing taps | Yes |
| Puzzles, a shared board | Shared progress that many people update | Yes. Show it by polling, or live through a Durable Object |
| Digital pets, parts, battles | Game state per person; battle rules run on the server | Yes. Heavy rules could pass the free plan's 10 ms of CPU; GeeksHacking pays for the paid plan |
| Trading | Atomic swaps between two people | Yes, with transactions (see above) |
| Rewards for pre-events, sponsors, profiles | Data from the GeeksHacking portal | Yes. Depends on the portal integration, which is outside this map |
| Sharing contact details with consent | Per-person permission rules | Yes. Rules in the backend, no infrastructure change |
| Token registration by phone or QR | Pairing, already in the API agreement | Yes. iPhones need the QR route |
| Entry, exit and food stations | More stations and taps | Yes. Just more rows; volume is small |
| Two people tapping one station | Pairing taps close in time | Yes, if pairing uses `received_at` or `tapped_at`, not `taps.id` order |
| Offline stations syncing later | Late batch uploads, deduplicated | Already built, with `client_tap_id` |
| Tokens after the event, more than one event | An event concept in the schema | Yes. A schema change, not an architecture change |

## What this means for the other tickets

- **"How is the database set up?"** must keep transactions available, for trading. It must also either make `taps.id` order global with `AUTO_ID_CACHE 1`, or state that features pair taps by time.
- **"How is the frontend set up, and how does the browser reach the backend?"** Whichever option wins, a WebSocket upgrade on an `/api` path must reach the backend Worker. All three options allow that.
- **"Write the migration spec"** should say that live features would add a Durable Object, and that multi-event support is a later schema change.

## Open questions

- Do TiDB's experimental interactive transactions hold up under two people trading at once? Test it when trading is designed.
- Web NFC support should be re-checked when phone registration is designed.
