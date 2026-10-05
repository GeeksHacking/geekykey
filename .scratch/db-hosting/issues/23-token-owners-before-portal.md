# Where do token owners live until the Portal's tag APIs exist, and what does the token page do?

Type: grilling
Status: resolved
Blocked by: none
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

"What does the GeekyKey Service need from the Portal's tag APIs?" decided that the showcase keeps claims in our own `tokens` table, behind the `Claims` module, and switches to the Portal after 18 Nov. Its reason was that the Portal answers one request at a time and sleeps when idle. Since 2 Oct, the GeekyKey Service keeps no database ([ADR 0003](../../../docs/adr/0003-event-service-on-cloud-run-geekykey-service-without-a-database.md)), so the `tokens` table can't stay where it is.

What Julian said the token page does (WhatsApp, 2 Oct 2026): "the view that the user sees upon tapping the token, whether that is to register the token (which will redirect to portal), or to show the token state (using the information from the portal) or to direct them to the event service (which is then the event experience)." In the meeting, Adam suggested moving whatever the GeekyKey Service stored into the Event Service, and Julian agreed.

Decide:

- **Where the owner of each token is kept for the showcase.** Options so far:
  - **In the Portal,** if Qing Guan can ship the tag APIs, and a claim screen if claiming happens there, before the rehearsal on 7 Nov.
  - **In the Event Service's TiDB,** with the GeekyKey Service asking the Event Service for owners. This breaks the 28 Sep rule that token IDs never reach an Event Service, and makes our sample Event Service different from other teams' Event Services.
  - **In the GeekyKey Service's cache, as the only copy.** Then it isn't a cache, and it contradicts ADR 0003.
- **Whether claiming happens on the Portal's own screens** ("redirect to portal") or on our token page calling the Portal's API. The glossary calls this **Claim** and avoids "register".
- **What the token page shows, and to whom.** Today's five views are in spec section 3.4. Julian adds "direct them to the event service". Which event, when a token's owner may be at several?
- **What happens to My tokens, Release and the 3-token cap,** and to a GeekyKey admin releasing someone else's token.
- **The Portal's load.** If the Portal answers lookups, it still runs one request at a time on Cloud Run (read 28 Sep). Does the cache from "What does the GeekyKey Service cache, and in which store?" shield it?

**Facts so far.** The Portal's repo (`GeeksHacking/portal`), read 2 Oct 2026: tag work is still only the `NfcTag` entity added on 27 Sep, with no endpoints, branches or pull requests. Qing Guan is very active (11 pull requests merged 28 to 30 Sep, all on workshops, profiles, OAuth redirect URLs and organizer roles), so it may be quick once asked. Message part 1 in [assets/message-to-qing-guan-tag-apis.md](../assets/message-to-qing-guan-tag-apis.md) was never sent.

Start by asking Qing Guan whether the Portal can own claims before 7 Nov, and what he'd need from us. Then decide the fallback.

**Since "Who registers stations, where is a station key checked, and how does the GeekyKey Service know which Event Service a station feeds?" (5 Oct 2026):** GeekyKey admins no longer create stations or change links; organizers manage their own event's stations. Whether GeekyKey admins still exist, to release other people's tokens, is decided here.

## Answer

Resolved 5 Oct 2026 by grilling with Adam. Where owners live is provisional until Julian answers at the in-person meeting on Thu 8 Oct 2026, the day after this map is due: see "To ask Julian".

**Decided**

- **For the showcase, token owners live in a claims stand-in on our Cloud Run server** (provisional). The stand-in keeps the `tokens` table in the one TiDB database and offers the same four calls we're asking the Portal for: the owners of up to 500 UIDs, claim, release only if a given user still owns it, and a user's tokens with when each was claimed. The GeekyKey Service calls it through `StandInClaims`, behind the `Claims` module, in place of the 28 Sep `LocalClaims`. The stand-in is **not** part of what an Event Service offers. Other teams' Event Services never build it, the hand-off still carries only user IDs, and the rule that token IDs never reach an Event Service holds. The switch after 18 Nov is as planned on 28 Sep: copy the rows to the Portal with the ordinary claim call, then point `Claims` at the Portal. Rejected:
  - the Portal before the rehearsal on 7 Nov, because Qing Guan hasn't started its endpoints (still none on 5 Oct), and it runs one request at a time and sleeps when idle, on every tap's path;
  - resolving owners inside our Event Service as part of the hand-off, which breaks the rule above and makes our sample unlike other teams' Event Services;
  - KV or D1 holding the only copy, which is a database in all but name and contradicts ADR 0003.
- **Where its code lives.** Before the split, the stand-in is simply today's `tokens` table and claim code, moved to Cloud Run with the rest of the backend ("move first"). At the split, it stays in our Event Service's Cloud Run server, in a folder of its own, under its own route prefix (for example `/claims-stand-in/v1/…`), with its own tables, marked "GeekyKey's stand-in, removed after the switch". It goes with the Event Service if that moves to a repo of its own, and is deleted after the switch. Rejected: a separate Cloud Run service in the GeekyKey repo, which would mean a third deploy and a second cold start on every tap's path, for something that lives six weeks.
- **The GeekyKey Service proves itself to the stand-in with a key of its own,** a `CLAIMS_STAND_IN_KEY` secret on both sides. Then the Event Service key never grants writes to claims, and after the switch one secret is swapped for the Portal client secret.
- **Claiming happens on our token page.** Julian's "register the token (which will redirect to portal)" is the Portal login from ADR 0002. The Portal has no claim screen and none is planned. The glossary keeps **Claim** and avoids "register".
- **The owner's view of the token page directs them to the event.** It shows the token, **Release**, and a button for each event in the GeekyKey Service's settings that has a public address, the same list My tokens shows. At the showcase that's one button, "Open Capstone Showcase". Rejected: redirecting straight to the only event, which hides Release and the token's state behind a back button; and asking each Event Service whether the user takes part, which puts a call on the page and adds work for other teams. The token page's other views, from "What is a token's ID, and what URL is written on each token?" and "What does the GeekyKey Service need from the Portal's tag APIs?", stay: a login prompt, **Claim**, "This token belongs to someone else", and that line with **Release** for a GeekyKey admin.
- **GeekyKey admins stay,** as a short list in the GeekyKey Service's settings. Their one job is releasing someone else's token on the token page, for a lost token found by someone else. At the showcase they're the same people as the organizers. Rejected: only owners release, which leaves a found token stuck until its owner releases it.
- **My tokens and Release are unchanged,** and now go through the stand-in.
- **The GeekyKey Service enforces the 3-token cap,** by checking `tokensOf` before `claim`. The stand-in, like the Portal later, does only the four calls, so the switch changes nothing above `Claims`. `claim` loses `limit_reached`, which the claim route returns instead. Accepted: two claims by one user at the same instant could leave them with 4 tokens.
- **A lookup gets 1.5 seconds, with no retry, from day one.** No answer in time, a `429` or `5xx`, or a body that doesn't parse fails the whole station request with **`503 claims_unavailable`**, the same code before and after the switch, and the station keeps and resends its taps, as for any `503`. This replaces the 28 Sep `503 portal_unavailable`, so neither the API agreement nor Zi Tao's firmware changes at the switch. The screens say they couldn't reach GeeksHacking and to try again, and nothing is saved. The stand-in shares a server with the hand-off, so when one is down the other usually is too.
- **The Portal's load matters only after the switch.** For the showcase the Portal is off the station path. The ask for a warm instance that takes more than one request at a time stays in the message for later.

**To ask Julian (Thu 8 Oct 2026)**

- Is a claims stand-in on our Cloud Run server, holding the showcase's claims until the switch after 18 Nov, acceptable, given ADR 0003 says the GeekyKey Service keeps no database? Part 1 of [the message](../assets/message-to-qing-guan-tag-apis.md), asked in person. If he wants the Portal at the showcase, the 28 Sep fallback stands: switch before it only if the tag APIs are live by 28 Oct, with a warm Portal instance.

**What follows without a further decision**

- The tap's journey: the key is checked against the copied station lists, the owners are looked up at the stand-in, and the taps are handed to the Event Service that listed the key. That's two requests to Cloud Run per station request until the switch, then one to the Portal and one to the Event Service.
- The showcase's claims are event data in the one TiDB database, so the backups and the evening-before clear from "How do we back up the database, recover it on event day, and clear the test data before the doors open?" still cover them. "Copy claims to the Portal" runs before the event's data is deleted.
- The token page still never shows an owner's name, so the GeekyKey Service still needs nothing about users from the Portal.

**Glossary**

`CONTEXT.md`: **Portal** holds claims only after the switch. **GeekyKey Service** asks the claims stand-in, then the Portal, who owns a token. **Claims stand-in** is new. **GeekyKey admin** and **Token page** are reworded to match.

**Assets**

- [Message to Julian and Qing Guan](../assets/message-to-qing-guan-tag-apis.md) gains a note at the top. Part 1 now describes the stand-in and is asked in person on 8 Oct. Part 2 is unchanged, apart from no longer pointing at part 1, and Adam sends it to Qing Guan now.

**Passed on**

- Whether owners are cached in front of the stand-in, and later the Portal, and what a release or a fresh claim does to that cache: "What does the GeekyKey Service cache, and in which store?".
- How the lookup's 1.5 s fits beside the hand-off's 3 s, inside the station's 5 s: "Does a station wait for the Event Service's verdict?".
- The stand-in's place in the Cloud Run server, its key among the secrets, and staging it with the Event Service: "How is the Event Service built, deployed and staged on Cloud Run?".
- The spec (sections 3.1 to 3.4, 4, 5, the checkpoints and "After the showcase"), `503 claims_unavailable` in the API agreement in place of `portal_unavailable`, `limit_reached` moving from `Claims` to the claim route, and the Linear tickets: "Fold the answers into the spec".
