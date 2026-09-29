# Can the architecture carry the 24 Sep game ideas?

Type: research
Status: resolved
Blocked by: none
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)
Findings: [research/future-ideas-fit.md](../research/future-ideas-fit.md)

## Question

For each idea raised at the 24 Sep meeting, what would it need from the backend, and can TiDB Cloud Starter plus a Workers backend and a Cloudflare-hosted frontend provide it? Flag any choice still open in this map that would rule an idea out.

The ideas, from the meeting notes:

- Live interaction, for example participants seeing how they interact for "Ambitions"
- Human bingo, and collecting rewards
- Puzzles that join things together, and a physical board filled with blocks
- Digital pets or battle partners: collecting parts, battling each other or a boss
- Trading items between participants
- Rewards for pre-events, sponsors and helping others; a fuller profile unlocking activities or restricted areas
- Sharing contact details only with consent, and only with people a participant allows
- Registering a token by phone, or by scanning the token's QR code
- Entry, exit and food stations tied to the main portal
- Two participants tapping at one station at the same time
- Offline stations syncing later. Zi Tao owns the station side; the backend already accepts late batch uploads.
- Tokens staying valid after the event, and more than one event

For each idea, answer:

- What it needs from the backend: for example transactions, real-time push, scheduled jobs, many more stations and taps, or per-person privacy rules.
- Whether the planned stack supports it, and how.
- Which open ticket's decision it constrains. For example, a driver without interactive transactions would make trading harder, which bears on "How is the database set up?".

Read first: the meeting notes, `apps/API-AGREEMENT.md` section 10 (out of scope for the MVP), `CONTEXT.md` and `apps/backend/src/db/schema.ts`.

Designing the game mechanics is not part of this ticket. Only whether the architecture leaves room for them.

## Answer

Resolved 26 Sep 2026 with a few targeted lookups. Full findings: [research/future-ideas-fit.md](../research/future-ideas-fit.md).

- Every 24 Sep idea fits TiDB plus Workers. None needs a different database or host.
- Live interaction adds a Durable Object for WebSockets to connect to. Durable Objects are on the free plan.
- Trading needs transactions, which Drizzle's TiDB adapter supports. They are experimental in TiDB's driver, so test before relying on them.
- For "How is the database set up?": keep transactions available, and do not rely on `taps.id` order to pair people's taps.
- iPhones cannot use Web NFC, so phone registration also needs the token's QR code.
