import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, test } from "vitest";
import { createTestHarness, unstable_startWorker } from "wrangler";
import {
  browser as sendAsBrowser,
  type BrowserRequest,
  type FetchMode,
} from "./test-support/browser.ts";
import { startFakeService, type FakeService } from "./test-support/fake-service.ts";

// The Worker as `wrangler dev` runs it, from wrangler.jsonc and the screens' build in dist/,
// with EVENT_API_URL pointed at a fake Event Service on this machine.
//
// unstable_startWorker() rather than Wrangler's newer createTestHarness(), which sends a
// Worker's fetch() out through Node's, and that follows redirects whatever the Worker asked
// for. So the harness can't show that the login's redirects reach the browser (checked with
// Wrangler 4.151).

const config = fileURLToPath(new URL("../wrangler.jsonc", import.meta.url));
const indexHtml = fileURLToPath(new URL("../dist/index.html", import.meta.url));

/** The Worker, started with EVENT_API_URL set to `eventApiUrl`. */
function startWorker(eventApiUrl: string) {
  return unstable_startWorker({
    config,
    bindings: { EVENT_API_URL: { type: "plain_text", value: eventApiUrl } },
    dev: { server: { port: 0 }, inspector: false, logLevel: "none" },
  });
}

let service: FakeService;
let worker: Awaited<ReturnType<typeof startWorker>>;
let workerUrl: URL;

beforeAll(async () => {
  if (!existsSync(indexHtml)) throw new Error("No dist/index.html. Build the screens first.");
  service = await startFakeService();
  worker = await startWorker(service.url);
  workerUrl = await worker.url;
});

afterEach(() => service.reset());

afterAll(async () => {
  await worker?.dispose();
  await service?.close();
});

/** Sends a request to the Worker as a browser at event.geekshacking.com would. */
function browser(mode: FetchMode, path: string, init?: BrowserRequest) {
  return sendAsBrowser(workerUrl, mode, path, init);
}

test("a request under /api or /auth reaches the Event Service unchanged", async () => {
  for (const [mode, method, path, body] of [
    ["same-origin", "POST", "/api/v1/admin/taps?dry_run=1&b=2", '{"user_id":"dev-user-1"}'],
    ["same-origin", "GET", "/api/v1/me?x=%20y", undefined],
    ["same-origin", "POST", "/auth/firebase", '{"id_token":"eyJ"}'],
    ["navigate", "GET", "/auth/login?return_to=%2Fpassport", undefined],
    ["navigate", "GET", "/api/v1/admin/export.csv", undefined],
  ] as const) {
    await browser(mode, path, {
      method,
      body,
      headers: { Cookie: "event_session=abc.def", "Content-Type": "application/json" },
    });
    const received = service.received.at(-1);
    assert.deepEqual(
      received && {
        method: received.method,
        path: received.path,
        body: received.body,
        cookie: received.headers.cookie,
        contentType: received.headers["content-type"],
        host: received.headers.host,
      },
      {
        method,
        path,
        body: body ?? "",
        cookie: "event_session=abc.def",
        contentType: "application/json",
        host: new URL(service.url).host,
      },
      `${mode} ${method} ${path}`,
    );
  }
});

test("the Event Service's answer comes back unchanged, a redirect included", async () => {
  service.answerWith({
    status: 302,
    headers: [
      ["Location", "https://accounts.example.com/login?next=%2F"],
      ["Set-Cookie", "event_session=new; Path=/; HttpOnly; SameSite=Lax"],
      ["Set-Cookie", "other=1; Path=/"],
      ["Cache-Control", "no-store"],
    ],
    body: '{"ok":true}',
  });

  const res = await browser("navigate", "/auth/login");

  assert.equal(res.status, 302);
  assert.equal(res.headers.get("Location"), "https://accounts.example.com/login?next=%2F");
  assert.deepEqual(res.headers.getSetCookie(), [
    "event_session=new; Path=/; HttpOnly; SameSite=Lax",
    "other=1; Path=/",
  ]);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(await res.text(), '{"ok":true}');
  // Not followed: the Event Service was asked once, and the redirect went to the browser.
  assert.equal(service.received.length, 1);
});

test("an error from the Event Service comes back unchanged", async () => {
  service.answerWith({
    status: 401,
    headers: [
      ["Content-Type", "application/json"],
      ["Cache-Control", "no-store"],
    ],
    body: '{"error":"unauthenticated"}',
  });

  const res = await browser("same-origin", "/api/v1/me");

  assert.equal(res.status, 401);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await res.json(), { error: "unauthenticated" });
});

test("every other path gets the screens, and never reaches the Event Service", async () => {
  const screens = readFileSync(indexHtml, "utf8");
  for (const path of ["/", "/t/04A1B2C3D4E5F6", "/admin/stations", "/apis", "/authors"]) {
    for (const mode of ["navigate", "same-origin"] as const) {
      const res = await browser(mode, path);
      assert.equal(res.status, 200, `${mode} ${path}`);
      assert.equal(await res.text(), screens, `${mode} ${path}`);
    }
  }
  assert.equal(service.received.length, 0);
});

test("the Worker starts with wrangler.jsonc's own EVENT_API_URL", async () => {
  const harness = createTestHarness({ workers: [{ configPath: config }] });
  try {
    await harness.listen();
    assert.equal((await harness.fetch("/")).status, 200);
  } finally {
    await harness.close();
  }
});

test("the Worker refuses to start with an EVENT_API_URL that isn't https:// or this machine", async () => {
  for (const url of [
    "http://event-api.geekshacking.com",
    "ftp://127.0.0.1",
    "event-api.geekshacking.com",
    "https://event-api.geekshacking.com/api",
  ]) {
    // Wrangler's test harness, because it reports a Worker that won't start as an error from
    // listen(). unstable_startWorker() throws it where no test can catch it.
    const harness = createTestHarness({
      workers: [{ configPath: config, vars: { EVENT_API_URL: url } }],
    });
    try {
      await assert.rejects(harness.listen(), /ConfigError: EVENT_API_URL must/, url);
    } finally {
      await harness.close();
    }
  }
});
