# Physical Capstone Meeting

Thu, 08 Oct 26 · Chua Li Ming Ethan Student, Joshua Ho Wai Yarn Student, Yap Zi Tao Student

## Ideas and Game Design

- Ad hoc quest concept: works best if themed (e.g. raid team), so roles shape the game mechanics, not just classification
  - Craft the game around the theme: e.g. devs can use hands but not talk, PMs can talk but not act
  - Without a supporting theme, the classification feels awkward and purposeless
- Tap-gives-a-question mechanic: tap with someone, your phone gives you a question, score if you remember their answer
  - Inversion variant: give the answer, find the question (more engaging, harder to game)
  - Risk: people just ask “what’s your answer?” directly, bypassing interaction
- Showcase as the first target event: design games for the showcase specifically, not a generic event
  - Collaborate with other teams: offer custom screens per booth, enhancing the experience for both visitors and presenters
  - Collectibles idea: partner with another group, theme 50 collectibles, give them out at the booth to drive engagement
  - Booth routing: show participants which booth is least crowded, track completion so they can return without losing progress
  - Treasure hunt: hide a scanner somewhere in the venue; 4G module needed if venue has no Wi-Fi

---

## 1. Setting up the Event Service on Cloud Run (Julian and Qing Guan)

- Proposal: run the Event Service the same way the Portal runs
  - One Cloud Run service in Singapore, deployed by GitHub Actions on every push to main
  - No key stored in GitHub; secrets in Secret Manager; address via Cloud Run domain mapping
  - Today’s backend moves there first, unchanged, on Node (done in code, BAC-17); GeekyKey Service cut out as a Worker afterwards
  - Full detail: part 1 of the 7 Oct notes (…/db-hosting/assets/message-to-julian-workers-requests.md)
- **1.1 Google Cloud project:** GeeksHacking’s billing account. Julian creates it. **Answer: confirmed.**
- **1.2 Roles:**
  - Adam: deploy service and staging copy, add secret values, read logs
  - Ethan and Zi Tao: Logs Viewer (station health lives in the Event Service)
  - Joshua: none
  - **Answer: confirmed.**
- **1.3 Infrastructure tool:** Pulumi is nice to have but not required right now
  - Better to firm up architecture first; start services by hand, use the GUI, extract the glue later
  - **Answer: nice if time allows, not needed.**
- **1.4 Address:** DNS record for https://event-api.geekshacking.com pointing at Google, Cloudflare proxy off (same as portal-api)
  - Confirm domain mapping over a Google load balancer (~US$18/month)
  - **Answer:** (to be confirmed when ready)
- **1.5 Budget alert:** set on the project, sent to Julian and Adam; max 2 instances; one kept warm on event days (rehearsal by 7 Nov, showcase 17–18 Nov)
  - **Answer:** (to be confirmed)
- **1.6 Cloud Run v1 vs v2:** V2 costs significantly more than V1 for unclear reasons; stick with V1 unless a V2 feature is specifically needed
  - **Answer:** go with V1.

---

## 2. Two Provisional Decisions (Julian)

- **2.1 Claims stand-in (until post-18 Nov switch):**
  - Portal tag endpoints not yet started; for the showcase, claims sit in a small stand-in on the Cloud Run server, same TiDB database
  - Offers exactly the four calls asked of the Portal; only GeekyKey Service can reach it; token IDs never reach an Event Service
  - After showcase: copy claims to Portal, point GeekyKey Service at Portal, delete stand-in
  - Why not Portal at showcase: every tap would wait on a Portal lookup; station gives up after 5 seconds; Portal runs as one instance, sleeps when idle
  - On Redis (from 2 Oct): no owner cache at showcase; stand-in sits next to hand-off and a cache could show a just-claimed token as unclaimed
  - After switch: owners cached in Cloudflare Cache API up to 5 minutes (claimed tokens only, cleared on claim/release); Redis Cloud too expensive per Worker invocation
  - Cloudflare Workers cache: check whether 1-hour cache expiry is supported; if not, fall back to Redis or another KV cache
  - **Answer: should be OK.**
  - Fallback: switch to Portal before showcase only if tag APIs are live by 28 Oct, with a warm Portal instance handling multiple concurrent requests
- **2.2 Moving a reader to another event:**
  - Each Event Service registers its own stations and issues their keys; no cross-event links
  - To move a reader: send saved taps to old event, flash with key from new event, becomes a new station
  - Station can be reconfigured via a terminal-based TUI or simple browser UI instead of reflashing
  - Retiring no_event status: flash erased on each move
  - **Answer:** reconfiguration via terminal or browser UI preferred over reflashing.

---

## 3. Qing Guan: the Portal

- **3.1 Logging in through the Portal:**
  - Sent 1 Oct (login message); still no reply in spec; Checkpoint 5 and Sprint 2 A/B test (5–18 Oct) wait on it
  - Two OAuth apps and redirect URLs needed:
    - Servicehttps://key.geekshacking.com/auth/callback
    - http://localhost:5174/auth/callback
    - Servicehttps://event.geekshacking.com/auth/callback
    - http://localhost:5173/auth/callback
    - http://localhost (confirm whether Portal accepts localhost redirect URLs)
  - Need: issuer, each app’s client ID, claim carrying display name, whether there’s a client secret
  - **Answer:** OIDC; likely a separate one for the showcase
    - Option A: login with Google (not stored in GeeksHacking database)
    - Option B: login with GeeksHacking GitHub (stored in Portal database)
    - For showcase: use Firebase only (avoids messy user database after teardown); GeeksHacking OAuth can be offered as an OIDC provider option within Firebase if desired
    - GitHub-only login rationale: filters out non-serious attendees; historically cut ~90% of “food tourists” from hackathons
- **3.2 Participant QR code:** what does the Portal’s QR code hold? QR fallback takes user_id only.
  - **Answer:** (to be confirmed)
- **3.3 Tag APIs:**
  - Part 2 of tag APIs message (…/db-hosting/assets/message-to-qing-guan-tag-apis.md): confirm receipt; follow-up on shared 4-second deadline and owner cache still needs sending
  - Claims stay on our side until just after 18 Nov; no rush on API readiness
  - Open questions: what happens to a user’s tags if their account is deleted? Can Portal keep an instance warm for multiple concurrent requests?
  - **Answer:** Portal team agrees to our approach.

---

## 4. Housekeeping (Julian)

- **Workers Builds:** disconnect from apps/backend; wrangler.jsonc left that folder with BAC-17, so every push to main now builds and fails. Reconnect for GeekyKey Service’s own folder at checkpoint 4. **Answer: sure.**
- **Going public:** make repo public and protect main; Workers Builds needs a protected main (1 Oct); keyless sign-in trusts main. Julian’s two architecture diagrams in .scratch/db-hosting/assets/ can be public. **Answer: sure.**
- **https://key.geekshacking.com/t** must keep working for as long as tokens are in use (URL is written on every token). **Answer: confirmed; Julian will ensure this.**
- **TiDB console:** confirm only Julian can access it and restore a backup on the day. **Answer: yes; Julian will be at the showcase.**
- **GeekyKey Service visibility on event day:** team cannot see Worker logs or account request count; options:
  - Read-only access to Workers Observability and account usage
  - Julian (or a named delegate) watches on the day
  - Rely on stations and station board
  - Settle before the rehearsal.
- **Event Service repo at split (checkpoint 4):** created under the GeeksHacking organisation. **Answer: confirmed.**
- **Showcase hours:** 18 Nov (showcase), setup 17 Nov. Confirm exact hours with Julian.
- **NFC tag URL routing (settled in meeting):**
  - Tag always leads to a single, unchanging URL: [https://key.geekshacking.com/t/[UID]](https://key.geekshacking.com/t/%5BUID%5D)
  - GeekyKey frontend handles routing: check login → redirect to GeeksHacking portal or Firebase login → redirect back → check if event is ongoing → route to event service or show profile
  - For showcase: assume one event at a time; one user attends one event at a time; auto-route to that event’s service
  - Multi-event handling (future): Portal provides list of active events with event service endpoints; GeekyKey frontend queries and routes by user’s registered event
- **Domain:** subdomain must never change; suggestion: key.geekshacking.com (to be provisioned and fixed permanently).
- **Cooldown:** default is 5 minutes; configurable per event via environment variable; 15 minutes suggested as a better default.
- **Polling vs SSE:** frontend currently pings backend every few seconds; SSE would auto-refresh but maintains a persistent connection; polling acceptable for current scale.

---

## 5. Only if it Comes Up

- **5.1 Free Workers plan capacity for showcase day:**
  - Estimated usage: ~60,000–90,000 requests/day (mostly organizer screens polling)
  - Free plan limit: 100,000 requests/day shared across all GeeksHacking Workers
  - Exceeding limit stops all Workers until 8 AM; stations keep taps but no stamps issued
  - Mitigation: poll less frequently; rehearsal gives real numbers
  - Open questions: is the Portal web app on the same Cloudflare account? Does a page load run a Worker? Are other GeeksHacking Workers busy on showcase day?
  - **Answer:** (to be confirmed)
- **5.2 Event day readiness:**
  - Julian to be reachable by phone on the day
  - Upgrade to Workers Paid on the spot if usage passes 70% of free daily limit
  - Roll back a Worker when asked
  - Check TiDB Request Units the evening before (spec section 9)
  - Feature freeze backend ~2 weeks before showcase; no deploys the night before
  - Stress test the system before showcase: no upcoming workshop, but can test in a classroom with other groups or artificially spam the backend; rate limiting not yet implemented

---

## Hardware and Physical Design

- Current station: soldered by Zi Tao; running on TiDB Docker container; demo shown in meeting
- Power: adding 2 batteries and one buck converter for handheld version; stationary version can use USB/wall power (no buck converter needed)
- Display: considering switching from LCD to OLED (smaller, better); LCD fine for stationary box
- Size: can shrink current enclosure roughly in half; trim and solder wires rather than using connectors
- Modular assembly idea: separate ESP32 + display from battery + 4G module; connect the two halves; reduces redesign effort when changing form factor
  - Concern: modularity adds wear-and-tear and support complexity
- Key/scanner pairing concept: design NFC tag and scanner as a matched pair (e.g. key + lock, stem + hook); extract a common internal form that fits multiple outer shells without rebuilding the electronics
- Stationary station: can be hidden (treasure hunt); needs 4G module if venue has no Wi-Fi
- Handheld station: needs buck converter; 4G module required; compact design still being worked out
- Magnet-based snapping for positioning: reduces tap errors; needs 2 magnets to align correctly
- Satisfying tap mechanic ideas: slide mechanism (tag goes in, stops, comes out), lock-and-key twist, gumball-machine style coin drop

## Next Steps

- **Check with Mr Pang on GeeksHacking OAuth for showcase**
- **Ask teachers if the showcase has a theme**
- **Set up Firebase for showcase auth (Adam)**
- **Disconnect Workers Builds from apps/backend (Julian)**
- **Make repo public and protect main branch (Julian)**
- **Provision key.geekshacking.com and lock the subdomain**
- **Implement queue system and stress-test before showcase**
- **Settle GeekyKey Service event-day visibility before rehearsal (7 Nov)**

---

Chat with meeting transcript: https://notes.granola.ai/t/a7741baa-fda8-48d0-874d-df0e8fc9c17d-00demib2
