# Screens (MVP)

Moved here from `apps/event-web/CLAUDE.md` on 30 Oct 2026. Only the links between sections
changed.

Each row says what a screen reads and writes, and the cases it must handle.

| Route | Role | Reads | Writes | Must handle |
|---|---|---|---|---|
| `/login` | anyone | | `POST /auth/dev-login` (dev), `POST /auth/firebase` (prod) | `not_found` on a bad dev user; a refused ID token says the sign-in failed |
| `/#login=<link>` | anyone | `GET /me` | `POST /auth/login-link`, before the first `/me` | the fragment gone at once; an expired link leaves the old session and says so |
| `/` dashboard | participant, organiser | `GET /me` | | Portal user ID with a copy button; claim help before the first tap; Event content only afterwards |
| `/passport` | participant | `GET /me` `stamps` | `PATCH /me` for the name | every station shown; empty slot where `earned_at` is null; the name prompt while `has_name` is false, and Change name for everyone; a new stamp with a link offers "Open their page?" in a new tab, until it is pressed, dismissed or replaced by the next stamp, and a stamp with no link shows nothing |
| `/activity` | participant | `GET /me` `recent_taps` | | non-accepted taps shown with a plain-language reason |
| `/admin` | organiser | | | participant sees the 403 view |
| `/admin/stations` | organiser | `GET /admin/stations` (Event board) polled | `POST /admin/stations`, `POST /admin/stations/{id}/key`, `PUT /admin/stations/{id}/passport`, `PUT /admin/stations/{id}/booth`, `POST /admin/stations/{id}/disable`, `POST /admin/stations/{id}/enable` | one-time `api_key` reveal with copy button and warning; online and offline; unknown status, which is never shown as offline; problem stations first; empty board; one Actions menu per row, named for its station, holding every row action, and the rows' order held while it is open; Add to passport on a row with no settings, Edit on one with, including the group link it can save or clear; each station's booth, or "No booth", changed from the menu, with the example plan's codes in the field's hint; Replace key on every row, disabled rows included; Disable behind a confirmation, Enable at once; a closed dialog puts the keyboard back on its row's Actions button |
| `/admin/taps` | organiser | `GET /admin/taps` polled, filters, cursor | | stored `no_game` keeps its user; load more; empty log |
| `/admin/fallback` | organiser | `GET /admin/stations` (Event board) | `POST /admin/taps` | `not_found`; result status shown after submit |
| `/admin/summary` | organiser | `GET /admin/stats` | `GET /admin/export.csv`, fetched and saved as a file | zero-tap event |
| `/map` | organiser, map screen | `GET /map` polled every 2 s | | every station at its booth; one with no booth or an unknown one listed beside the map; disabled marked in words, no pulse; a pulse only when `taps` rose; `forbidden` shown in place, with Log out; no names |

`/admin/stations` and `/admin/fallback` both read the Event board, from
`listStationBoard()`, which is the only call to `GET /api/v1/admin/stations` (9.2).
The export is not a link: `features/stats/export-button.tsx`
fetches it and hands the browser a Blob.

Endpoint statuses (`Implemented`, `Sprint 1`, `MVP`) are in the agreement. Screens
against `MVP` endpoints are still built now, against mocks.
