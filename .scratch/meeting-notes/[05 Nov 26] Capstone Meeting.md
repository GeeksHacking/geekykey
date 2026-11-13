# On site Capstone meeting

Thu, 05 Nov 26 · Chua Li Ming Ethan Student, Joshua Ho Wai Yarn Student, Yap Zi Tao Student

## Problem Statement and Scope

- Confirmed: sticking with the original problem statement, peer-to-peer networking at hackathon events
  - Original three problems:
    1. Behavioral/social: friend group clustering
    2. Technical accessibility: making the system easy to use
    3. Long-running: avoiding tech debt year over year
  - Sponsors were never in the original brief; dropping the sponsor-focus is fine
  - Physical token + web portal vision is consistent with what was originally proposed two years ago
- Scanning station reoriented toward game ideas rather than sponsor booth ideas
  - Sponsor booth integration remains possible but is not the primary focus

## Connection and Profile Features

- Tapping phones currently shows a compatibility score and shared Q&A answers
  - Discussed whether to hide the raw answers so the match score itself becomes the game mechanic
  - Consensus: keeping the answers visible is fine as a “bingo-style” comparison, but a live interactive game on top would be more engaging
- Contact exchange: not yet implemented, flagged as a clear priority
  - When two people tap, the connection should surface the other person’s profile and bio
  - Consent matters: scanning someone’s token should not auto-connect; the other person should accept
  - This directly addresses the original problem statement (peer-to-peer networking) and should be the first thing built next
- Avatar is intended to be long-running at the key service level, not event-specific
  - Currently event-scoped; moving it to the key service is a planned but not yet done
  - Cosmetics earned per connection or per event attended (e.g., new jacket, logo, item each year)
  - Answers given at sign-up could also shape the avatar’s appearance rather than just a default blocky figure
  - Long-term stickiness goal: if someone attends Hackomania five times, their profile should visibly reflect that history

## Gamification: Token-Triggered Games

- Core idea: tapping phones or a station triggers a live challenge, not just a passive profile exchange
  - Games should be simple enough to play on the spot, not prepared in advance
  - Winner earns a cosmetic, profile item, or event reward
- Two-player games triggered by tapping phones together:
  - Coin toss, dice roll, guess a number, reaction speed test, higher card wins
  - Both players participate simultaneously; no need for one to be faster than the other
- From raw notes: tapping each other’s phones should pit the two people against each other in a challenge
  - Rolling a dice or coin toss as the simplest implementation
- “Find the polar bear” game (from raw notes):
  - One person is secretly designated the polar bear; neither they nor anyone else knows who it is
  - Players tap each other’s phones to gather clues and vote
  - Voting and game triggers can also happen at stations, not just phone-to-phone
- Group games triggered at a station:
  - Everyone taps the station within a time window; game starts simultaneously for all
  - Game master holds the phone or stands at the station; others tap in to join
  - Enables ad hoc group formation outside natural friend circles, directly solving the clustering problem
  - Station can reset between rounds; timeout logic needed to handle people who walk away mid-game
- Brainstormed extensions (not committed, for future consideration):
  - 3-team competitions where 2 out of 3 pairs must win for the group to win
  - Station-facilitated games that replace the need for a human facilitator
  - Telegram bot integration for team-finding (explicitly flagged as out of scope with ~10 days left)
- Phone app: not worth building at current scale; one event per year does not justify App Store fees (~$100/year)
  - PWA noted as a possible future improvement for NFC API access, but deferred
  - Tab clutter from repeated NFC taps acknowledged as a known trade-off of the web app approach
  - Worth noting in the report as a future iteration

## Grouping Feature

- Two grouping modes already built:
  - Automatic: randomize by desired group size; result shown on the user’s profile after tapping token
  - Manual: organizer assigns people directly; UI simplification still in progress to avoid clutter
- Latecomer feature: auto-allocates late arrivals to the next available group
- Group result currently shown on the user’s profile page after tapping; organizer sees group locations
- Planned but not yet built: pull pre-registered groups from the portal and bind to NFC token on check-in
  - At registration, attendees already sign up in groups; the NFC tap should just reflect that existing grouping
  - This integration is confirmed for the production system but not required for the showcase
- Sorting and filtering of groups flagged by a supervisor (Mr. Tan) as a desired improvement
  - Current sorting options are limited; more flexibility wanted

## Event Flow Integration

- Full event flow: online registration → day-of check-in → goodie bag (includes token) → tap to bind → event begins
  - Token tap binds to the user’s profile; they should already be logged in from check-in, making it seamless
  - Replaces Linktree with a dedicated event page; grouping, seating, schedule all in one system
- Pre-opening gap: the connections game can fill dead time before the event formally starts
  - Attendees already have tokens and are registered; peer-to-peer interaction can begin immediately
- Invitation flow (brainstormed, not committed):
  - Past attendees with tokens could receive exclusive early-access invites triggered by tapping their token
  - Simple version: tap token to reveal invite details; more complex: pull Telegram handle from portal and message directly
  - Flagged as a future idea, not for the current showcase
- Station write capability: stations can write to tokens, not just read them
  - Enables treasure hunt mechanic: tap all stations in sequence to unlock a lucky draw entry or prize eligibility
  - Each station writes a code; only holding all codes grants access to the final reward
  - Acknowledged as potentially complex to control; server-side tracking suggested as a cleaner approach
- Sponsor booth integration (possible, not primary):
  - Give each sponsor a scanner; staff engage visitors by joining or facilitating games
  - Sponsors can gatekeep swag behind winning a game rather than just handing it out
  - Changes the organizer’s pitch to sponsors: “we give you a new affordance, here’s how to use it”
  - Risk noted: attendees might focus on the game and ignore the sponsor; acknowledged as a trade-off

## Hardware and Scanner Design

- Current scanner is too large; target reduction to roughly one quarter of current size
  - Minimum viable components: ESP32, RC522
  - LED for tap confirmation: easier to implement, sufficient for basic feedback
  - OLED display: useful for showing game messages or station instructions; worth including in one version
- Two versions to build:
  - Stationary station: larger, with display, fixed at event locations
  - Compact modular unit: battery-powered, portable, can be placed or hidden anywhere
- Passport form factor confirmed as the scanner design concept for the showcase
  - A hollow/printed version with no components is acceptable for the showcase if parts are unavailable, as long as it shows where components would sit
- Buck converter still not delivered (over a month late); modular battery-powered build is blocked until it arrives
  - If it does not arrive, the modular unit may have to be represented as a non-functional prop
- Token is always a giveaway item; scanner is permanent infrastructure
  - Scanner quality and compactness matter more long-term; token redesign is low cost since it is always given away
  - Base token design with interchangeable inserts was discussed but noted as tricky; not a priority
- More token form factor designs needed to illustrate reusability across events
  - The casing of the scanner can change each year; the internal hardware does not
  - Showing multiple physical forms makes the “reusable base, adaptable design” argument tangible for judges
- Current hardware count: 2 units; plan is 1 stationary station + 1 modular unit, no need to buy more

## Reusability and Tech Debt

- Reusable components (the core argument for the project’s long-term value):
  - NFC token (always reissued but same technology)
  - Scanner hardware (permanent, casing changes)
  - Key service: token registration, token-to-person binding, station scanning
  - Portal: registration, check-in, teaming (rebuilt once, reused every year)
- Non-reusable by design, and intentionally so:
  - Event website (theme, sponsors, challenge statement change every year)
  - Games and event-specific experiences (events must be different or people stop coming)
- Key service is ephemeral: runs ~3 months around the hackathon period, then spins down
  - On restart next year, key bindings are re-pulled from the portal; portal is the source of truth
- The reusability argument needs to be clearly explained to supervisors and showcase judges
  - Supervisors have not attended a Hackomania event and may not understand the event-driven context
  - The team needs to be able to articulate: which parts scale, which parts do not, and why the non-reusable parts are intentionally non-reusable
  - Suggested framing: “We are not increasing tech debt; we are abstracting the parts that were always going to be rebuilt anyway”
- SST’s own internal apps (e.g., orientation app) cited as an example of reusability failing in practice even when intended; pushes back on the assumption that reusability is straightforward

## Next Steps

- **Implement contact exchange on token tap**
- **Design and build at least one token-triggered game**
- **Design more token form factors to illustrate event-to-event reusability**
- **Build compact modular scanner unit**
- **Confirm next meeting day: Wednesday or Friday (Adam)**

# Our own notes

- open message/recruitment board + filters.
- it can also be in catagories too
- like the token can be the entry point to it. We can also integrate telegram bots (in the future)
- gamification elements
- would making a PWA help with it (the tab management)
- we should hide the answers after each connection


- when they tap each other, they should tap each other's phone and it will come up with a challenge and pit the two people

for the sponsors:
- how many things can they tell them about the brand?
- they have the build the website for the new hackomania again. They by definition will have to create new events every year
- identity the reusable components and explain why some unreusable components are like that


sorting the groups is a pretty event specific part


how do we ensure that we have a reusable portion of the web app

mascot idea

as many ways of scanner as possible (we can customise it to the event needs)
- unbind the token with the guest signout
- improve the organiser/key admin Token view.
