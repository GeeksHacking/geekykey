import assert from "node:assert/strict";
import {
  env,
  evictDurableObject,
  runInDurableObject,
  runDurableObjectAlarm,
} from "cloudflare:test";
import { onTestFinished, test, vi } from "vitest";
import { stationConnections } from "./station-sockets.ts";
import { loadConfig } from "./config.ts";

function harness(eventServiceId = "showcase") {
  const stationId = crypto.randomUUID();
  const connections = stationConnections(env.STATION_SOCKETS);
  const stub = env.STATION_SOCKETS.get(
    env.STATION_SOCKETS.idFromName(JSON.stringify([eventServiceId, stationId])),
  );
  const at = Date.now() + 60000;
  onTestFinished(async () => {
    await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.deleteAll();
      await state.storage.deleteAlarm();
    });
  });
  const wake = (time: number) =>
    connections.wake(eventServiceId, stationId, new Date(time).toISOString());
  const alarmAt = () => runInDurableObject(stub, (_instance, state) => state.storage.getAlarm());
  const due = () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(at);
    onTestFinished(() => clock.mockRestore());
  };
  return {
    wake,
    stub,
    at,
    alarmAt,
    due,
    stationId,
    send: (lines: string[]) =>
      connections.send(eventServiceId, stationId, { type: "station_message", lines }),
  };
}

test("the earliest wake wins, duplicate times coalesce and stored wakes survive eviction", async () => {
  const h = harness();
  await h.wake(h.at + 20000);
  await h.wake(h.at);
  await h.wake(h.at + 10000);
  await h.wake(h.at);
  assert.equal(await h.alarmAt(), h.at);
  await evictDurableObject(h.stub);
  assert.equal(await h.alarmAt(), h.at);
});

test("an alarm calls its configured Event Service, removes due wakes and schedules the next", async () => {
  const h = harness();
  await h.wake(h.at);
  await h.wake(h.at);
  await h.wake(h.at + 10000);
  await evictDurableObject(h.stub);
  h.due();
  const send = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
  onTestFinished(() => send.mockRestore());
  assert.equal(await runDurableObjectAlarm(h.stub), true);
  assert.equal(send.mock.calls.length, 1);
  const [url, init] = send.mock.calls[0]!;
  const entry = loadConfig(env).eventServices[0]!;
  const request = new Request(url, init);
  assert.equal(request.url, `${entry.url}/geekykey/v1/wake`);
  assert.equal(request.method, "POST");
  assert.equal(request.headers.get("Authorization"), `Bearer ${entry.key}`);
  assert.equal(request.redirect, "manual");
  assert.deepEqual(await request.json(), { station_id: h.stationId });
  assert.equal(await h.alarmAt(), h.at + 10000);
  await runInDurableObject(h.stub, (instance) =>
    instance.alarm({ retryCount: 0, isRetry: false, scheduledTime: h.at }),
  );
  assert.equal(send.mock.calls.length, 1);
});

for (const failure of ["status", "network"]) {
  test(`a ${failure} failure throws and leaves the wake pending for a retry`, async () => {
    const h = harness();
    await h.wake(h.at);
    await h.wake(h.at + 10000);
    h.due();
    const send = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (failure === "network") throw new Error("secret detail");
      return new Response(null, { status: 503 });
    });
    onTestFinished(() => send.mockRestore());
    await assert.rejects(
      runInDurableObject(h.stub, (instance) =>
        instance.alarm({ retryCount: 0, isRetry: false, scheduledTime: h.at }),
      ),
      /Station wake failed/,
    );
    send.mockResolvedValue(new Response(null, { status: 204 }));
    await runInDurableObject(h.stub, (instance) =>
      instance.alarm({ retryCount: 1, isRetry: true, scheduledTime: h.at }),
    );
    assert.equal(send.mock.calls.length, 2);
    assert.equal(await h.alarmAt(), h.at + 10000);
  });
}

test("the last failed retry drops the due wake and schedules later work", async () => {
  const h = harness("removed-service");
  await h.wake(h.at);
  await h.wake(h.at + 10000);
  h.due();
  await assert.rejects(
    runInDurableObject(h.stub, (instance) =>
      instance.alarm({ retryCount: 0, isRetry: false, scheduledTime: h.at }),
    ),
    /Station wake failed/,
  );
  await runInDurableObject(h.stub, (instance) =>
    instance.alarm({ retryCount: 6, isRetry: true, scheduledTime: h.at }),
  );
  assert.equal(await h.alarmAt(), h.at + 10000);
});

test("an alarm callback can send to the same object and register its next wake", async () => {
  const h = harness();
  await h.wake(h.at);
  h.due();
  const send = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    assert.equal(await h.send(["Next hint"]), 0);
    await h.wake(h.at + 10000);
    return new Response(null, { status: 204 });
  });
  onTestFinished(() => send.mockRestore());
  assert.equal(await runDurableObjectAlarm(h.stub), true);
  assert.equal(await h.alarmAt(), h.at + 10000);
});

test("an alarm's last wake is cleared and its station socket survives hibernation", async () => {
  const h = harness();
  const res = await h.stub.fetch("https://station/socket", {
    headers: { Upgrade: "websocket", "X-Station-Id": h.stationId },
  });
  const socket = res.webSocket!;
  socket.accept();
  onTestFinished(async () => {
    const closed = new Promise((resolve) =>
      socket.addEventListener("close", resolve, { once: true }),
    );
    socket.close(1000, "test finished");
    await closed;
  });
  await h.wake(h.at);
  await evictDurableObject(h.stub);
  h.due();
  const send = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    assert.equal(await h.send(["Hint ready"]), 1);
    return new Response(null, { status: 204 });
  });
  onTestFinished(() => send.mockRestore());
  const received = new Promise<string>((resolve) =>
    socket.addEventListener("message", (event) => resolve(String(event.data)), { once: true }),
  );
  assert.equal(await runDurableObjectAlarm(h.stub), true);
  assert.deepEqual(JSON.parse(await received), { type: "station_message", lines: ["Hint ready"] });
  assert.equal(await h.alarmAt(), null);
  const pong = new Promise<string>((resolve) =>
    socket.addEventListener("message", (event) => resolve(String(event.data)), { once: true }),
  );
  socket.send("ping");
  assert.equal(await pong, "pong");
});
