import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, test } from "vitest";
import { createTestHarness } from "wrangler";
import {
  browser as sendAsBrowser,
  type BrowserRequest,
  type FetchMode,
} from "./test-support/browser.ts";

// The Worker as Wrangler runs it, from wrangler.jsonc and the screens' build in dist/, with
// its service binding to geekykey-service pointed at a fake (test-support/).

const indexHtml = fileURLToPath(new URL("../dist/index.html", import.meta.url));

const harness = createTestHarness({
  workers: [
    {
      configPath: fileURLToPath(new URL("../wrangler.jsonc", import.meta.url)),
      bindingOverrides: { GEEKYKEY_SERVICE: "fake-geekykey-service" },
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

let workerUrl: URL;

beforeAll(async () => {
  if (!existsSync(indexHtml)) throw new Error("No dist/index.html. Build the screens first.");
  ({ url: workerUrl } = await harness.listen());
});

afterAll(() => harness.close());

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

test("every other path gets the screens", async () => {
  const screens = readFileSync(indexHtml, "utf8");
  for (const path of ["/", "/t/04A1B2C3D4E5F6", "/me", "/apis", "/authors"]) {
    for (const mode of ["navigate", "same-origin"] as const) {
      const res = await browser(mode, path);
      assert.equal(res.status, 200, `${mode} ${path}`);
      assert.equal(await res.text(), screens, `${mode} ${path}`);
    }
  }
});
