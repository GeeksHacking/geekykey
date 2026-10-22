import assert from "node:assert/strict";
import { env } from "cloudflare:test";
import { fakeGoogle } from "@geekykey/firebase-login/testing";
import { onTestFinished, test, vi } from "vitest";
import { fakeServices } from "../test-support/fake-services.ts";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

// GET /api/v1/tokens/{uid} on the GeekyKey Service (the API agreement's
// 8.5): what the token page shows once someone is logged in. Whether the
// token is unclaimed, theirs or someone else's, and, for a GeekyKey admin,
// whose. And POST /api/v1/tokens/{uid}/claim (8.2), which the token page's
// Claim and My tokens' claim-by-code form call: the first claim wins, and a
// user holds at most 3 tokens.

const google = await fakeGoogle(env.FIREBASE_PROJECT_ID);

/**
 * The Worker as production starts it, with wrangler.jsonc's settings,
 * `admin-1` as its one GeekyKey admin, and its services faked, and a way to
 * log in as a user and then look a token up or claim it with the cookie, as
 * the token page would.
 */
function harness({ claimsDeadlineMs = 4000 } = {}) {
  const config = loadConfig({ ...env, GEEKYKEY_ADMINS: ["admin-1"] });
  const fake = fakeServices(config);
  const app = createApp(config, { send: fake.send, googleKeys: google.keys, claimsDeadlineMs });

  /** The gk_session cookie a Firebase login as `userId` sets, as the browser sends it back. */
  async function logIn(userId: string): Promise<string> {
    const res = await app.request("/auth/firebase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: await google.signIdToken({ sub: userId }) }),
    });
    assert.equal(res.status, 204);
    // Only the name=value pair travels back.
    return (res.headers.get("Set-Cookie") ?? "").split(";")[0]!;
  }

  /** GET /api/v1/tokens/{uid}, with `uid` as the page puts it in the path. */
  const lookUp = (uid: string, cookie?: string) =>
    app.request(`/api/v1/tokens/${uid}`, {
      headers: cookie === undefined ? {} : { Cookie: cookie },
    });

  /** POST /api/v1/tokens/{uid}/claim, with no body, as the screens send it. */
  const claim = (uid: string, cookie?: string) =>
    app.request(`/api/v1/tokens/${uid}/claim`, {
      method: "POST",
      headers: cookie === undefined ? {} : { Cookie: cookie },
    });

  return { fake, logIn, lookUp, claim };
}

test("without a session, the lookup answers unauthenticated and asks the stand-in nothing", async () => {
  const { fake, lookUp } = harness();
  const res = await lookUp("04A1B2C3D4E5F6");
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await res.json(), { error: "unauthenticated" });
  assert.deepEqual(fake.sent, []);
});

test("a token nobody has claimed is nobody's, and only its owner was asked for", async () => {
  const { fake, logIn, lookUp } = harness();
  const res = await lookUp("04A1B2C3D4E5F6", await logIn("firebase-uid-1"));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await res.json(), {
    token: { uid: "04A1B2C3D4E5F6", owner: "nobody", claimed_at: null, owner_id: null },
  });
  assert.deepEqual(
    fake.sent.map(({ method, url, authorization, body }) => [method, url, authorization, body]),
    [
      [
        "POST",
        `${env.CLAIMS_STAND_IN_URL}/owners`,
        `Bearer ${env.CLAIMS_STAND_IN_KEY}`,
        { uids: ["04A1B2C3D4E5F6"] },
      ],
    ],
  );
});

test("the owner's own token is theirs, with when they claimed it", async () => {
  const { fake, logIn, lookUp } = harness();
  fake.owners.set("04A1B2C3D4E5F6", "firebase-uid-1");
  fake.tokens.set("firebase-uid-1", [
    { uid: "DEADBEEF", claimed_at: "2026-11-18T05:00:00.000Z" },
    { uid: "04A1B2C3D4E5F6", claimed_at: "2026-11-18T05:30:00.000Z" },
  ]);
  const res = await lookUp("04A1B2C3D4E5F6", await logIn("firebase-uid-1"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    token: {
      uid: "04A1B2C3D4E5F6",
      owner: "you",
      claimed_at: "2026-11-18T05:30:00.000Z",
      owner_id: null,
    },
  });
  // Who owns it, then the user's own tokens for when.
  assert.deepEqual(
    fake.sent.map(({ method, url }) => [method, url]),
    [
      ["POST", `${env.CLAIMS_STAND_IN_URL}/owners`],
      ["GET", `${env.CLAIMS_STAND_IN_URL}/users/firebase-uid-1/tokens`],
    ],
  );
});

test("someone else's token is someone else's, and a user isn't told whose", async () => {
  const { fake, logIn, lookUp } = harness();
  fake.owners.set("04A1B2C3D4E5F6", "firebase-uid-2");
  const res = await lookUp("04A1B2C3D4E5F6", await logIn("firebase-uid-1"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    token: { uid: "04A1B2C3D4E5F6", owner: "someone_else", claimed_at: null, owner_id: null },
  });
  // One call: the user's own tokens aren't needed.
  assert.equal(fake.sent.length, 1);
});

test("a GeekyKey admin is told whose it is, to release it with", async () => {
  const { fake, logIn, lookUp } = harness();
  fake.owners.set("04A1B2C3D4E5F6", "firebase-uid-2");
  const res = await lookUp("04A1B2C3D4E5F6", await logIn("admin-1"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    token: {
      uid: "04A1B2C3D4E5F6",
      owner: "someone_else",
      claimed_at: null,
      owner_id: "firebase-uid-2",
    },
  });
});

test("a UID in any separator style is the same token, and the stand-in is asked for it normalised", async () => {
  const { fake, logIn, lookUp } = harness();
  fake.owners.set("04A1B2C3D4E5F6", "firebase-uid-2");
  const cookie = await logIn("firebase-uid-1");
  // Colons, spaces, dashes and slashes, as readers commonly write a UID, in either case. A space
  // and a slash are percent-encoded, as the screens send them (the agreement's Token UID).
  for (const uid of [
    "04:a1:b2:c3:d4:e5:f6",
    "04%20A1%20B2%20C3%20D4%20E5%20F6",
    "04-a1-B2-c3-D4-e5-F6",
    "04%2FA1%2FB2%2FC3%2FD4%2FE5%2FF6",
  ]) {
    fake.sent.length = 0;
    const res = await lookUp(uid, cookie);
    assert.equal(res.status, 200, uid);
    assert.deepEqual(
      await res.json(),
      { token: { uid: "04A1B2C3D4E5F6", owner: "someone_else", claimed_at: null, owner_id: null } },
      uid,
    );
    assert.deepEqual(
      fake.sent.map(({ body }) => body),
      [{ uids: ["04A1B2C3D4E5F6"] }],
      uid,
    );
  }
});

test("a UID that isn't 4 to 10 hex bytes fails validation, and the stand-in isn't asked", async () => {
  const { fake, logIn, lookUp } = harness();
  const cookie = await logIn("firebase-uid-1");
  const bad = {
    "3 bytes": "04A1B2",
    "11 bytes": "04A1B2C3D4E5F6A7B8C9D0",
    "an odd number of hex digits": "04A1B2C3D",
    "no hex at all": "not-a-token",
  };
  for (const [what, uid] of Object.entries(bad)) {
    const res = await lookUp(uid, cookie);
    assert.equal(res.status, 400, what);
    assert.equal(res.headers.get("Cache-Control"), "no-store", what);
    const body = (await res.json()) as {
      error: string;
      issues: { path: unknown[]; message: string }[];
    };
    assert.equal(body.error, "validation_failed", what);
    assert.deepEqual(
      body.issues.map(({ path, message }) => [path, message]),
      [[["uid"], "uid must be 4 to 10 hex bytes"]],
      what,
    );
  }
  assert.deepEqual(fake.sent, []);
});

/** Every line logged as an error during this test, each read as one JSON object. */
function loggedErrors() {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => errors.mockRestore());
  return () =>
    errors.mock.calls.map(([line]) => JSON.parse(line as string) as Record<string, unknown>);
}

/** An answer from the stand-in that comes `ms` milliseconds late. */
const late = (ms: number, answer: () => Response) => async () => {
  await new Promise((resolve) => setTimeout(resolve, ms));
  return answer();
};

test("a stand-in that doesn't answer within the deadline gets claims_unavailable, and is logged", async () => {
  const { fake, logIn, lookUp } = harness({ claimsDeadlineMs: 200 });
  const cookie = await logIn("firebase-uid-1");
  const logged = loggedErrors();
  fake.answers.owners = late(1000, () => Response.json({ owners: [] }));
  const startedAt = Date.now();
  const res = await lookUp("04A1B2C3D4E5F6", cookie);
  const took = Date.now() - startedAt;
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await res.json(), { error: "claims_unavailable" });
  assert.ok(took < 600, `took ${took} ms, not cut short at the deadline`);
  assert.deepEqual(
    logged().map(({ message, user_id, reason }) => [message, user_id, reason]),
    [["claims_unavailable", "firebase-uid-1", "timeout"]],
  );
});

test("the owner's two calls share one deadline", async () => {
  const { fake, logIn, lookUp } = harness({ claimsDeadlineMs: 300 });
  const cookie = await logIn("firebase-uid-1");
  const logged = loggedErrors();
  fake.owners.set("04A1B2C3D4E5F6", "firebase-uid-1");
  // Each is within 300 ms on its own, but not both together.
  const answer = (body: unknown) => late(200, () => Response.json(body));
  fake.answers.owners = answer({ owners: [{ uid: "04A1B2C3D4E5F6", user_id: "firebase-uid-1" }] });
  fake.answers.tokens = answer({
    tokens: [{ uid: "04A1B2C3D4E5F6", claimed_at: "2026-11-18T05:30:00.000Z" }],
  });
  const res = await lookUp("04A1B2C3D4E5F6", cookie);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "claims_unavailable" });
  assert.deepEqual(
    logged().map(({ reason }) => reason),
    ["timeout"],
  );
});

test("a stand-in that answers with a body that doesn't fit gets claims_unavailable too", async () => {
  const { fake, logIn, lookUp } = harness();
  const logged = loggedErrors();
  const wrong: Record<string, Partial<typeof fake.answers>> = {
    "owners without user IDs": {
      owners: async () => Response.json({ owners: [{ uid: "04A1B2C3D4E5F6" }] }),
    },
    "the owner's tokens without when": {
      owners: async () =>
        Response.json({ owners: [{ uid: "04A1B2C3D4E5F6", user_id: "firebase-uid-1" }] }),
      tokens: async () => Response.json({ tokens: [{ uid: "04A1B2C3D4E5F6" }] }),
    },
  };
  const cookie = await logIn("firebase-uid-1");
  for (const [what, answers] of Object.entries(wrong)) {
    fake.answers = answers;
    const res = await lookUp("04A1B2C3D4E5F6", cookie);
    assert.equal(res.status, 503, what);
    assert.deepEqual(await res.json(), { error: "claims_unavailable" }, what);
  }
  assert.deepEqual(
    logged().map(({ message, reason }) => [message, reason]),
    [
      ["claims_unavailable", "unparseable"],
      ["claims_unavailable", "unparseable"],
    ],
  );
});

test("an owner whose token was released between the two calls sees it as nobody's", async () => {
  const { fake, logIn, lookUp } = harness();
  // The stand-in still had them as owner, then their own tokens no longer list it.
  fake.owners.set("04A1B2C3D4E5F6", "firebase-uid-1");
  const res = await lookUp("04A1B2C3D4E5F6", await logIn("firebase-uid-1"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    token: { uid: "04A1B2C3D4E5F6", owner: "nobody", claimed_at: null, owner_id: null },
  });
});

test("without a session, a claim answers unauthenticated and asks the stand-in nothing", async () => {
  const { fake, claim } = harness();
  const res = await claim("04A1B2C3D4E5F6");
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await res.json(), { error: "unauthenticated" });
  assert.deepEqual(fake.sent, []);
});

test("a token nobody has claimed is claimed, 201, with when", async () => {
  const { fake, logIn, claim } = harness();
  fake.now = "2026-11-18T06:00:00.000Z";
  const res = await claim("04A1B2C3D4E5F6", await logIn("firebase-uid-1"));
  assert.equal(res.status, 201);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await res.json(), {
    token: { uid: "04A1B2C3D4E5F6", claimed_at: "2026-11-18T06:00:00.000Z" },
  });
  assert.equal(fake.owners.get("04A1B2C3D4E5F6"), "firebase-uid-1");
  // The user's own tokens for the checks, then the claim, with the key.
  assert.deepEqual(
    fake.sent.map(({ method, url, authorization, body }) => [method, url, authorization, body]),
    [
      [
        "GET",
        `${env.CLAIMS_STAND_IN_URL}/users/firebase-uid-1/tokens`,
        `Bearer ${env.CLAIMS_STAND_IN_KEY}`,
        undefined,
      ],
      [
        "POST",
        `${env.CLAIMS_STAND_IN_URL}/tokens/04A1B2C3D4E5F6/claim`,
        `Bearer ${env.CLAIMS_STAND_IN_KEY}`,
        { user_id: "firebase-uid-1" },
      ],
    ],
  );
});

test("a token already among the user's answers 200 with when they claimed it, and isn't claimed again", async () => {
  const { fake, logIn, claim } = harness();
  fake.owners.set("04A1B2C3D4E5F6", "firebase-uid-1");
  fake.tokens.set("firebase-uid-1", [
    { uid: "04A1B2C3D4E5F6", claimed_at: "2026-11-18T05:30:00.000Z" },
  ]);
  const res = await claim("04:a1:b2:c3:d4:e5:f6", await logIn("firebase-uid-1"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    token: { uid: "04A1B2C3D4E5F6", claimed_at: "2026-11-18T05:30:00.000Z" },
  });
  assert.deepEqual(
    fake.sent.map(({ method, url }) => [method, url]),
    [["GET", `${env.CLAIMS_STAND_IN_URL}/users/firebase-uid-1/tokens`]],
  );
});

test("a claim beaten by another claim of the user's own answers 200, already yours", async () => {
  const { fake, logIn, claim } = harness();
  // Their own tokens didn't list it yet, then the stand-in says it's theirs:
  // a second claim of the user's, from another tab, raced this one.
  fake.answers.claim = async () =>
    Response.json({ result: "already_yours", claimed_at: "2026-11-18T05:59:59.000Z" });
  const res = await claim("04A1B2C3D4E5F6", await logIn("firebase-uid-1"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    token: { uid: "04A1B2C3D4E5F6", claimed_at: "2026-11-18T05:59:59.000Z" },
  });
});

/** `userId` holding three tokens, the most wrangler.jsonc's MAX_TOKENS_PER_USER allows. */
function holdingThree(fake: ReturnType<typeof harness>["fake"], userId: string) {
  const three = ["11111111", "22222222", "33333333"].map((uid, i) => ({
    uid,
    claimed_at: `2026-11-18T05:0${i}:00.000Z`,
  }));
  for (const { uid } of three) fake.owners.set(uid, userId);
  fake.tokens.set(userId, three);
}

test("a user holding 3 can't claim a 4th, and the stand-in isn't asked to", async () => {
  const { fake, logIn, claim } = harness();
  holdingThree(fake, "firebase-uid-1");
  const res = await claim("04A1B2C3D4E5F6", await logIn("firebase-uid-1"));
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "token_limit_reached" });
  assert.equal(fake.owners.get("04A1B2C3D4E5F6"), undefined);
  assert.deepEqual(
    fake.sent.map(({ method, url }) => [method, url]),
    [["GET", `${env.CLAIMS_STAND_IN_URL}/users/firebase-uid-1/tokens`]],
  );
});

test("a user holding 3 hears about the limit even for someone else's token", async () => {
  const { fake, logIn, claim } = harness();
  holdingThree(fake, "firebase-uid-1");
  fake.owners.set("04A1B2C3D4E5F6", "firebase-uid-2");
  const res = await claim("04A1B2C3D4E5F6", await logIn("firebase-uid-1"));
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "token_limit_reached" });
});

test("a GeekyKey admin holding 3 can't claim a 4th either", async () => {
  const { fake, logIn, claim } = harness();
  holdingThree(fake, "admin-1");
  const res = await claim("04A1B2C3D4E5F6", await logIn("admin-1"));
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "token_limit_reached" });
});

test("a user holding 3 who claims one of their own gets 200, whatever the count", async () => {
  const { fake, logIn, claim } = harness();
  holdingThree(fake, "firebase-uid-1");
  const res = await claim("22222222", await logIn("firebase-uid-1"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    token: { uid: "22222222", claimed_at: "2026-11-18T05:01:00.000Z" },
  });
});

test("someone else's token is token_taken, and stays theirs", async () => {
  const { fake, logIn, claim } = harness();
  fake.owners.set("04A1B2C3D4E5F6", "firebase-uid-2");
  const res = await claim("04A1B2C3D4E5F6", await logIn("firebase-uid-1"));
  assert.equal(res.status, 409);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await res.json(), { error: "token_taken" });
  assert.equal(fake.owners.get("04A1B2C3D4E5F6"), "firebase-uid-2");
});

test("a claim of a UID that isn't 4 to 10 hex bytes fails validation, and the stand-in isn't asked", async () => {
  const { fake, logIn, claim } = harness();
  const res = await claim("04A1B2", await logIn("firebase-uid-1"));
  assert.equal(res.status, 400);
  const body = (await res.json()) as {
    error: string;
    issues: { path: unknown[]; message: string }[];
  };
  assert.equal(body.error, "validation_failed");
  assert.deepEqual(
    body.issues.map(({ path, message }) => [path, message]),
    [[["uid"], "uid must be 4 to 10 hex bytes"]],
  );
  assert.deepEqual(fake.sent, []);
});

test("a stand-in that doesn't answer either of a claim's calls in time gets claims_unavailable", async () => {
  const slow: Record<string, Partial<ReturnType<typeof harness>["fake"]["answers"]>> = {
    "the user's own tokens": { tokens: late(1000, () => Response.json({ tokens: [] })) },
    "the claim": {
      claim: late(1000, () =>
        Response.json({ result: "claimed", claimed_at: "2026-11-18T06:00:00.000Z" }),
      ),
    },
  };
  const logged = loggedErrors();
  for (const [what, answers] of Object.entries(slow)) {
    const { fake, logIn, claim } = harness({ claimsDeadlineMs: 200 });
    const cookie = await logIn("firebase-uid-1");
    const before = logged().length;
    fake.answers = answers;
    const res = await claim("04A1B2C3D4E5F6", cookie);
    assert.equal(res.status, 503, what);
    assert.equal(res.headers.get("Cache-Control"), "no-store", what);
    assert.deepEqual(await res.json(), { error: "claims_unavailable" }, what);
    assert.deepEqual(
      logged()
        .slice(before)
        .map(({ message, user_id, reason }) => [message, user_id, reason]),
      [["claims_unavailable", "firebase-uid-1", "timeout"]],
      what,
    );
  }
});

test("a claim's two calls share one deadline", async () => {
  const { fake, logIn, claim } = harness({ claimsDeadlineMs: 300 });
  const cookie = await logIn("firebase-uid-1");
  loggedErrors();
  // Each is within 300 ms on its own, but not both together.
  fake.answers.tokens = late(200, () => Response.json({ tokens: [] }));
  fake.answers.claim = late(200, () =>
    Response.json({ result: "claimed", claimed_at: "2026-11-18T06:00:00.000Z" }),
  );
  const res = await claim("04A1B2C3D4E5F6", cookie);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "claims_unavailable" });
});

test("a stand-in whose claim answer doesn't fit gets claims_unavailable", async () => {
  const { fake, logIn, claim } = harness();
  const logged = loggedErrors();
  fake.answers.claim = async () => Response.json({ result: "claimed", claimed_at: null });
  const res = await claim("04A1B2C3D4E5F6", await logIn("firebase-uid-1"));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "claims_unavailable" });
  assert.deepEqual(
    logged().map(({ reason }) => reason),
    ["unparseable"],
  );
});
