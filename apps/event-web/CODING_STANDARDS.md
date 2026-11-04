# Event screens coding standards

These are the judgement calls the Event screens follow and no check enforces. oxlint, oxfmt, `tsc`
and `scripts/check-dashes.ts` cover the rest. The design rules and the definition of done are in
[CLAUDE.md](CLAUDE.md), because the agent building a screen works from them.

## Components

- Function components, named exports, one component per file, explicit prop types.
  No `React.FC`.
- Keep components under roughly 150 lines, and split them by responsibility, not by markup.
- Comments explain why, not what.

## Types

- Strict TypeScript with `noUncheckedIndexedAccess`. No `any`: use `unknown` and narrow it.

## Styling

- Tailwind classes only. No CSS modules, no CSS-in-JS, and no `.css` files besides
  `globals.css`. Compose class names with `cn()`.

## Data

- Server data enters components through TanStack Query hooks in `features/*`. Never
  `useEffect` plus `fetch`, and never a `useState` copy of something the cache holds.
- Derive, don't sync: no state that duplicates props or server data.
- Rules for formatting dates and points live in `lib/format.ts` and nowhere else.

## Tests

- Colocate tests as `*.test.tsx`. Test behaviour through the DOM, not the implementation.

## Docs that follow the code

- **A change to what a screen reads, writes or handles updates its row in
  [docs/screens.md](docs/screens.md)** in the same change: a new route it calls, a new error it
  shows, a new case such as "after a reset". CLAUDE.md sends whoever builds a screen to that row
  first, so a stale row misleads the next one. Example: the `/admin/groups` row lists
  `POST /api/v1/admin/groups/reset` and what a failed reset shows.
