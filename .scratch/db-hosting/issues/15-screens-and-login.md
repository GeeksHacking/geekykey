# Which screens belong to which service, and how does each know who is logged in?

Type: grilling
Status: resolved
Blocked by: 12
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

- **The GeekyKey Service's screens.** Julian's mobile flow shows a token's user info, or lets the user claim an unclaimed token, after logging in through the Portal. `geekykey.geekshacking.com` is this service's address ("Which hostnames, and which OAuth redirect URLs?").
- **The passport and admin screens** (today's `apps/frontend`). Do they belong to the sample Event Service? Do they log in through the Portal themselves (a second OAuth client and redirect URL), or trust the GeekyKey Service's login?
- **Addresses.** Which hostname serves each set of screens, and does each reuse the setup from "How is the frontend set up, and how does the browser reach the backend?": a Worker serving the screens that forwards `/api` and `/auth` to its own backend?
- **The session cookie.** If the two sets of screens sit on different hostnames, what happens to `gk_session`?

**Settled by "Which parts of today's backend belong to the GeekyKey Service, and which to the Event Service?" (28 Sep):**

- The Event Service no longer knows a user's tokens, so `/me` cannot list them from its own data. Does the passport ask the GeekyKey Service, or do only the GeekyKey Service's screens show tokens?
- Setting up a station spans both services: the GeekyKey Service creates it and shows its key once; the Event Service holds its passport settings (name, location, points). Which screens do this?
- The online light's data belongs to the GeekyKey Service. The tap log, stats and export belong to the Event Service.
- Organizer is a role at one event, held by the Event Service. Who grants it?

**Settled by "How do local dev, tests and CI get a runtime and a database?" (28 Sep):** locally, the Vite dev server's proxy stands in for the service binding, pointed at `wrangler dev` on port 8000. After the split, one `wrangler dev` command runs both services and only the first one answers on port 8000. Which service that is, and whether the screens then move to Cloudflare's Vite plugin (the screens' Worker running locally with the service binding real), follows from this ticket.

**Settled by "What is a token's ID, and what URL is written on each token?" (28 Sep):** a phone that taps a token opens the **token page**, `https://geekykey.geekshacking.com/t/<UID>`, on the GeekyKey Service. It has four levels: not logged in (a login prompt, nothing about the token), an unclaimed token (claim it), someone else's token ("belongs to someone else", no name), and your own token (see it, release it). Organizers get no extra level. After logging in through the Portal, the user must land back on the token page they came from, not on a fixed page. The `/t/` path must keep working for as long as tokens exist.

**Settled by "How do stations talk to the GeekyKey Service?" (28 Sep):** stations call `api.geekykey.geekshacking.com`, not `geekykey.geekshacking.com`, so a Worker in front of the screens cannot stop taps. An organizer needs a way to **replace a station's key, keeping its ID**, shown once like a new key: a new station ID would orphan the Event Service's passport settings and stamps. The organizers' station list shows each station's saved taps, from the heartbeat's `buffered_taps`, as a warning before a station is moved to another event.

**Settled by "How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?" (28 Sep):** creating a station, replacing its key and changing its **link** (which Event Service it feeds) are done by **GeekyKey admins**, GeeksHacking people listed by Portal user ID in the GeekyKey Service's settings, not by an event's organizers. They need screens on the GeekyKey Service and a Portal login checked against that list. The organizers' station list on the Event Service's side comes from the GeekyKey Service's `GET /api/v1/event-service/stations` (only the stations linked to that Event Service, with last seen, online, firmware version and saved taps), and shows a station's status as unknown, not offline, when that call fails. Locally, the GeekyKey Service must answer on a port of its own: real stations use `http://A-Mac.local:8000`, and the Event Service reaches the status call over HTTP, not through a binding.

## Answer

Resolved 28 Sep 2026 by grilling with Adam. The login decision is recorded as [ADR 0002](../../../docs/adr/0002-each-service-logs-in-through-the-portal.md).

**Decided**

- **Each service has its own screens, in a Worker of their own in front of it.** This keeps the setup from "How is the frontend set up, and how does the browser reach the backend?": a Worker with static assets that forwards `/api` and `/auth` to its service through a service binding. That makes four Workers.
  - **The Event Service's screens are today's `apps/frontend`:** the dashboard, passport and activity list, and the organizer screens (tap log, stats, export, station board, QR fallback). The passport is a game, so it belongs to the Event Service.
  - **The GeekyKey Service's screens are a second small React app, `apps/geekykey-web`,** on the same stack: the token page, My tokens and the GeekyKey admin screens. Ethan's team knows the stack, the station board, add-station dialog and key reveal move across from `apps/frontend`, and a broken screens deploy can't stop taps. Rejected: pages rendered by the GeekyKey Service itself, which would make every screens change a deploy of the service stations depend on, with a second way of styling; and one app for both, which mixes two services' screens and logins. Cost accepted: a second Vite app to set up, with a few shadcn components copied.
- **Each service logs users in through the Portal itself,** with its own `/auth/login`, `/auth/callback` and `/auth/logout`, and its own session cookie on its own hostname. Rejected: the Event Service trusting the GeekyKey Service's login, through a cookie shared on a parent domain or a signed ticket passed across. That would make the GeekyKey Service an identity provider, when only the Portal is one, and it could not work for another team's Event Service on another domain. Cost accepted: someone who uses both sets of screens logs in twice. If the Portal remembers them, the second login is only a quick redirect. Whether the Portal sees one client or two is Qing Guan's call.
- **Hostnames.** `geekykey.geekshacking.com` stays the GeekyKey Service's screens, and `api.geekykey.geekshacking.com` its address for stations and Event Services. The Event Service gets a short first-level name of its own: **`showcase.geekshacking.com`, provisional**, because Adam is discussing it with Julian. Adam asked whether the Event Service could use `geekykey.geekshacking.com` instead, so the address participants see is clean. Rejected: every token carries `https://geekykey.geekshacking.com/t/<UID>` for as long as tokens are in use ([ADR 0001](../../../docs/adr/0001-token-id-is-the-hardware-uid.md)), and both services need `/auth` and `/api`, so sharing the hostname means splitting it by path and moving one service under a prefix. Swapping, with the token address moving elsewhere, would give the product's name to one event, and the next event would inherit it. Participants see both services anyway (the token page when they tap their token, the passport during the event), so both names are short.
- **Names.** The packages are `apps/geekykey-service`, `apps/geekykey-web`, `apps/event-service`, and `apps/frontend` renamed to `apps/event-web` at the split stage, not before, so Ethan's work in progress isn't disrupted. The Workers are named like their packages, replacing `geekykey-frontend` and `geekykey-backend` from "Which hostnames, and which OAuth redirect URLs?". What the single Worker is called during "move first" is for "Write the migration spec".
- **Cookies.** The GeekyKey Service's is `gk_session`, the Event Service's `event_session`. Cookies on `localhost` ignore the port, so two services with one cookie name, signed with different secrets, would log each other out in local dev. Every other attribute stays as decided.
- **Redirect URLs, provisional** (Adam: they may be debated). Six, one set per service:

  | | GeekyKey Service (`geekykey-web`) | Event Service (`event-web`) |
  |---|---|---|
  | Final | `https://geekykey.geekshacking.com/auth/callback` | `https://showcase.geekshacking.com/auth/callback` (provisional) |
  | Until the subdomain exists | `https://geekykey-web.<account subdomain>.workers.dev/auth/callback` | `https://event-web.<account subdomain>.workers.dev/auth/callback` |
  | Local dev | `http://localhost:5174/auth/callback` | `http://localhost:5173/auth/callback` |

  Each service reads its own from a setting. Both `workers.dev` URLs are removed once the subdomains work.
- **Organizers are listed by Portal user ID in the Event Service's settings,** like GeekyKey admins in the GeekyKey Service's. Adding one is a reviewed change and a deploy. The list is checked on every request, not copied onto the user at login, so removing someone takes effect at the next deploy; the `users.role` column goes. The seed's `dev-organizer-1` goes on the local list. The passport shows your Portal user ID where you can copy it, so a helper can send theirs to Adam. Rejected: the Portal saying who organizes (nothing like it exists), and a screen for promoting organizers (it still needs a first one).
- **My tokens.** The home page of `geekykey.geekshacking.com` lists your tokens after you log in, each with a Release button. A lost token can't be tapped, so this is how its owner releases it. It needs a "tokens for this user" lookup, from the `tokens` stand-in for now. The passport drops its pair screen and its token status line. While a participant has no taps, it shows "Tap your token with your phone to claim it", with a link to My tokens. Rejected: the Event Service asking the GeekyKey Service whether a user has a token, a new call that would have the GeekyKey Service answering questions about users.
- **Claiming without NFC.** My tokens has a form to claim a token by typing its UID. At the desk, an organizer taps the token with their own phone and reads the UID from the address bar (`…/t/04A1B2C3D4E5F6`). This makes guessing no easier, because anyone can already type out a token's address. It is for the few phones left over: iPhones from the XS on, and Android phones with NFC turned on, open a token's address with no app (not re-checked here). A printed QR label holding the token's address would open the same token page from any phone camera, with nothing new in our code. Whether to print one is the token and hardware workstream's call; the form stays either way, for a damaged label.
- **The QR fallback for taps stays, as the worst-case fallback.** Adam brought it back from Out of scope for this ticket. It is an Event Service organizer screen that takes a Portal user ID, scanned from the participant's Portal QR code or typed in, and stores the tap with `source = qr_fallback`. Its "Token UID" mode goes, because only the GeekyKey Service can turn a token into a user. If Qing Guan says the Portal's QR code holds something other than the user ID, only the scanning changes. It covers what stations can't: a reader that dies during the event.
- **Setting up a station spans both services' screens.**
  - **The GeekyKey admin screens** (`geekykey.geekshacking.com/admin`, GeekyKey admins only) show every station with its online light, create a station and replace a station's key (each key shown once), and change a station's link, picking an Event Service from the settings or none, with the saved-taps warning before a move.
  - **The Event Service's organizer station board** shows the stations from the status call, merged with their passport settings. A linked station with no passport settings shows "Not in the passport" (its taps get `no_game`) and a button to add its name, location and points. Stamp slots follow the order stations were added to the passport. A station unlinked later keeps its slot and any stamps already earned, and shows as "no longer linked".
- **From the token page to the passport.** Each Event Service in the GeekyKey Service's settings can carry a public address and a name. The token page (on your own token) and My tokens show a link for each one that has an address, such as "Open Capstone Showcase". At the showcase there is exactly one. If GeeksHacking ever runs several events at once, showing them all would be wrong; that waits until it happens. The other way in is the check-in poster's QR code, which points at the passport.
- **Local dev.** The GeekyKey Service runs on port 8000, where real stations already point (`http://A-Mac.local:8000`), and the Event Service on 8001. The Event Service's screens stay on Vite's 5173 and the GeekyKey screens use 5174. Each service runs its own `wrangler dev`, not one command with two configs, because in that mode the second Worker gets no HTTP port and the Event Service's screens need one. The Event Service's setting for the GeekyKey Service's address is `http://localhost:8000`. One root `pnpm dev` starts all four. The Vite proxy stays; Cloudflare's Vite plugin isn't needed.

**What follows without a further decision**

- Logging in from the token page passes `return_to=/t/<UID>`, so the user lands back where they came from. `isSafeReturnTo` in `apps/frontend/src/features/auth/paths.ts` already enforces the relative-path rule and moves with it.
- Pairing and unpairing (`POST /api/v1/tokens/pair`, `DELETE /api/v1/tokens/{uid}`) move to the GeekyKey Service as claim and release. `/me` loses `tokens`.
- Each service has its own `SESSION_SECRET`.
- `geekykey.geekshacking.com` is a custom domain on `geekykey-web`, so the GeekyKey Service Worker's only custom domain is `api.geekykey.geekshacking.com`. This corrects the earlier note, in "How do deploys and secrets work?", of a "second" custom domain.
- The GeekyKey admin screens check the GeekyKey Service's own session against its admin list. Organizers and GeekyKey admins are separate lists, and one person can be on both.

**Facts** (checked 28 Sep 2026)

- Separate `wrangler dev` sessions reach each other through service bindings, whether started with `wrangler dev` or `vite dev`. With several `-c` configs in one command, only the first Worker is exposed over HTTP and the rest only through bindings, and that mode is experimental ([Service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/), [Multi Workers](https://developers.cloudflare.com/workers/local-development/multi-workers/)).
- Cookies are not isolated by port, so `localhost:5173` and `localhost:5174` share them ([RFC 6265, section 8.5](https://www.rfc-editor.org/rfc/rfc6265#section-8.5)).

**Glossary**

`CONTEXT.md`: **Claim** now covers typing a token's UID as well as tapping it with your phone, and **My tokens** joins **Token page**.

**Assets**

- [Message to Julian](../assets/message-to-julian-redirect-urls.md), rewritten: the three custom domains, the six redirect URLs, and three questions. Adam edits and sends it; the Event Service's hostname and the redirect URLs are open to debate with him.
- [ADR 0002](../../../docs/adr/0002-each-service-logs-in-through-the-portal.md): each service logs in through the Portal itself.

**Passed on**

- The four Workers and their custom domains; the service bindings (`event-web` to `event-service`, `geekykey-web` to `geekykey-service`, `geekykey-service` to `event-service`); each service's redirect URL setting and `SESSION_SECRET`; the organizer list in the Event Service's settings; each Event Service's public address and name in the GeekyKey Service's settings; sending the message to Julian: "How do deploys and secrets work?".
- The API agreement's changes (the base URLs for both sets of screens, `/auth` on each service, `/me` without `tokens`, claim and release on the GeekyKey Service plus the "tokens for this user" lookup, section 9.4 taking `user_id` only, the cookie names, section 3's callers table with organizers from a list, section 11's screen map split by service), and the steps (`apps/geekykey-web`, the rename to `apps/event-web`, moving the station screens, dropping the pair screen and the `users.role` column, the passport's hint and user ID, the claim-by-code form, the four-process `pnpm dev`): "Write the migration spec".
- A "tokens for this user" lookup, and whether the Portal sees one client or two: "What we need from the Portal's tag APIs", still fog on the map.
- The claim-by-code form shares the per-user limit on claims: "Protecting our public services", still fog on the map.
- A printed QR label on each token, holding its address: a note for the token and hardware workstream, outside this map.

## Renamed (28 Sep 2026)

`api.geekykey.geekshacking.com` is now **`geekykey-api.geekshacking.com`**, wherever it appears above. Qing Guan, who runs the zone, advised one level of subdomain because of Cloudflare's certificate limits; see "How do deploys and secrets work?".

The same replies also changed the redirect URLs: there is no `workers.dev` stage, and the Portal takes one redirect URL per OAuth app for now, so it is two apps, one per service, each with its final URL only.
