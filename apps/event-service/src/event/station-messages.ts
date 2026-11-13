import {
  stationMessageAnswer,
  stationMessageRequest,
  type StationMessageRequest,
} from "@geekykey/handoff";
import type { Config } from "../config.ts";
import { log } from "../lib/log.ts";

export type StationMessageResult = "delivered" | "dropped" | "failed" | "off";
export type StationMessage = Omit<StationMessageRequest, "station_id">;

/**
 * Sends a station message to the GeekyKey Service (the API agreement's
 * 11.12). A message may be dropped, so games must work without it.
 */
export interface StationMessages {
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
  return {
    async send(stationId, message) {
      if (!config.geekykeyServiceUrl) return "off";
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const request = stationMessageRequest.parse({ ...message, station_id: stationId });
        // The same deadline covers the headers and the body, even if a test's HTTP call ignores abort.
        const deadline = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("Station message timed out"));
          }, TIMEOUT_MS);
        });
        const response = await Promise.race([
          send(`${config.geekykeyServiceUrl}/api/v1/station-messages`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${config.eventServiceKey}`,
              "Content-Type": "application/json",
            },
            redirect: "manual",
            body: JSON.stringify(request),
            signal: controller.signal,
          }),
          deadline,
        ]);
        if (!response.ok) {
          log("station_message_failed", { station_id: stationId, status: response.status });
          return "failed";
        }
        const answer = stationMessageAnswer.parse(await Promise.race([response.json(), deadline]));
        if (!answer.delivered) log("station_message_dropped", { station_id: stationId });
        return answer.delivered ? "delivered" : "dropped";
      } catch {
        // Exception messages and validation issues can hold the key or the screen's lines.
        log("station_message_failed", {
          station_id: stationId,
          reason: controller.signal.aborted ? "timeout" : "request_failed",
        });
        return "failed";
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
