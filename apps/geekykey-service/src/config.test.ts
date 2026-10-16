import assert from "node:assert/strict";
import { env } from "cloudflare:test";
import { test } from "vitest";
import { ConfigError, loadConfig } from "./config.ts";

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
    SESSION_SECRET,
    CLAIMS_STAND_IN_KEY,
    EVENT_SERVICE_KEY_SHOWCASE,
    ...changes,
  };
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
    sessionSecret: SESSION_SECRET,
  });
});

test("settings from .dev.vars, which are all strings, are read the same", () => {
  const config = loadConfig(
    settings({
      EVENT_SERVICES:
        '[{"id":"showcase","name":"Capstone Showcase","url":"http://localhost:8001"}]',
      CLAIMS_STAND_IN_URL: "http://localhost:8001/claims-stand-in/v1",
      GEEKYKEY_ADMINS: '["dev-organizer-1"]',
      MAX_TAPS_PER_REQUEST: "500",
      TAP_DEADLINE_MS: "4000",
    }),
  );
  assert.equal(config.eventServices[0]!.url, "http://localhost:8001");
  assert.equal(config.claimsStandIn.url, "http://localhost:8001/claims-stand-in/v1");
  assert.deepEqual(config.geekykeyAdmins, ["dev-organizer-1"]);
  assert.equal(config.maxTapsPerRequest, 500);
  assert.equal(config.tapDeadlineMs, 4000);
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
  ] as const) {
    assertRefused({ [name]: value }, name);
  }
});
