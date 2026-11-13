import assert from "node:assert/strict";
import { test } from "vitest";
import { ConfigError, loadConfig } from "./config.ts";

const SETTINGS = {
  DATABASE_URL: "mysql://dev:dev@localhost:4000/geekykey_test",
  DEV_AUTH_ENABLED: "true",
  FIREBASE_PROJECT_ID: "geekykey-test",
};

test("the GeekyKey Service address loses every trailing slash", () => {
  const config = loadConfig({
    ...SETTINGS,
    GEEKYKEY_SERVICE_URL: "https://key-api.geekshacking.com///",
  });
  assert.equal(config.geekykeyServiceUrl, "https://key-api.geekshacking.com");
});

for (const value of [undefined, ""]) {
  test(`station messages are off when GEEKYKEY_SERVICE_URL is ${value === undefined ? "unset" : "empty"}`, () => {
    const config = loadConfig({ ...SETTINGS, GEEKYKEY_SERVICE_URL: value });
    assert.equal(config.geekykeyServiceUrl, undefined);
  });
}

for (const value of ["http://localhost:8000/", "http://127.0.0.1:8000/", "http://[::1]:8000/"]) {
  test(`station messages allow ${value} on this machine`, () => {
    const config = loadConfig({ ...SETTINGS, GEEKYKEY_SERVICE_URL: value });
    assert.equal(config.geekykeyServiceUrl, value.slice(0, -1));
  });
}

for (const value of [
  "not a URL",
  "http://key-api.geekshacking.com",
  "http://localhost.example.com",
  "http://192.168.1.5:8000",
  "ftp://localhost:8000",
  "file:///tmp/geekykey",
]) {
  test(`station messages refuse ${value}`, () => {
    assert.throws(() => loadConfig({ ...SETTINGS, GEEKYKEY_SERVICE_URL: value }), {
      name: new ConfigError().name,
      message: /GEEKYKEY_SERVICE_URL must/,
    });
  });
}
