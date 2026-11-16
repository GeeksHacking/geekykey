import { DurableObject } from "cloudflare:workers";
import type { StationMessageFrame } from "@geekykey/handoff";
import { loadConfig } from "./config.ts";
import { EventService } from "./event-service.ts";
import { log } from "./lib/log.ts";

/**
 * The station connections the routes reach, faked by route tests. Each
 * station is named with the Event Service that registered it, the one its key
 * matched or the one whose key sent the message.
 */
export interface StationConnections {
  wake(eventServiceId: string, stationId: string, at: string): Promise<void>;
  open(eventServiceId: string, stationId: string, request: Request): Promise<Response>;
  send(eventServiceId: string, stationId: string, frame: StationMessageFrame): Promise<number>;
}

/**
 * One object per station, near the Event Service in Singapore. Its name holds
 * the Event Service's ID as well as the station's, so a message can never
 * reach another event's station, even one that registered the same station ID
 * (the API agreement's 11.1 and 11.12).
 */
export function stationConnections(
  binding: DurableObjectNamespace<StationSockets>,
): StationConnections {
  const stub = (eventServiceId: string, stationId: string) =>
    binding.get(binding.idFromName(JSON.stringify([eventServiceId, stationId])), {
      locationHint: "apac",
    });
  return {
    open(eventServiceId, stationId, request) {
      // Forward only what the object needs, so the station key never leaves the route.
      return stub(eventServiceId, stationId).fetch("https://station/socket", {
        headers: { Upgrade: request.headers.get("Upgrade") ?? "", "X-Station-Id": stationId },
      });
    },
    async wake(eventServiceId, stationId, at) {
      await stub(eventServiceId, stationId).wake(eventServiceId, stationId, at);
    },
    async send(eventServiceId, stationId, frame) {
      return await stub(eventServiceId, stationId).send(frame);
    },
  };
}

interface PendingWake {
  eventServiceId: string;
  stationId: string;
  at: number;
}
const WAKE_PREFIX = "wake:";

/** Holds connections and wake times. Station messages themselves are never kept. */
export class StationSockets extends DurableObject<Cloudflare.Env> {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    // The runtime answers these without waking the object from hibernation.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  /** Persist before arming: duplicate times coalesce, and an earlier wake is never postponed. */
  async wake(eventServiceId: string, stationId: string, at: string): Promise<void> {
    const time = Date.parse(at);
    await this.ctx.storage.transaction(async (storage) => {
      await storage.put<PendingWake>(`${WAKE_PREFIX}${time}`, {
        eventServiceId,
        stationId,
        at: time,
      });
      const current = await storage.getAlarm();
      if (current === null || time < current) await storage.setAlarm(time);
    });
  }

  override async alarm(info: AlarmInvocationInfo): Promise<void> {
    const pending = await this.ctx.storage.list<PendingWake>({ prefix: WAKE_PREFIX });
    const due = [...pending].filter(([, wake]) => wake.at <= Date.now());
    if (due.length) {
      const { eventServiceId, stationId } = due[0]![1];
      try {
        // Read current settings after every eviction or deploy; never persist a URL or key.
        const config = loadConfig(this.env);
        const entry = config.eventServices.find(({ id }) => id === eventServiceId);
        if (!entry) throw new Error("Event Service removed");
        const service = new EventService({ ...entry, send: (url, init) => fetch(url, init) });
        await service.wake({ station_id: stationId }, AbortSignal.timeout(config.tapDeadlineMs));
      } catch {
        // Cloudflare retries a thrown alarm up to six times. Retain due times until success,
        // but on the last attempt discard them so bad config cannot strand later wakes.
        // The test alarm helper omits invocation info; the runtime supplies it.
        const retryCount = info?.retryCount ?? 0;
        const abandoned = retryCount >= 6;
        log(abandoned ? "station_wake_abandoned" : "station_wake_failed", {
          event_service: eventServiceId,
          station_id: stationId,
          retry_count: retryCount,
        });
        if (!abandoned) throw new Error("Station wake failed");
      }
    }
    // The HTTP callback can register more wakes while it is in flight. Delete only the snapshot
    // just processed, and find the next time from storage rather than overwriting that new work.
    await this.ctx.storage.transaction(async (storage) => {
      await storage.delete(due.map(([key]) => key));
      const remaining = await storage.list<PendingWake>({ prefix: WAKE_PREFIX });
      const times = [...remaining.values()].map(({ at }) => at);
      if (times.length) await storage.setAlarm(Math.min(...times));
      else await storage.deleteAlarm();
    });
  }

  override fetch(request: Request): Response {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return Response.json({ error: "upgrade_required" }, { status: 426 });
    }
    const stationId = request.headers.get("X-Station-Id")!;
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState === WebSocket.OPEN) socket.close(4000, "replaced");
    }
    const { 0: client, 1: server } = new WebSocketPair();
    // The attachment survives hibernation for the close log, with no storage writes.
    server.serializeAttachment(stationId);
    this.ctx.acceptWebSocket(server);
    log("station_socket_opened", { station_id: stationId });
    return new Response(null, { status: 101, webSocket: client });
  }

  send(frame: StationMessageFrame): number {
    const message = JSON.stringify(frame);
    let delivered = 0;
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      try {
        socket.send(message);
        delivered++;
      } catch {
        // A peer can disappear between checking it and sending. Nothing is queued.
      }
    }
    return delivered;
  }

  override webSocketMessage(): void {
    // Only the automatic ping response is supported. All other frames are ignored.
  }

  override webSocketClose(socket: WebSocket, code: number): void {
    // Reply explicitly too, for runtimes that do not yet auto-reply to Close frames.
    socket.close(code === 1005 || code === 1006 ? 1000 : code);
    log("station_socket_closed", { station_id: socket.deserializeAttachment(), code });
  }

  override webSocketError(socket: WebSocket): void {
    socket.close(1011, "socket error");
  }
}
