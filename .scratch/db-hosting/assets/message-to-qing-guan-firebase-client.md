# Message to Qing Guan: an OIDC client for GeekyKey's Firebase project

Draft for Adam to edit and send, formatted for WhatsApp like [the earlier login message](message-to-qing-guan-login.md). Written 10 Oct 2026 for BAC-20, after Adam decided to add GeeksHacking's login beside Google before asking Mr Pang (spec checkpoint 5). It replaces that message's two OAuth apps for the showcase: Firebase signs people in, so the Portal sees one client, Firebase's, and our two services never talk to the Portal.

What's already known, from the Portal's discovery document at `https://hackomania-api.geekshacking.com/.well-known/openid-configuration` (checked 10 Oct): the issuer is `https://hackomania-api.geekshacking.com/`, it offers the code flow, client secrets, and the scopes `openid`, `profile` and `email`. The Portal's own playground (`GeeksHackingPortal.OidcWebPlayground`) already signs in to a Firebase project this way, with a confidential client.

Not yet known: whether the ID token carries `name` and `email`. The discovery document lists only `sub` among the user's claims. The Event Service shows the name on the passport and in the organizers' tap log.

---

```text
Hi Qing Guan! For the showcase's Firebase login: could you create an OAuth application on the Portal for GeekyKey's Firebase project? Then GeeksHacking members can sign in with their Portal account beside Google. (I'll check with Mr Pang that he's happy to offer it; if not, I just turn it off.)

- *Type:* confidential (web) client, code flow, like the one your OIDC playground uses with Firebase
- *Redirect URI:* `https://geekykey-b035a.firebaseapp.com/__/auth/handler`
- *Scopes:* `openid profile email`
- *Issuer:* I'll use `https://hackomania-api.geekshacking.com/`. Is that the right one?

Could you send me the client ID, and the client secret privately rather than in the group?

One question: with those scopes, does the ID token carry the user's name and email? We show the name on the passport.

Thanks!
```
