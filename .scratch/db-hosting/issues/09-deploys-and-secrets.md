# How do deploys and secrets work?

Type: grilling
Status: resolved
Blocked by: 02, 03, 05, 12, 15
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

- **Builds.** Does Cloudflare build straight from the repo (Julian's plan), or does GitHub Actions run `wrangler deploy`? Our pinned toolchain (pnpm 12.5.1, installed by mise) may not run in Cloudflare's build image. The updates site already ran into the same question.
- **Access.** Which Cloudflare account holds the Workers, and which plan is it on? Who on the team can set secrets, read logs and roll back a deploy?
- **Secrets.** Which ones exist (for example `SESSION_SECRET` and the database credentials), and who sets them?
- **The service binding.** The frontend Worker forwards `/api` and `/auth` to a backend Worker it names in its config, and both must be in the same account. Which backend does it name in each environment, and is there more than one backend (for example a staging one)?
- **Previews.** Should pull requests get preview deployments? If so, does a preview forward to a real backend, or is it built on the mock client, which needs none?
- **Addresses and login in each environment** (from "Which hostnames, and which OAuth redirect URLs?"). The backend's OAuth redirect URL is a setting per environment. Both Workers' `workers.dev` addresses are turned off once the subdomains work, so no config should set `workers_dev = true`. Previews have no registered redirect URL, so a preview that forwards to a real backend cannot use the portal login.
- **Asking Julian.** What do we ask him for, and when? He is waiting to set up the frontend and backend together. The redirect URLs and the frontend's subdomain are already in [the message to Julian](../assets/message-to-julian-redirect-urls.md).

Since the 27 Sep redraw there are two services, the GeekyKey Service and the sample Event Service, and perhaps two sets of screens ("Which screens belong to which service, and how does each know who is logged in?"). Each Worker, binding and secret above has to be worked out for both.

**Settled by "How is the database set up?" (28 Sep):** each Worker reaches TiDB through a Hyperdrive config, created with the app login and the query cache off, one for each environment that has a database. The migration login is needed wherever `db:migrate` runs, and `db:migrate` runs before the Worker that needs it is deployed; whether CI runs it is this ticket's call. For the plan question: on the free plan, Hyperdrive's 100,000 queries a day last roughly 55 hours of passports left open. That's 55 participants for one hour, since the passport polls `/me` every 10 seconds at about five queries a poll. The paid plan removes the limit.

**Settled by "How do local dev, tests and CI get a runtime and a database?" (28 Sep):** Deno leaves the backend; Wrangler builds, runs and tests it. Locally, secrets such as `SESSION_SECRET`, and `DEV_AUTH_ENABLED`, live in a gitignored `.dev.vars` file and must never reach a deployed Worker's config. CI already runs `wrangler deploy --dry-run` on every pull request to prove the Worker builds, without a Cloudflare login; whether that build is what gets deployed is this ticket's call. After the split the services are two packages, `apps/geekykey-service` and `apps/event-service`, each deployed on its own.

**Settled by "How do stations talk to the GeekyKey Service?" (28 Sep):** the GeekyKey Service Worker gets a second custom domain, `api.geekykey.geekshacking.com`, for stations; Adam asks Julian for it. On the plan: besides Hyperdrive's limit, the Workers free plan allows 50 outside requests per incoming request (10,000 on the paid plan), which would cap Portal lookups in a station's late batch, and 100,000 requests a day, of which 20 stations' heartbeats take about 12,000 over a 10-hour day.

**Settled by "How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?" (28 Sep):**
- The GeekyKey Service's settings hold the list of Event Services (an ID, a name, and a binding name or an `https://` URL for each) and the list of GeekyKey admins by Portal user ID. Adding an Event Service is a reviewed change and a deploy.
- Each Event Service has one **Event Service key**, 32 random bytes, kept as a Workers secret on both the GeekyKey Service and that Event Service, in each environment.
- The GeekyKey Service binds to our Event Service, so the first time the Event Service is deployed first. The Event Service does not bind back: it reaches the GeekyKey Service's status call over HTTPS at `api.geekykey.geekshacking.com`, an address it reads from a setting.
- Cloudflare's invocation logs capture request headers, and its docs don't say whether `Authorization` is hidden. Check one log on the first deployed Worker, for both station keys and Event Service keys, and decide what to do if it is there; `observability.logs.invocation_logs = false` turns invocation logs off.
- Each hand-off is one outside request, whatever the batch size.

**Settled by "Which screens belong to which service, and how does each know who is logged in?" (28 Sep):**
- **Four Workers,** named like their packages: `geekykey-web` and `geekykey-service`, `event-web` and `event-service`. They replace `geekykey-frontend` and `geekykey-backend`. Each `-web` Worker serves its screens and forwards `/api` and `/auth` to its service through a service binding, so there are three bindings: `event-web` to `event-service`, `geekykey-web` to `geekykey-service`, and `geekykey-service` to `event-service` for the hand-off. Deploy order the first time: each service before its screens, and `event-service` before `geekykey-service`.
- **Custom domains:** `geekykey.geekshacking.com` on `geekykey-web` (not on the GeekyKey Service Worker, correcting the "second custom domain" note above), `api.geekykey.geekshacking.com` on `geekykey-service`, and the Event Service's hostname, `showcase.geekshacking.com` (provisional), on `event-web`.
- **Settings and secrets per service:** each service has its own redirect URL setting and its own `SESSION_SECRET`. The Event Service's settings gain the list of organizers by Portal user ID. The GeekyKey Service's list of Event Services gains an optional public address and name for each, which the token page and My tokens link to.
- **Redirect URLs, provisional:** six, three per service (local dev, `workers.dev`, final), in [the rewritten message to Julian](../assets/message-to-julian-redirect-urls.md), which also asks for all three custom domains. Adam has not sent it yet.
- **Local dev:** the GeekyKey Service on 8000, the Event Service on 8001, the Event Service's screens on 5173 and the GeekyKey screens on 5174, each service in its own `wrangler dev`, started together by one root `pnpm dev`. `.dev.vars` holds a `SESSION_SECRET` for each service.

## Answer

Resolved 28 Sep 2026 by grilling with Adam. How the code is built and deployed is Julian's call, so the first decision gives our preference and the alternative we accept, and Adam asks him.

**Decided**

- **Builds: GitHub Actions deploys, provisional until Julian answers.** A deploy workflow runs on every push to `main`, after the jobs CI runs on a pull request have passed, with the toolchain mise installs. One job runs `db:migrate` with the migration login, then `wrangler deploy` for `event-service`, `geekykey-service`, `event-web` and `geekykey-web`, in that order. Its Cloudflare API token has Editor on those four Workers and nothing else: no zone, no other Workers, no Hyperdrive. Reasons: a failing test stops the deploy, migrations always run first, and there is less for Julian to set up (one token and two repo secrets, instead of connecting four Workers to the repo).
  - **The alternative we accept:** Cloudflare builds straight from the repo (Workers Builds), Julian's original plan, on two conditions. Adam runs `db:migrate` by hand before merging anything with a migration, and one trial build proves the build image runs pnpm 12.5.1 (set with `PNPM_VERSION`, and Node with `NODE_VERSION`). Its costs, accepted if Julian picks it: a push to `main` deploys even when CI fails, and the four Workers build separately, in no fixed order.
  - Adam asks Julian with our preference stated. The spec describes GitHub Actions, marked provisional, with a short section on the alternative.
- **One environment: production.** Local dev and CI's end-to-end smoke test cover the rest. Rejected: a staging copy, which would double the Workers, the Hyperdrive config, the database, the redirect URLs and the custom domains. Nothing runs in production today, so until the event it is where we test, and the test data is cleared before the doors open. Each service binding names the production Worker. Staging can be added after the showcase if GeekyKey carries on to more events.
- **No preview deployments for pull requests.** A preview's service binding reaches the production service, so a preview would put real data behind a public address. Login can't work there either: no redirect URL is registered for a preview, and the service's callback setting points at the production hostname. `pnpm dev` already runs the screens on the mock client. If Ethan's team later wants to share screens on pull requests, previews of the two screens Workers, built on the mock client, can be added without changing anything else.
- **Workers Paid is treated as required for the event.** On the free plan, Hyperdrive's 100,000 queries a day last about 55 hours of open passports, and one request may make only 50 outside requests. Adam asks Julian whether GeeksHacking's account is on Workers Paid, which starts at $5 a month. If GeeksHacking won't upgrade, the fallback is the passport polling less, a separate decision, and every other limit gets rechecked.
- **Credentials in invocation logs.** On the first deploy, check whether a request's invocation log shows `Authorization` or `Cookie`, on every Worker that receives them. The station key and the Event Service key travel in `Authorization`. All four Workers see a `gk_session` or `event_session` cookie, and a copied cookie is a working login until it expires. Anyone with read-only access to the logs would see them.
  - If either shows, that Worker gets `observability.logs.invocation_logs = false`. Our own log lines never include keys or cookies, so they stay. Any key that appeared is replaced, and so is the service's `SESSION_SECRET` if a cookie did.
  - If neither shows, invocation logs stay on: they are what we want on event day.
- **Access to GeeksHacking's Cloudflare account.** Julian stays the owner and the backstop.
  - **Adam:** Editor on all four Workers (deploy, set secrets, roll back, read logs), and permission to create the Hyperdrive config, so the TiDB app login he creates never passes through anyone else.
  - **Ethan:** Editor on `event-web` and `geekykey-web`, so a second person can roll back the screens on event day, and Metadata Read-Only on the two services, to read their logs.
  - **Zi Tao:** Metadata Read-Only on `geekykey-service`, to debug stations.
  - **Joshua:** none.
- **Every merge to `main` deploys, with a freeze on event day.** `main` is always what's live, and changes to the screens don't wait for Adam. From the evening before the event until it ends, nothing merges to `main` except a fix Adam approves, announced in the team chat. It is a team rule, not a setting, because `main` can't be protected (see Facts).
- **Rollbacks.**
  - One Worker at a time, from its Deployments page in the dashboard or with `wrangler rollback`, by anyone with Editor on it. The database is never rolled back.
  - Going back one version is always safe, because every migration works with the version still running ("How is the database set up?"). Going back further is not.
  - Revert the bad commit on `main` straight after, or the next merge deploys it again.
  - A change to `packages/handoff` must work with the other service's previous version, so either service can be rolled back alone.
  - Never roll back to a version older than a key replacement. Changing a secret makes a new version, and the docs don't say whether rolling back brings the old value back, so assume it does.
- **Secrets live only on the two services:**
  - `SESSION_SECRET`, one per service;
  - the Event Service key: on `geekykey-service`, one for each Event Service in its list; on `event-service`, its own;
  - the Portal client secret, if Qing Guan issues one.

  Each service lists its secrets under `secrets.required` in its `wrangler.jsonc`, so a deploy fails if one is missing. The screens Workers have none. The TiDB app login lives only in the Hyperdrive config, never in a Worker.
- **Everything else is a setting in `wrangler.jsonc`,** changed by a reviewed pull request: each service's redirect URL, the organizers, the GeekyKey admins, the list of Event Services, the Event Service's address for the GeekyKey Service, the cooldown and the batch size. `DEV_AUTH_ENABLED` and the other local-only values stay in `.dev.vars`.
- **Adam sets every secret from his laptop and keeps no copy.** He generates it with `openssl rand`, sets it with `wrangler secret put`, and throws it away. Losing one only means replacing it: a new `SESSION_SECRET` logs everyone out of that service, and a new Event Service key goes onto both Workers at once.
- **GitHub secrets, if GitHub Actions deploys.** Julian creates the API token and adds it, with the account ID, himself, so the token never passes through anyone else. Adam asks for admin on `GeeksHacking/geekykey`, so he can add the migration login and replace it without asking. If Julian would rather not, he adds the migration login too, and Adam replaces it if it was ever pasted into a chat.
- **Julian does the one-off setup.** Creating a Worker needs Admin across all Workers, and per-Worker roles can only be given on a Worker that exists. So Julian creates the four Workers empty, under our names, and gives out the roles above; the service bindings then resolve from the first deploy. When a Worker is ready for its custom domain, he attaches it in the dashboard, and the same day a pull request adds it to that Worker's `routes`, so the next deploy finds nothing to change and needs only Editor. The deploy token never gets write access to the zone's Workers routes: a token that could route any geekshacking.com hostname shouldn't sit in a repo six people can push to. Adam may take this setup over later, if he is given the access.

**What follows without a further decision**

- The Event Service's screens are built with `VITE_LIVE_API=1` for production. Without it, the build ships the in-memory mock client, which is today's default.
- No `wrangler.jsonc` sets `workers_dev = true`. A Worker without a custom domain answers on its `workers.dev` address by default, and adding its custom domain to `routes` turns `workers.dev` off at the next deploy. `preview_urls` is left unset, so it follows `workers_dev`.
- The configs are the source of truth. The next deploy overwrites settings or routes changed in the dashboard, but never touches secrets.
- There is one Hyperdrive config, for production, created by Adam with the app login and the query cache off. Local dev and tests use a local connection string instead.
- The migration login lives outside the repo, like the root login: in the repo's GitHub secrets if GitHub Actions deploys, and only on Adam's laptop otherwise.
- The updates site's deploy can reuse whichever way Julian picks. It is outside this map.

**Facts for the spec** (checked 28 Sep 2026)

- `GeeksHacking/geekykey` is a private repo in an organization on GitHub Free. `main` is not protected and can't be: branch protection and rulesets need GitHub Pro or Team for private repos, and GitHub's API answers "Upgrade to GitHub Pro". Environment secrets and deployment branch rules aren't available either, so a workflow on any branch can read the repo's secrets ([Deployments and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)). Six people have write access, and Julian and Qing Guan are admins.
- Workers Builds' image has Node 22.23.2 and 24.18.0 installed and pnpm 10.11.1 by default; `NODE_VERSION` and `PNPM_VERSION` choose others. It has no mise. In a monorepo, each Worker is connected separately, with its own root directory and watch paths ([Build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/), [Advanced setups](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/)).
- Worker Previews, released 22 Sep 2026: a preview's service binding calls the bound Worker's production deployment, and preview URLs are public by default ([Previews](https://developers.cloudflare.com/workers/previews/), [Limitations](https://developers.cloudflare.com/workers/previews/resources/#limitations)).
- Per-Worker roles, released 15 Sep 2026: Metadata Read-Only (settings and logs, but no code or secret values), Content Read-Only, Editor (deploy, secrets and rollback, but not create or delete) and Admin, for members and API tokens alike. Creating a Worker needs Admin across all Workers. Adding or changing a custom domain also needs Workers Routes Write on the zone, and a deploy that leaves it unchanged needs only Editor ([Workers roles](https://developers.cloudflare.com/workers/authorization/workers/)).
- `wrangler deploy` replaces settings and routes changed in the dashboard with the config's, and never deletes secrets. `secrets.required` makes a deploy fail when a listed secret is missing. `wrangler secret put` makes and deploys a new version ([Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/), [Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)).
- A rollback can go to any of the last 100 versions and makes a new deployment ([Rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)).
- Workers Paid starts at $5 a month for the account ([Pricing](https://developers.cloudflare.com/workers/platform/pricing/)).

**Assets**

- [Message to Julian](../assets/message-to-julian-redirect-urls.md), rewritten in three parts. Adam sends "Now" on 29 Sep: the hostnames and redirect URLs as drafted, the `workers.dev` subdomain, the Workers plan, and how the code gets deployed. "At the first deploy" and "Later" wait until then.

**Passed on**

- Clearing the test data from production before the doors open, and what TiDB Starter backs up: "Backups and event-day recovery", still fog on the map.
- Who watches the logs on event day: "Monitoring during the event", still fog.
- The deploy workflow, the four configs (settings, `secrets.required`, `routes`), the Hyperdrive config, the invocation-log check with `Cookie` added, the production screens build with `VITE_LIVE_API=1`, the event-day freeze and rollback notes, and what Julian needs at each stage: "Write the migration spec". So is the name of the single Worker during "move first", and so which of the four Julian's placeholders it deploys to.

## Changed after Julian and Qing Guan's replies (28 Sep 2026)

Adam sent part 1 of [the message to Julian](../assets/message-to-julian-redirect-urls.md) the same evening, and Julian and Qing Guan answered in the group chat. Six decisions above change. Everything not listed here stands: production only, no previews, the invocation-log check, the access roles, every merge deploying with the event-day freeze, rollbacks, the secrets and settings, and Adam setting each secret with no copy kept.

**What they said**

- GeeksHacking's Cloudflare account is on the free plan. Qing Guan expects no trouble getting Paid, but Julian wants to try the free tier first and learn its limits before paying. Adam agreed to measure real use once the services are up.
- Julian has no issue with making the repo public.
- Qing Guan: with branch rules, Cloudflare building from the repo is fine; database migrations should be separate anyway and can run on GitHub Actions; `PNPM_VERSION` can be set to 12.
- Qing Guan, or Julian, can add our custom domains whenever we ask. Qing Guan advised one level of subdomain because of Cloudflare's certificate limits.
- The account's `workers.dev` subdomain is `geekshacking.workers.dev`.
- The Portal accepts only one redirect URL per OAuth app for now. Qing Guan may add support for several.

**Changed decisions**

- **Builds: Cloudflare builds each Worker from `main` (Workers Builds), and migrations run separately on GitHub Actions.** This replaces GitHub Actions deploying. Once the repo is public, `main` is protected and needs a pull request with CI passing, so only tested code reaches it. The one real problem with the split is ordering: Drizzle names every column in its queries, so code that knows a new column fails on that table until the column exists, and a migration started by the same push races the build. **The rule: migrate before you merge.** A pull request that adds a migration first runs a manual "Migrate production" workflow on its own branch, through a `production` environment that needs Adam's approval, and is merged only once that succeeds. This is always safe, because every migration already has to work with the version still running. Also:
  - no Cloudflare API token is kept in GitHub at all;
  - each Worker's build settings: its folder as the root directory, `NODE_VERSION` `22.23.3`, `PNPM_VERSION` `12.5.1`, `VITE_LIVE_API` `1` on `event-web`, `npx wrangler deploy` as the deploy command, and watch paths covering its folder, the shared packages and the lockfile;
  - **preview builds switched off** on all four Workers (a preview of the screens can only forward to the live service; see "No preview deployments" above);
  - one trial build confirms pnpm 12.5.1 works in Cloudflare's build image;
  - Cloudflare builds the four Workers independently, so the empty Workers created first (below) are what keep the first deploy's service bindings working.
- **The repo goes public, after one clean-up.** A Wi-Fi password is committed in `firmware/NFC_test/test.ino` (added in "Added test code", 23 Sep), and history can't be taken back once public. Before the switch, Zi Tao changes that Wi-Fi password or confirms it's a throwaway hotspot, and removes it from the file; Adam decides whether `.scratch/` and `meeting-notes/` stay uncommitted or become public. After the switch: protect `main` (pull request and CI required) and create the `production` environment with Adam as its approver. No real station keys are in history, and the station and token-writer secrets already live in gitignored `secrets.h` files.
- **GitHub secrets: only the migration login,** in the `production` environment. Adam asks for admin on the repo to add it himself; otherwise Julian adds it.
- **Workers Paid: start on the free plan, measure, then decide.** At the first deploy, measure the queries each passport poll and each tap costs, and estimate the showcase's day against the free limits: Hyperdrive's 100,000 queries a day, Workers' 100,000 requests a day and 50 outside requests per request. **Decide on Paid by 11 Nov 2026,** a week before the showcase on 18 Nov. The ways to fit the free plan are in the new fog "Staying on the free plan".
- **The station hostname is `geekykey-api.geekshacking.com`,** replacing `api.geekykey.geekshacking.com` everywhere. The Workers custom domain would get its own certificate, but Qing Guan runs the zone, a certificate problem on event day would stop the stations, and nothing is deployed yet. It still has zone rules of its own. The other two hostnames are already one level.
- **No `workers.dev` stage.** Julian or Qing Guan creates each Worker and attaches its custom domain together, at the first deploy, so the services never run on `workers.dev` and the two `workers.dev` redirect URLs aren't needed. Adding the domain to that Worker's `routes` in the same change keeps the config the source of truth.
- **OAuth: two apps, one per service,** each with only its final redirect URL (`https://geekykey.geekshacking.com/auth/callback` and the Event Service's). Each service reads its client ID and redirect URL from its settings. Local dev keeps dev-login; if Qing Guan adds support for several URLs, the `localhost` ones join their apps then.
- **Who does the one-off setup:** Julian or Qing Guan.

**Facts** (checked 28 Sep 2026)

- The free certificate Cloudflare gives every zone covers only the domain and its first-level subdomains; a Workers custom domain generates its own certificate for its exact hostname ([Universal SSL](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/), [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)).
- Workers Builds has Deploy Hooks, a URL that triggers a build of one branch, but every push to the production branch still builds, so GitHub Actions can't hold a deploy back until a migration has run ([Deploy Hooks](https://developers.cloudflare.com/changelog/post/2026-04-01-deploy-hooks/), [Build branches](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)).
- The showcase is on 18 Nov 2026 (Adam).

**Assets**

- [The message to Julian](../assets/message-to-julian-redirect-urls.md): part 1 marked sent, with the replies; part 2 is the reply to Qing Guan; part 3 the first-deploy setup. The old "Later" part is gone.
- [The message to Zi Tao about the Wi-Fi password](../assets/message-to-zi-tao-wifi-password.md).

**Passed on**

- Staying on the free plan: a new fog on the map.
- The migrate workflow and its rule, the Workers Builds settings, making the repo public and what comes before it, the hostname in the API agreement and the firmware, and the two OAuth apps: "Write the migration spec".
