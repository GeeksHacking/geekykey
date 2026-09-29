# How can the frontend run on Cloudflare and reach the backend?

Research for ticket 03, 25 Sep 2026. Sources checked 25 Sep 2026. The run was stopped early to save tokens. The Answer below is complete, but the per-source citations were not written up, and two points were never confirmed (marked "not confirmed").

## Answer

- **Use a Worker with static assets, not Pages.** Cloudflare's Pages docs now say "Start new projects with Workers" (page updated 25 Aug 2026). Static file requests are free and unlimited on both. A Worker set to `not_found_handling = "single-page-application"` answers `/passport` and `/admin/*` with `index.html` and a 200. Pages does the same when the build has no top-level `404.html`.
- **One rule decides the cookie.** The browser sends the `SameSite=Lax` cookie `gk_session` with a `fetch()` only when the page and the backend are the same *site*: same scheme and same registrable domain, worked out with the public suffix list. `app.geekshacking.com` and `api.geekshacking.com` are the same site. `pages.dev` and `workers.dev` are both on the public suffix list, so a `*.pages.dev` page and a `*.workers.dev` backend are different sites, and the cookie never flows between them.
- **One hostname works, and Cloudflare documents it.** Put the frontend Worker on a Custom Domain such as `app.geekshacking.com`, and give the backend Worker the routes `app.geekshacking.com/api/*` and `app.geekshacking.com/auth/*`. Routes take precedence over a Custom Domain on the same hostname. The browser sees one origin, exactly like the Vite dev proxy today: no CORS, `VITE_API_BASE_URL` stays empty, and the relative `return_to` redirect keeps working.
- **Sibling subdomains work too, with more backend work.** `app.` and `api.` are the same site, so the cookie is sent. The backend must add CORS with credentials for the exact frontend origin, answer preflight requests, and redirect to an absolute frontend URL after login. The frontend is built with `VITE_API_BASE_URL` set to the `api.` address.
- **Before the subdomain exists.** Two Workers in one account share the site `<account>.workers.dev`, so sibling Workers there do get the cookie, with CORS. Routes cannot be used there, so a one-hostname layout needs the frontend Worker to forward `/api/*` and `/auth/*` through a service binding. A Pages frontend on `pages.dev` can only get the cookie through a forwarding Function.
- **Previews** behave like the temporary setup, because Worker preview URLs live on workers.dev (not confirmed). The cheapest option is to build previews on the mock client, which needs no backend.
- **Nothing on the way strips the cookie by default** (not confirmed). The risk is a zone-wide cache rule on geekshacking.com that nobody on the team can see, so the backend should send `Cache-Control: no-store` on API responses.
- **Options worth deciding between:**
  - **A. One hostname, split by routes.** No CORS and no forwarding code. Needs the real subdomain, both Workers in GeeksHacking's account, and a stopgap (B or C) until the subdomain exists.
  - **B. One hostname, the frontend Worker forwards through a service binding.** The same setup works on workers.dev, in previews and on the final domain, with no extra request fee. Costs a little forwarding code in the frontend, and its deploy must bind to the right backend.
  - **C. Sibling subdomains with CORS.** Each app is fully independent, and the workers.dev setup mirrors production. Costs CORS, preflight round trips, an absolute login redirect, one frontend build per backend address, and two hostnames to ask for.

## What this means for the other tickets

- **"How is the frontend set up, and how does the browser reach the backend?"** chooses between A, B and C. Pages is no longer the obvious default, because Cloudflare now points new projects at Workers.
- **"Which hostnames, and which OAuth redirect URLs?"** A and B need one hostname; C needs two. The temporary workers.dev setup also needs its own redirect URL.
- **"How do deploys and secrets work?"** A needs both Workers in the account that owns the geekshacking.com zone. B needs the frontend's deploy to bind to the right backend Worker.
- Whatever is chosen, the backend should send `Cache-Control: no-store` on API responses.

## Open questions

- Do Worker preview URLs share a site with the backend, so previews get the cookie? Not confirmed.
- Does geekshacking.com have cache or security rules that would touch our paths? Julian can check.
