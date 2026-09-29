# How is the frontend set up, and how does the browser reach the backend?

Type: grilling
Status: resolved
Blocked by: 02, 03
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

Does the frontend run on Pages or on a Worker serving static files? And does the browser reach the backend through one hostname, with `/api` and `/auth` routed to the backend Worker, or through sibling subdomains with CORS?

The answer decides:

- how the session cookie is set up;
- whether the backend needs CORS;
- what Ethan sets `VITE_API_BASE_URL` to;
- how the app works before the geekshacking.com subdomain exists.

## Answer

Resolved 26 Sep 2026 by grilling with Adam. It builds on the research in "How can the frontend run on Cloudflare and reach the backend?".

**Decided**

- **The frontend is a Worker with static assets, not Pages.** Cloudflare now points new projects at Workers ([migration guide](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)). It runs in single-page-app mode, so `/passport` and `/admin/*` get `index.html`.
- **The browser reaches the backend through the frontend's own hostname (option B).** The frontend Worker passes `/api/*` and `/auth/*` to the backend Worker through a service binding. Every other path is served as plain static files. The browser only ever sees one address, just as it does behind the Vite proxy in local dev.
- **Stations call the backend directly on its own address, not through the frontend.** A broken frontend deploy then can't stop taps, and the station address can suit the ESP32. Which address it is belongs to "Which hostnames, and which OAuth redirect URLs?".
- **Every `/api/*` and `/auth/*` response carries `Cache-Control: no-store`**, set by one backend middleware. It changes neither performance nor database calls: nothing caches these responses today. It guarantees nothing ever will, so one person never sees another's passport.
- **The forwarding code lives in `apps/frontend`,** in a small `worker/` folder next to `src/`, with its own `wrangler` config. Adam writes it during the migration. After that Ethan owns it, and Adam reviews any change to its list of backend paths.
- **The API agreement changes as the first step of the migration plan,** in a pull request Ethan reviews, not now. Until the move nobody relies on CORS, because local dev already uses the Vite proxy.

**What follows without a further decision**

- **Session cookie:** no change. `gk_session` stays `HttpOnly`, `SameSite=Lax`, `Path=/`, with no `Domain`, and `Secure` outside dev.
- **CORS:** the backend never adds it. The API agreement's "CORS and cookies" section is rewritten to match, and its open question "Production origin for CORS" closes with no origin needed.
- **`VITE_API_BASE_URL`:** stays empty in every build (local dev, `workers.dev` and the real subdomain), and so does the relative `return_to` login redirect.
- **Before the geekshacking.com subdomain exists:** the frontend runs on its `workers.dev` address and forwards in exactly the same way. Nothing changes when the subdomain arrives except the hostname.

**Facts for the spec**

- The frontend's config needs `"run_worker_first": ["/api/*", "/auth/*"]`. In single-page-app mode Cloudflare otherwise answers a browser *navigation* (for example clicking "Log in", which goes to `/auth/login`) with `index.html`, without running any code ([SPA routing docs](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/), checked 26 Sep 2026).
- A service binding only links Workers in the same Cloudflare account, so both Workers must live in GeeksHacking's account. Service bindings add no cost, but each forwarded request counts toward the frontend Worker's subrequest limit ([service binding docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/), checked 26 Sep 2026).

**Passed on**

- The station address, and the redirect URL for the `workers.dev` frontend: "Which hostnames, and which OAuth redirect URLs?".
- Which backend the frontend's service binding points at in each environment, and whether branch previews forward to a backend or run on the mock client: "How do deploys and secrets work?".

## Partly superseded (27 Sep 2026)

The map was redrawn after Julian's architecture: we build the GeekyKey Service and a sample Event Service, not one backend. Serving screens from a Worker with static assets that forwards `/api` and `/auth` to its backend still holds, along with everything about the cookie, CORS and `Cache-Control: no-store`. Two parts no longer hold: that there is one backend, and that stations call it directly. Stations now call the GeekyKey Service ("How do stations talk to the GeekyKey Service?"), and which screens belong to which service is "Which screens belong to which service, and how does each know who is logged in?".
