# Updates site

A public timeline of the project for the capstone mentors, built with Astro. It is also the
project's journal: the final report quotes its decision history. It isn't part of the product, so a
team taking GeekyKey on can leave it as a record.

- `src/content/entries/` has one Markdown file per check-in window, named `YYYY-MM-DD-slug.md`.
- `src/content/changelog.yaml` has one line per decision or visible change, newest last.
- [CONTENT-MODEL.md](CONTENT-MODEL.md) says what goes in an entry and a changelog line.

```bash
mise run dev:updates      # http://localhost:4321
mise run build:updates    # build to dist/, checking every entry
```

The build fails on an en or em dash, a file name that doesn't start with the entry's date, a
leftover `TODO(` marker, or a word `CONTEXT.md` asks us to avoid. On each pull request, CI also
fails if a changelog line that `main` has went missing (`scripts/check-changelog-ids.ts`). Both
tasks turn off Astro's anonymous usage reporting.
