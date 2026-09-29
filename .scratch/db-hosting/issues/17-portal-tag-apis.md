# What does the GeekyKey Service need from the Portal's tag APIs?

Type: grilling
Status: resolved
Blocked by: none
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

The Portal will store which user each token belongs to. The GeekyKey Service will read and change that through the Portal's tag APIs, which Qing Guan designs and builds (out of scope here). Until they exist, the GeekyKey Service keeps the `tokens` table in TiDB behind one module: today's `TokenResolver`, grown to also claim and release tokens. That way, switching later is not painful. This ticket decides what we ask Qing Guan for. It also decides the module's interface, so that the `tokens` table and the Portal can both sit behind it.

What the resolved tickets already need:

- **The users for many tokens in one call.** A station's late batch can hold up to 500 taps, and on the Workers free plan one request can make only 50 outside requests. The hand-off to the Event Service already uses one of them ("How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?").
- **Claiming a token for a user,** from the token page and from My tokens' form for claiming by typing a UID.
- **Releasing a token:** by its owner, and by a GeeksHacking admin for a user who reports that someone else claimed it ("What is a token's ID, and what URL is written on each token?").
- **The tokens for one user,** for My tokens, since a lost token can't be tapped to reach its token page ("Which screens belong to which service, and how does each know who is logged in?").
- A token's key is its normalised 14-character hardware UID ([ADR 0001](../../../docs/adr/0001-token-id-is-the-hardware-uid.md)).
- Each service has its own OAuth app, so the Portal already sees two clients ("How do deploys and secrets work?").

Still open:

- **Time.** A station waits 5 seconds and the Event Service gets 3 of them. How long may a lookup take, and what does a station hear when the Portal is slow or down? May the GeekyKey Service remember who owns a token, and for how long, given that a release must take effect?
- **Two people claiming one token at once.** Who wins, and what does the other person see?
- **Who may release someone else's token:** a GeekyKey admin on our screens, or someone in the Portal?
- **How the GeekyKey Service proves who it is to the Portal** on calls made for no logged-in user, such as a station's lookup.
- **The switch.** When the tag APIs arrive, do the claims already in the `tokens` table move into the Portal, which needs a way to import them, or does everyone claim again? What date do we ask for, and after what date does the showcase stay on the `tokens` table, so the switch never lands just before the event?

The answer is the module's interface, for the spec, and a message to Qing Guan.

## Answer

Resolved 28 Sep 2026 by grilling with Adam.

**Decided**

- **The showcase runs on the `tokens` table, and we switch to the Portal after 18 Nov,** before the showcase's data is cleaned up ("After the event", still fog). The Portal answers one request at a time (see Facts), and once we switch, every station request waits on it. Moving where claims live a few weeks before the showcase is a risk the showcase gains nothing from. Julian allowed the table "until the tag APIs exist", so Adam asks him in part 1 of [the message](../assets/message-to-qing-guan-tag-apis.md). If Julian wants the Portal on the station path at the showcase, the fallback is to switch only if the APIs are live by 28 Oct, with a warm instance that takes more than one request at a time on event day. Rejected: a copy of every token's owner kept by the GeekyKey Service, which is the mapping Julian asked us not to keep.
- **The GeekyKey Service calls the tag APIs as itself,** with the client-credentials flow the Portal already offers, using the GeekyKey Service's own OAuth app. It passes the user ID when claiming, releasing or listing, and decides itself who may do what. Reasons: a station lookup has no user; ADR 0002 already makes the GeekyKey Service the judge of who is logged in; our sessions don't keep the Portal's access tokens; and the switch can copy the table with the ordinary claim call. Rejected: calling as the logged-in user, and a fixed API key, which the Portal would have to build. The cost: the Portal trusts the GeekyKey Service to claim only for the user in front of it, so its Portal client secret matters as much as an Event Service key.
- **Only the current owner is kept.** Releasing a token deletes its claim, and each claim keeps when it was made, for My tokens. A late batch goes to whoever owns the token when the batch arrives, not when it was tapped. The Event Service already stores every tap against the user it was handed, and a history would be long-lived data about people. Section 8.3's "the row is kept with `revoked_at`" goes; today's table couldn't do it anyway, since the UID is its primary key.
- **GeekyKey admins release other people's tokens on the token page.** When a GeekyKey admin taps a token that belongs to someone else, the page shows "This token belongs to someone else" and a **Release** button, a fifth level beside the four in "What is a token's ID, and what URL is written on each token?". Having the reporter tap the token in front of them is how the admin checks they hold it. The admin never sees the owner's name. Each release writes a log line saying who released which UID from whom, the only trace once there is no history. Claims change only through the GeekyKey Service: the Portal's own screens may show a user's tokens but not change them. Rejected for now: a form taking a UID on the GeekyKey admin screens, which can be added if reports come in remotely; and Portal admins releasing tokens in the Portal.
- **After the switch, a lookup gets 1.5 seconds.** No answer in time, a `429` or `5xx`, or a body that doesn't parse fails the whole station request with `503 portal_unavailable`, logged, and the station keeps and resends its taps, as for any `503`. There is no retry inside the request and no cache: every station request makes one batch lookup, so a release takes effect at once. Revisit caching only if measurements call for it. When the Portal fails during a claim, a release or My tokens, the page says it couldn't reach GeeksHacking and to try again, and nothing is saved.
- **The switch is a one-off GeekyKey admin action, "Copy claims to the Portal".** It replays each row of the `tokens` table as an ordinary claim, 40 rows per request to stay under the free plan's 50 outside requests, and the admin screen repeats it until every row is done. Running it twice is safe, since a repeat comes back "already yours", and it reports any UID the Portal says someone else owns. The order: deploy the action, run it, deploy the version that talks to the Portal, run it once more for stragglers, and drop the `tokens` table in a later migration. Accepted: a release made in the minutes between the copy and the switch doesn't reach the Portal, so that token stays claimed until it is released again. Rejected: an export for Qing Guan to import, and everyone claiming again.
- **No ask for a user's name by user ID.** A participant who claims a token but never opens the passport has taps with no name in the organizers' tap log and the export. Accepted: most participants open the passport, the A/B analysis counts by user ID, and asking would put a Portal call inside the Event Service. Julian's Portal issue "Integration with NFC Key" asks for such a call, so it may come anyway.
- **One module, `Claims`, replaces `TokenResolver`:**

  ```ts
  /** Who owns each token: the `tokens` table until the switch, then the Portal's tag APIs. */
  export interface Claims {
    /** The owners of up to 500 tokens, by UID. A UID missing from the map is unclaimed. */
    ownersOf(uids: string[]): Promise<Map<string, string>>;
    /** Claims the token for the user. The first claim wins. */
    claim(uid: string, userId: string): Promise<"claimed" | "already_yours" | "taken">;
    /** Releases the token, but only if `ownerId` still owns it. */
    release(uid: string, ownerId: string): Promise<"released" | "not_owner">;
    /** The user's tokens, oldest claim first. */
    tokensOf(userId: string): Promise<{ uid: string; claimedAt: string }[]>;
  }
  ```

  `LocalClaims` wraps the `tokens` table and `PortalClaims` calls the tag APIs. UIDs arrive normalised, as today. Either implementation throws `ClaimsUnavailable` when it can't answer, which the station route turns into `503 portal_unavailable`. Who may release is decided by the routes: an owner passes their own user ID, and a GeekyKey admin passes the owner the token page found when it loaded, so a late or double click can't release a newer claim.
- **The message** goes to the group chat in two parts: part 1 asks Julian about the switch date, and part 2 gives Qing Guan our needs: tags looked up by UID, the four calls matching `Claims`, client credentials from the GeekyKey Service's app only, claims changed only through the GeekyKey Service, lookups well within 1.5 seconds with a warm instance that takes more than one request at a time, and two questions (when the APIs might be ready, and what happens to a deleted user's tags). Adam sends it; Qing Guan can copy part 2 onto the Portal issue "nfc tag endpoitns".

`CONTEXT.md` gained **Owner**: the user who has claimed a token, who may not be the person holding it.

**Facts** (checked 28 Sep 2026)

- The Portal merged an `NfcTag` entity on 27 Sep: a new GUID as each tag's ID, and the owner's user ID. It has no endpoints yet, and the issues "nfc tag entities" and "nfc tag endpoitns" have no description ([PR #182](https://github.com/GeeksHacking/portal/pull/182), [#183](https://github.com/GeeksHacking/portal/issues/183), [#184](https://github.com/GeeksHacking/portal/issues/184)). The Portal's user IDs are GUIDs.
- Julian's Portal issue "Integration with NFC Key" (27 Sep, closed by that PR) asks the Portal to return a few non-identifying details by user ID, such as a first name, and to offer APIs the NFC Key service calls on a user's behalf ([#181](https://github.com/GeeksHacking/portal/issues/181)).
- The Portal's infrastructure code on `main` runs it on Cloud Run in `asia-southeast1` with at least 0 and at most 1 instance, 1 request per instance, 4 CPUs and 4 GiB, and CPU only while handling requests (`GeeksHackingPortal.Infra/Stacks/DefaultStack.cs`). One request per instance was forced in March, when it had 0.08 of a CPU ([PR #126](https://github.com/GeeksHacking/portal/pull/126)); it has had 4 CPUs since 29 Apr. What is deployed could differ from the code.
- Cloud Run keeps an idle instance for up to 15 minutes. When the maximum number of instances is busy, a request waits up to 3.5 times the average startup time or 10 seconds, whichever is longer, then fails with `429` ([Instance autoscaling](https://docs.cloud.google.com/run/docs/about-instance-autoscaling)).
- The Portal's login server offers the authorization-code, client-credentials and refresh-token flows at `connect/token`. Its API accepts only browser cookies today (`GeeksHackingPortal.Api/Program.cs`).
- Since 28 Sep the Portal accepts several redirect URLs per OAuth app; the API already did, and the admin screen now lets you add them ([PR #193](https://github.com/GeeksHacking/portal/pull/193)).

**Assets**

- [Message to Julian and Qing Guan](../assets/message-to-qing-guan-tag-apis.md), in two parts. Not sent yet.

**Passed on**

- The `Claims` module with `LocalClaims` in the first steps, and `PortalClaims`, the copy action and the switch as steps after the showcase; the token page's fifth level and the release log line; section 8.3 losing its history line; `503 portal_unavailable` in the API agreement, from the switch on; the GeekyKey Service's Portal client secret among its secrets, needed from the switch; and the message: "Write the migration spec".
- The Portal taking several redirect URLs per app, which "How do deploys and secrets work?" planned for (the `localhost` URLs join their apps, so local dev could log in through the Portal): "Write the migration spec".
- The showcase's claims live in the `tokens` table, so they are event data to back up and to keep when the test data is cleared: "How do we back up the database, recover it on event day, and clear the test data before the doors open?".
- The copy to the Portal comes before the showcase's data is deleted: "After the event", still fog on the map.
