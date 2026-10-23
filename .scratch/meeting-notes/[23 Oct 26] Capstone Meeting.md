# GeekyKey showcase game design and checkpoint 7 scope with Julian

Fri, 23 Oct 26

## If There Are Only 15 Minutes

1. **What GeekyKey is for after the showcase** (4.1 and 4.2): answer decides where checkpoint 7 draws the line between base and one event’s own games
2. **The showcase game and checkpoint 7’s scope** (sections 2 and 3), with the leaderboard (4.6)
3. **Guests** (section 5): built, need Julian’s and Qing Guan’s agreement

---

## 0. Progress since 8 Oct

- **12 Oct:** Event Service runs on Cloud Run in Singapore, with staging copy, deployed from main by GitHub Actions
- **15 Oct, checkpoint 3:** GeekyKey side and Event side split inside one server; owners from claims stand-in, taps handed off, station keys checked against each event’s registered stations; passed on production
- **20 Oct, checkpoint 4:** GeekyKey Service runs as its own Worker on key-api, built by Workers Builds; stations moved through new setup mode with no reflash
- **22 Oct, checkpoint 5:** Both screen sets deployed on event. and key., login through Firebase; guests, login links, and display names in
- **23 Oct, checkpoint 6:** Checked on phone on production:
  - Claiming a token from its page and by typing its code
  - Guest claim, passport opening with no second login
  - Releasing by owner and by GeekyKey admin
  - Three rate limits confirmed working

Next: checkpoint 7, the Event Service’s features; expected to be one of the biggest checkpoints in the series

---

## 1. What We Heard since 8 Oct

**1.1 Capstone teacher’s feedback**

- GeekyKey is too generic; token could be more fun, like DEF CON’s badge with lights and lasers
- Stations could use a better screen (e.g. OLED) and show more about the person who tapped
- A game could run on a screen when someone taps
- Everything so far could be done with a phone
- Suggested asking Julian what GeeksHacking wants from it (section 4)

What we take from it:

- Phone needed only once, to claim a token
- During the event, station and big screen reactions are seen by everyone nearby at once
- Two ideas go into checkpoint 7: station shows visitor’s name and progress after a tap (3.3), big screen reacts to taps (3.4)

On the token:

- NTAG213 tags have no battery; can’t light up on their own
- Tags with an LED lit from the reader’s field exist but need testing against RC522 (weak field)
- 3D-printed shell with collectible designs is a cheaper way to make the token fun
- RC522 sensitivity tested: survived under a large 3D printer overnight, placed under a table, thrown on the ground; only fails when hit deep inside; a 5 mm layer of solid plastic (3 walls in slicer = ~4.6 mm) is more than enough

**1.2 How the showcase day runs**

- Two segments: judges assess booths in the morning; public segment (parents, mentors, visitors) after lunch
- Layout: booths along walls in three areas divided by walls (~3, 6, and 5 booths); from inside one area the others aren’t visible; this year’s layout needs confirming
- 100 NTAG213 tags available: roughly one per family in the public segment, with some kept back for judges, demos, and spares
- Many parents come for their own child’s booth; walls hide other areas; public segment is where visitors need a reason to go further

---

## 2. The Game We Propose for the Showcase

For the public segment:

- Partner stations at other groups’ booths, at least one per walled area, chosen from the station partners page once booths are assigned
- A tap lights the station and plays a sound; station shows visitor’s name and progress (e.g. “Hi Alex / +10 2/3 areas”)
- Big screen at our booth shows a live map of the hall, each station pulsing as taps arrive, plus a leaderboard
- Every 20 minutes a bonus moves to the quietest area (e.g. “Research booths x2 until 3:20”), shown on the map and on stations

During judging:

- Stations run no game, or a short trail for judges if teachers allow
- At our booth, a judge taps a token and watches the tap reach the big screen

Why this game:

- A phone can’t do it: map and station light/sound are seen by everyone nearby at once
- Measures something the showcase can test: how many walled areas each token reached, straight from the taps
- Runs on checkpoint 7’s base features (3.1, 3.3, 3.4) with this event’s own game and settings on top, testing both halves of the split in 3.2

**Physical collectible design**

- Hexagon top-spinner idea: main hexagon piece (with NFC tag) plus 6 triangular pieces, one from each partner booth
- Must collect all 6 to spin it; incentivizes visiting all booths
- Jointing mechanism: look up print-in-place hinges (no hinge rod needed); design only one side, pieces snap to each other
- Each piece can be a different color; 7 different logos possible
- Prototype multiple designs; don’t commit to one yet
- Key ergonomics to solve: nothing extruding (breaks in bags/pockets); flatter is better; attach magnet to NFC piece for easy snap-to-station
- Onboarding: needs to be obvious for a fresh participant; consider QR code, printed card, or instruction on station screen; minimize steps to first tap

**Showcase booth vs. showcase game**

- The showcase game is one case; the booth should also show other ideas the platform can illustrate:
  - Custom tokens (e.g. role-based: developer, designer; or prize tokens)
  - Competitive game variant (tokens as currency; stealing mechanic)
  - RPG-style variant (collecting pieces unlocks abilities)
  - Iteration history: show prototypes leading to final design
- Visitors should leave understanding the platform is flexible by design, not generic by accident

---

## 3. The Plan for Checkpoint 7

**3.1 Timed games and timed rules**

- Each station can run a different game; game can change at set times
- Organizer sets a schedule before the day; each schedule line names:
  - A game
  - Stations it runs on (some or all)
  - Start and end time
  - Game rules for that period (points, multiplier, etc.)
- Tap judged by games scheduled at the station at time of tap (tapped_at if station sent one, otherwise arrival time)
- Two games on one station: tap still gets one status (accepted > cooldown > no_game), per spec section 3.7
- Judging segment: no game or judges’ trail; public segment: passport game with bonus moving every 20 minutes

**3.2 The base, and one event’s own**

Base (every event) One event’s own Stations: creating, keys, disabling, station board Which games run and their rules Storing taps: statuses, cooldown, QR fallback Schedule of games and rules Users, names, login links, organizers What stations and big screen show Tap log, stats, export Theme and branding Passport as default game Add-ons at a booth Running the schedule, passing station text back

Folder structure in apps/event-service:

- src/event/: base
- src/games/: one folder per game; each game has same interface (tap + context → status, points, station text, own record); passport moves here first
- src/showcase/: this event’s settings (which games, schedule, booth texts)
- Lint rule: src/event/ cannot import from src/games/ or src/showcase/

After showcase, when Event Service moves to its own repo (BAC-39), base and game interface serve as the starting point for another event.

**3.3 What the station shows after a tap**

- Today: tap answer carries only a status; station picks words from a fixed table
- Plan: add optional field with station text (two lines, up to 16 characters for current screen)
- Event Service fills it in hand-off answer (agreement 11.2); GeekyKey Service passes it unchanged
- Station shows booth details, visitor’s name and progress; guest shows as “Guest”
- Old stations keep working (firmware contract already ignores unknown fields)
- Changes sections 6.1 and 11.2 of the agreement: needs Ethan’s approval and firmware work from Zi Tao

**3.4 The big screen**

- One screen at our booth, built into Event screens
- Shows: hall map, leaderboard, current bonus and countdown
- Leaderboard brought into scope for big screen only (BAC-62); shows names people chose; guests show as “Guest”
- One screen (not one per booth): polling every 2 seconds for 6 hours ≈ 10,800 requests; showcase day already estimated at 60,000–90,000 of 100,000 free plan requests

**3.5 The look of the screens**

- Sci-fi style, referencing Wuthering Waves and Arknights: Endfield; Endfield’s black and yellow is close to GeeksHacking’s colors
- Animation rules:
  - Animate only a change: stamp earned, points counting up, stamp slot filling, station online pulse, bonus countdown
  - Never animate on a poll that changed nothing
- Visual language: thin borders, corner brackets, monospace labels, faint grid; nothing purely decorative moves
- Stack: CSS and tw-animate-css (both apps already have these); no new animation library; respect reduced-motion preference
- Priority: big screen first (judges and crowds look at it); phone passport needs less
- This is a proposal for Ethan, who owns the screens

**3.6 How much fits**

- 19 days to backend freeze: Wed 11 Nov
- Key dates: rehearsal Sat 7 Nov, grad tea Thu 12 Nov, showcase Wed 18 Nov
- **Must:** checkpoint 7 as spec has it
- **Should:** timed games and rules, station text field, big screen with hall map and leaderboard
- **Could:** bigger station screen (OLED or color TFT, Zi Tao’s call); tags that light up; full animation pass
- **Stretch:** light 3D model of hall on big screen (too heavy for phones; big screen only); plugin system for games packaged independently
- **Not before the showcase:** more than one event in one Event Service

---

## 4. Questions for Julian

**4.1 After the showcase, what is GeekyKey for GeeksHacking?**

Answer: a system that enhances GeeksHacking events with physical-digital interaction (human-computer interaction); not just a fun token

**4.2 What’s one thing he’d run at Hackomania 2027?**

Answer: treasure hunt (hidden or roaming stations depending on space); or explorative game; or token-gated game room (limits access, e.g. 3 plays per token); theme for Hackomania 2027 is physical AI; may try integrating NFC into participant solutions but likely too complex for most

**4.3 Is the showcase a fair test?**

Answer: fair for sponsors (fixed booth locations); not yet for individual-to-individual interaction, but fine to focus on sponsor side first; if first part is done before showcase deadline, can attempt the second

**4.4 Timed games**

Answer: nil

**4.5 Stations’ screens and big screen**

Answer: nil

**4.6 The leaderboard**

Answer: leaderboard only makes sense for competitive games; showcase game is a collectible game; time-based leaderboard would make it competitive, which isn’t the goal; no leaderboard for the showcase

---

## 5. Guests at the Showcase (Julian and Qing Guan)

Background: ADR 0005 and BAC-54. In the public segment, many visitors’ phones aren’t signed in to Google. “Continue as guest” uses Firebase anonymous sign-in; token page button opens passport as same user via a signed login link from GeekyKey Service.

**5.1 Are guests OK?**

- Firebase deletes anonymous accounts after 30 days (automatic clean-up on); no billing for them
- Login link valid for 60 seconds, works once; key from Event Service key, so a leaked link key only grants access to our Event Service
- Guests already built; guest claim passed checkpoint 6 check on production
- If rejected: guest button removed from token page; desk helps visitors sign in with Google instead

Answer: yes, guests are OK

**5.2 Firebase’s limit on new accounts**

- 100 new accounts per hour per IP address (guests included); venue Wi-Fi shares one address
- Adam has scheduled 800/hour for grad tea on 12 Nov
- Firebase holds one scheduled raise at a time: showcase raise (17–18 Nov) goes in on 13 Nov or later

---

## Priorities and Sequence

- Map first (showcase end-to-end flow)
- Then user-to-user connections (show how many connections made, not a specific map for PDPA reasons; show tag-to-tag links or connection counts)
- Then different scenarios and game variants for the booth

## Next Meetings

- **29th Oct, 9 PM:** online (Julian hosting office visitors Tue–Fri that week)
- **5th Nov, 12 PM:** in person or online
- **13th Nov, 12 PM:** after grad tea; share results

## Next Steps

- **Finalize showcase game design and settle on collectible token form**
- **Build showcase end-to-end flow: map first, then user-to-user**
- **Schedule Firebase account-rate raise for showcase (Adam)**
- **Confirm Cloudflare log-view permissions for the team**
- **Email Mr. John Tan (Dean of IT) about SST x GeeksHacking branding on tokens**
- **Pin specific dependency versions and set a 2-week lock-file window**
