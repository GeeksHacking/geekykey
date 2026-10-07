# Thu 8 Oct 2026: what to ask Julian and Qing Guan

Collated by Adam's request from "How is the Event Service built, deployed and staged on Cloud Run?", 7 Oct 2026, for the in-person meeting on Thu 8 Oct. Part 1 comes from that ticket's grilling. Part 2 was already set for the meeting by earlier tickets. Part 3 is only for if it comes up: on 7 Oct Adam decided not to send it as a message, because fewer people are expected at the showcase, so the free plan should last, and the Event Service stays on Cloud Run.

The file keeps its old name, `message-to-julian-workers-requests.md`, because part 3 started as its own message.

## Part 1: setting up the Event Service on Cloud Run

We'd like to run the Event Service the way the Portal runs: one Cloud Run service in Singapore, deployed by GitHub Actions on every push to `main`, with no key stored in GitHub, secrets in Secret Manager, and its address through a Cloud Run domain mapping. Today's backend moves there first, unchanged, on Node, and the GeekyKey Service is cut out as a Worker afterwards.

1. **A Google Cloud project of our own,** on GeeksHacking's billing account. Is that OK, rather than a stack in the Portal's project? Who creates it, and sets up the keyless sign-in from GitHub (Workload Identity Federation, limited to `GeeksHacking/geekykey` and its `main` branch)? It only needs doing once.
2. **Roles.** For Adam: enough to deploy the service and its staging copy, add secret values and read logs. For Ethan and Zi Tao: Logs Viewer, since station health now lives in the Event Service. Joshua needs none.
3. **The infrastructure tool.** Our pick is Pulumi in TypeScript: Qing Guan's tool, in the language the team writes. Would Qing Guan rather we used C#, as the Portal does, or something else? Would he review it?
4. **The address.** A DNS record for `event-api.geekshacking.com` pointing at Google, with Cloudflare's proxy off, the same as `portal-api.`. Who adds it, and when we're ready?
5. **Workers Builds.** Please disconnect it from `apps/backend` until the split. It builds every push to `main` and fails, and that folder stops being a Worker anyway. It's connected again for the GeekyKey Service's own folder later.
6. **A budget alert** on the project, sent to Julian and Adam. At most 2 instances run, and one is kept warm only on event days (the rehearsal by 7 Nov, and 17 to 18 Nov), so the bill should stay within the free tier apart from the warm instance.
7. **"Cloud Run v1".** Did it mean the domain mapping, which only exists in Cloud Run's v1 interface, as the Portal uses it?

## Part 2: already set for this meeting

- **The claims stand-in** ("Where do token owners live until the Portal's tag APIs exist, and what does the token page do?"): is it OK for the showcase's claims to sit in a small stand-in on our Cloud Run server until the switch after 18 Nov? Asked from part 1 of [the message to Julian and Qing Guan](message-to-qing-guan-tag-apis.md).
- **Moving a reader to another event** ("Who registers stations, where is a station key checked, and how does the GeekyKey Service know which Event Service a station feeds?"): is a reflash, with the flash erased, an acceptable way to move one, given Julian wanted pointing stations at a new event to be easy? And is retiring the `no_event` status OK?

## Part 3, only if it comes up: will the free Workers plan last the showcase day?

Not measured: worked out from the screens' code and Cloudflare's docs, checked 7 Oct 2026.

**Where the numbers come from**

- `apps/frontend` polls while a page is on screen: `/api/v1/me` every 10 s on every page, the tap log and the stats every 5 s, and the station board every 12 s (`src/lib/constants.ts`). TanStack Query stops polling when the tab is hidden, and phones suspend background tabs, so a passport only costs requests while someone is looking at it. The 430,000 a day in the first round of the grilling assumed every passport stays on screen for 4 hours, which won't happen.
- `event-web` forwards `/api` and `/auth` to Cloud Run, so each of those polls runs the Worker and counts as one request. Only plain files (the screens' HTML, JavaScript and images) are free and unlimited ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)).
- The free plan allows 100,000 requests a day for the **whole account**, reset at 08:00 Singapore time. Past it, every Worker on the account answers with error 1027 until the reset ([limits](https://developers.cloudflare.com/workers/platform/limits/#daily-requests)).
- **The Portal**, read from its public repo, `GeeksHacking/portal`, on 7 Oct 2026. Its API, `portal-api.`, runs on Cloud Run behind a Cloud Run domain mapping (`DefaultStack.cs`), so no Worker sits in front of it and its calls don't count. Its web app is Nuxt with `ssr: false`, built for Cloudflare (the `nitro.cloudflare` settings in `nuxt.config.ts`). It's a single-page app with an offline cache (`@vite-pwa/nuxt`), so at most a page load runs its Worker, never a click inside the app or an API call. Each participant loads it about twice to log in to our two services (ADR 0002), so even if every load counts and it shares our account, that's at most about 2 requests a participant. Whether its pages run a Worker at all, and whether it's on the same account, only Julian or Qing Guan can say.
- Assumed for the day: 9 hours, 20 stations, 20 taps per participant, about 5 token-page requests per participant, 2 organizer screens on the tap log and 1 on the station board all day.

| | 100 participants | 200 | 300 |
|---|---|---|---|
| Organizer screens, all day | 38,000 | 38,000 | 38,000 |
| Station heartbeats | 11,000 | 11,000 | 11,000 |
| Taps and token pages | 2,500 | 5,000 | 7,500 |
| Passports, 10 minutes on screen each | 6,300 | 12,600 | 18,900 |
| The Portal's page loads, if they count | 200 | 400 | 600 |
| **Total** | **about 58,000** | **about 67,000** | **about 76,000** |
| …with passports on screen 30 minutes each | about 70,000 | about 91,000 | **about 112,000, over** |

**To say:** the event's screens are a Worker that forwards their API calls to Cloud Run, and every forwarded call counts against the free plan's 100,000 Worker requests a day, shared by every Worker on GeeksHacking's account, the stations' Worker included. A showcase day should use about 60,000 to 90,000, mostly the organizers' screens, which poll all day. Going over stops every Worker on the account until 8 am the next day; stations keep their taps and resend them, but nobody gets a stamp. We can poll the organizers' screens less often if needed, and the rehearsal will show the real number.

**To ask:** is the Portal's web app on the same Cloudflare account, and does a page load run a Worker? Are any other GeeksHacking Workers there busy on a showcase day?
