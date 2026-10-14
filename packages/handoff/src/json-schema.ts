import { z } from "zod";
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
