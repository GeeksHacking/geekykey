import assert from "node:assert/strict";
import { test } from "vitest";
import { ClaimsUnavailable, StandInClaims } from "./claims.ts";

// StandInClaims as the claims stand-in's client: what it sends each of the
// stand-in's routes (the migration spec's section 4), and how it reads each
// answer. The stand-in is faked behind `send`, with the answers its routes
// give.

const STAND_IN_URL = "https://event-api.test/claims-stand-in/v1";
const KEY = "5".repeat(64);

/** StandInClaims whose one request is answered with `answer`, and what it sent. */
function standIn(answer: Response) {
  const sent: { method: string; url: string; authorization: string | null; body: unknown }[] = [];
  const claims = new StandInClaims({
    url: STAND_IN_URL,
    key: KEY,
    send: async (url, init) => {
      sent.push({
        method: init.method ?? "GET",
        url,
        authorization: new Headers(init.headers).get("Authorization"),
        body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      });
      return answer;
    },
  });
  return { claims, sent };
}

/** Plenty of time: these tests aren't about the deadline. */
const signal = () => AbortSignal.timeout(4000);

test("the owners of the tokens someone owns, and none for the rest", async () => {
  const { claims, sent } = standIn(
    Response.json({ owners: [{ uid: "04A1B2C3D4E5F6", user_id: "user-1", kind: "E" }] }),
  );
  const owners = await claims.ownersOf(["04A1B2C3D4E5F6", "DEADBEEF"], signal());
  assert.deepEqual(owners, new Map([["04A1B2C3D4E5F6", { userId: "user-1", kind: "E" }]]));
  assert.deepEqual(sent, [
    {
      method: "POST",
      url: `${STAND_IN_URL}/owners`,
      authorization: `Bearer ${KEY}`,
      body: { uids: ["04A1B2C3D4E5F6", "DEADBEEF"] },
    },
  ]);
});

test("no UIDs, no owners, and nothing asked", async () => {
  const { claims, sent } = standIn(Response.json({ owners: [] }));
  assert.deepEqual(await claims.ownersOf([], signal()), new Map());
  assert.deepEqual(sent, []);
});

test("a claim's answer: claimed, with when, or taken", async () => {
  const claimed = standIn(
    Response.json({ result: "claimed", claimed_at: "2026-10-16T01:00:00.000Z" }),
  );
  assert.deepEqual(await claimed.claims.claim("04A1B2C3D4E5F6", "user-1", signal()), {
    result: "claimed",
    claimedAt: "2026-10-16T01:00:00.000Z",
  });
  assert.deepEqual(claimed.sent[0]!.url, `${STAND_IN_URL}/tokens/04A1B2C3D4E5F6/claim`);
  assert.deepEqual(claimed.sent[0]!.body, { user_id: "user-1" });

  const taken = standIn(Response.json({ result: "taken", claimed_at: null }));
  assert.deepEqual(await taken.claims.claim("04A1B2C3D4E5F6", "user-2", signal()), {
    result: "taken",
  });
});

test("a release names the owner it expects", async () => {
  const { claims, sent } = standIn(Response.json({ result: "not_owner" }));
  assert.equal(await claims.release("04A1B2C3D4E5F6", "user-2", signal()), "not_owner");
  assert.deepEqual(sent[0]!.url, `${STAND_IN_URL}/tokens/04A1B2C3D4E5F6/release`);
  assert.deepEqual(sent[0]!.body, { owner_id: "user-2" });
});

test("a user's tokens, with their user ID made safe for the path", async () => {
  const { claims, sent } = standIn(
    Response.json({ tokens: [{ uid: "04A1B2C3D4E5F6", claimed_at: "2026-10-12T05:00:00.000Z" }] }),
  );
  assert.deepEqual(await claims.tokensOf("dev-user/1", signal()), [
    { uid: "04A1B2C3D4E5F6", claimedAt: "2026-10-12T05:00:00.000Z" },
  ]);
  assert.deepEqual(sent[0]!.method, "GET");
  assert.deepEqual(sent[0]!.url, `${STAND_IN_URL}/users/dev-user%2F1/tokens`);
});

test("a 401, as until a new key is set on both sides, is ClaimsUnavailable", async () => {
  const { claims } = standIn(Response.json({ error: "unauthenticated" }, { status: 401 }));
  await assert.rejects(
    claims.ownersOf(["04A1B2C3D4E5F6"], signal()),
    (err) => err instanceof ClaimsUnavailable && err.reason === "status" && err.status === 401,
  );
});

test("writer uploads carry write times and return outdated counts", async () => {
  const { claims, sent } = standIn(
    Response.json({ new: 1, changed: 2, unchanged: 3, outdated: 4 }),
  );
  const tokens = [{ uid: "04E45150324189", kind: "E", written_at: "2026-11-13T01:00:00.123Z" }];
  assert.deepEqual(await claims.uploadKinds(tokens, signal()), {
    new: 1,
    changed: 2,
    unchanged: 3,
    outdated: 4,
  });
  assert.deepEqual(sent, [
    {
      method: "POST",
      url: `${STAND_IN_URL}/token-kinds`,
      authorization: `Bearer ${KEY}`,
      body: { tokens },
    },
  ]);
});

test("paste loads hide the new count and writer uploads accept an old stand-in answer", async () => {
  const paste = standIn(Response.json({ new: 1, changed: 0, unchanged: 0, outdated: 0 }));
  assert.deepEqual(await paste.claims.loadKinds([{ uid: "DEADBEEF", kind: "E" }], signal()), {
    new: 1,
    changed: 0,
    unchanged: 0,
  });
  const old = standIn(Response.json({ new: 1, changed: 0, unchanged: 0 }));
  assert.deepEqual(
    await old.claims.uploadKinds(
      [{ uid: "DEADBEEF", kind: "E", written_at: "2026-11-13T00:00:00.000Z" }],
      signal(),
    ),
    { new: 1, changed: 0, unchanged: 0, outdated: 0 },
  );
});

test("a writer upload fails closed on a bad count or an unanswered stand-in", async () => {
  for (const answer of [
    Response.json({ new: 0, changed: 0, unchanged: 0, outdated: "bad" }),
    new Response(null, { status: 500 }),
  ]) {
    const { claims } = standIn(answer);
    await assert.rejects(claims.uploadKinds([], signal()), ClaimsUnavailable);
  }
});
