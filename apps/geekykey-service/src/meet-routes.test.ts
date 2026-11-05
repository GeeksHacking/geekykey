import assert from "node:assert/strict";
import { env } from "cloudflare:test";
import { fakeGoogle } from "@geekykey/firebase-login/testing";
import { onTestFinished, test, vi } from "vitest";
import { fakeLimiter } from "../test-support/fake-limiter.ts";
import { fakeServices } from "../test-support/fake-services.ts";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

// POST /api/v1/tokens/{uid}/meet on the GeekyKey Service (the API agreement's
// 8.8): the user tapped their phone on someone else's token, one half of a
// connection. The Worker finds the owner and hands the half to each Event
// Service that takes meetings (11.10).

const google = await fakeGoogle(env.FIREBASE_PROJECT_ID);

const UID = "04A1B2C3D4E5F6";
const OWN_UID = "04FFFFFFFFFFFF";

/** The Worker with wrangler.jsonc's settings, `eventServices` in place of EVENT_SERVICES if given. */
function harness({
  claimsDeadlineMs = 4000,
  eventServices,
}: { claimsDeadlineMs?: number; eventServices?: object[] } = {}) {
  const config = loadConfig({
    ...env,
    ...(eventServices && { EVENT_SERVICES: eventServices }),
    EVENT_SERVICE_KEY_BINGO: "b".repeat(64),
    EVENT_SERVICE_KEY_TEA: "c".repeat(64),
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
  // The tapper's own token, of kind E, and the owner's, of kind B.
  fake.owners.set(OWN_UID, "tapper");
  fake.kinds.set(OWN_UID, "E");
  fake.tokens.set("tapper", [{ uid: OWN_UID, claimed_at: "2026-11-12T07:00:00.000Z" }]);
  fake.owners.set(UID, "owner");
  fake.kinds.set(UID, "B");

  /** The gk_session cookie a Firebase login as `userId` sets. */
  async function logIn(userId: string): Promise<string> {
    const res = await app.request("/auth/firebase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: await google.signIdToken({ sub: userId }) }),
    });
    assert.equal(res.status, 204);
    return (res.headers.get("Set-Cookie") ?? "").split(";")[0]!;
  }

  /** POST /api/v1/tokens/{uid}/meet, with no body, as the token page sends it. */
  const meet = (uid: string, cookie?: string) =>
    app.request(`/api/v1/tokens/${uid}/meet`, {
      method: "POST",
      headers: cookie === undefined ? {} : { Cookie: cookie },
    });

  /** The meeting hand-offs the Worker sent, to which Event Service, with what. */
  const handedOff = () =>
    fake.sent
      .filter(({ url }) => url.endsWith("/geekykey/v1/meetings"))
      .map(({ url, authorization, body }) => ({ url, authorization, body }));

  return { fake, logIn, meet, handedOff };
}

/** Every error line the Worker writes during the test, parsed, with nothing printed. */
function loggedErrors() {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => errors.mockRestore());
  return () =>
    errors.mock.calls.map(([line]) => JSON.parse(line as string) as Record<string, unknown>);
}

const showcase = (extra: object = {}) => ({
  id: "showcase",
  name: "Grad Tea",
  url: "https://event-api.geekshacking.com",
  public_url: "https://event.geekshacking.com",
  meetings: true,
  ...extra,
});
const bingo = (extra: object = {}) => ({
  id: "bingo",
  name: "Bingo Night",
  url: "https://bingo.example.com",
  meetings: true,
  ...extra,
});

test("tapping someone else's token hands the half on, with both kinds, and answers its status", async () => {
  const { fake, logIn, meet, handedOff } = harness();
  fake.meetingStatusOf = () => "connected";
  // Separators and lower case, as someone might type it.
  const res = await meet("04:a1:b2:c3:d4:e5:f6", await logIn("tapper"));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await res.json(), { meetings: [{ event_id: "showcase", status: "connected" }] });
  assert.deepEqual(handedOff(), [
    {
      url: "https://event-api.geekshacking.com/geekykey/v1/meetings",
      authorization: `Bearer ${env.EVENT_SERVICE_KEY_SHOWCASE}`,
      body: { user_id: "tapper", user_kind: "E", owner_id: "owner", owner_kind: "B" },
    },
  ]);
});

test("the tapper's kind is their first-claimed token's, or null with no token or no kind", async () => {
  const { fake, logIn, meet, handedOff } = harness();
  fake.tokens.set("tapper", [
    { uid: "04EEEEEEEEEEEE", claimed_at: "2026-11-12T06:00:00.000Z" },
    { uid: OWN_UID, claimed_at: "2026-11-12T07:00:00.000Z" },
  ]);
  fake.owners.set("04EEEEEEEEEEEE", "tapper");
  fake.kinds.set("04EEEEEEEEEEEE", "C");
  await meet(UID, await logIn("tapper"));
  fake.kinds.delete("04EEEEEEEEEEEE");
  await meet(UID, await logIn("tapper"));
  await meet(UID, await logIn("no-tokens"));
  assert.deepEqual(
    handedOff().map(({ body }) => (body as { user_kind: string | null }).user_kind),
    ["C", null, null],
  );
});

test("the user's own token, or nobody's, is not_found, and no half is handed on", async () => {
  const { logIn, meet, handedOff } = harness();
  const cookie = await logIn("tapper");
  for (const uid of [OWN_UID, "04000000000000"]) {
    const res = await meet(uid, cookie);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "not_found" });
  }
  assert.deepEqual(handedOff(), []);
});

test("without a session it's unauthenticated, and a UID that isn't one fails validation", async () => {
  const { fake, logIn, meet } = harness();
  assert.equal((await meet(UID)).status, 401);
  assert.deepEqual(fake.sent, []);
  const res = await meet("not-a-uid", await logIn("tapper"));
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { error: string }).error, "validation_failed");
});

test("only the Event Services that take meetings get the half, all of them, in their order", async () => {
  const { fake, logIn, meet, handedOff } = harness({
    eventServices: [
      showcase({ meetings: false }),
      bingo(),
      showcase({ id: "tea", url: "https://tea.example.com" }),
    ],
  });
  fake.meetingStatusOf = (_meeting, id) => (id === "bingo" ? "same_kind" : "waiting");
  const res = await meet(UID, await logIn("tapper"));
  assert.deepEqual(await res.json(), {
    meetings: [
      { event_id: "bingo", status: "same_kind" },
      { event_id: "tea", status: "waiting" },
    ],
  });
  assert.deepEqual(
    handedOff().map(({ url }) => url),
    [
      "https://bingo.example.com/geekykey/v1/meetings",
      "https://tea.example.com/geekykey/v1/meetings",
    ],
  );
});

test("an Event Service connecting across groups can answer no_group, which is passed on", async () => {
  const { fake, logIn, meet } = harness({ eventServices: [showcase()] });
  fake.meetingStatusOf = () => "no_group";
  const res = await meet(UID, await logIn("tapper"));
  assert.deepEqual(await res.json(), { meetings: [{ event_id: "showcase", status: "no_group" }] });
});

test("with no Event Service taking meetings, the list is empty, and the owner is still checked", async () => {
  const { logIn, meet, handedOff } = harness({ eventServices: [showcase({ meetings: false })] });
  const cookie = await logIn("tapper");
  assert.deepEqual(await (await meet(UID, cookie)).json(), { meetings: [] });
  assert.equal((await meet(OWN_UID, cookie)).status, 404);
  assert.deepEqual(handedOff(), []);
});

test("an Event Service from before meetings answers 404, and is left out", async () => {
  const { fake, logIn, meet } = harness({ eventServices: [showcase(), bingo()] });
  fake.answers.meetings = async ({ url }) =>
    url.startsWith("https://bingo")
      ? Response.json({ error: "not_found" }, { status: 404 })
      : Response.json({ status: "waiting" });
  const res = await meet(UID, await logIn("tapper"));
  assert.deepEqual(await res.json(), { meetings: [{ event_id: "showcase", status: "waiting" }] });
});

test("an Event Service that fails or answers wrongly is unavailable, logged, and not asked again", async () => {
  const logged = loggedErrors();
  for (const [what, answer, reason] of [
    ["a 500", () => Response.json({ error: "internal_error" }, { status: 500 }), "status"],
    ["a status it doesn't know", () => Response.json({ status: "accepted" }), "unparseable"],
    [
      "a redirect",
      () => new Response(null, { status: 302, headers: { Location: "https://x" } }),
      "status",
    ],
  ] as const) {
    const { fake, logIn, meet, handedOff } = harness();
    const before = logged().length;
    fake.answers.meetings = async () => answer();
    const res = await meet(UID, await logIn("tapper"));
    assert.equal(res.status, 200, what);
    assert.deepEqual(
      await res.json(),
      { meetings: [{ event_id: "showcase", status: "unavailable" }] },
      what,
    );
    assert.equal(handedOff().length, 1, what);
    assert.deepEqual(
      logged()
        .slice(before)
        .map(({ message, event_service, user_id, reason: why }) => [
          message,
          event_service,
          user_id,
          why,
        ]),
      [["meeting_handoff_failed", "showcase", "tapper", reason]],
      what,
    );
  }
});

test("the claims and the hand-off share the 4 seconds, and a late Event Service is unavailable", async () => {
  const { fake, logIn, meet } = harness({ claimsDeadlineMs: 300 });
  const cookie = await logIn("tapper");
  loggedErrors();
  fake.answers.meetings = async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return Response.json({ status: "waiting" });
  };
  const startedAt = Date.now();
  const res = await meet(UID, cookie);
  const took = Date.now() - startedAt;
  assert.deepEqual(await res.json(), {
    meetings: [{ event_id: "showcase", status: "unavailable" }],
  });
  assert.ok(took < 700, `took ${took} ms, not cut short at the deadline`);
});

test("a claims stand-in that doesn't answer gets claims_unavailable, and no half is handed on", async () => {
  const { fake, logIn, meet, handedOff } = harness();
  const cookie = await logIn("tapper");
  loggedErrors();
  fake.answers.owners = async () => Response.json({ error: "internal_error" }, { status: 500 });
  const res = await meet(UID, cookie);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "claims_unavailable" });
  assert.deepEqual(handedOff(), []);
});
