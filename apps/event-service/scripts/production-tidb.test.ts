import assert from "node:assert/strict";
import { test } from "vitest";
import { productionConnection } from "./production-tidb.ts";

test("a production connection checks the server's certificate and name, whatever its URL says", () => {
  const options = productionConnection(
    "mysql://3pTAoNNegb47Uc8.geekykey_migrate:a%2Fb%40c@gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com:4000/geekykey?ssl=false",
  );

  assert.deepEqual(options, {
    host: "gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com",
    port: 4000,
    user: "3pTAoNNegb47Uc8.geekykey_migrate",
    password: "a/b@c",
    database: "geekykey",
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true, verifyIdentity: true },
  });
});
