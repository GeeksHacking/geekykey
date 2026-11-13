import assert from "node:assert/strict";
import {
  createExecutionContext,
  env,
  evictDurableObject,
  waitOnExecutionContext,
} from "cloudflare:test";
import { onTestFinished, test, vi } from "vitest";
import { fakeServices } from "../test-support/fake-services.ts";
import { fakeLimiter } from "../test-support/fake-limiter.ts";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { hashStationKey } from "./station-keys.ts";
import { stationConnections } from "./station-sockets.ts";

/** Real workerd objects, with only the Event Service's HTTP answers faked. */
async function harness() {
  const config = loadConfig(env);
  const fake = fakeServices(config);
  // Test files can share storage when exercising sockets. Use fresh station IDs.
  const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const keys = ["gk_sta_first-key", "gk_sta_second-key", "gk_sta_offline-key"];
  fake.stations.set(
    "showcase",
    await Promise.all(
      ids.map(async (station_id, index) => ({
        station_id,
        key_hash: await hashStationKey(keys[index]!),
      })),
    ),
  );
  const app = createApp(config, {
    send: fake.send,
    stationSockets: stationConnections(env.STATION_SOCKETS),
    stationLimit: fakeLimiter(60),
    userLimit: fakeLimiter(60),
    writerLimit: env.TOKEN_WRITER_LIMIT,
    tokenLimit: fakeLimiter(20),
  });
  const request = async (path: string, init: RequestInit) => {
    const ctx = createExecutionContext();
    const res = await app.request(path, init, env, ctx);
    await waitOnExecutionContext(ctx);
    return res;
  };
  const sockets: WebSocket[] = [];
  onTestFinished(async () => {
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        const closed = new Promise((resolve) =>
          socket.addEventListener("close", resolve, { once: true }),
        );
        socket.close(1000, "test finished");
        await closed;
      }
    }
  });
  const open = async (index = 0) => {
    const res = await request("/api/v1/stations/socket", {
      headers: { Upgrade: "websocket", Authorization: `Bearer ${keys[index]}` },
    });
    assert.equal(res.status, 101);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    assert.ok(res.webSocket);
    res.webSocket.accept();
    sockets.push(res.webSocket);
    return res.webSocket;
  };
  const post = (index = 0, extra: Record<string, unknown> = {}) =>
    request("/api/v1/station-messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.eventServices[0]!.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        station_id: ids[index],
        lines: ["Round started!", "Check your phone"],
        beep: true,
        ...extra,
      }),
    });
  const stub = (index = 0) =>
    env.STATION_SOCKETS.get(
      env.STATION_SOCKETS.idFromName(JSON.stringify(["showcase", ids[index]])),
    );
  return { open, post, stub, ids };
}

function message(socket: WebSocket) {
  return new Promise<string>((resolve) =>
    socket.addEventListener("message", (event) => resolve(String(event.data)), { once: true }),
  );
}

test("a station message reaches only its station's real socket, and an offline station drops it", async () => {
  const { open, post } = await harness();
  const first = await open();
  const second = await open(1);
  const otherMessages: string[] = [];
  second.addEventListener("message", (event) => {
    otherMessages.push(String(event.data));
  });
  const received = message(first);
  const res = await post();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { delivered: true });
  assert.deepEqual(JSON.parse(await received), {
    type: "station_message",
    lines: ["Round started!", "Check your phone"],
    beep: true,
  });
  const offline = await post(2);
  assert.equal(offline.status, 200);
  assert.deepEqual(await offline.json(), { delivered: false });
  // A pong on the other connection proves it is alive and has processed its frames.
  const pong = message(second);
  second.send("ping");
  assert.equal(await pong, "pong");
  assert.deepEqual(otherMessages, ["pong"]);
});

test("a message from another Event Service never reaches a station with the same ID", async () => {
  const { open, ids } = await harness();
  const socket = await open();
  const messages: string[] = [];
  socket.addEventListener("message", (event) => {
    messages.push(String(event.data));
  });
  // As if a second Event Service had registered the same station ID: its objects are its own.
  const connections = stationConnections(env.STATION_SOCKETS);
  const frame = { type: "station_message" as const, lines: ["Not yours"] };
  assert.equal(await connections.send("other", ids[0]!, frame), 0);
  assert.equal(await connections.send("showcase", ids[0]!, frame), 1);
  const pong = message(socket);
  socket.send("ping");
  assert.equal(await pong, "pong");
  assert.deepEqual(messages, [JSON.stringify(frame), "pong"]);
});

test("a reconnect replaces the older socket with code 4000 and receives subsequent messages", async () => {
  const { open, post } = await harness();
  const first = await open();
  const closed = new Promise<CloseEvent>((resolve) =>
    first.addEventListener("close", resolve, { once: true }),
  );
  const second = await open();
  const close = await closed;
  assert.equal(close.code, 4000);
  assert.equal(close.reason, "replaced");
  const received = message(second);
  assert.deepEqual(await (await post()).json(), { delivered: true });
  assert.equal(JSON.parse(await received).type, "station_message");
});

test("ping works after hibernation, other frames are ignored, and station messages still arrive", async () => {
  const { open, post, stub } = await harness();
  const socket = await open();
  await evictDurableObject(stub());
  const messages: string[] = [];
  socket.addEventListener("message", (event) => {
    messages.push(String(event.data));
  });
  const pong = message(socket);
  socket.send("not a ping");
  socket.send(new Uint8Array([1, 2, 3]));
  socket.send("ping");
  assert.equal(await pong, "pong");
  assert.deepEqual(messages, ["pong"]);
  const received = message(socket);
  assert.deepEqual(await (await post()).json(), { delivered: true });
  assert.equal(JSON.parse(await received).type, "station_message");
});

test("a disconnected station drops its messages and reconnecting does not replay them", async () => {
  const { open, post } = await harness();
  const first = await open();
  const closed = new Promise((resolve) => first.addEventListener("close", resolve, { once: true }));
  first.close(1000, "offline");
  await closed;
  assert.deepEqual(await (await post()).json(), { delivered: false });
  const second = await open();
  const received = message(second);
  second.send("ping");
  assert.equal(await received, "pong");
});

test("socket logs include the station and close code without message contents", async () => {
  const logged = vi.spyOn(console, "log").mockImplementation(() => {});
  onTestFinished(() => logged.mockRestore());
  const { open, ids } = await harness();
  const socket = await open();
  const closed = new Promise((resolve) =>
    socket.addEventListener("close", resolve, { once: true }),
  );
  socket.close(1000, "sensitive close reason");
  await closed;
  const logs = logged.mock.calls
    .map(([line]) => JSON.parse(String(line)) as Record<string, unknown>)
    .filter((line) => String(line.message).startsWith("station_socket_"));
  assert.deepEqual(logs, [
    { severity: "INFO", message: "station_socket_opened", station_id: ids[0] },
    { severity: "INFO", message: "station_socket_closed", station_id: ids[0], code: 1000 },
  ]);
});
