# GeekyKey

## Agent skills

### Issue tracker

Tickets live in Linear (workspace `geekykey`, through the Linear MCP). Specs and wayfinder maps live as markdown under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels, each named after its role (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Source of truth

In order: the API agreement, then the spec, then `CONTEXT.md` and the ADRs, with Linear and our own notes below all of them. Code and tests rank last.

- The API agreement: [apps/API-AGREEMENT.md](apps/API-AGREEMENT.md). **Highest.** Section 1 says of itself: *"The screens and the stations build against the shapes here, not against either service's source. If a service differs from this file, the file wins and the service is fixed. This file also wins over every other document, including the migration spec."* Field names, status codes, error codes and the screen wording in section 13 all live here.
- The spec: [.scratch/db-hosting/spec.md](.scratch/db-hosting/spec.md). Decides what gets built and what is removed. It makes no claim of precedence over the agreement, and defers to it for shapes: *"Field names and status codes live in apps/API-AGREEMENT.md."* Section 11 marks what's provisional, section 12 what's still to confirm. Adam reviews it before any code changes.
- `CONTEXT.md` and `docs/adr/`: vocabulary and architecture decisions. ADR 0004 supersedes ADR 0002 for the showcase.

Where a lower source contradicts a higher one, the higher one wins, and the difference is raised as an issue rather than settled in the code.

These documents change often, so re-read them at the start of a task and before any claim about the contract, and check for new commits on them rather than working from what was true earlier in the session.

### Writing style

**No em-dash (U+2014) or en-dash (U+2013) anywhere.** Not in visible app text, not in code comments, not in a report, a ticket, a comment or a chat message. This restates `apps/frontend/CLAUDE.md` and applies to everything an agent writes here, including documents about removing dashes.

Before finishing a PR description, a report, user-facing text, an updates-site entry, a doc, or a Linear ticket or comment meant for people, read [.agents/skills/unslop/SKILL.md](.agents/skills/unslop/SKILL.md) and apply it. Tickets and comments written for an agent don't need it. Screen wording set in section 13 of the API agreement is used exactly as written. The skill also lists the dash replacements and the check for dashes in a file.

### Pull request descriptions

Reports go in `reports/`, which is gitignored, one file per change set. Keep them short and scannable, in this order and no other:

1. `# ` title, naming the ticket and the change. Resolves **FRO-nn**.
2. `## Summary`, two or three sentences.
3. `## Key Changes`, one `###` subsection per app or area.
4. `## Verification`, the gates and counts, as run.
5. `## Notes for review`, only for decisions a reviewer might want to make differently.
6. `## Suggested commits`, the Conventional Commits subjects, then the recommended branch name.

Rules that apply to these reports:

- Bullets, not tables. A table collapses when the report is pasted into a chat or a plain text view.
- No reflection on the debugging process, false alarms, or self-correction. A reviewer needs what changed and why, not how the work was arrived at.
- No meta-commentary about the report itself, or about conversations with Ethan.
- Justify a decision in a line or two. If the reasoning needs a paragraph, the decision is probably wrong.
- Everything stated must be measured or read from the file. No claim from memory, and no inference from reading class names in place of rendering the page.

### Escalation

Any conflict or problem between the sources above, and anything important or likely to affect the project, becomes an issue for Adam. That covers other lanes too: something for the backend or the infrastructure is raised there rather than fixed from the frontend.

### Lanes

This section binds agents working for Ethan's frontend team. It doesn't bind agents working for Adam, who owns the backend and the infrastructure (Adam, 12 Oct 2026).

The frontend is ours: `apps/frontend`, `apps/geekykey-web`, `apps/updates`, and this file.

`apps/backend`, `infra/`, `firmware/` and `compose.yaml` are **not ours and are not to be edited.** Not to fix a bug, not to tidy a type, not to add a test. A problem there is raised as a Linear issue for Adam, with the evidence, and left there. Read them freely to answer questions about the contract; changing them needs Ethan's explicit permission for that specific change.
