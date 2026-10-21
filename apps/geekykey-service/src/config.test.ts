import assert from "node:assert/strict";
import { env } from "cloudflare:test";
import { test } from "vitest";
import { ConfigError, loadConfig } from "./config.ts";
import devEnv from "../dev.env?raw";

// The settings the Worker reads once as it starts (the migration spec's 5.1),
// and the ones that stop it starting.

const SESSION_SECRET = "a-session-secret-of-some-length";
const CLAIMS_STAND_IN_KEY = "1".repeat(64);
const EVENT_SERVICE_KEY_SHOWCASE = "2".repeat(64);

/** Every setting, as wrangler.jsonc and the secrets give them, with `changes` on top. */
function settings(changes: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    EVENT_SERVICES: [
      { id: "showcase", name: "Capstone Showcase", url: "https://event-api.geekshacking.com" },
    ],
    CLAIMS_STAND_IN_URL: "https://event-api.geekshacking.com/claims-stand-in/v1",
    GEEKYKEY_ADMINS: [],
    MAX_TAPS_PER_REQUEST: 500,
    TAP_DEADLINE_MS: 4000,
    FIREBASE_PROJECT_ID: "geekykey-b035a",
    SESSION_SECRET,
    CLAIMS_STAND_IN_KEY,
    EVENT_SERVICE_KEY_SHOWCASE,
    ...changes,
  };
}

/** The `NAME=value` lines of an env file, leaving out blank lines and comments. */
function parseEnv(text: string): Record<string, string> {
  const lines = text.split("\n").filter((line) => line.trim() !== "" && !line.startsWith("#"));
  return Object.fromEntries(
    lines.map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
}

/** Asserts the settings stop the Worker starting, with an error naming `name` and none of `settings`' values. */
function assertRefused(changes: Record<string, unknown>, name: string) {
  const given = settings(changes);
  assert.throws(
    () => loadConfig(given),
    (err) => {
      assert.ok(err instanceof ConfigError, String(err));
      assert.ok(err.message.startsWith(name), err.message);
      for (const value of Object.values(given)) {
        if (typeof value === "string" && value.length > 3) {
          assert.ok(!err.message.includes(value), `${err.message} holds a value`);
        }
      }
      return true;
    },
  );
}

test("wrangler.jsonc's settings, with the secrets, start the Worker", () => {
  const config = loadConfig({
    ...env,
    SESSION_SECRET,
    CLAIMS_STAND_IN_KEY,
    EVENT_SERVICE_KEY_SHOWCASE,
  });
  assert.deepEqual(config, {
    eventServices: [
      {
        id: "showcase",
        name: "Capstone Showcase",
        url: "https://event-api.geekshacking.com",
        publicUrl: "https://event.geekshacking.com",
        key: EVENT_SERVICE_KEY_SHOWCASE,
      },
    ],
    claimsStandIn: {
      url: "https://event-api.geekshacking.com/claims-stand-in/v1",
      key: CLAIMS_STAND_IN_KEY,
    },
    geekykeyAdmins: [],
    maxTapsPerRequest: 500,
    tapDeadlineMs: 4000,
    devAuthEnabled: false,
    sessionSecret: SESSION_SECRET,
    sessionCookieSecure: true,
    firebaseProjectId: "geekykey-b035a",
  });
});

test("settings from dev.env, which are all strings, are read the same", () => {
  const config = loadConfig(
    settings({
      EVENT_SERVICES:
        '[{"id":"showcase","name":"Capstone Showcase","url":"http://localhost:8001"}]',
      CLAIMS_STAND_IN_URL: "http://localhost:8001/claims-stand-in/v1",
      GEEKYKEY_ADMINS: '["dev-organizer-1"]',
      MAX_TAPS_PER_REQUEST: "500",
      TAP_DEADLINE_MS: "4000",
      DEV_AUTH_ENABLED: "true",
    }),
  );
  assert.equal(config.eventServices[0]!.url, "http://localhost:8001");
  assert.equal(config.claimsStandIn.url, "http://localhost:8001/claims-stand-in/v1");
  assert.deepEqual(config.geekykeyAdmins, ["dev-organizer-1"]);
  assert.equal(config.maxTapsPerRequest, 500);
  assert.equal(config.tapDeadlineMs, 4000);
  assert.equal(config.devAuthEnabled, true);
});

test("without DEV_AUTH_ENABLED, as in production, dev-login is off and the cookie is Secure", () => {
  const config = loadConfig(settings());
  assert.equal(config.devAuthEnabled, false);
  assert.equal(config.sessionCookieSecure, true);
  assert.equal(loadConfig(settings({ DEV_AUTH_ENABLED: "false" })).devAuthEnabled, false);
});

test("dev.env, with the DEV_AUTH_ENABLED `pnpm dev` adds, starts the Worker with dev-login on", () => {
  // `wrangler dev` takes from dev.env only names wrangler.jsonc lists, so
  // `pnpm dev` passes DEV_AUTH_ENABLED with --var instead.
  assert.ok(!("DEV_AUTH_ENABLED" in parseEnv(devEnv)), "dev.env sets DEV_AUTH_ENABLED");
  const config = loadConfig({ ...env, ...parseEnv(devEnv), DEV_AUTH_ENABLED: "true" });
  assert.equal(config.devAuthEnabled, true);
  // On http://localhost, where a Secure cookie never comes back.
  assert.equal(config.sessionCookieSecure, false);
  assert.equal(config.eventServices[0]!.url, "http://localhost:8001");
  assert.equal(config.claimsStandIn.url, "http://localhost:8001/claims-stand-in/v1");
  assert.deepEqual(config.geekykeyAdmins, ["dev-organizer-1"]);
  // The Event screens, on 5173.
  assert.equal(config.eventServices[0]!.publicUrl, "http://localhost:5173");
});

test("an Event Service without a public address has none, and the screens get no button for it", () => {
  const config = loadConfig(settings());
  assert.equal(config.eventServices[0]!.publicUrl, null);
});

test("a public address is checked like the others, and loses its / at the end", () => {
  const showcase = { id: "showcase", name: "Capstone Showcase", url: "https://event.test" };
  const config = loadConfig(
    settings({ EVENT_SERVICES: [{ ...showcase, public_url: "https://event.example.com/" }] }),
  );
  assert.equal(config.eventServices[0]!.publicUrl, "https://event.example.com");
  for (const public_url of ["http://event.example.com", "event.example.com", ""]) {
    assertRefused({ EVENT_SERVICES: [{ ...showcase, public_url }] }, "EVENT_SERVICES");
  }
});

test("without a secret it needs, the Worker doesn't start, and says which", () => {
  for (const name of ["SESSION_SECRET", "CLAIMS_STAND_IN_KEY", "EVENT_SERVICE_KEY_SHOWCASE"]) {
    assertRefused({ [name]: undefined }, name);
    assertRefused({ [name]: "" }, name);
  }
});

test("each Event Service needs a key of its own, named after its ID", () => {
  const other = { id: "bingo_night", name: "Bingo Night", url: "https://bingo.example.com" };
  const services = [...(settings().EVENT_SERVICES as object[]), other];
  assertRefused({ EVENT_SERVICES: services }, "EVENT_SERVICE_KEY_BINGO_NIGHT");
  const config = loadConfig(
    settings({ EVENT_SERVICES: services, EVENT_SERVICE_KEY_BINGO_NIGHT: "3".repeat(64) }),
  );
  assert.deepEqual(
    config.eventServices.map(({ id, key }) => [id, key]),
    [
      ["showcase", EVENT_SERVICE_KEY_SHOWCASE],
      ["bingo_night", "3".repeat(64)],
    ],
  );
});

test("a key that isn't 64 lower-case hex characters stops the Worker, without saying what it was", () => {
  for (const key of ["2".repeat(63), "A".repeat(64), "gk_sta_" + "2".repeat(57)]) {
    assertRefused({ CLAIMS_STAND_IN_KEY: key }, "CLAIMS_STAND_IN_KEY");
    assertRefused({ EVENT_SERVICE_KEY_SHOWCASE: key }, "EVENT_SERVICE_KEY_SHOWCASE");
  }
});

test("a session secret shorter than 16 characters stops the Worker", () => {
  assertRefused({ SESSION_SECRET: "too-short" }, "SESSION_SECRET");
});

test("an Event Service address that's neither https:// nor this machine stops the Worker", () => {
  for (const url of [
    "http://event-api.geekshacking.com",
    "http://A-Mac.local:8001",
    "http://192.168.1.20:8001",
    "ftp://event-api.geekshacking.com",
    "event-api.geekshacking.com",
  ]) {
    assertRefused(
      { EVENT_SERVICES: [{ id: "showcase", name: "Capstone Showcase", url }] },
      "EVENT_SERVICES",
    );
    assertRefused({ CLAIMS_STAND_IN_URL: url }, "CLAIMS_STAND_IN_URL");
  }
});

test("http:// to this machine is allowed, for local development", () => {
  for (const url of ["http://localhost:8001", "http://127.0.0.1:8001", "http://[::1]:8001"]) {
    const config = loadConfig(
      settings({
        EVENT_SERVICES: [{ id: "showcase", name: "Capstone Showcase", url }],
        CLAIMS_STAND_IN_URL: `${url}/claims-stand-in/v1`,
      }),
    );
    assert.equal(config.eventServices[0]!.url, url);
  }
});

test("an address's / at the end is dropped, so paths can follow it", () => {
  const config = loadConfig(
    settings({
      EVENT_SERVICES: [{ id: "showcase", name: "Capstone Showcase", url: "https://event.test/" }],
      CLAIMS_STAND_IN_URL: "https://event.test/claims-stand-in/v1/",
    }),
  );
  assert.equal(config.eventServices[0]!.url, "https://event.test");
  assert.equal(config.claimsStandIn.url, "https://event.test/claims-stand-in/v1");
});

test("a missing or malformed setting stops the Worker, and says which", () => {
  const showcase = { id: "showcase", name: "Capstone Showcase", url: "https://event.test" };
  for (const [name, value] of [
    ["EVENT_SERVICES", undefined],
    ["EVENT_SERVICES", "[{"],
    ["EVENT_SERVICES", []],
    ["EVENT_SERVICES", [{ ...showcase, id: "Show Case" }]],
    ["EVENT_SERVICES", [{ ...showcase, name: "" }]],
    ["EVENT_SERVICES", [showcase, showcase]],
    ["CLAIMS_STAND_IN_URL", undefined],
    ["GEEKYKEY_ADMINS", undefined],
    ["GEEKYKEY_ADMINS", "dev-organizer-1"],
    ["GEEKYKEY_ADMINS", [""]],
    ["MAX_TAPS_PER_REQUEST", undefined],
    ["MAX_TAPS_PER_REQUEST", "lots"],
    ["MAX_TAPS_PER_REQUEST", 0],
    ["TAP_DEADLINE_MS", undefined],
    ["TAP_DEADLINE_MS", 1.5],
    ["TAP_DEADLINE_MS", -1],
    ["DEV_AUTH_ENABLED", "yes"],
    ["DEV_AUTH_ENABLED", 1],
    ["FIREBASE_PROJECT_ID", undefined],
    ["FIREBASE_PROJECT_ID", ""],
    // Not a Firebase project ID: upper case, too short, or ending in a hyphen.
    ["FIREBASE_PROJECT_ID", "GeekyKey-b035a"],
    ["FIREBASE_PROJECT_ID", "gk"],
    ["FIREBASE_PROJECT_ID", "geekykey-"],
  ] as const) {
    assertRefused({ [name]: value }, name);
  }
});
