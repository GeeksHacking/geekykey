import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import type { ZodType } from "zod";

/**
 * JSON body validation that fails with the agreement's error shape:
 * `{ error: "validation_failed", issues }`, where `issues` is Zod's own format.
 *
 * Every 400 in the API comes from here so they all look alike, which is what
 * the frontend's form-errors.ts relies on to put each message under the right
 * field.
 */
export function jsonBody<T extends ZodType>(schema: T) {
  return zValidator("json", schema, failValidation);
}

/** The same check, for a route's path parameters, such as a token's UID. */
export function pathParams<T extends ZodType>(schema: T) {
  return zValidator("param", schema, failValidation);
}

function failValidation(
  result: { success: true } | { success: false; error: { issues: unknown } },
  c: Context,
) {
  return result.success
    ? undefined
    : c.json({ error: "validation_failed", issues: result.error.issues }, 400);
}
