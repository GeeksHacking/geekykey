# GeekyKey

## Agent skills

### Issue tracker

Tickets live in Linear (workspace `geekykey`, through the Linear MCP). Specs and wayfinder maps live as markdown under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels, each named after its role (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Personal skills

`.agents/personal/` holds Ethan's own skills for this repo, and it is gitignored, so it never
reaches GitHub and a fresh clone will not have it. That is deliberate: anything personal is
written there instead of in `.agents/skills/`, which is the shared, tracked set that the team
installs from.

Nothing in `.agents/personal/` is a source of product truth. Those skills record how to work
in this repo, and the sources below still say what to build. [`source-truth-check`](.agents/personal/source-truth-check/SKILL.md)
is the one to read before answering anything about the contract, the architecture, a date or a
ticket's state. Add further personal skills as new folders beside it.

### Source of truth

In order: the API agreement, then the spec, then `CONTEXT.md` and the ADRs, with Linear and our own notes below all of them. Code and tests rank last.

- The API agreement: [apps/API-AGREEMENT.md](apps/API-AGREEMENT.md). **Highest.** Section 1 says of itself: *"The screens and the stations build against the shapes here, not against either service's source. If a service differs from this file, the file wins and the service is fixed. This file also wins over every other document, including the migration spec."* Field names, status codes, error codes and the screen wording in section 13 all live here.
- The spec: [.scratch/db-hosting/spec.md](.scratch/db-hosting/spec.md). Decides what gets built and what is removed. It makes no claim of precedence over the agreement, and defers to it for shapes: *"Field names and status codes live in apps/API-AGREEMENT.md."* Section 11 marks what's provisional, section 12 what's still to confirm. Adam reviews it before any code changes.
- `CONTEXT.md` and `docs/adr/`: vocabulary and architecture decisions. ADR 0004 supersedes ADR 0002 for the showcase.

Where a lower source contradicts a higher one, the higher one wins, and the difference is raised as an issue rather than settled in the code.

These documents change often, so re-read them at the start of a task and before any claim about the contract, and check for new commits on them rather than working from what was true earlier in the session.

### Writing style

Before finishing a PR description, a report, user-facing text, an updates-site entry, a doc, or a Linear ticket or comment meant for people, read [.agents/skills/unslop/SKILL.md](.agents/skills/unslop/SKILL.md) and apply it. Tickets and comments written for an agent don't need it. Screen wording set in section 13 of the API agreement is used exactly as written. The skill also lists the dash replacements and the check for dashes in a file.

### Escalation

Any conflict or problem between the sources above, and anything important or likely to affect the project, becomes an issue for Adam. That covers other lanes too: something for the backend or the infrastructure is raised there rather than fixed from the frontend.

### Lanes

This section binds agents working for Ethan's frontend team. It doesn't bind agents working for Adam, who owns the backend and the infrastructure (Adam, 12 Oct 2026).

The frontend is ours: `apps/frontend`, `apps/geekykey-web`, `apps/updates`, and this file.

`apps/backend`, `infra/`, `firmware/` and `compose.yaml` are **not ours and are not to be edited.** Not to fix a bug, not to tidy a type, not to add a test. A problem there is raised as a Linear issue for Adam, with the evidence, and left there. Read them freely to answer questions about the contract; changing them needs Ethan's explicit permission for that specific change.
