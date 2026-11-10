# Event screens coding standards

Read these rules when reviewing Event screens code. They cover conventions that
the automated checks cannot fully enforce, design rules and the checks for a finished screen.

## Module boundaries

- Route files wire a feature to a URL. Keep screens in `features/` and data in hooks, without
  router loaders, so changing routers stays a change to routes and navigation.
- Features own their components, hooks, fixtures and tests. Cross-feature imports go through
  `components/` or `lib/`; `features/auth` is consumed only by route files.
- Customise shadcn tokens and variants in `components/ui`; keep GeekyKey behaviour in features.
- Let the router generate `src/routeTree.gen.ts`.

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
- Use the existing shadcn components, Phosphor icons and self-hosted fonts. Replace the
  `lucide-react` imports shadcn generates; the default icon weight is `fill` to match the kit.
- Explain a new library or pattern before adding it. Keep the app on Vite and function components.

## Data

- Server data enters components through TanStack Query hooks in `features/*`. Never
  `useEffect` plus `fetch`. All data access goes through `src/api/`, so screens work with either
  client. Keep transport and response validation there, with no per-screen response reshaping.
- Derive, don't sync: no state that duplicates props or server data. The previous `/me` snapshot
  for animation is the exception; [design direction](docs/design-direction.md) explains it.
- Follow the [server-state patterns](docs/data-access.md#server-state) for polling and writes.
- Fixtures cover loading, errors and incomplete records, including `earned_at: null`. Use realistic,
  uneven data, the seeded users and the event's questions; no round numbers or generic names.
- Rules for formatting dates and points live in `lib/format.ts` and nowhere else.

## Dependencies and generated assets

- Keep TypeScript on the repo's pinned 6.0 release. The reason and installation gotchas are in
  [scaffold notes](docs/scaffold-notes.md#typescript-version).
- Keep `@firebase/app` and `@firebase/auth` on the versions one `firebase` release uses, behind
  `src/lib/firebase.ts`. The separate packages avoid pulling in Firestore and the other products.
- Import `zod/mini` for forms and response schemas. Classic zod would add about 10 KB gzipped to
  every screen; lint rejects that import. Mini uses `z.nullable(...)` and
  `.check(z.minLength(1, "..."))` rather than `.nullable()` and `.min(1, "...")`.
- Before changing the avatar's generated art or figures, read [the art guide](art/avatar/README.md).
- Before adding GSAP or three.js imports, read [design direction](docs/design-direction.md) for
  loading boundaries, motion exceptions and reduced-motion behaviour.

## Tests

- Colocate tests as `*.test.tsx`. Test behaviour through the DOM, not the implementation.

## Docs that follow the code

- **A change to what a screen reads, writes or handles updates its row in
  [docs/screens.md](docs/screens.md)** in the same change: a new route it calls, a new error it
  shows, a new case such as "after a reset". CLAUDE.md sends whoever builds a screen to that row
  first, so a stale row misleads the next one. Example: the `/admin/groups` row lists
  `POST /api/v1/admin/groups/reset` and what a failed reset shows.

## Design rules

Before a change to colour, type, shape, layout, the sci-fi look or motion, read
[docs/design-direction.md](docs/design-direction.md): how the taste skill applies to a product
UI, the dials, the palette and its helpers, the look, and the motion exceptions on the big screens.
Every change follows these rules:

**Status is never colour alone.** Every `tap_status` and every online/offline indicator
renders icon plus text plus colour. Accepted green, cooldown orange, no_game red. The kit
has no status colours, so these are the app's own.
Cooldown is orange on screen rather than the agreement's amber so it never reads as the
brand yellow. Station LEDs stay amber.

**Copy:** plain language. British spelling in visible text ("organiser", "colour"). API
spelling in code (`organizer`). No emoji. No em-dash or en-dash anywhere visible. No
placeholder-as-label. Buttons are verbs, one label per intent across the app.

**States:** every data view ships loading, empty, error, and populated. Skeletons match
the final layout. Empty states say what to do next. Errors are inline where the user
acted; toasts only for transient success.

## Definition of done for a screen

1. `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass.
2. Loading, empty, error, and populated states all render against the mock client.
3. Checked at 360 px and 1280 px, in light and dark.
4. Keyboard reachable, visible focus rings, a label on every input, WCAG AA contrast on
   text and controls.
5. No status conveyed by colour alone.
6. No em-dash or en-dash in any visible string. No emoji. No lorem ipsum, no generic
   names, no round fake numbers.
7. shadcn components customised to the tokens, not default.
8. Endpoints and fields follow the agreement, or the ticket's draft for its next version
   under the root [source-of-truth rule](../../AGENTS.md#source-of-truth).

For step 3, `pnpm shot <route>` takes the four screenshots, with `--as participant` or
`--as organiser` to sign in first (`scripts/shot.ts`). It uses the dev server on :5173 if one is
up and starts the mock one if not. For anything `--click` doesn't cover, such as opening a menu
first, drive Playwright yourself. Two gotchas: Radix Select ignores a synthetic click, so dispatch a
`pointerdown` on the trigger and then click the option; and headless Arc crashes after a few
navigations.
