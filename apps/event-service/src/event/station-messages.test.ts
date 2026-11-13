import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
import { stationMessages } from "./station-messages.ts";

const URL = "https://key-api.geekshacking.com";
const KEY = "e".repeat(64);
const STATION_ID = "station-1";
const MESSAGE = {
  lines: ["Transfer ready", "Tap your token"],
  countdown: { seconds: 20, lines: ["Time left: {s}"], ending: ["Time is up"] },
  beep: true,
};

test("a station message reaches the GeekyKey Service with the Event Service key", async () => {
  const requests: Request[] = [];
  const messages = stationMessages(
    { geekykeyServiceUrl: URL, eventServiceKey: KEY },
    {
      send: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({ delivered: true });
      },
    },
  );

  assert.equal(await messages.send(STATION_ID, MESSAGE), "delivered");
  assert.equal(requests.length, 1);
  const request = requests[0]!;
  assert.equal(request.url, "https://key-api.geekshacking.com/api/v1/station-messages");
  assert.equal(request.method, "POST");
  assert.equal(request.headers.get("Authorization"), `Bearer ${KEY}`);
  assert.equal(request.headers.get("Content-Type"), "application/json");
  assert.equal(request.redirect, "manual");
  assert.deepEqual(await request.json(), { station_id: STATION_ID, ...MESSAGE });
});

test("a message with no open station socket is dropped and logged once", async () => {
  const logged = captureLogs();
  const messages = stationMessages(
    { geekykeyServiceUrl: URL, eventServiceKey: KEY },
    { send: async () => Response.json({ delivered: false }) },
  );
  assert.equal(await messages.send(STATION_ID, MESSAGE), "dropped");
  assert.deepEqual(
    logged.info.mock.calls.map(([line]) => JSON.parse(line)),
    [{ severity: "INFO", message: "station_message_dropped", station_id: STATION_ID }],
  );
  assert.equal(logged.error.mock.calls.length, 0);
});

function captureLogs() {
  const info = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => {
    info.mockRestore();
    error.mockRestore();
  });
  return { info, error };
}

for (const status of [401, 503, 302, 307, 308]) {
  test(`a station message that gets ${status} fails without following a redirect`, async () => {
    const logged = captureLogs();
    const requests: Request[] = [];
    const messages = stationMessages(
      { geekykeyServiceUrl: URL, eventServiceKey: KEY },
      {
        send: async (input, init) => {
          requests.push(new Request(input, init));
          return Response.json(
            { delivered: true, key: KEY, lines: MESSAGE.lines },
            {
              status,
              headers: { Location: "https://another-service.example" },
            },
          );
        },
      },
    );
    assert.equal(await messages.send(STATION_ID, MESSAGE), "failed");
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.redirect, "manual");
    assert.deepEqual(
      logged.error.mock.calls.map(([line]) => JSON.parse(line)),
      [{ severity: "ERROR", message: "station_message_failed", station_id: STATION_ID, status }],
    );
    assert.equal(logged.info.mock.calls.length, 0);
  });
}

for (const [name, send] of [
  [
    "an invalid answer",
    async () => Response.json({ delivered: "yes", key: KEY, lines: MESSAGE.lines }),
  ],
  ["a missing answer", async () => Response.json({})],
  ["invalid JSON", async () => new Response(`${KEY} ${MESSAGE.lines[0]}`)],
  ["an empty body", async () => new Response(null, { status: 204 })],
  [
    "a network error",
    async () => {
      throw new Error(`${KEY} ${MESSAGE.lines[0]}`);
    },
  ],
] satisfies [string, typeof fetch][]) {
  test(`a station message with ${name} fails without logging its key or lines`, async () => {
    const logged = captureLogs();
    const messages = stationMessages({ geekykeyServiceUrl: URL, eventServiceKey: KEY }, { send });
    assert.equal(await messages.send(STATION_ID, MESSAGE), "failed");
    assert.equal(logged.info.mock.calls.length, 0);
    assert.equal(logged.error.mock.calls.length, 1);
    const line = logged.error.mock.calls[0]![0];
    assert.equal(typeof line, "string");
    assert.ok(!line.includes(KEY));
    for (const text of MESSAGE.lines) assert.ok(!line.includes(text));
    const fields = JSON.parse(line);
    assert.equal(fields.message, "station_message_failed");
    assert.equal(fields.station_id, STATION_ID);
    assert.equal(fields.reason, "request_failed");
  });
}

for (const lines of [
  ["This line is far too long"],
  ["Tap\nyour token"],
  ["你好"],
  [],
  ["1", "2", "3"],
]) {
  test(`a bad line is refused before any request: ${JSON.stringify(lines)}`, async () => {
    const logged = captureLogs();
    const send = vi.fn<typeof fetch>();
    const messages = stationMessages({ geekykeyServiceUrl: URL, eventServiceKey: KEY }, { send });
    assert.equal(await messages.send(STATION_ID, { lines }), "failed");
    assert.equal(send.mock.calls.length, 0);
    assert.deepEqual(
      logged.error.mock.calls.map(([line]) => JSON.parse(line)),
      [
        {
          severity: "ERROR",
          message: "station_message_failed",
          station_id: STATION_ID,
          reason: "request_failed",
        },
      ],
    );
  });
}

for (const url of [undefined, ""]) {
  test(`station messages are off with no request or log when the URL is ${url === undefined ? "unset" : "empty"}`, async () => {
    const logged = captureLogs();
    const send = vi.fn<typeof fetch>();
    const messages = stationMessages({ geekykeyServiceUrl: url, eventServiceKey: KEY }, { send });
    assert.equal(await messages.send(STATION_ID, MESSAGE), "off");
    assert.equal(send.mock.calls.length, 0);
    assert.equal(logged.info.mock.calls.length, 0);
    assert.equal(logged.error.mock.calls.length, 0);
  });
}

for (const waitingFor of ["headers", "body"]) {
  test(`a station message times out after two seconds while waiting for ${waitingFor}`, async () => {
    const logged = captureLogs();
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    let closeBody = () => {};
    const response = new Response(
      new ReadableStream({
        start(controller) {
          closeBody = () => controller.close();
        },
      }),
    );
    onTestFinished(() => closeBody());
    let signal: AbortSignal | undefined;
    const messages = stationMessages(
      { geekykeyServiceUrl: URL, eventServiceKey: KEY },
      {
        send: async (input, init) => {
          signal = new Request(input, init).signal;
          return waitingFor === "headers" ? new Promise<Response>(() => {}) : response;
        },
      },
    );
    let settled = false;
    const result = messages.send(STATION_ID, MESSAGE).then((result) => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(1999);
    assert.equal(settled, false);
    await vi.advanceTimersByTimeAsync(1);
    assert.equal(await result, "failed");
    assert.equal(signal?.aborted, true);
    assert.deepEqual(
      logged.error.mock.calls.map(([line]) => JSON.parse(line)),
      [
        {
          severity: "ERROR",
          message: "station_message_failed",
          station_id: STATION_ID,
          reason: "timeout",
        },
      ],
    );
    assert.equal(logged.info.mock.calls.length, 0);
  });
}
