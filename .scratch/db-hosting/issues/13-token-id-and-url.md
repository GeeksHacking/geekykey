# What is a token's ID, and what URL is written on each token?

Type: grilling
Status: resolved
Blocked by: none
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

In Julian's station flow a station sends the token's ID. In his mobile flow a phone opens a GeekyKey Service link carrying that ID. His diagrams call it the "tag ID". A station can read the chip's hardware UID, but a phone that opens a link only sees the URL written on the token (its NDEF record). Held with Zi Tao:

- **The ID.** Is a token's ID its hardware UID, or an ID we write onto it? It must be the same in both flows.
- **The URL.** Which exact URL is written onto each token? Once tokens are handed out it cannot change, so the GeekyKey Service's hostname and path become permanent.
- **Guessing and privacy.** Could someone who reads one token's URL guess or forge another's? Anyone who taps a token on their phone sees its user's info: what should that show?
- **Writing tokens.** How, and by whom, are tokens written in bulk before the event?

This is hard to reverse, so record the answer as a decision record in `docs/adr/` as well as here.

## Answer

Resolved 28 Sep 2026 by grilling with Adam. Recorded as [ADR 0001](../../../docs/adr/0001-token-id-is-the-hardware-uid.md).

**Decided**

- **A token's ID is its hardware UID,** the same in the station flow and the phone flow: 7 bytes, written as 14 upper-case hex characters, the normalised form the station already sends. Our tokens are NTAG213 (Adam, 28 Sep).
- **Every token carries the address `https://geekykey.geekshacking.com/t/<UID>`.** It is written with 14 placeholder characters, and the chip's UID mirror swaps in its own UID each time it is read, so every token is written the same way. A random ID written per token was rejected: anyone with a phone can copy an address onto a blank tag, so forging would get easier, not harder, and every token would need its own write. Rewriting a token's address can't change what a station reads.
- **No read counter in the address.** It starts near zero, so it doesn't stop guessing, stations don't use it, and it would make every read a different address.
- **The hostname and the `/t/` path must keep working for as long as tokens are in use.** Keeping the hostname is Julian's call, since GeeksHacking owns the domain; Adam raises it with him, so no message is drafted here (Adam, 28 Sep).
- **Writes are protected by one password,** with the chip giving up after 7 wrong guesses. Anyone can read a token; only we can rewrite it. Tokens are never locked for good, so the address can be rewritten if it ever has to change. The password lives in the writer sketch's gitignored `secrets.h`, with a copy Adam keeps outside the repo.
- **Zi Tao writes the tokens before the event with a writer sketch on a spare station** (`firmware/token_writer/`), which checks each token by reading it back. NXP's TagWriter app is not used, not even as a fallback, so the address has only one shape: TagWriter adds the UID as a query parameter whose name has changed between versions, and it can't cap password guesses.
- **The token page has four levels of access:**
  1. Not logged in: a login prompt, and nothing about the token.
  2. Logged in, unclaimed token: a button to claim it.
  3. Logged in, someone else's token: "This token belongs to someone else", with no name.
  4. Logged in, your own token: your token, and a way to release it if it's lost.

  Organizers get no extra level: the GeekyKey Service knows nothing of event roles, and the Event Service never sees token IDs. Showing more, for example to friends who opt in, would belong to a game's Event Service, and can be added when needed.
- **We accept that addresses can be guessed.** UIDs aren't secret, since any NFC app shows them, and tokens from one batch may have UIDs close together. So someone could type out another token's address and claim it before its holder, or claim any NFC card by its UID. NTAG213 has no cryptography, so a phone can't prove it is touching the token. The stakes are stamps and points, every claim needs a Portal login, and the real holder can get the token released. A list of issued tokens was rejected: it would not stop guessing within the batch, and it is long-lived data the GeekyKey Service is not meant to hold.

**What follows without a further decision**

- The station keeps sending the hardware UID. Reading the text written on the token (`readNtag213Text` in `firmware/geekykey_station/geekykey_station.ino`) is no longer needed.
- The test tokens that hold a text record today get rewritten by the writer sketch.
- The Portal's key for a token is the normalised 14-character UID. The API contract's wider rule (4 to 10 bytes) can stay, since stations can read other cards.
- Until the token page exists, a phone that taps a token gets a "not found" page.

**Facts for the spec** (NXP's [NTAG213/215/216 datasheet](https://www.nxp.com/docs/en/data-sheet/NTAG213_215_216.pdf), Rev. 3.2, and the [TagWriter manual](https://inspire.nxp.com/tagwriter/tag-writer-user-manual.pdf), Rev. 1.29, checked 28 Sep 2026)

- The UID mirror returns the 7-byte UID as 14 ASCII hex characters in upper case when user memory is read. NXP's example reads back as `http://www.nxp.com/index.html?m=04E141124C2880` (section 8.7.1).
- The address takes 55 of the NTAG213's 144 bytes of user memory, keeping the lock control TLV a new token comes with.
- The password is 32 bits and can protect writes only (`PROT = 0`). `AUTHLIM` caps wrong guesses; once reached, the protected memory can never be written again, which does us no harm. Lock bits and `CFGLCK` are permanent.
- The station's `MFRC522` library already has `MIFARE_Ultralight_Write` and `PCD_NTAG216_AUTH`, which also works on NTAG213.
- TagWriter can turn on the UID mirror and a 4-character password and write many tokens in a row, but always adds the UID at the end as a query parameter (`?UID=` in the 2018 manual, `?m=` in the current app listing).

**Glossary**

`CONTEXT.md` gained **Release** (giving up a claim on a token, avoiding "unpair" and "revoke") and **Token page**. **Token** already said it is identified by its hardware UID.

**Assets**

- [Message to Zi Tao](../assets/message-to-zi-tao-token-writer.md): what the writer sketch does, step by step, with the exact bytes. Adam edits and sends it.

**Passed on**

- The station keeps sending the UID, and no longer reads the token's text: "How do stations talk to the GeekyKey Service?".
- The token page at `/t/<UID>` with its four levels, and landing back on it after the Portal login: "Which screens belong to which service, and how does each know who is logged in?".
- The writer sketch as a step for Zi Tao before the event, the token address in the API contract, and asking Julian to keep the hostname and path: "Write the migration spec".
- The Portal storing the 14-character UID, a way to release a token, and a GeeksHacking admin releasing one for a user: "What we need from the Portal's tag APIs", still fog on the map.
- Limits on how fast one user can claim tokens: "Protecting our public services", still fog on the map.
