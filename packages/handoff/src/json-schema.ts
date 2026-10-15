import { z } from "zod";
import { heartbeatsRequest } from "./heartbeats.ts";
import { stationsAnswer } from "./stations.ts";
import { tapsAnswer, tapsRequest } from "./taps.ts";

/** Each body's schema, by the file its JSON Schema goes in. */
const SCHEMAS = {
  "taps-request.schema.json": tapsRequest.meta({
    title: "The hand-off: POST /geekykey/v1/taps",
  }),
  "taps-answer.schema.json": tapsAnswer.meta({
    title: "The answer to the hand-off: POST /geekykey/v1/taps",
    description:
      "Also: one result per tap in the request, in the same order, with the same client_tap_ids.",
  }),
  "stations-answer.schema.json": stationsAnswer.meta({
    title: "The registered stations: GET /geekykey/v1/stations",
    description: "Enabled stations only. The request has no body.",
  }),
  "heartbeats-request.schema.json": heartbeatsRequest.meta({
    title: "The heartbeat hand-off: POST /geekykey/v1/heartbeats",
    description: "Answered 204, with no body.",
  }),
};

/**
 * The JSON Schema of each body, as the files in json-schema/ hold it, for
 * other teams building an Event Service (the API agreement's 11.7).
 */
export function jsonSchemaFiles(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(SCHEMAS).map(([name, schema]) => [
      name,
      // As sent, which leaves other fields allowed: they're only ever added,
      // and a team checking with an older file mustn't refuse them.
      `${JSON.stringify(z.toJSONSchema(schema, { io: "input" }), null, 2)}\n`,
    ]),
  );
}
