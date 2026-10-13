import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { describe, test } from "vitest";
import { loadConfig, unpackAppSecrets } from "../src/config.ts";

// The files in infra/ that .github/workflows/deploy.yml deploys with. A
// mistake in one only shows when a deploy fails, or worse, when it doesn't,
// so these check them on every pull request instead.

const infraDir = join(import.meta.dirname, "../../../infra");

function readInfra(path: string): Record<string, string> {
  return parseEnv(readFileSync(join(infraDir, path), "utf8")) as Record<string, string>;
}

/** `secret:version`, as its two parts. */
function parsePin(pin: string) {
  const [secret, version] = pin.split(":");
  return { secret: secret!, version: version! };
}

/** `SECRETS`, `NAME=secret:version,...`, as a map from each name to its secret and version. */
function pinnedSecrets(deployEnv: Record<string, string>) {
  return new Map(
    deployEnv.SECRETS!.split(",").map((pin) => {
      const [name, source] = pin.split("=");
      return [name!, parsePin(source!)];
    }),
  );
}

const TARGETS = {
  production: { service: "event-service" },
  staging: { service: "event-service-staging" },
};

for (const [target, { service }] of Object.entries(TARGETS)) {
  describe(`infra/${target}`, () => {
    const settings = readInfra(`${target}/settings.env`);
    const deployEnv = readInfra(`${target}/deploy.env`);
    const secrets = pinnedSecrets(deployEnv);

    test("its settings and secrets are enough for the server to start, with dev sign-in off", () => {
      const env: Record<string, string> = { ...settings };
      // A stand-in for the secrets Cloud Run would fill in.
      env.APP_SECRETS = JSON.stringify({
        SESSION_SECRET: "a-stand-in-for-the-secret",
        DATABASE_URL: "mysql://a-stand-in-for-the-secret@stand-in/db",
      });

      const config = loadConfig(unpackAppSecrets(env));
      assert.equal(config.devAuthEnabled, false);
      assert.equal(config.sessionCookieSecure, true);
    });

    test("the server's secrets come as one, APP_SECRETS, so each costs one stored version", () => {
      assert.deepEqual([...secrets.keys()], ["APP_SECRETS"]);
    });

    test("it deploys its own service, as its own deploy account", () => {
      assert.equal(deployEnv.SERVICE, service);
      assert.match(deployEnv.DEPLOYER!, new RegExp(`^${service}-deployer@`));
    });

    test("every secret is its own service's, pinned to a version number", () => {
      const pins = [...secrets.values(), parsePin(deployEnv.MIGRATION_SECRET!)];
      for (const { secret, version } of pins) {
        // Production's secret names are a prefix of staging's, so check the
        // whole name is this service's plus one of its two secrets.
        assert.match(secret, new RegExp(`^${service}-(app-secrets|migration-database-url)$`));
        assert.match(version, /^[1-9]\d*$/, `${secret} must be pinned to a number, not ${version}`);
      }
    });

    test("the migration login is never given to the server", () => {
      assert.equal(
        parsePin(deployEnv.MIGRATION_SECRET!).secret,
        `${service}-migration-database-url`,
      );
      for (const { secret } of secrets.values()) assert.doesNotMatch(secret, /migration/);
    });

    test("a setting is never also a secret, and PORT is left to Cloud Run", () => {
      for (const name of Object.keys(settings)) {
        assert.ok(!secrets.has(name), `${name} is both a setting and a secret`);
      }
      assert.ok(
        !("PORT" in settings),
        "Cloud Run sets PORT itself, and refuses a deploy that sets it",
      );
    });
  });
}
