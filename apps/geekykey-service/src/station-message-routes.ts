import { stationMessageRequest } from "@geekykey/handoff";
import { Hono } from "hono";
import type { EventServiceEntry } from "./config.ts";
import type { EventService } from "./event-service.ts";
import { bearerKey } from "./lib/bearer-key.ts";
import { log } from "./lib/log.ts";
import { jsonBody } from "./lib/validate.ts";
import { beforeDeadline } from "./service-request.ts";
import { stationAuth, type StationEnv } from "./station-auth.ts";
import type { StationConnections } from "./station-sockets.ts";
import type { StationsCopy } from "./stations-copy.ts";

interface SocketOptions {
  stationsCopy: StationsCopy<EventService>;
  stationSockets: StationConnections;
  deadlineMs: number;
  stationLimit: RateLimit;
}

export function socketRoutes({
  stationsCopy,
  stationSockets,
  deadlineMs,
  stationLimit,
}: SocketOptions) {
  return new Hono<StationEnv>().get(
    "/",
    stationAuth(stationsCopy, deadlineMs, stationLimit),
    async (c) => {
      if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
        return c.json({ error: "upgrade_required" }, 426);
      }
      return await stationSockets.open(c.var.station.eventService.id, c.var.station.id, c.req.raw);
    },
  );
}

/** Like the Event Service's bearer check, compare equal-length SHA-256 hashes. */
function hashKey(key: string) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
}

type MessageEnv = { Variables: { sender: EventServiceEntry; deadline: AbortSignal } };

export function stationMessageRoutes({
  eventServices,
  stationsCopy,
  stationSockets,
  deadlineMs,
}: Omit<SocketOptions, "stationLimit"> & { eventServices: EventServiceEntry[] }) {
  return new Hono<MessageEnv>().post(
    "/",
    async (c, next) => {
      // Authentication, validation, the stations list and the send share one deadline.
      c.set("deadline", AbortSignal.timeout(deadlineMs));
      const key = bearerKey(c.req.header("Authorization"));
      if (key === null) return c.json({ error: "invalid_event_service_key" }, 401);
      const given = await hashKey(key);
      let sender: EventServiceEntry | undefined;
      // Check every entry, even after a match, so timing does not reveal its position. Each key
      // is hashed here rather than when the app is built, which a Worker does at global scope.
      for (const entry of eventServices) {
        if (crypto.subtle.timingSafeEqual(given, await hashKey(entry.key))) sender = entry;
      }
      if (sender === undefined) return c.json({ error: "invalid_event_service_key" }, 401);
      c.set("sender", sender);
      return await next();
    },
    jsonBody(stationMessageRequest),
    async (c) => {
      const { station_id, ...message } = c.req.valid("json");
      const { sender, deadline } = c.var;
      const check = await stationsCopy.findForEventService(sender.id, station_id, {
        signal: deadline,
        waitUntil: (work) => c.executionCtx.waitUntil(work),
      });
      if (check.result === "unavailable")
        return c.json({ error: "event_service_unavailable" }, 503);
      if (check.result === "unknown") {
        return c.json(
          {
            error: "validation_failed",
            issues: [
              { path: ["station_id"], message: "Station is not registered by this Event Service" },
            ],
          },
          400,
        );
      }
      let delivered = false;
      try {
        if (deadline.aborted) throw new Error("timeout");
        const count = await beforeDeadline(
          stationSockets.send(sender.id, station_id, { type: "station_message", ...message }),
          deadline,
          () => new Error("timeout"),
        );
        delivered = count > 0;
      } catch {
        log("station_message_failed", {
          station_id,
          reason: deadline.aborted ? "timeout" : "unreachable",
        });
      }
      return c.json({ delivered });
    },
  );
}
