# NFC token scanner design and interactive activity planning for showcase

Thu, 24 Sept 26

## Project Meeting Notes

## 1. Decisions and Proposals

## Token and Authentication

- Explore making the token clip easier to 3D-print
- Investigate mechanical keyboard-style design (Mr Julian)
- Token registration options:
  - Use a phone to register an initially empty token
  - Alternatively, scan the token’s QR code with a phone
- Participants already show login status at event check-in; explore how this integrates with the token system
- Decide whether tokens and participant data remain valid after the event

## Infrastructure

- Firebase, Firestore, RDS, and TiDB already in use; stick with these, do not introduce Turso
- Prioritize TiDB; use Firebase/Firestore as the preferred alternative
- Separate frontend and backend; no need to package into one Docker container
- Frontend and backend are NOT limited to Google Cloud Run
- Live sockets only if they support a core game mechanic (e.g., participants seeing how they interact for “Ambitions”)
  - Treat live interaction as a potential enhancement, not a main feature, until value is confirmed

## Entry and Exit

- Consider dedicated NFC scanner stations for food, entry, and exit (increases NFC usage and interaction)
- Entry/exit stations could connect to the main portal for participant tracking
- Client feedback: entry and exit handling is not currently a priority; keep as a future consideration
- If implemented, would tie into the main portal

---

## 2. Game and Interaction Ideas

## Human Interaction

- Human interaction should be central to the experience
- Throwing-based activities were not well received
- Human bingo is a strong idea; participants could collect bingo rewards
- Puzzle mechanic also preferred, especially ones involving joining things together
- Consent required when sharing information:
  - Do not expose phone numbers or personal details by default
  - Share only when the participant has explicitly enabled it
  - Share details only with people they have specifically allowed

## Digital Pets and Battles

- Explore digital pets or battle partners interacted with via NFC tokens
- Mechanics to consider:
  - Trade, battle, or collect digital creatures
  - Complete puzzles or add parts to a token to make it stronger
  - Each participant starts with a character; collect more parts by exploring activities
  - Collected parts increase power and unlock rewards, activities, or wins
- Offline RPG concept: items collected accumulate as stats, then participants fight each other or a boss

## Trading and Cooperation

- Trading is a strong potential mechanic
- Collecting items expands what participants can do:
  - Special activities
  - Rewards
  - Restricted areas
  - Additional game features
- Reward attending pre-events and completing activities
- Reward participants for helping sponsors and collaborating with others
- A more complete participant profile could unlock more advanced activities
- Core design principle: give participants something that is useless alone but becomes valuable through interaction with others, contributing to a shared goal (Geekshacking’s goal)

## Physical Game Elements

- Explore a physical board that participants fill with blocks
  - Completed arrangement gradually forms a larger shape or image
- Physical products that participants can touch have the most impact for storytelling and “selling” the showcase

## NFC Tap Design

- For simultaneous tapping, use physical design to allow only one participant to tap at a time (e.g., a slot mechanism)
- Different ways to trigger the NFT token to be explored

---

## 3. Connectivity and Offline Behaviour

- Wi-Fi likely part of the scanner setup, but a fallback is needed
- Consider what happens if internet is unavailable at individual booths
- Venue may have Wi-Fi, but could depend on SGx’s wireless network
- Options to investigate:
  - 4G module
  - Battery-powered setup
  - Offline operation with later synchronization
- NFC should provide low-friction interaction; one reason to prefer it over more complex methods

---

## 4. Procurement and Showcase Ideas

- Procure a wider range of items to develop more showcase concepts
- 3D-printed version is a prototype, not the final product; different years will have different budgets
- Manufacturing methods to discuss for future versions (if no time/budget constraints):
  - CNC milling
  - Injection moulding
  - Other suitable production methods
- Showcase strategy:
  - Present as much information as possible; more information leaves a stronger impression
  - Show different iterations from start to end to create emotional attachment
  - Physical hardware makes it easier to explain and “sell” to participants
- Pick a few ideas to tell the most stories
- Showcase why and how NFC can:
  - Reduce the number of steps
  - Make the experience more convenient
  - Enable meaningful interactions that would not happen naturally otherwise
- Choose broadly applicable components where possible

---

## 5. Urgent Action Items

- **Create and send OAuth redirect URL to Julian**
- **Provide updated answer to outstanding questionnaire question before next meeting**
- **Confirm "API key" replaces "barrel key" across the project**
- **Confirm token persistence and post-event behaviour** (Adam)
- **Research 3D-printable token clips and Mr Julian's mechanical keyboard-inspired design**
- **Compare QR-based token registration with phone-based registration**
- **Research offline scanning and connectivity options**
- **Develop NFC trading, battle, pet, and collection concepts further**
- **Expand showcase item catalogue and consider manufacturing options**

---

## 6. Meeting Cadence

- Physical meetup: every two weeks
- Digital meetup: every other week (alternating with physical)
- Next physical meetup: Thursday, 8th October (same timing as today)
  - Can shift to Friday 9th October if needed
  - Adjust as required; confirm in calendar

---

## 7. Terminology and Follow-up Questions

- Digital pets, trading, battles, and character parts may overlap; consider combining into one unified system

## Questions to Resolve

1. Should tokens remain linked to the same person permanently, or only for the duration of an event?
2. Which activities should support offline use, and which can require internet access?
3. Should the game use one unified character/pet system, or keep trading, battles, and collections as separate features?
4. How should consent work when participants interact through NFC?
5. Which token design is the priority for the next prototype?
6. Which questionnaire question needs to be updated urgently?
7. Is 8th October the next physical meetup or the next digital meetup?

---

## Organising Options

## Option A: By Topic

Best for a clean reference document for future meetings.

Sections: Token design and registration, Infrastructure, Game mechanics, Offline and connectivity, Procurement and showcase, Action items, Meeting schedule.

## Option B: By Priority

Best for focusing the next meeting on what needs attention first.

Sections: Urgent blockers, Decisions required, Next prototypes, Longer-term ideas, Client feedback, Meeting schedule.

Suggested priority order:

1. OAuth redirect URL
2. Outstanding questionnaire answer
3. Token persistence requirements
4. Token registration and clip design
5. Offline scanning approach
6. Gameplay and showcase concepts

## Option C: By Workstream

Best for assigning tasks to specific people.

Suggested workstreams:

- Token and hardware: clip design, QR code, registration, 3D printing
- Backend and infrastructure: API key naming, TiDB, Firebase, separate frontend/backend
- Gameplay: human bingo, pets, trading, battles, collection
- Connectivity: offline mode, Wi-Fi, 4G, synchronization
- Showcase and procurement: item range, manufacturing options, demonstration
- Operations: entry/exit stations, food stations, participant tracking

## Recommended Approach

Use Option B for the next meeting agenda, then Option A for the ongoing project document. Keeps urgent work visible without losing longer-term ideas.
