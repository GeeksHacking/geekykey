import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { beforeEach, onTestFinished, test, vi } from "vitest";
import { startTidbProxy, type TidbProxy } from "../../test-support/tidb-proxy.ts";
import { connectionOptions, createDbPool, type DbPoolOptions } from "./pool.ts";
import { stations } from "./schema.ts";

let proxy: TidbProxy;

beforeEach(async () => {
  proxy = await startTidbProxy();
  return () => proxy.close();
});

/** A pool to geekykey_test through the proxy, closed when the test ends. */
function poolThroughProxy(options?: DbPoolOptions) {
  const pool = createDbPool(proxy.url("geekykey_test"), options);
  onTestFinished(() => pool.close());
  return pool;
}

test("a query still succeeds when its idle connection died unnoticed, on a new connection", async () => {
  const { db } = poolThroughProxy({ checkAfterIdleMs: 0 });
  await db.execute(sql`SELECT 1`);

  proxy.killOpenConnections();
  const [rows] = await db.execute(sql`SELECT 2 AS n`);

  assert.deepEqual(rows, [{ n: 2 }]);
  assert.equal(proxy.connectionsMade(), 2);
});

test("a query whose reply is lost fails, and isn't sent again", async () => {
  const { db } = poolThroughProxy({ checkAfterIdleMs: 0 });
  await db.insert(stations).values({ id: "station-1", name: "Booth 1", apiKeyHash: "unused" });

  proxy.loseNextReply();
  await assert.rejects(
    db
      .update(stations)
      .set({ points: sql`${stations.points} + 1` })
      .where(eq(stations.id, "station-1")),
    (err: Error) => (err.cause as { code?: string }).code === "ECONNRESET",
  );

  // TiDB ran it once: sent again, it would have added another point.
  const [station] = await db.select().from(stations).limit(1);
  assert.equal(station?.points, 2);
});

test("a connection left unused is closed after the idle time", async () => {
  const { db } = poolThroughProxy({ idleTimeoutMs: 500 });
  await db.execute(sql`SELECT 1`);
  assert.equal(proxy.openConnections(), 1);

  // The pool looks for idle connections once a second.
  await vi.waitFor(() => assert.equal(proxy.openConnections(), 0), { timeout: 3_000 });
});

test("closing the pool closes every connection", async () => {
  const pool = createDbPool(proxy.url("geekykey_test"));
  // Two at once, so the pool opens two.
  await Promise.all([pool.db.execute(sql`SELECT 1`), pool.db.execute(sql`SELECT 2`)]);
  assert.equal(proxy.openConnections(), 2);

  await pool.close();
  await vi.waitFor(() => assert.equal(proxy.openConnections(), 0));
});

test("a database elsewhere is reached over TLS that checks its certificate and name, whatever its URL says", () => {
  const options = connectionOptions(
    "mysql://3pTAoNNegb47Uc8.geekykey_app:a%2Fb%40c@gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com:4000/geekykey?ssl=false",
  );

  assert.deepEqual(options, {
    host: "gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com",
    port: 4000,
    user: "3pTAoNNegb47Uc8.geekykey_app",
    password: "a/b@c",
    database: "geekykey",
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true, verifyIdentity: true },
  });
});

test("a database on this machine is reached without TLS, since TiDB in Docker has none", () => {
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    const options = connectionOptions(`mysql://geekykey:geekykey@${host}:4000/geekykey_dev`);
    assert.equal(options.ssl, undefined, host);
  }
});
