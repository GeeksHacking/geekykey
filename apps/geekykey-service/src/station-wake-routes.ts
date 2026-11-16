import { stationWakeRequest } from "@geekykey/handoff";
import { Hono } from "hono";
import type { EventServiceEntry } from "./config.ts";
import type { EventService } from "./event-service.ts";
import { log } from "./lib/log.ts";
import { jsonBody } from "./lib/validate.ts";
import { beforeDeadline } from "./service-request.ts";
import {
  eventServiceAuth,
  type MessageEnv,
  refuseUnknownStation,
} from "./station-message-routes.ts";
import type { StationConnections } from "./station-sockets.ts";
import type { StationsCopy } from "./stations-copy.ts";

export function stationWakeRoutes({
  eventServices,
  stationsCopy,
  stationSockets,
  deadlineMs,
}: {
  eventServices: EventServiceEntry[];
  stationsCopy: StationsCopy<EventService>;
  stationSockets: StationConnections;
  deadlineMs: number;
}) {
  return new Hono<MessageEnv>().post(
    "/",
    eventServiceAuth(eventServices, deadlineMs),
    jsonBody(stationWakeRequest),
    async (c) => {
      const { station_id, at } = c.req.valid("json");
      const { sender, deadline } = c.var;
      const delay = Date.parse(at) - Date.now();
      if (delay < -60000 || delay > 600000)
        return c.json(
          {
            error: "validation_failed",
            issues: [
              {
                code: "custom",
                path: ["at"],
                message: "at must be at most 1 minute past or 10 minutes ahead",
              },
            ],
          },
          400,
        );
      const refused = await refuseUnknownStation(c, stationsCopy, station_id);
      if (refused) return refused;
      try {
        if (deadline.aborted) throw new Error("timeout");
        await beforeDeadline(
          stationSockets.wake(sender.id, station_id, at),
          deadline,
          () => new Error("timeout"),
        );
      } catch {
        log("station_wake_failed", {
          station_id,
          reason: deadline.aborted ? "timeout" : "unreachable",
        });
        return c.json({ error: "event_service_unavailable" }, 503);
      }
      return c.json({ scheduled: true }, 202);
    },
  );
}
