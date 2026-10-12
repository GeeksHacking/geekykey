# GeekyKey

## Agent skills

### Issue tracker

Tickets live in Linear (workspace `geekykey`, through the Linear MCP). Specs and wayfinder maps live as markdown under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels, each named after its role (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Source of truth

In order: the spec, then the API agreement, then Linear and `CONTEXT.md`, which sit at about the same level. Code, tests and our own notes rank below all of them.

- The spec: [.scratch/db-hosting/spec.md](.scratch/db-hosting/spec.md). Adam reviews it before any code changes. Section 11 marks what's still provisional, section 12 what's still to confirm.
- The API agreement: [apps/API-AGREEMENT.md](apps/API-AGREEMENT.md). Field names, status codes and the error codes live there, not in the spec.

Where a lower source contradicts a higher one, the higher one wins, and the difference is raised as an issue rather than settled in the code.

These documents change often, so re-read them at the start of a task and before any claim about the contract, and check for new commits on them rather than working from what was true earlier in the session.

### Escalation

Any conflict or problem between the sources above, and anything important or likely to affect the project, becomes an issue for Adam. That covers other lanes too: something for the backend or the infrastructure is raised there rather than fixed from the frontend.

### Lanes

The frontend is ours: `apps/frontend`, `apps/geekykey-web`, `apps/updates`, and this file.

`apps/backend`, `infra/`, `firmware/` and `compose.yaml` are **not ours and are not to be edited.** Not to fix a bug, not to tidy a type, not to add a test. A problem there is raised as a Linear issue for Adam, with the evidence, and left there. Read them freely to answer questions about the contract; changing them needs Ethan's explicit permission for that specific change.
