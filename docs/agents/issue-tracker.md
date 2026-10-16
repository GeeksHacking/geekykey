# Issue tracker: Linear, with specs and maps in `.scratch/`

Work is split between two places:

- **Tickets** (the implementation issues that `/to-tickets` and `/triage` handle) live in Linear, workspace `geekykey`. Use the Linear MCP tools (`save_issue`, `get_issue`, `list_issues`, `save_comment`, `list_comments`), not `gh`.
- **Specs and wayfinder maps** are markdown files under `.scratch/<feature-slug>/`, such as `.scratch/db-hosting/`.

## Linear conventions

- **Team**: the team whose area the work is in. Backend (`BAC`) for `apps/event-service`; Frontend (`FRO`) for the screens in `apps/`; Hardware (`HAR`) for `firmware/` and the tokens. Ask if it isn't clear. Everything sits under the initiative "GeekyKey at the showcase", in one of its projects.
- **Project and milestone**: the Linear project for the effort (for example "Move to TiDB and Cloudflare"). Each spec checkpoint gets its own milestone, named like "Checkpoint 1: today's backend on workerd and TiDB".
- **New tickets**: status `Todo`, assigned to the person driving the session, with the triage label from `triage-labels.md`.
- **Blocking**: use Linear's native blocked-by relations (`save_issue` with `blockedBy`). Also list the blockers in the issue body, so someone reading only the text can see them.
- **Comment**: `save_comment` on the issue.
- **Apply / remove labels**: `save_issue` with `addLabels` / `removeLabels`. If a label doesn't exist in the workspace yet, create it with `save_issue_label`.
- **Close**: set the status to `Done` (or `Canceled` for `wontfix`), and add a comment saying why.

## When a skill says "publish to the issue tracker"

- A spec goes to `.scratch/<feature-slug>/spec.md`.
- Tickets go to Linear as issues, linked to the spec by its repo path.

## When a skill says "fetch the relevant ticket"

- A Linear identifier (for example `BAC-3`) means `get_issue`, plus `list_comments`.
- A path means reading the file.

## Wayfinding operations

Used by `/wayfinder`. The map and its tickets stay in local markdown.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`. The question goes in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`), and a `Status:` line records `open`/`claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: the open, unblocked, unclaimed files in `.scratch/<effort>/issues/`. The lowest number goes first.
- **Claim**: set `Status: claimed` and save before doing any work.
- **Resolve**: add the answer under an `## Answer` heading, set `Status: resolved`, then add a context pointer (gist + link) to the map's Decisions-so-far.
