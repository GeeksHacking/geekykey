# Capstone Mentor Meeting

Fri, 02 Oct 26

## Game Ideas: Bingo and Color/NFC Matching

- Two concepts presented: Human Bingo and a color/NFC-matching game
- Human Bingo: participants fill a form pre-event, then find others with matching traits during the session
- Color-matching concept: answers map to colors/patterns; players find others with matching colors by tapping NFC tokens

## Feedback on Color-Matching Concept

- Representation space problem: distinguishing 16+ colors or patterns becomes cognitively expensive fast
  - Suggested experiment: pick 16 colors from a color wheel, assign 3 to yourself, try to track what you’re missing
  - Patterns help but hit the same ceiling (7 vs. 8 lines requires counting, not instinct)
  - Animals as symbols also run out quickly; naming 16 distinct ones is already hard
- Gameplay collapses without forced conversation
  - If colors are visible upfront, players just seek the missing color and tap, no discussion needed
  - Joshua’s suggestion: hide colors until after interaction, so players are forced to engage before the reveal
- NFC doesn’t meaningfully enhance the existing bingo mechanic
  - Same motivation (or lack thereof) as pen-and-paper bingo; the tap just replaces the paper
  - Key design question: what does NFC unlock that paper cannot?

## Direction: NFC as Enhancer, Not Replacement

- Mentor’s framing: the project goal is a tool that enhances interaction, not a new game that happens to use NFC
- Forced grouping tends to produce more meaningful interaction than free-for-all discovery
  - School class analogy: structured proximity leads to deeper familiarity than self-selected groups
- Quest-style mechanic floated as a stronger direction
  - “Find 4 people who X” rather than “find one person who X” changes min-max behavior
  - Rarity scoring: common traits (wearing glasses) worth fewer points; rare traits (programs microcontrollers) worth more
  - Still pen-and-paper-compatible, so NFC enhancement still needs to be defined
- Recommendation: prototype and playtest any game concept with 4-5 people for 10 minutes
  - Key questions: did you learn something about the other person? How long did explanation take? How confusing was it?

## Backend Blocker: Cloudflare Workers + TIDB

- Current stack: TIDB Cloud (production DB) + Cloudflare Workers + Hyperdrive
- Problem: TIDB requires double authentication per client; Hyperdrive only authenticates once, causing connection failures
- Root issue identified: Cloudflare Workers CPU limit is 10ms, TIDB serverless driver alone uses ~7ms just to ping
  - Workers are optimized for edge compute hitting a cache (e.g. Redis), not a database directly
  - Hyperdrive exists for single-writer persistent connections, not the multi-user transactional model needed here
- Recommendation: move backend services to Google Cloud Run or Firebase Functions
  - Hosting can remain on Cloudflare; domains link up either way
  - Cloud Run is still serverless, so concepts carry over with minimal rewrite

## GeekyKey Service Architecture + Physical Design

- GeekyKey service should be stateless: no database, acts as a router/interface
  - Stations should be registered by EventService, not GeekyKey
  - GeekyKey only needs to recognize a station ID and forward events to EventService
  - Storing data in GeekyKey creates sync and write-clash problems across multiple instances
- Plan: move any GeekyKey tables into EventService; GeekyKey retains no DB
- Physical design: two scanner forms, stationary box and handheld
  - Stationary box: currently functional but too large; explore pedestal, kiosk, and wall-mount forms
  - Handheld: key shape proposed (NFC reader in the circular bow); can slot into a fixed mount to become stationary
  - Ergonomics flagged as the critical design challenge
    - Holder must not block the NFC surface when gripping
    - Scanning surface should be forward-facing and instinctive on first grab
    - Drop-in/dispense mechanism for stationary use is a viable direction if NFC tag shape is standardized
  - NFC tag form factor also needs to be decided: should be consistent across handheld and stationary uses

## Next Steps

- **Explore what NFC specifically enables that pen-and-paper cannot**
- **Prototype and playtest the leading game concept with 4-5 people**
- **Migrate backend from Cloudflare Workers to Google Cloud Run (or equivalent GCP service)**
- **Move GeekyKey DB tables into EventService; strip GeekyKey of any database**
- **Iterate on handheld scanner ergonomics and explore key-form NFC tag design**
