import assert from "node:assert/strict";
import { env } from "cloudflare:test";
import { fakeGoogle } from "@geekykey/firebase-login/testing";
import { onTestFinished, test, vi } from "vitest";
import { fakeLimiter } from "../test-support/fake-limiter.ts";
import { fakeServices } from "../test-support/fake-services.ts";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

// GET and POST /api/v1/admin/token-kinds on the GeekyKey Service: what the
// token kinds screen shows and loads (BAC-139). A GeekyKey admin does both, an
// organizer only reads the totals, and the list is only ever reached through
// the claims stand-in.

const google = await fakeGoogle(env.FIREBASE_PROJECT_ID);

function harness({ claimsDeadlineMs = 4000 } = {}) {
  const config = loadConfig({
    ...env,
    GEEKYKEY_ADMINS: ["admin-1"],
    TOKEN_KIND_VIEWERS: ["organizer-1"],
  });
  const fake = fakeServices(config);
  const app = createApp(config, {
    send: fake.send,
    googleKeys: google.keys,
    claimsDeadlineMs,
    stationLimit: env.STATION_LIMIT,
    userLimit: fakeLimiter(60),
    tokenLimit: fakeLimiter(20),
  });

  async function logIn(userId: string): Promise<string> {
    const res = await app.request("/auth/firebase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: await google.signIdToken({ sub: userId }) }),
    });
    assert.equal(res.status, 204);
    return (res.headers.get("Set-Cookie") ?? "").split(";")[0]!;
  }

  const totals = (cookie?: string) =>
    app.request("/api/v1/admin/token-kinds", {
      headers: cookie === undefined ? {} : { Cookie: cookie },
    });

  const load = (body: unknown, cookie?: string) =>
    app.request("/api/v1/admin/token-kinds", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie === undefined ? {} : { Cookie: cookie }),
      },
      body: JSON.stringify(body),
    });

  return { config, fake, logIn, totals, load };
}

/** Captures the Worker's log lines for one test, as parsed JSON. */
function captureLogs() {
  const lines: Record<string, unknown>[] = [];
  const spy = (line: unknown) => {
    lines.push(JSON.parse(String(line)) as Record<string, unknown>);
  };
  const info = vi.spyOn(console, "log").mockImplementation(spy);
  const error = vi.spyOn(console, "error").mockImplementation(spy);
  onTestFinished(() => {
    info.mockRestore();
    error.mockRestore();
  });
  return lines;
}

test("nobody without a session gets the totals or loads", async () => {
  const { fake, totals, load } = harness();

  const seen = await totals();
  assert.equal(seen.status, 401);
  assert.deepEqual(await seen.json(), { error: "unauthenticated" });

  const loaded = await load({ tokens: [{ uid: "04A1B2C3D4E5F6", kind: "E" }] });
  assert.equal(loaded.status, 401);

  assert.deepEqual(fake.sent, []);
});

test("someone on neither list is refused, whatever they send", async () => {
  const { fake, logIn, totals, load } = harness();
  const cookie = await logIn("user-1");

  const seen = await totals(cookie);
  assert.equal(seen.status, 403);
  assert.deepEqual(await seen.json(), { error: "forbidden" });

  const loaded = await load({ tokens: [{ uid: "04A1B2C3D4E5F6", kind: "E" }] }, cookie);
  assert.equal(loaded.status, 403);

  // Refused before the body is read, so a bad one tells them nothing either.
  const malformed = await load({ nonsense: true }, cookie);
  assert.equal(malformed.status, 403);

  assert.deepEqual(fake.sent, []);
  assert.equal(fake.kinds.size, 0);
});

test("a GeekyKey admin sees how many tokens each kind has", async () => {
  const { fake, logIn, totals } = harness();
  fake.kinds.set("04A1B2C3D4E5F6", "E");
  fake.kinds.set("04C9E1A27B3080", "B");
  fake.kinds.set("04D00D00D00D00", "E");

  const res = await totals(await logIn("admin-1"));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    kinds: [
      { kind: "B", tokens: 1 },
      { kind: "E", tokens: 2 },
    ],
  });
});

test("an organizer sees how many tokens each kind has", async () => {
  const { fake, logIn, totals } = harness();
  fake.kinds.set("04A1B2C3D4E5F6", "E");

  const res = await totals(await logIn("organizer-1"));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { kinds: [{ kind: "E", tokens: 1 }] });
});

test("an organizer can't load, whatever they send", async () => {
  const { fake, logIn, load } = harness();
  const cookie = await logIn("organizer-1");

  const loaded = await load({ tokens: [{ uid: "04A1B2C3D4E5F6", kind: "E" }] }, cookie);
  assert.equal(loaded.status, 403);
  assert.deepEqual(await loaded.json(), { error: "forbidden" });

  const malformed = await load({ nonsense: true }, cookie);
  assert.equal(malformed.status, 403);

  assert.deepEqual(fake.sent, []);
  assert.equal(fake.kinds.size, 0);
});

test("a GeekyKey admin's load says what was new and what changed kind, and logs who did it", async () => {
  const { fake, logIn, load } = harness();
  fake.kinds.set("04A1B2C3D4E5F6", "E");
  fake.kinds.set("04C9E1A27B3080", "B");
  const lines = captureLogs();

  const res = await load(
    {
      tokens: [
        { uid: "04A1B2C3D4E5F6", kind: "H" },
        { uid: "04C9E1A27B3080", kind: "B" },
        { uid: "04D00D00D00D00", kind: "V" },
      ],
    },
    await logIn("admin-1"),
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { new: 1, changed: 1, unchanged: 1 });
  assert.equal(fake.kinds.get("04A1B2C3D4E5F6"), "H");
  assert.equal(fake.kinds.get("04D00D00D00D00"), "V");

  const line = lines.find((l) => l.message === "token_kinds_loaded");
  assert.ok(line);
  assert.equal(line.loaded_by, "admin-1");
  assert.equal(line.new, 1);
  assert.equal(line.changed, 1);
  assert.equal(line.unchanged, 1);
});

test("UIDs go to the claims stand-in only, never to an Event Service", async () => {
  const { config, fake, logIn, totals, load } = harness();
  const cookie = await logIn("admin-1");

  await load({ tokens: [{ uid: "04A1B2C3D4E5F6", kind: "E" }] }, cookie);
  await totals(cookie);

  assert.equal(fake.sent.length, 2);
  for (const request of fake.sent) {
    assert.ok(
      request.url.startsWith(`${config.claimsStandIn.url}/`),
      `${request.url} isn't the claims stand-in`,
    );
  }
});

test("a UID in any separator style is sent on normalised", async () => {
  const { fake, logIn, load } = harness();

  const res = await load(
    { tokens: [{ uid: "04:a1:b2:c3:d4:e5:f6", kind: "E" }] },
    await logIn("admin-1"),
  );

  assert.equal(res.status, 200);
  assert.equal(fake.kinds.get("04A1B2C3D4E5F6"), "E");
});

test("up to 500 tokens load at once, and a larger load is refused", async () => {
  const { fake, logIn, load } = harness();
  const cookie = await logIn("admin-1");
  const tokens = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      uid: `04${i.toString(16).padStart(12, "0").toUpperCase()}`,
      kind: "E",
    }));

  const res = await load({ tokens: tokens(500) }, cookie);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { new: 500, changed: 0, unchanged: 0 });

  fake.sent.length = 0;
  const tooMany = await load({ tokens: tokens(501) }, cookie);
  assert.equal(tooMany.status, 400);
  assert.equal(((await tooMany.json()) as { error: string }).error, "validation_failed");
  assert.deepEqual(fake.sent, []);
});

test("a load with a bad UID or kind, or no tokens, is refused and nothing is sent", async () => {
  const { fake, logIn, load } = harness();
  const cookie = await logIn("admin-1");

  for (const body of [
    { tokens: [{ uid: "not-a-uid", kind: "E" }] },
    { tokens: [{ uid: "04A1B2C3D4E5F6", kind: "e" }] },
    { tokens: [{ uid: "04A1B2C3D4E5F6", kind: "EE" }] },
    { tokens: [] },
    {},
  ]) {
    const res = await load(body, cookie);
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: string }).error, "validation_failed");
  }
  assert.deepEqual(fake.sent, []);
});

test("when the stand-in doesn't answer, both answer claims_unavailable", async () => {
  const { fake, logIn, totals, load } = harness();
  const cookie = await logIn("admin-1");
  const down = async () => new Response("down", { status: 500 });
  fake.answers.kindTotals = down;
  fake.answers.loadKinds = down;
  const lines = captureLogs();

  const seen = await totals(cookie);
  assert.equal(seen.status, 503);
  assert.deepEqual(await seen.json(), { error: "claims_unavailable" });

  const loaded = await load({ tokens: [{ uid: "04A1B2C3D4E5F6", kind: "E" }] }, cookie);
  assert.equal(loaded.status, 503);
  assert.deepEqual(await loaded.json(), { error: "claims_unavailable" });

  assert.equal(lines.filter((l) => l.message === "claims_unavailable").length, 2);
  assert.equal(
    lines.some((l) => l.message === "token_kinds_loaded"),
    false,
  );
});
