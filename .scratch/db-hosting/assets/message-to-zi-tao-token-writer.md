# Message to Zi Tao: writing the tokens

Draft for Adam to edit and send, from "What is a token's ID, and what URL is written on each token?", 28 Sep 2026. The byte values come from NXP's [NTAG213/215/216 datasheet](https://www.nxp.com/docs/en/data-sheet/NTAG213_215_216.pdf) (Rev. 3.2), sections 8.5.7 and 8.7, and the functions from the `MFRC522` library the station already uses.

---

Hi Zi Tao, we've decided how tokens are identified and what gets written on them. Could you build a small **token writer** sketch, `firmware/token_writer/`, to run on a spare station before the event?

**What we decided**

- A token's ID is its **hardware UID**, the same 14 hex characters the station sends today. The station doesn't need to change.
- Every token carries one web address: `https://geekykey.geekshacking.com/t/<UID>`. A phone that taps the token opens it.
- We don't write a different address on each token. NTAG213 has a **UID mirror**: we write the address with 14 `0` characters at the end, and the chip swaps in its own UID every time it is read. So every token is written identically.
- Writes are protected by **one password**, and the chip gives up after 7 wrong guesses. Anyone can still read a token, but only we can rewrite it. **Never lock a token for good**, so we can rewrite the address if it ever has to change.

**What the sketch does for each token**

1. **Check whether it was written before.** Read page `29h` (reading is never protected). If byte 3 (`AUTH0`) is `FF`, the token is fresh. Otherwise, call `PCD_NTAG216_AUTH` with our password first, and stop if it fails.
2. **Write the address** to pages `04h` to `11h` with `MIFARE_Ultralight_Write`, 4 bytes per page. The first 5 bytes are the lock control TLV a new NTAG213 comes with, kept as is:

   ```
   byte  0-4   01 03 A0 0C 34            lock control TLV (as delivered)
   byte  5     03                        NDEF message starts
   byte  6     2F                        its length: 47 bytes
   byte  7-10  D1 01 2B 55               one record, type "U" (web address), 43 bytes long
   byte  11    04                        means "https://"
   byte  12-39 geekykey.geekshacking.com/t/   (28 characters)
   byte  40-53 00000000000000            14 placeholders, replaced by the UID
   byte  54    FE                        end
   byte  55    00                        padding to fill page 11h
   ```

   Byte 40 is page `04h + 40/4 = 0Eh`, byte `40 % 4 = 0`. That is where the mirror starts.
3. **Write the password before turning protection on,** so a token that fails halfway can't lock us out:
   - page `2Bh`: the 4-byte password;
   - page `2Ch`: the 2-byte PACK, then `00 00`.
4. **Write page `2Ah`: `07 00 00 00`.** That is the `ACCESS` byte: protect writes only (not reads), leave the settings unlocked, counter off, and stop after 7 wrong password guesses.
5. **Write page `29h` last: `44 00 0E 04`.** This turns the UID mirror on at page `0Eh` byte 0, keeps strong modulation on, and protects every page from `04h` onwards (`AUTH0 = 04h`). Read the page first and keep any other bits as they were.
6. **Check the token.** Ask for it to be taken away and tapped again. Read pages `04h` to `11h` and check that the address ends in the token's own UID (the same `uidToHex` the station uses). Show "OK" or "FAIL" and the UID on the LCD.

**Please don't**

- set `CFGLCK` (bit 6 of `ACCESS`) or touch the lock bytes on pages `02h` and `28h`. Both are permanent;
- turn on the read counter (`NFC_CNT_EN`). We only want the UID in the address.

**The password** is 4 bytes plus a 2-byte PACK. Put them in the sketch's gitignored `secrets.h`, like the Wi-Fi details, and give Adam a copy to keep somewhere safe outside the repo. Without it, the tokens can never be rewritten.

**Try it on one spare token first.** Then tap it with an iPhone and an Android phone: each should offer to open `https://geekykey.geekshacking.com/t/04…`. The page won't exist yet, so a "not found" is fine for now.

These page numbers are for NTAG213, which is what our tokens are. NTAG215 and 216 keep their settings on different pages, so check before buying a different kind.
