import { z } from "zod";
import { heartbeatsRequest } from "./heartbeats.ts";
import { meetingsAnswer, meetingsRequest } from "./meetings.ts";
import { stationMessageAnswer, stationMessageRequest } from "./station-messages.ts";
import { stationsAnswer } from "./stations.ts";
import { tapsAnswer, tapsRequest } from "./taps.ts";
import { usedLoginLinksAnswer, usedLoginLinksRequest } from "./used-login-links.ts";

/** Each body's schema, by the file its JSON Schema goes in. */
const SCHEMAS = {
  "taps-request.schema.json": tapsRequest.meta({
    title: "The hand-off: POST /geekykey/v1/taps",
  }),
  "taps-answer.schema.json": tapsAnswer.meta({
    title: "The answer to the hand-off: POST /geekykey/v1/taps",
    description:
      "Also: one result per tap in the request, in the same order, with the same " +
      "client_tap_ids, and {s} at most once across a countdown's lines.",
  }),
  "stations-answer.schema.json": stationsAnswer.meta({
    title: "The registered stations: GET /geekykey/v1/stations",
    description: "Enabled stations only. The request has no body.",
  }),
  "heartbeats-request.schema.json": heartbeatsRequest.meta({
    title: "The heartbeat hand-off: POST /geekykey/v1/heartbeats",
    description: "Answered 204, with no body.",
  }),
  "meetings-request.schema.json": meetingsRequest.meta({
    title: "The meeting hand-off: POST /geekykey/v1/meetings",
    description: "Also: owner_id is never the same as user_id.",
  }),
  "meetings-answer.schema.json": meetingsAnswer.meta({
    title: "The answer to the meeting hand-off: POST /geekykey/v1/meetings",
  }),
  "used-login-links-request.schema.json": usedLoginLinksRequest.meta({
    title: "Marking a login link used: POST /geekykey/v1/used-login-links",
  }),
  "used-login-links-answer.schema.json": usedLoginLinksAnswer.meta({
    title: "The answer to marking a login link used: POST /geekykey/v1/used-login-links",
  }),
  "station-messages-request.schema.json": stationMessageRequest.meta({
    title: "A station message: POST /api/v1/station-messages on the GeekyKey Service",
    description: "Also: {s} at most once across a countdown's lines.",
  }),
  "station-messages-answer.schema.json": stationMessageAnswer.meta({
    title: "The answer to a station message: POST /api/v1/station-messages",
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
