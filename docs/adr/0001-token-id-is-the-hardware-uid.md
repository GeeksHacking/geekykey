# Tokens are identified by their hardware UID, mirrored into a permanent link

A token's ID is its NTAG213 hardware UID, both when a station reads it and when a phone opens it.
Every token carries the address `https://key.geekshacking.com/t/<UID>`, and the chip fills in
its own UID each time it is read (the NTAG21x "UID mirror"), so every token is written the same
way. Writes are protected by one password with a cap on wrong guesses, not locked for good, so the
address can be rewritten if it ever has to change. The hostname and path must keep working for as
long as tokens are in use. Decided 28 Sep 2026 by Adam, in the wayfinder ticket "What is a token's
ID, and what URL is written on each token?". The hostname was `geekykey.geekshacking.com` until 1 Oct
2026, when Julian, who runs GeeksHacking's domains, chose `key.geekshacking.com`.

**Considered options.** A random ID written into each token's address can't be guessed, but anyone
with a phone can copy it onto a blank tag, which makes forging easier, not harder. It would also
need a separate write for every token and a firmware change. NXP's TagWriter app needs no code, but
it only adds the UID as a query parameter whose name has changed between versions, and it can't cap
password guesses, so Zi Tao writes the tokens with a writer sketch on a spare station instead.

**Consequences.** UIDs aren't secret, and tokens from one batch may have UIDs close together, so
someone could claim a token they don't hold, or any NFC card. We accept this. The stakes are stamps
and points, every claim needs a Portal login, and the real holder can get the token released.
