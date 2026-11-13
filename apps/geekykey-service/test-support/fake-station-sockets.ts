import type { StationMessageFrame } from "@geekykey/handoff";
import type { StationConnections } from "../src/station-sockets.ts";

/** A station's connections, with no Durable Object needed for route tests. */
export function fakeStationSockets() {
  const fake = {
    opened: [] as string[],
    /** The Event Service each socket was opened for, beside `opened`. */
    openedFor: [] as string[],
    sent: [] as { eventServiceId: string; stationId: string; frame: StationMessageFrame }[],
    delivered: 0,
    open: (async (eventServiceId: string, stationId: string): Promise<Response> => {
      fake.opened.push(stationId);
      fake.openedFor.push(eventServiceId);
      return new Response(null, { status: 204 });
    }) satisfies StationConnections["open"],
    send: (async (
      eventServiceId: string,
      stationId: string,
      frame: StationMessageFrame,
    ): Promise<number> => {
      fake.sent.push({ eventServiceId, stationId, frame });
      return fake.delivered;
    }) satisfies StationConnections["send"],
  };
  return fake;
}
