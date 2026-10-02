# Where do token owners live until the Portal's tag APIs exist, and what does the token page do?

Type: grilling
Status: open
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
