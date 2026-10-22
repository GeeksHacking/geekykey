import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, test, vi } from "vitest";
import { createTestHarness } from "wrangler";
import { toFirebase } from "./firebase.ts";
import { forward } from "./forward.ts";
import {
  browser as sendAsBrowser,
  type BrowserRequest,
  type FetchMode,
} from "./test-support/browser.ts";
import { startFakeFirebase, type FakeFirebase } from "./test-support/fake-firebase.ts";

// The Worker as Wrangler runs it, from wrangler.jsonc and the screens' build in dist/, with
// its service binding to geekykey-service pointed at a fake (test-support/), and
// FIREBASE_AUTH_URL at a fake Firebase on this machine.

const config = fileURLToPath(new URL("../wrangler.jsonc", import.meta.url));
const indexHtml = fileURLToPath(new URL("../dist/index.html", import.meta.url));

/**
 * The Worker and the fake geekykey-service behind its binding, with `vars` in place of
 * wrangler.jsonc's own.
 */
function startHarness(vars?: Record<string, string>) {
  return createTestHarness({
    workers: [
      {
        configPath: config,
        bindingOverrides: { GEEKYKEY_SERVICE: "fake-geekykey-service" },
        vars,
      },
      {
        config: {
          name: "fake-geekykey-service",
          main: fileURLToPath(new URL("test-support/fake-geekykey-service.ts", import.meta.url)),
          compatibility_date: "2026-10-12",
        },
      },
    ],
  });
}

let firebase: FakeFirebase;
let harness: ReturnType<typeof startHarness>;
let workerUrl: URL;

beforeAll(async () => {
  if (!existsSync(indexHtml)) throw new Error("No dist/index.html. Build the screens first.");
  firebase = await startFakeFirebase();
  harness = startHarness({ FIREBASE_AUTH_URL: firebase.url });
  ({ url: workerUrl } = await harness.listen());
});

afterEach(() => {
  vi.restoreAllMocks();
  firebase.reset();
});

afterAll(async () => {
  await harness?.close();
  await firebase?.close();
});

/** Sends a request to the Worker as a browser at key.geekshacking.com would. */
function browser(mode: FetchMode, path: string, init?: BrowserRequest) {
  return sendAsBrowser(workerUrl, mode, path, init);
}

test("a request under /api or /auth reaches geekykey-service unchanged", async () => {
  for (const [mode, method, path, body] of [
    ["same-origin", "POST", "/api/v1/tokens/04A1B2C3D4E5F6/claim?x=1&y=2", '{"a":1}'],
    ["same-origin", "GET", "/api/v1/tokens/04A1B2C3D4E5F6?x=%20y", undefined],
    ["same-origin", "POST", "/auth/firebase", '{"id_token":"eyJ"}'],
    ["navigate", "POST", "/auth/logout?return_to=%2Ft%2F04A1B2C3D4E5F6", undefined],
  ] as const) {
    const res = await browser(mode, path, {
      method,
      body,
      headers: { Cookie: "gk_session=abc.def", "Content-Type": "application/json" },
    });
    assert.deepEqual(
      await res.json(),
      {
        method,
        path,
        body: body ?? "",
        cookie: "gk_session=abc.def",
        contentType: "application/json",
      },
      `${mode} ${method} ${path}`,
    );
  }
});

test("geekykey-service's answer comes back unchanged, a redirect included", async () => {
  const res = await browser("navigate", "/auth/login");

  assert.equal(res.status, 302);
  assert.equal(res.headers.get("Location"), "https://accounts.example.com/login?next=%2F");
  assert.deepEqual(res.headers.getSetCookie(), [
    "gk_session=new; Path=/; HttpOnly; SameSite=Lax",
    "other=1; Path=/",
  ]);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(await res.text(), '{"ok":true}');
});

test("an error from geekykey-service comes back unchanged", async () => {
  const res = await browser("same-origin", "/api/v1/me");

  assert.equal(res.status, 401);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await res.json(), { error: "unauthenticated" });
});

test("a geekykey-service that doesn't answer gets 503 service_unavailable", async () => {
  // forward() on its own, with a binding that fails as it does on Cloudflare when
  // geekykey-service throws. Locally, wrangler dev turns that failure into its own error page
  // before the binding returns, so the Worker above can't show it (checked with Wrangler 4.151).
  vi.spyOn(console, "error").mockImplementation(() => {});
  const down = { fetch: () => Promise.reject(new Error("geekykey-service is down")) };

  const res = await forward(down, new Request("https://key.geekshacking.com/api/v1/me"));

  assert.equal(res.status, 503);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(res.headers.get("Content-Type"), "application/json");
  assert.deepEqual(await res.json(), { error: "service_unavailable" });
});

test("Firebase's sign-in pages reach Firebase without the cookie, and come back unchanged", async () => {
  firebase.answerWith({
    status: 200,
    headers: [
      ["Content-Type", "text/html; charset=utf-8"],
      ["Cache-Control", "max-age=1800"],
    ],
    body: "<!DOCTYPE html><script src=handler.js></script>",
  });

  // What the popup loads (agreement 7.2): the handler and its scripts, the iframe, and the
  // init.json the handler asks for. A provider may answer the handler with a form's POST.
  for (const [mode, method, path, body] of [
    ["navigate", "GET", "/__/auth/handler?apiKey=k&authType=signInViaPopup&v=12", undefined],
    ["same-origin", "GET", "/__/auth/handler.js", undefined],
    ["navigate", "GET", "/__/auth/iframe?apiKey=k", undefined],
    ["navigate", "POST", "/__/auth/handler", "state=abc&code=def"],
    ["same-origin", "GET", "/__/firebase/init.json", undefined],
  ] as const) {
    const res = await browser(mode, path, {
      method,
      body,
      headers: { Cookie: "gk_session=abc.def" },
    });

    assert.equal(res.status, 200, `${mode} ${method} ${path}`);
    assert.equal(res.headers.get("Cache-Control"), "max-age=1800", `${mode} ${method} ${path}`);
    assert.equal(await res.text(), "<!DOCTYPE html><script src=handler.js></script>");
    const received = firebase.received.at(-1);
    assert.deepEqual(
      received && {
        method: received.method,
        path: received.path,
        body: received.body,
        cookie: received.headers.cookie,
        host: received.headers.host,
      },
      // The session cookie is ours, so Firebase never gets it.
      { method, path, body: body ?? "", cookie: undefined, host: new URL(firebase.url).host },
      `${mode} ${method} ${path}`,
    );
  }
});

test("a redirect from Firebase goes back to the browser, not followed", async () => {
  // toFirebase() on its own, because Wrangler's test harness sends the Worker's fetch() out
  // through Node's, which follows redirects whatever the Worker asked for (checked with
  // Wrangler 4.151).
  firebase.answerWith({
    status: 302,
    headers: [["Location", "https://accounts.google.com/o/oauth2/auth?client_id=x"]],
    body: "",
  });

  const res = await toFirebase(
    firebase.url,
    new Request("https://key.geekshacking.com/__/auth/handler?apiKey=k"),
  );

  assert.equal(res.status, 302);
  assert.equal(
    res.headers.get("Location"),
    "https://accounts.google.com/o/oauth2/auth?client_id=x",
  );
  assert.equal(firebase.received.length, 1);
});

test("every other path gets the screens", async () => {
  const screens = readFileSync(indexHtml, "utf8");
  for (const path of [
    "/",
    "/t/04A1B2C3D4E5F6",
    "/me",
    "/apis",
    "/authors",
    "/__/firebase/init.js",
  ]) {
    for (const mode of ["navigate", "same-origin"] as const) {
      const res = await browser(mode, path);
      assert.equal(res.status, 200, `${mode} ${path}`);
      assert.equal(await res.text(), screens, `${mode} ${path}`);
    }
  }
  assert.equal(firebase.received.length, 0);
});

test("the Worker starts with wrangler.jsonc's own FIREBASE_AUTH_URL", async () => {
  const own = startHarness();
  try {
    await own.listen();
    assert.equal((await own.fetch("/")).status, 200);
  } finally {
    await own.close();
  }
});

test("the Worker refuses to start with a FIREBASE_AUTH_URL that isn't https:// or this machine", async () => {
  for (const url of [
    "http://geekykey-b035a.firebaseapp.com",
    "geekykey-b035a.firebaseapp.com",
    "https://geekykey-b035a.firebaseapp.com/__/auth",
  ]) {
    const refused = startHarness({ FIREBASE_AUTH_URL: url });
    try {
      await assert.rejects(refused.listen(), /ConfigError: FIREBASE_AUTH_URL must/, url);
    } finally {
      await refused.close();
    }
  }
});
