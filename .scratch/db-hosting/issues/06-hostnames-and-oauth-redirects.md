# Which hostnames, and which OAuth redirect URLs?

Type: grilling
Status: resolved
Blocked by: 05
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

"How is the frontend set up, and how does the browser reach the backend?" settled that the browser uses only the frontend's hostname, which forwards `/api` and `/auth` to the backend, while stations call the backend on its own address. So:

- **The frontend's hostname.** Which geekshacking.com subdomain do we ask GeeksHacking for?
- **The station address.** Do stations use the backend's `workers.dev` address or a second geekshacking.com subdomain? Weigh the certificates the ESP32 must trust, and the zone's bot settings, which only apply under geekshacking.com.
- **OAuth redirect URLs.** The portal redirects to `/auth/callback` on the frontend's hostname. Which URLs do we send Julian for:
  - local development;
  - the frontend's `workers.dev` address, until the subdomain exists;
  - the final address?

This settles the urgent action item "Create and send OAuth redirect URL to Julian".

## Answer

Resolved 27 Sep 2026 by grilling with Adam. Messages from Julian and Qing Guan that day, passed on by Adam, changed part of it.

**Decided**

- **The frontend is `geekykey.geekshacking.com`,** a Workers custom domain on the Worker `geekykey-frontend`. It carries the product's name, so it can outlive one event.
- **The backend gets its own subdomain, `api.geekykey.geekshacking.com`,** on the Worker `geekykey-backend`, instead of relying on its `workers.dev` address. We own the name, so it can point somewhere else without touching the stations, and the zone's firewall and rate-limit rules can apply to it. Whether stations call it directly at this event belongs to "How do stations reach the backend at this event, and move to the NFC Key service later?". GeeksHacking is asked for it once that ticket is resolved.
- **The Workers are called `geekykey-frontend` and `geekykey-backend`,** matching `apps/frontend` and `apps/backend`. A `workers.dev` address is `<worker name>.<account subdomain>.workers.dev`.
- **Three OAuth redirect URLs go to Julian:**
  - `http://localhost:5173/auth/callback`, so anyone can try the real login before a deploy;
  - `https://geekykey-frontend.<account subdomain>.workers.dev/auth/callback`, until the subdomain exists;
  - `https://geekykey.geekshacking.com/auth/callback`, the final address.

  Branch previews get none.
- **The backend reads its redirect URL from a setting in each environment,** not from the address a request came in on. It then always matches a URL registered with Julian, and a visit to `/auth/login` on the backend's own address can't produce a callback on the wrong hostname.
- **Both `workers.dev` addresses are turned off** once login works on `geekykey.geekshacking.com` and a station has tapped through the backend's subdomain. Julian then removes the `workers.dev` redirect URL. Adding a custom domain to a Wrangler config already does this on the next deploy, unless the config sets `workers_dev = true`.

**What follows without a further decision**

- The browser never uses the backend's subdomain, because the frontend forwards `/api` and `/auth` ("How is the frontend set up, and how does the browser reach the backend?"). The session cookie and the no-CORS setup are unchanged.
- The production base URL for the browser, in the API agreement, is `https://geekykey.geekshacking.com`.

**Facts for the spec**

- Bot Fight Mode is off on geekshacking.com (Julian, 27 Sep). If it were turned on, it could challenge the ESP32, and on the free plan it cannot be switched off for chosen hostnames ([Bot Fight Mode docs](https://developers.cloudflare.com/bots/get-started/bot-fight-mode/), checked 26 Sep 2026). Whoever manages the zone should know GeekyKey relies on it staying off.
- Cloudflare picks the certificate authority for both custom domains and `workers.dev`: Let's Encrypt, Google Trust Services or SSL.com. Certificates last 14 to 90 days, and Cloudflare says not to pin them ([certificate authorities](https://developers.cloudflare.com/ssl/reference/certificate-authorities/), checked 26 Sep 2026). So the ESP32 must trust a bundle of certificate authorities, not one pinned root. The firmware is Zi Tao's.
- A Workers custom domain gets its own certificate for its exact hostname, so a two-level name like `api.geekykey.geekshacking.com` works ([Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), checked 27 Sep 2026).
- Cloudflare calls `workers.dev` "intended for personal or hobby projects that aren't business-critical" ([workers.dev docs](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/), checked 27 Sep 2026).

**Changed by Julian and Qing Guan, 27 Sep**

- **Stations must not be tied to one fixed address.** It must be easy to point stations at a new experience's endpoint, and to point different stations at different endpoints.
- **Tags will be bound to portal users in the Portal,** in a new table, with APIs to look up the user bound to a tag and to bind a tag to a user. The Portal stays the one source of identity.
- **A new NFC Key service is what stations will call.** It resolves tags through the Portal and passes taps on to the event experiences built on top of it. Designing and building it, and the Portal's tag APIs, is Julian and Qing Guan's effort, outside this map.
- **TiDB holds an experience's own data** (games, stations, taps, stamps), not the long-lived mapping from tags to users. Julian allows GeekyKey to keep its `tokens` table in TiDB until the Portal's tag APIs exist. Adam asked that switching to those APIs later not be painful.

**Assets**

- [Message to Julian](../assets/message-to-julian-redirect-urls.md): the redirect URLs, the request for `geekykey.geekshacking.com`, and two questions (GeeksHacking's `workers.dev` account subdomain, and whether the portal accepts `http` for `localhost`). Adam sends it, which completes the urgent action item "Create and send OAuth redirect URL to Julian".

**Passed on**

- How stations find the backend now, and how they move to the NFC Key service: "How do stations reach the backend at this event, and move to the NFC Key service later?".
- The redirect URL setting and switching off `workers.dev` in each environment: "How do deploys and secrets work?".
- Keeping `tokens` in TiDB for now: "How is the database set up?". Keeping the switch to the Portal's tag APIs cheap: "Write the migration spec".

## Partly superseded (27 Sep 2026)

The map was redrawn after Julian's architecture: we build the GeekyKey Service and a sample Event Service, not one backend. `geekykey.geekshacking.com` becomes the GeekyKey Service's address, which is also what logs users in through the Portal, so the redirect URLs, the Worker naming, the redirect URL setting and switching off `workers.dev` all stand. Two things move to new tickets: where the passport's screens live ("Which screens belong to which service, and how does each know who is logged in?"), and whether `api.geekykey.geekshacking.com` is still needed ("How do stations talk to the GeekyKey Service?").

## Renamed (28 Sep 2026)

`api.geekykey.geekshacking.com` is now **`geekykey-api.geekshacking.com`**, wherever it appears above. Qing Guan, who runs the zone, advised one level of subdomain because of Cloudflare's certificate limits; see "How do deploys and secrets work?".

The same replies removed the `workers.dev` stage: custom domains are attached when each Worker is created, so its `workers.dev` redirect URL is never needed.
