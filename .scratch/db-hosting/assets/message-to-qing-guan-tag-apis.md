# Message to Julian and Qing Guan: what the GeekyKey Service needs from the Portal's tag APIs

Draft for Adam to edit and send to the group chat, from "What does the GeekyKey Service need from the Portal's tag APIs?", 28 Sep 2026. The facts about the Portal come from its public repo, `GeeksHacking/portal`, read on `main` on 28 Sep 2026: the `NfcTag` entity, the Cloud Run settings in `GeeksHackingPortal.Infra/Stacks/DefaultStack.cs`, and the client-credentials flow in `GeeksHackingPortal.Api/Program.cs`. If it helps, Qing Guan can copy part 2 onto the Portal issue "nfc tag endpoitns".

---

**Part 1, for Julian**

Hi Julian! A proposal about the tags moving into the Portal. We'd like the showcase on 18 Nov to keep using our own `tokens` table, and switch to the Portal's tag APIs straight after it.

Why: once we switch, every tap at a station waits on a Portal lookup, and a station gives up after 5 seconds. From its repo, the Portal runs as one Cloud Run instance that handles one request at a time and sleeps when idle, so a tap could queue behind people logging in, or wait for the Portal to wake up. Changing where claims live a few weeks before the showcase is a risk the showcase gains nothing from. On our side every claim already goes through one module, so switching afterwards is a copy and a deploy. We'd do it before the showcase's data is cleaned up.

Is that OK with you?

**Part 2, for Qing Guan**

Hi Qing Guan! Saw the `NfcTag` entity and the tag issues, thanks for starting on them. Here's what the GeekyKey Service needs, in case it helps with the design. How you build it is your call.

1. **Tags looked up by their UID.** A token is identified by its hardware UID. Normalised, that's 8 to 20 uppercase hex characters, 14 for our tokens, for example `04A1B2C3D4E5F6`. A UID has at most one owner. The draft entity gives each tag a new GUID, and we'd need to find tags by UID.
2. **Four calls:**
   - **The owners of many UIDs in one call,** up to 500, because a station can upload a batch of saved taps. We only need the user ID for each claimed UID; unclaimed UIDs can just be left out of the answer.
   - **Claim a UID for a user.** The first claim wins. Please tell us whether it's newly claimed, already that user's, or someone else's, and record when it was claimed.
   - **Release a UID, only if a given user still owns it,** so a late click can't release someone's newer claim. A released claim can simply be deleted: we don't need a history.
   - **A user's tokens,** with when each was claimed, for our "My tokens" page.
3. **How we log in for these calls:** the client-credentials flow your server already has, with the GeekyKey Service's own OAuth app, and no other app allowed. The GeekyKey Service checks who may claim or release (the owner, or one of GeeksHacking's GeekyKey admins), so it calls as itself rather than on a user's behalf.
4. **Claims change only through the GeekyKey Service.** Showing a user's tokens on Portal screens would be great, but changing them there would skip our checks.
5. **Speed.** Our station path gives the lookup 1.5 seconds. For events that use the tag APIs, could the Portal keep an instance warm and take more than one request at a time? From the repo, one request at a time was needed when it ran on 0.08 of a CPU, and it has 4 CPUs now.

Two questions: roughly when might the APIs be ready (no rush for the showcase, see part 1)? And what happens to a user's tags if their account is deleted?

We won't need an import. When we switch, the GeekyKey Service copies its table across using the normal claim call.
