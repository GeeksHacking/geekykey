# Event screens

## Working context

Before changing scope or working on the booth demo, read the [showcase and testing
plan](https://linear.app/geekykey/document/showcase-and-testing-plan-53253683443c) for the current
priorities, dates and owners. It is the one copy; update it in Linear.

## Sources of truth

Follow the root [source-of-truth order](../../AGENTS.md#source-of-truth), including its rule for
a ticket building a draft of the next agreement version.

Before changing requests, responses or errors, read the [API agreement's
conventions](../API-AGREEMENT.md#2-conventions) and the endpoint's section. Section
[13](../API-AGREEMENT.md#13-screen-to-endpoint-map) sets screen wording, and section
[12](../API-AGREEMENT.md#12-out-of-scope-for-the-showcase) sets exclusions.

Before reviewing a change, read [CODING_STANDARDS.md](CODING_STANDARDS.md) for module
boundaries, data and dependency conventions, design rules and the definition of done.

## Screens

Before building or changing a screen, read its row in [docs/screens.md](docs/screens.md) for its
route, role, calls and cases. Update the row in the same change.

## Design rules

Before changing colour, type, shape, layout or motion, read
[docs/design-direction.md](docs/design-direction.md). It applies the
[experimental v2 taste skill](../../.agents/skills/design-taste-frontend-v2-experimental/SKILL.md)
to this product UI. Use that version; the newer default is for public pages.

## Mock and live builds

When changing data access, read [docs/data-access.md](docs/data-access.md) for the client boundary
and server-state patterns. When switching modes or testing login links, read
[README.md](README.md#mock-and-live-builds) for session and Firebase gotchas.

## The real backend

When checking a screen against a running service or preparing a deploy with a new required
field, follow [the integration checks](README.md#checking-the-real-service).

## Server state

Before adding a query, mutation or poll, read [the server-state
patterns](docs/data-access.md#server-state), including login-link ordering and avoiding stale polls
after writes.

## Directory layout

Before adding a file or finding a feature, read [docs/directory-layout.md](docs/directory-layout.md).

## Commands

For setup, phone access and screenshot prerequisites, read [README.md](README.md).
Scripts and installed versions live in [package.json](package.json); toolchain versions live in
[the root mise config](../../.mise.toml).

## Gotchas

Before using TanStack Table, react-hook-form's `watch`, redirects, `next-themes`, or changing
TypeScript, read [docs/scaffold-notes.md](docs/scaffold-notes.md).
Before copying Tailwind classes or changing `globals.css`, read
[docs/tailwind-4.md](docs/tailwind-4.md) for changed class meanings and the shared theme.

## Team and AI usage

- Agents may write logic; keep changes small, explain them plainly, and have the frontend owner
  review them.
- Show a pattern once and point to it rather than generating the same thing many times.
