SETTLED
# Message to Zi Tao: the Wi-Fi password in the repo

Draft for Adam to edit and send, from the replies recorded in "How do deploys and secrets work?", 28 Sep 2026. It has to be sorted before the repo goes public, because git history can't be taken back once it's public. Formatted for WhatsApp.

```text
Hi Zi Tao! GeeksHacking is making the geekykey repo public soon, so every file and its whole history will be visible to anyone.

`firmware/NFC_test/test.ino` (from your "Added test code" commit on 23 Sep) has a Wi-Fi name and password in plain text (the "Aegon" network). Could you:
1. Change that Wi-Fi's password, or tell me if it's just a throwaway hotspot. Deleting the line isn't enough, because the old commit stays public
2. Remove it from the file and read it from `secrets.h` like the station sketch does (it's gitignored)

Thanks! No rush tonight, but we need it done before we flip the repo to public.
```
