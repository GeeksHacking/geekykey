# How to write an update entry

This folder is the GeekyKey **updates site**: a timeline the capstone mentors read between
check-ins. Julian and Brian are asked to meet us at least once a fortnight (Annex C of the
mentor guidelines). This site fills the gap in between, so a check-in starts at "here is
what we decided" instead of "what have you been up to".

It is also the project journal. The 2 Sep internal meeting flagged that the journal is
behind and needs to capture *thought processes and decision history, not just final
outcomes*. Every entry you write here is material Component B and C can quote later, so
write the reasoning down while you still remember it.

One entry per check-in window. Entries live in `src/content/entries/` and are named
`YYYY-MM-DD-short-slug.md`, dated on the day the window closes.

## The front matter

The block between the `---` lines at the top of the file. It is the machine-readable part:
the site uses it to sort the timeline, group entries by sprint, and show the "asks" box.

```yaml
---
# Quote the title when it contains a colon, like this one.
title: "Sprint 1 opens: the first endpoint lands and the team reshuffles"
date: 2026-09-23          # the day this entry covers up to
window:
  from: 2026-09-18        # the day after the previous entry's `to`
  to: 2026-09-23
sprint: 1                 # 1-4, or omit before Sprint 1 starts
authors: [adam]           # adam | zitao | joshua | ethan: who wrote it, not who did the work
summary: >-
  Two or three sentences. This is all a mentor sees in the timeline list, so put the
  decision or the blocker here, not the commit count.
areas: [backend, frontend, hardware, tooling]   # backend | frontend | firmware | hardware | design | research | tooling | admin
asks:                     # pulled to the top of the page; drop the key if there are none
  - who: Qing Guan
    what: 30 minutes on the portal user schema and the OIDC callback shape
---
```

## The body

Always these five headings, in this order, so entries are comparable week to week. Leave a
heading out only if there is genuinely nothing under it.

### `## What moved`
Sub-headed by area. Plain English, one line per thing, past tense. Generated commit lists
go under the code areas, but **edit them into sentences**: a mentor should not have to
read a diff. Hardware, token design and research go here too: work that leaves no commits
still counts, and an entry made only of code makes it look like only one person is working.

### `## Decisions`
The part the report needs. One block per decision:

- **What we decided**: one line.
- **Why**: the constraint that forced it.
- **What we rejected**: the other option, and what it would have cost.

A decision is not only a technical one. Scoping a feature out, changing the token form
factor, picking a test event: all of it belongs here.

### `## Blockers and asks`
What is stopping you, and specifically who can unblock it. Anything addressed to a mentor
should also be in the `asks` front matter so it shows at the top of the page.

### `## What we learned`
The check-in template's "Learning & Output" section. Courses, concepts, the thing that
finally clicked. Being a learner here is the point of the capstone; do not hide it.

### `## Next window`
The one goal per person for the coming fortnight. Next entry opens by saying whether it
happened.

## Photos

A photo of a prototype, a sketch or a CAD render often says more than a paragraph, and it
is the main way hardware and design work shows up here. Put the file in
`src/content/entries/images/`, start its name with the entry's date, and reference it where
it belongs in the body:

```md
![The first scanner prototype on the bench](./images/2026-09-23-scanner.jpg)
```

The text in the square brackets describes the photo for anyone who cannot see it, so say
what is in it. Phone photos can go in as they are: the build converts them to WebP and makes
smaller copies for smaller screens. No participants' faces, and nothing on a screen that
counts as PII (house rule 1).

## House rules

1. **No PII, ever.** The site is public. No participant names, no raw survey responses, no
   emails, no keys or `.env` values, no station secrets. The A/B test data gets reported as
   aggregates only. When in doubt, leave it out and tell the mentors in person.
2. **An entry stands on its own.** The repo is public now, but a mentor reading between
   check-ins should not have to open a commit to follow an entry, so say in words what
   changed. A link to the code or a pull request is a courtesy for anyone who wants more.
3. **Write it the week it happens.** An entry reconstructed in November is worth much less
   to the report than one written on the day, and it will be obvious which is which.
4. **Uncertainty is content.** "We tried X, it did not work, we do not know why yet" is a
   perfectly good entry, and mentors can act on it. A tidy entry that hides a problem
   wastes the one fortnightly conversation we get.
5. **No en or em dashes.** The design rules the site follows ban them anywhere a reader
   can see. Use a comma, a colon, brackets or a full stop, and a plain hyphen for date
   ranges (`5-18 Oct`). The build stops and prints the line if one slips in.

The build also checks the things that are easy to get wrong when copying the last entry:
the file name starts with `date`, `date` is the same day as `window.to`, and `authors` and
`areas` only use the values listed above. A `TODO(` marker is fine while you write, but the
build that publishes the site refuses an entry that still has one.

## Adding an entry

1. Copy the most recent file in `src/content/entries/` to a new dated filename.
2. Update the front matter. `window.from` is the day after the last entry's `window.to`.
3. Run the commit collector for your window (arriving in a later checkpoint) and edit its
   output into `## What moved`, and into changelog lines for anything that shipped.
4. Preview it: `mise run dev:updates`, then open http://localhost:4321. The page reloads
   as you save.
5. Open a PR. The entry ships in the same PR as the work it describes where possible.

# How to add a changelog line

The changelog runs alongside the entries. An entry tells the story of a window: what we
decided and why. The changelog is the plain list of what shipped, one line per change, so a
mentor can see at a glance what exists now. The site shows it at `/changelog`, and each
entry page ends with the lines from its own window.

All of it lives in one file, `src/content/changelog.yaml`, oldest first. Add new lines at
the bottom:

```yaml
- id: api-v1-me            # lowercase words and hyphens; becomes /changelog#api-v1-me
  date: 2026-09-25         # the day it shipped
  area: backend            # one of the entry areas: backend | frontend | firmware | ...
  change: >-
    The participant dashboard and passport can read from the real backend: a user's
    profile, paired tokens, points, stamps and last 50 taps.
```

## What gets a line

One line per change someone could see or use: an endpoint that works, a screen that moved
onto real data, the reader doing something new, a prototype printed, a test session booked.
Hardware and design count as much as code. Chores that change nothing visible (formatting,
lockfile bumps, renames) do not get a line.

Write it as one or two plain sentences in the present tense, saying what is now true. A line
for a decision may end with one more sentence that starts "The trade-offs we accept:" and names
what the decision gives up. Keep that phrase word for word, so a reader can find every
trade-off by searching for it. Unslop's rule 14 counts a framing colon as filler, but this one
stays, because it is the site's fixed marker for a trade-off. The site shows a line as plain
text, so no Markdown and no links, and the house rules above still apply: no PII, no en or em
dashes.

## Which entry a line belongs to

Nobody links lines to entries by hand. Each entry covers the lines dated inside its window,
and lines after the latest entry show at the top of the changelog as "Since the last
update", ready for whoever writes the next one.

The one exception is two entries that end on the same day. Then the file has to say where
that day splits: add `closes:` with the earlier entry's id to the last line it covers.
Every line after it belongs to the next entry.

```yaml
- id: updates-site
  date: 2026-09-23
  area: admin
  change: >-
    This updates site goes up, with its first entry.
  closes: 2026-09-23-sprint-1-opens
```

The build checks the file and stops with a message saying what to fix when: two lines share
an id, a line does not start with `- id:`, lines are out of date order, a line is dated before
any entry's window starts, or two entries end on the same day with no `closes:` between them.
