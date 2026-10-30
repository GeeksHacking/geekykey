# Event Service coding standards

The judgement calls this service's code follows that no linter or type check enforces. oxlint,
oxfmt and `tsc` cover the rest. Each rule names an example to copy.

## Words

- **Use CONTEXT.md's terms** in names, comments, test names and any text a person reads:
  participant, stamp slot, next stop, hand-off. Where CONTEXT.md lists a word under _Avoid_, use
  the term it sits under instead.
- **Cite the contract by section** in a comment that depends on it: "the API agreement's 6.1",
  "spec section 3.7". The agreement wins over this code, so the citation tells a reader where to
  check.

## Station screens

- **Pass any text from people through `forTheScreen()`** (`src/event/display-names.ts`) before
  it goes into a station's `lines`. The screen shows printable ASCII only; `forTheScreen()` takes
  accents off and returns null for anything else, such as Chinese characters. On null, fall back
  to the agreement's wording for that line rather than sending a broken one. Example:
  `nextStopLine()` in `src/games/passport/passport.ts`.
- **Fit each line to `LINE_LENGTH`** from `@geekykey/handoff`, cutting the least important part
  (a name, a booth) so the part that matters stays whole: `progressLine()` keeps `3 of 6` and
  shortens the name.

## Database reads

- **Type `db` as `Db | Tx`** for a read the tap pipeline also runs during an ingest, and as
  `Db` for one only a route calls. A `Tx` is the ingest's transaction, with the station's row
  locked, so the read sees what that ingest has written so far. Examples:
  `greetingNames()`, `quietestFirst()`.
- **Take `now` as a parameter** in anything that depends on the time, so tests can pass
  a fixed time, or `fakeClock()` from `src/test-helpers.ts`. Example: `quietestFirst(db, now)`.

## Tests

- **Test through the route a client calls**: the hand-off route for taps, `GET /api/v1/me` for
  the passport. A test that calls an inner function passes even when the route around it changes
  what a client sees.
- **Parse an answer the Event screens read with `screensSchemas`** from `src/test-helpers.ts`,
  adding the schema's name there when a route has none yet. A test then fails when the service
  sends something the screens would refuse.
- **Name a test by what is true afterwards**, as a sentence: "a tap by someone who has never
  logged in is still stored".
