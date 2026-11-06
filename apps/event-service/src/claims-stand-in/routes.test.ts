import assert from "node:assert/strict";
import { test } from "vitest";
import { claimToken, testApp, testDb, TEST_CLAIMS_STAND_IN_KEY } from "../test-helpers.ts";
import { tokenKinds, tokens } from "./schema.ts";

const app = testApp();

/** A request to one of the stand-in's routes, with the stand-in's key unless told otherwise. */
function standIn(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  authorization: string | null = `Bearer ${TEST_CLAIMS_STAND_IN_KEY}`,
) {
  return app.request(`/claims-stand-in/v1${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(authorization === null ? {} : { Authorization: authorization }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("the owners of some tokens leave out the ones nobody owns", async () => {
  await claimToken("04A1B2C3D4E5F6", "user-1");
  await claimToken("04C9E1A27B3080", "user-2");

  const res = await standIn("POST", "/owners", {
    uids: ["04A1B2C3D4E5F6", "DEADBEEF", "04C9E1A27B3080"],
  });
  assert.equal(res.status, 200);
  const { owners } = (await res.json()) as { owners: { uid: string; user_id: string }[] };
  assert.deepEqual(
    owners.sort((a, b) => a.uid.localeCompare(b.uid)),
    [
      { uid: "04A1B2C3D4E5F6", user_id: "user-1", kind: null },
      { uid: "04C9E1A27B3080", user_id: "user-2", kind: null },
    ],
  );
});

test("each owner comes with the token's kind from the list, or null for a token not in it", async () => {
  await claimToken("04A1B2C3D4E5F6", "user-1");
  await claimToken("04C9E1A27B3080", "user-2");
  await testDb()
    .insert(tokenKinds)
    .values([
      { uid: "04A1B2C3D4E5F6", kind: "E" },
      // In the list but nobody's, so still left out.
      { uid: "04D00D00D00D00", kind: "V" },
    ]);

  const res = await standIn("POST", "/owners", {
    uids: ["04A1B2C3D4E5F6", "04C9E1A27B3080", "04D00D00D00D00"],
  });
  assert.equal(res.status, 200);
  const { owners } = (await res.json()) as { owners: { uid: string }[] };
  assert.deepEqual(
    owners.sort((a, b) => a.uid.localeCompare(b.uid)),
    [
      { uid: "04A1B2C3D4E5F6", user_id: "user-1", kind: "E" },
      { uid: "04C9E1A27B3080", user_id: "user-2", kind: null },
    ],
  );
});

test("the owners of up to 500 tokens can be asked for at once, and no more", async () => {
  const uids = (count: number) =>
    Array.from({ length: count }, (_, i) => `04${i.toString(16).padStart(12, "0").toUpperCase()}`);

  assert.equal((await standIn("POST", "/owners", { uids: uids(500) })).status, 200);
  const tooMany = await standIn("POST", "/owners", { uids: uids(501) });
  assert.equal(tooMany.status, 400);
  assert.equal(((await tooMany.json()) as { error: string }).error, "validation_failed");
});

test("a UID must arrive normalised", async () => {
  for (const uid of ["04:A1:B2:C3:D4:E5:F6", "04a1b2c3d4e5f6", "ZZ"]) {
    const res = await standIn("POST", "/owners", { uids: [uid] });
    assert.equal(res.status, 400, uid);
  }
});

test("every route refuses a request without the stand-in's key, or with another", async () => {
  const routes = [
    ["POST", "/owners", { uids: ["04A1B2C3D4E5F6"] }],
    ["POST", "/tokens/04A1B2C3D4E5F6/claim", { user_id: "user-1" }],
    ["POST", "/tokens/04A1B2C3D4E5F6/release", { owner_id: "user-1" }],
    ["GET", "/users/user-1/tokens", undefined],
  ] as const;
  for (const authorization of [
    null,
    "",
    TEST_CLAIMS_STAND_IN_KEY,
    `Basic ${TEST_CLAIMS_STAND_IN_KEY}`,
    `Bearer ${"6".repeat(64)}`,
    `Bearer ${TEST_CLAIMS_STAND_IN_KEY.slice(1)}`,
    `Bearer ${TEST_CLAIMS_STAND_IN_KEY} extra`,
  ]) {
    for (const [method, path, body] of routes) {
      const res = await standIn(method, path, body, authorization);
      assert.equal(res.status, 401, `${method} ${path} with ${authorization}`);
      assert.deepEqual(await res.json(), { error: "invalid_claims_stand_in_key" });
    }
  }
  // Nothing was claimed or released on the way.
  assert.deepEqual(await testDb().select().from(tokens), []);
});

/** The stand-in's answer to a claim, which must be a 200. */
async function claim(uid: string, userId: string) {
  const res = await standIn("POST", `/tokens/${uid}/claim`, { user_id: userId });
  assert.equal(res.status, 200);
  return (await res.json()) as { result: string; claimed_at: string | null };
}

async function ownerOf(uid: string): Promise<string | undefined> {
  const res = await standIn("POST", "/owners", { uids: [uid] });
  const { owners } = (await res.json()) as { owners: { uid: string; user_id: string }[] };
  return owners[0]?.user_id;
}

test("a token nobody owns is claimed, from now", async () => {
  const before = new Date().toISOString();
  const answer = await claim("04A1B2C3D4E5F6", "user-1");

  assert.equal(answer.result, "claimed");
  assert.ok(answer.claimed_at! >= before, `${answer.claimed_at} is before ${before}`);
  assert.equal(new Date(answer.claimed_at!).toISOString(), answer.claimed_at);
  assert.equal(await ownerOf("04A1B2C3D4E5F6"), "user-1");
});

test("claiming your own token again changes nothing", async () => {
  await claimToken("04A1B2C3D4E5F6", "user-1", "2026-10-12T05:00:00.000Z");
  assert.deepEqual(await claim("04A1B2C3D4E5F6", "user-1"), {
    result: "already_yours",
    claimed_at: "2026-10-12T05:00:00.000Z",
  });
});

test("the first claim wins, and the second learns nothing about it", async () => {
  await claimToken("04A1B2C3D4E5F6", "user-1");
  assert.deepEqual(await claim("04A1B2C3D4E5F6", "user-2"), {
    result: "taken",
    claimed_at: null,
  });
  assert.equal(await ownerOf("04A1B2C3D4E5F6"), "user-1");
});

test("a claim needs a normalised UID and a user ID", async () => {
  for (const [uid, body] of [
    ["04:A1:B2:C3:D4:E5:F6", { user_id: "user-1" }],
    ["04A1B2C3D4E5F6", {}],
    ["04A1B2C3D4E5F6", { user_id: "" }],
  ] as const) {
    const res = await standIn("POST", `/tokens/${uid}/claim`, body);
    assert.equal(res.status, 400, `${uid} ${JSON.stringify(body)}`);
    assert.equal(((await res.json()) as { error: string }).error, "validation_failed");
  }
});

async function release(uid: string, ownerId: string) {
  const res = await standIn("POST", `/tokens/${uid}/release`, { owner_id: ownerId });
  assert.equal(res.status, 200);
  return (await res.json()) as { result: string };
}

test("its owner releases a token, and anyone can claim it again", async () => {
  await claimToken("04A1B2C3D4E5F6", "user-1");
  assert.deepEqual(await release("04A1B2C3D4E5F6", "user-1"), { result: "released" });
  assert.equal(await ownerOf("04A1B2C3D4E5F6"), undefined);
  // Releasing deletes the claim, so nothing is left of it.
  assert.deepEqual(await testDb().select().from(tokens), []);
  assert.equal((await claim("04A1B2C3D4E5F6", "user-2")).result, "claimed");
});

test("a release names the owner, so a newer claim isn't released by mistake", async () => {
  // user-1 released the token and user-2 claimed it, before a late second
  // click by an admin who still saw user-1 as the owner.
  await claimToken("04A1B2C3D4E5F6", "user-2");
  assert.deepEqual(await release("04A1B2C3D4E5F6", "user-1"), { result: "not_owner" });
  assert.equal(await ownerOf("04A1B2C3D4E5F6"), "user-2");
});

test("releasing a token nobody owns is not_owner", async () => {
  assert.deepEqual(await release("04A1B2C3D4E5F6", "user-1"), { result: "not_owner" });
});

test("a user's tokens come oldest claim first", async () => {
  await claimToken("04C9E1A27B3080", "user-1", "2026-10-12T06:00:00.000Z");
  await claimToken("04A1B2C3D4E5F6", "user-1", "2026-10-12T05:00:00.000Z");
  await claimToken("0455D2F1C83A91", "user-2", "2026-10-12T04:00:00.000Z");

  const res = await standIn("GET", "/users/user-1/tokens");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    tokens: [
      { uid: "04A1B2C3D4E5F6", claimed_at: "2026-10-12T05:00:00.000Z" },
      { uid: "04C9E1A27B3080", claimed_at: "2026-10-12T06:00:00.000Z" },
    ],
  });
});

test("a user ID with characters a path can't hold reads back the same", async () => {
  await claimToken("04A1B2C3D4E5F6", "user/1 & co");
  const res = await standIn("GET", `/users/${encodeURIComponent("user/1 & co")}/tokens`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    tokens: [{ uid: "04A1B2C3D4E5F6", claimed_at: "2026-10-12T05:00:00.000Z" }],
  });
});

test("a user with no tokens has an empty list", async () => {
  const res = await standIn("GET", "/users/user-1/tokens");
  assert.deepEqual(await res.json(), { tokens: [] });
});

test("the kinds' totals count the tokens on the list, by kind in order", async () => {
  await testDb()
    .insert(tokenKinds)
    .values([
      { uid: "04A1B2C3D4E5F6", kind: "E" },
      { uid: "04C9E1A27B3080", kind: "B" },
      { uid: "04D00D00D00D00", kind: "E" },
    ]);

  const res = await standIn("GET", "/token-kinds");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    kinds: [
      { kind: "B", tokens: 1 },
      { kind: "E", tokens: 2 },
    ],
  });
});

test("the kinds' totals are empty before anything is loaded", async () => {
  const res = await standIn("GET", "/token-kinds");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { kinds: [] });
});

test("a load adds new tokens, changes kinds, and says how many of each", async () => {
  await testDb()
    .insert(tokenKinds)
    .values([
      { uid: "04A1B2C3D4E5F6", kind: "E" },
      { uid: "04C9E1A27B3080", kind: "B" },
    ]);

  const res = await standIn("POST", "/token-kinds", {
    tokens: [
      { uid: "04A1B2C3D4E5F6", kind: "H" },
      { uid: "04C9E1A27B3080", kind: "B" },
      { uid: "04D00D00D00D00", kind: "V" },
      { uid: "04D00D00D00D01", kind: "V" },
    ],
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { new: 2, changed: 1, unchanged: 1 });

  const rows = await testDb().select().from(tokenKinds);
  assert.deepEqual(
    rows.sort((a, b) => a.uid.localeCompare(b.uid)),
    [
      { uid: "04A1B2C3D4E5F6", kind: "H" },
      { uid: "04C9E1A27B3080", kind: "B" },
      { uid: "04D00D00D00D00", kind: "V" },
      { uid: "04D00D00D00D01", kind: "V" },
    ],
  );
});

test("a load removes nothing: a token not in it keeps its kind", async () => {
  await testDb().insert(tokenKinds).values({ uid: "04A1B2C3D4E5F6", kind: "E" });

  const res = await standIn("POST", "/token-kinds", {
    tokens: [{ uid: "04C9E1A27B3080", kind: "B" }],
  });
  assert.equal(res.status, 200);

  const rows = await testDb().select().from(tokenKinds);
  assert.deepEqual(
    rows.sort((a, b) => a.uid.localeCompare(b.uid)),
    [
      { uid: "04A1B2C3D4E5F6", kind: "E" },
      { uid: "04C9E1A27B3080", kind: "B" },
    ],
  );
});

test("a load naming a UID twice takes the later kind, and counts the token once", async () => {
  const res = await standIn("POST", "/token-kinds", {
    tokens: [
      { uid: "04A1B2C3D4E5F6", kind: "E" },
      { uid: "04A1B2C3D4E5F6", kind: "B" },
    ],
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { new: 1, changed: 0, unchanged: 0 });
  assert.deepEqual(await testDb().select().from(tokenKinds), [
    { uid: "04A1B2C3D4E5F6", kind: "B" },
  ]);
});

test("up to 500 tokens can be loaded at once, and no more", async () => {
  const tokens = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      uid: `04${i.toString(16).padStart(12, "0").toUpperCase()}`,
      kind: "E",
    }));

  const res = await standIn("POST", "/token-kinds", { tokens: tokens(500) });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { new: 500, changed: 0, unchanged: 0 });

  const tooMany = await standIn("POST", "/token-kinds", { tokens: tokens(501) });
  assert.equal(tooMany.status, 400);
  assert.equal(((await tooMany.json()) as { error: string }).error, "validation_failed");
});

test("a load is refused for a UID or a kind that isn't one", async () => {
  for (const token of [
    { uid: "04:A1:B2:C3", kind: "E" },
    { uid: "04A1B2C3D4E5F6", kind: "e" },
    { uid: "04A1B2C3D4E5F6", kind: "EE" },
  ]) {
    const res = await standIn("POST", "/token-kinds", { tokens: [token] });
    assert.equal(res.status, 400);
  }
  assert.deepEqual(await testDb().select().from(tokenKinds), []);
});

test("the token kinds' routes refuse a request without the stand-in's key", async () => {
  const totals = await standIn("GET", "/token-kinds", undefined, null);
  assert.equal(totals.status, 401);
  const load = await standIn("POST", "/token-kinds", { tokens: [] }, "Bearer wrong");
  assert.equal(load.status, 401);
});

test("the admin list includes kinds and claims without kinds, once each in UID order", async () => {
  await standIn("POST", "/token-kinds", {
    tokens: [
      { uid: "04A1B2C3D4E5F6", kind: "E" },
      { uid: "04C9E1A27B3080", kind: "B" },
    ],
  });
  const claimed = await claim("04A1B2C3D4E5F6", "user-1");
  const noKind = await claim("DEADBEEF", "user-2");
  const res = await standIn("GET", "/token-kinds/tokens");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    tokens: [
      { uid: "04A1B2C3D4E5F6", kind: "E", owner_id: "user-1", claimed_at: claimed.claimed_at },
      { uid: "04C9E1A27B3080", kind: "B", owner_id: null, claimed_at: null },
      { uid: "DEADBEEF", kind: null, owner_id: "user-2", claimed_at: noKind.claimed_at },
    ],
  });
});

test("removal refuses a claim, then removes only the kind after release and allows reloading", async () => {
  const uid = "04A1B2C3D4E5F6";
  const load = () => standIn("POST", "/token-kinds", { tokens: [{ uid, kind: "E" }] });
  await load();
  await claim(uid, "user-1");
  const refused = await standIn("DELETE", `/token-kinds/${uid}`);
  assert.equal(refused.status, 200);
  assert.deepEqual(await refused.json(), { result: "claimed" });
  assert.deepEqual(await (await standIn("GET", "/token-kinds")).json(), {
    kinds: [{ kind: "E", tokens: 1 }],
  });
  await release(uid, "user-1");
  assert.deepEqual(await (await standIn("DELETE", `/token-kinds/${uid}`)).json(), {
    result: "removed",
  });
  assert.deepEqual(await (await standIn("GET", "/token-kinds/tokens")).json(), { tokens: [] });
  assert.deepEqual(await (await standIn("GET", "/token-kinds")).json(), { kinds: [] });
  assert.deepEqual(await (await standIn("DELETE", `/token-kinds/${uid}`)).json(), {
    result: "not_found",
  });
  assert.deepEqual(await (await load()).json(), { new: 1, changed: 0, unchanged: 0 });
});

test("the list returns 500 tokens without truncating or duplicating claims", async () => {
  const tokens = Array.from({ length: 500 }, (_, i) => ({
    uid: `04${i.toString(16).padStart(12, "0").toUpperCase()}`,
    kind: "E",
  }));
  await standIn("POST", "/token-kinds", { tokens });
  await claim("040000000001F3", "user-1");
  const res = await standIn("GET", "/token-kinds/tokens");
  assert.equal(res.status, 200);
  const list = (await res.json()) as { tokens: { uid: string; owner_id: string | null }[] };
  assert.equal(list.tokens.length, 500);
  assert.equal(list.tokens[499]?.uid, "040000000001F3");
  assert.equal(list.tokens[499]?.owner_id, "user-1");
});

test("a claim concurrent with removal either keeps its kind or starts after removal", async () => {
  // Observe the two operations together through the routes, against TiDB's real locks.
  for (let i = 0; i < 10; i++) {
    const uid = `04${i.toString(16).padStart(12, "0").toUpperCase()}`;
    await standIn("POST", "/token-kinds", { tokens: [{ uid, kind: "E" }] });
    const [claimed, removed] = await Promise.all([
      standIn("POST", `/tokens/${uid}/claim`, { user_id: "user-1" }),
      standIn("DELETE", `/token-kinds/${uid}`),
    ]);
    assert.equal(claimed.status, 200);
    assert.equal(removed.status, 200);
    const result = (await removed.json()) as { result: string };
    const list = (await (await standIn("GET", "/token-kinds/tokens")).json()) as {
      tokens: { uid: string; kind: string | null; owner_id: string | null }[];
    };
    const token = list.tokens.find((t) => t.uid === uid);
    assert.equal(token?.owner_id, "user-1");
    assert.ok(result.result === "claimed" || result.result === "removed");
    assert.equal(token?.kind, result.result === "claimed" ? "E" : null);
  }
});
