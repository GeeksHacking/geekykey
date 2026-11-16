import {
  stationWakeRequest,
  stationWakeAnswer,
  stationMessageAnswer,
  stationMessageRequest,
  type StationMessageRequest,
} from "@geekykey/handoff";
import type { Config } from "../config.ts";
import { log, type LogName } from "../lib/log.ts";

export type StationMessageResult = "delivered" | "dropped" | "failed" | "off";
export type StationMessage = Omit<StationMessageRequest, "station_id">;

/**
 * Sends a station message to the GeekyKey Service (the API agreement's
 * 11.12). A message may be dropped, so games must work without it.
 */
export interface StationMessages {
  wake(stationId: string, at: Date): Promise<"scheduled" | "failed" | "off">;
  send(stationId: string, message: StationMessage): Promise<StationMessageResult>;
}

/**
 * How long a message may take. A game's tap answer must not wait long for it
 * (the API agreement's 11.12).
 */
const TIMEOUT_MS = 2000;

/** Built once by the app, for the games this event runs. Tests replace the HTTP call. */
export function stationMessages(
  config: Pick<Config, "geekykeyServiceUrl" | "eventServiceKey">,
  { send = fetch }: { send?: typeof fetch } = {},
): StationMessages {
  /**
   * One bounded POST to the GeekyKey Service: the same deadline covers the headers and the body,
   * even if a test's HTTP call ignores abort. Gives the parsed answer, or null after logging
   * `failed` with no key, lines or body in the log.
   */
  async function post<T>(
    path: string,
    body: unknown,
    answer: { parse(data: unknown): T },
    { stationId, failed }: { stationId: string; failed: LogName },
  ): Promise<T | null> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("GeekyKey Service request timed out"));
        }, TIMEOUT_MS);
      });
      const response = await Promise.race([
        send(`${config.geekykeyServiceUrl}${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.eventServiceKey}`,
            "Content-Type": "application/json",
          },
          redirect: "manual",
          body: JSON.stringify(body),
          signal: controller.signal,
        }),
        deadline,
      ]);
      if (!response.ok) {
        log(failed, { station_id: stationId, status: response.status });
        return null;
      }
      return answer.parse(await Promise.race([response.json(), deadline]));
    } catch {
      // Exception messages and validation issues can hold the key or the screen's lines.
      log(failed, {
        station_id: stationId,
        reason: controller.signal.aborted ? "timeout" : "request_failed",
      });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async wake(stationId, at) {
      if (!config.geekykeyServiceUrl) return "off";
      const request = stationWakeRequest.safeParse({ station_id: stationId, at: at.toISOString() });
      if (!request.success) {
        log("station_wake_failed", { station_id: stationId, reason: "request_failed" });
        return "failed";
      }
      const answer = await post("/api/v1/station-wakes", request.data, stationWakeAnswer, {
        stationId,
        failed: "station_wake_failed",
      });
      return answer ? "scheduled" : "failed";
    },
    async send(stationId, message) {
      if (!config.geekykeyServiceUrl) return "off";
      const request = stationMessageRequest.safeParse({ ...message, station_id: stationId });
      if (!request.success) {
        log("station_message_failed", { station_id: stationId, reason: "request_failed" });
        return "failed";
      }
      const answer = await post("/api/v1/station-messages", request.data, stationMessageAnswer, {
        stationId,
        failed: "station_message_failed",
      });
      if (!answer) return "failed";
      if (!answer.delivered) log("station_message_dropped", { station_id: stationId });
      return answer.delivered ? "delivered" : "dropped";
    },
  };
}
