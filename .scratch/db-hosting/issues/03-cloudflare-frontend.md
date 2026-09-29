# How can the frontend run on Cloudflare and reach the backend?

Type: research
Status: resolved
Blocked by: none
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)
Findings: [research/cloudflare-frontend.md](../research/cloudflare-frontend.md)

## Question

What are the ways to host the React frontend on Cloudflare so the browser can call the backend Worker with the `gk_session` cookie, and what does each need?

Find out, from primary sources:

- **Pages or a Worker serving static files** for a Vite single-page app. Which does Cloudflare currently recommend for new projects? How does each serve `index.html` for app routes such as `/passport` and `/admin/*`? Build and deploy options, limits, and pricing: static files are free, but function requests count against Workers.
- **One hostname for both.** With the zone (geekshacking.com) on Cloudflare, how can `/api/*` and `/auth/*` go to the backend Worker while everything else goes to the frontend: Worker routes, service bindings, or a forwarding function? The browser would see one origin, so the `SameSite=Lax` cookie works and no CORS is needed.
- **Sibling subdomains** (for example `app.` and `api.`): how the cookie behaves between them, what CORS the backend must add, and what the frontend changes. It already reads `VITE_API_BASE_URL`.
- **Before the geekshacking.com subdomain exists.** Can temporary `*.pages.dev` or `*.workers.dev` addresses send the cookie to the backend, or does that only work through forwarding? How would preview deployments for branches reach a backend?
- **Anything on the way** that strips or rewrites cookies, or caches API responses.

Read first: `apps/frontend/vite.config.ts`, `apps/frontend/src/api/` (the HTTP client and `create-client.ts`), `apps/API-AGREEMENT.md` section 2 (CORS and cookies) and section 3 (browser sessions), and `apps/updates`, which is already headed for Cloudflare Pages.

## Answer

Resolved 25 Sep 2026 from research stopped early to save tokens. Full findings: [research/cloudflare-frontend.md](../research/cloudflare-frontend.md).

- A Worker with static assets, not Pages: Cloudflare now tells new projects to start with Workers. Both serve `index.html` for app routes.
- The `SameSite=Lax` cookie only flows between the same site. Subdomains of geekshacking.com share a site; `pages.dev` and `workers.dev` addresses do not share one with each other.
- Three ways to reach the backend: A, one hostname split by Worker routes (no CORS, needs the real subdomain); B, one hostname with the frontend Worker forwarding through a service binding (works on workers.dev too); C, sibling subdomains with CORS.
- Before the subdomain exists, two Workers in one account share `<account>.workers.dev`, so the cookie works there, but routes do not.
- The backend should send `Cache-Control: no-store` on API responses.
