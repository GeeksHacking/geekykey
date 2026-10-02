# Message to Julian: hostnames, OAuth redirect URLs and deploys

Drafts for Adam to edit and send, formatted for WhatsApp (`*bold*`, backticks and lists render there; copy from inside each box so the asterisks come across). First written 27 Sep 2026 from "Which hostnames, and which OAuth redirect URLs?", rewritten 28 Sep 2026 from "Which screens belong to which service, and how does each know who is logged in?", then split into parts by "How do deploys and secrets work?". Part 1 settled the urgent action item "Create and send OAuth redirect URL to Julian".

- **Part 1:** sent to the group chat on 28 Sep 2026, kept below as sent. Julian and Qing Guan's replies follow it.
- **Part 2, reply to Qing Guan:** send now. If you already sent the lines about ordering and preview builds, send only the rest. On 29 Sep its OAuth paragraph moved to [the message to Qing Guan about logging in](message-to-qing-guan-login.md), since the Portal now takes several redirect URLs per app.
- **Part 3, in three messages** that follow the checkpoints in [the spec](../spec.md), rewritten on 29 Sep by "Write the migration spec" for "move first": 3a at the first deploy, when `geekykey-service` is ready; 3b at the split; 3c when the screens are ready. 3a was sent on 1 Oct 2026, with a follow-up giving `geekykey-service`'s build settings. Julian's replies, recorded in BAC-8, changed the plan: the team gets no Cloudflare access, the hostnames are now `key-api`, `key` and `event`, and the Event Service gets its own repo at the split. 3b and 3c below are updated for them. The TiDB access in 3a was added on 29 Sep by "How do we notice trouble on event day, and who watches?", and its item for Qing Guan by "How do we protect our public addresses without blocking the stations?".
- **Part 4, before the showcase:** added on 29 Sep by "How do we notice trouble on event day, and who watches?". Send once the showcase's hours are known, and before the rehearsal on 7 Nov.

---

## Part 1 (sent 28 Sep 2026)

**Message 1: hostnames and redirect URLs**

```text
Hi Julian! Here's what GeekyKey needs on geekshacking.com, plus the OAuth redirect URLs for the portal.

We're building 2 services. Each has its own screens and logs users in through the portal itself:
- *GeekyKey Service*: the page a phone opens when it taps a token, "My tokens", and the station admin screens. Stations and Event Services call it too.
- *Showcase Event Service*: the passport and the organizers' screens.

*Custom domains* (Workers custom domains in GeeksHacking's account). Nothing to set up yet, we'll ask when each Worker is ready:
1. `geekykey.geekshacking.com` for the Worker `geekykey-web`. It's also the address written on every token (`/t/<UID>`)
2. `api.geekykey.geekshacking.com` for the Worker `geekykey-service`, which stations and Event Services call
3. A short name for the showcase screens, on the Worker `event-web`. We'd suggest `showcase.geekshacking.com`. Does that work, or would you prefer another name?

*OAuth redirect URLs*, 3 per service:

GeekyKey Service
- `https://geekykey.geekshacking.com/auth/callback`
- `https://geekykey-web.<subdomain>.workers.dev/auth/callback` (only until the custom domain is up, we'll ask you to remove it after)
- `http://localhost:5174/auth/callback` (local dev)

Showcase Event Service
- `https://showcase.geekshacking.com/auth/callback` (or the name you prefer)
- `https://event-web.<subdomain>.workers.dev/auth/callback` (only until the custom domain is up)
- `http://localhost:5173/auth/callback` (local dev)

3 questions:
1. What's GeeksHacking's `workers.dev` subdomain? It fills in the 2 temporary URLs
2. Does the portal accept plain `http` for localhost?
3. Should the 2 services be one OAuth client with all 6 URLs, or two clients? Either works for us, Qing Guan may have a preference
```

**Message 2: deploying**

```text
Also 2 questions about deploying:

1. *Is the Cloudflare account on Workers Paid?* We think the event needs it. On the free plan, Hyperdrive (which keeps our connections to TiDB open) allows 100k database queries a day. The passport checks for new stamps every 10s, so that only lasts about 55 hours of open passports, e.g. 55 people for 1 hour. If it isn't on Paid, could GeeksHacking upgrade before the showcase? It starts at $5/month.

2. *How should the code get deployed?* You offered to connect the repo to Cloudflare. Would you be ok with GitHub Actions running `wrangler deploy` instead? Our reasons:
- It only deploys after the tests pass. The repo is private on GitHub Free, so `main` can't require checks, and Cloudflare's builds don't wait for them
- Database migrations run in the same job, right before the deploy
- It builds with the same pinned pnpm 12 as our CI. Cloudflare's build image hasn't been tried with it
- Less setup for you: one API token that can only deploy our 4 Workers, instead of connecting each Worker to the repo

If you'd rather keep Cloudflare's builds, that's fine too. We'd run migrations by hand before merging, and try one build first to check pnpm 12.
```

**The replies, 28 Sep 2026** (group chat, summarised)

- **Qing Guan:** the account is free; the polling cost sounds questionable, a push architecture may be worth a look, and getting Paid should be no problem. Can help add the domains, but advises one level of subdomain because of Cloudflare's certificate limits. The `workers.dev` subdomain is `geekshacking.workers.dev`. The Portal takes only one redirect URL per OAuth app for now; may add support for several.
- **Julian:** no issue making the repo public. Paid is possible if really needed, but try the free tier first and learn its limits before paying.
- **Adam:** agreed; will measure real use once the services are up.
- **Qing Guan, on deploying:** with branch rules, Cloudflare builds are fine; migrations should be separate anyway and can run on GitHub Actions; `PNPM_VERSION` can be set to 12. Asked what our main concern was.

---

## Part 2: Reply to Qing Guan (send now)

```text
Thanks both! Going with that:

*Deploys*: Cloudflare builds from the repo is fine with branch rules 👍 My main concern was ordering: if a PR adds a DB column and Cloudflare deploys the new code before the migration runs, queries on that table fail until it does. So migrations run on GHA as a separate manual step *before* merging (our migrations always work with the currently running version, so running them early is safe). We'll set `PNPM_VERSION` to 12.5.1 and do one trial build to confirm.

Could preview builds be switched off on our Workers? A preview of the screens can only forward to the live service, so it'd be a public copy on real event data (and login can't work there).

*Domains*: taking your one-level advice, the stations' address becomes `geekykey-api.geekshacking.com` instead of `api.geekykey.geekshacking.com`. The other two stay `geekykey.geekshacking.com` and `showcase.geekshacking.com` (is that name ok?). Since you can add domains, could we attach each one when its Worker is ready and skip `workers.dev` completely?

*OAuth*: two apps, one per service. I'll send you the details separately.

*Free tier*: sounds good. We'll measure on the first deploy and decide on Paid by 11 Nov, a week before the showcase.

*Public repo*: great. There's one Wi-Fi password in the history we're getting changed first, I'll tell you when it's ready to flip.
```

---

## Part 3a: At the first deploy (checkpoint 2)

```text
Hi Julian / Qing Guan, GeekyKey is ready for its first deploy. We're moving today's backend over first, as one Worker, and splitting it into the two services after that. Could you:

1. *Create the 4 Workers empty*, so the names and access are in place: `geekykey-service`, `event-service`, `geekykey-web` and `event-web`.
For now, attach only `geekykey-api.geekshacking.com`, to `geekykey-service`. The other two domains come when the screens are ready.

2. *Connect `geekykey-service` to the repo* (Workers Builds), once `main` is protected:
- root directory: `apps/backend` for now. It becomes `apps/geekykey-service` when we split, and we'll ask you to change it then
- build variables: `NODE_VERSION` = `22.23.3`, `PNPM_VERSION` = `12.5.1`
- deploy command: `npx wrangler deploy`
- *preview builds off*
Until `main` is protected, I will deploy it by hand.

3. *Give access:*
- Adam (<Adam's Cloudflare email>): Editor on all 4, and permission to create a Hyperdrive config (it holds the TiDB login the Workers use, which I will create)
- Ethan (<Ethan's Cloudflare email>): Editor on `event-web` and `geekykey-web`, Metadata Read-Only on the two services
- Zi Tao (<Zi Tao's Cloudflare email>): Metadata Read-Only on `geekykey-service`, to read the stations' logs
- On TiDB Cloud, Adam (<Adam's TiDB Cloud email>): read-only access to the project, to watch the Request Units we use against the free 50 million a month. No data access needed

4. *On GitHub* (once the repo is public): protect `main` so it needs a PR with CI passing, and add a `production` environment with me as the required reviewer. Could I have admin on the repo, so I can add the database migration login to that environment and replace it later? If you'd rather not, I will send it to you however you prefer.

5. *FYI*: our Workers use the rate-limit namespace IDs `7101` to `7105`. Please keep other Workers in the account off them, since Workers that share one share their counts.

6. *Qing Guan*: one custom rule on the zone, please: when the hostname is `geekykey-api.geekshacking.com`, skip Browser Integrity Check, Security Level and all rate limiting rules. Stations can't solve a challenge, so if "I'm Under Attack" ever went on to protect another site, they'd stop recording taps. Our code does its own rate limiting, so we don't need a rate limiting rule. Please also keep Bot Fight Mode off: it can't be skipped for one hostname on the free plan, and it would challenge the stations.
```

---

## Part 3b: At the split (checkpoint 4)

```text
Hi Julian / Qing Guan, GeekyKey is splitting into its two services. Could you:

1. *Connect `event-service` to its new repo* (Workers Builds): <the new repo, and its root directory>, the same build variables and deploy command, preview builds off. It gets no domain: only our other Workers reach it. It also needs a Hyperdrive config (the same one is fine), its own `SESSION_SECRET`, and the Event Service key, the same value on both services.

2. *Change `geekykey-service`'s root directory* to `apps/geekykey-service`, the same day.
```

---

## Part 3c: When the screens are ready (checkpoint 5)

```text
Hi Julian / Qing Guan, the GeekyKey screens and the showcase screens are ready to go live. Could you:

1. *Attach the domains*:
- `geekykey-web`: `key.geekshacking.com`
- `event-web`: `event.geekshacking.com`

2. *Connect both* (Workers Builds): `geekykey-web` from this repo, root directory `apps/geekykey-web`, and `event-web` from the Event Service's repo, with `VITE_LIVE_API` = `1`. The same build variables and deploy command, preview builds off.
```

---

## Part 4: Before the showcase

Fill in the hours first. Since 1 Oct the team can't see production's logs or usage, so settle how we watch the day first (spec section 12): this may need one more ask of Julian.

```text
Hi Julian and Qing Guan! For the showcase on 18 Nov (<start> to <end>), could you both be reachable by phone during those hours, in case something breaks that only you can fix? We'll only call if something's down:
- *Julian*: GeeksHacking's Cloudflare account (e.g. upgrading to Workers Paid on the spot if we run out of the free day's requests) and TiDB
- *Qing Guan*: the Portal, since everyone logs in through it, and the geekshacking.com zone settings

Is it ok if your numbers go on our one-page event-day sheet? It stays with the team at our desk.

We're also rehearsing the whole day on the live setup by Sat 7 Nov. Nothing needed from you for that, just a heads-up in case you see traffic.
```
