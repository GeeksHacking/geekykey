# Message to Qing Guan: logging in through the Portal

Draft for Adam to edit and send, formatted for WhatsApp like [the message to Julian](message-to-julian-redirect-urls.md). Written 29 Sep 2026 by "Write the migration spec", from sections 9 and 12 of [the spec](../spec.md). It gathers what checkpoint 5, logging in through the Portal, waits on. It replaces the OAuth paragraph of part 2 of the message to Julian: since 28 Sep the Portal takes several redirect URLs per app ([PR #193](https://github.com/GeeksHacking/portal/pull/193)), so each app gets its `localhost` URL too.

The Portal's user IDs are GUIDs (from "What does the GeekyKey Service need from the Portal's tag APIs?"). Whether `sub` carries that ID, and whether the Portal accepts plain `http` for `localhost`, haven't been checked.

On 1 Oct 2026 the redirect URLs moved to Julian's hostnames, `key.geekshacking.com` and `event.geekshacking.com`. The message hadn't been sent yet.

**Parked on 8 Oct 2026.** At the meeting, Julian and Qing Guan chose Firebase for the showcase's login, with Google sign-in and GeeksHacking's login as an OIDC provider inside it ([ADR 0004](../../../docs/adr/0004-the-showcase-logs-in-through-firebase.md)). So this message isn't sent. What Qing Guan is asked for instead is one OIDC client for our Firebase project: [that message](message-to-qing-guan-firebase-client.md), since 10 Oct sent before Mr Pang is asked. The message comes back when events log in through the Portal.

---

```text
Hi Qing Guan! What GeekyKey needs to log people in through the Portal. No rush: the login comes after our first deploy.

*1. Two OAuth apps, one per service.* Each service logs users in itself, with its own redirect URLs:
- *GeekyKey Service* (the token page and "My tokens"): `https://key.geekshacking.com/auth/callback`, and `http://localhost:5174/auth/callback` for local dev
- *Showcase* (the passport and the organizers' screens): `https://event.geekshacking.com/auth/callback`, and `http://localhost:5173/auth/callback` for local dev
Does the Portal accept plain `http` for localhost?
Later, the GeekyKey Service's app will also use client credentials for the tag APIs, as in our tag APIs message.

*2. What we need to build the login:*
- the issuer URL, or the OIDC discovery document
- each app's client ID, and whether there's a client secret. If there is, could you send it to Adam privately rather than in the group?
- the scopes to ask for
- which claim carries the user's display name, and whether `sub` is the Portal user ID

*3. The participant QR code.* What does the Portal's QR code hold? Our organizers' fallback scans it to log a tap, and needs the Portal user ID. If it holds something else, we'll change the scanner.

Thanks!
```
