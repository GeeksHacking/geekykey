import { zValidator } from "@hono/zod-validator";
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
  return zValidator(
    "json",
    schema,
    (result, c) =>
      result.success ? undefined : c.json(
        { error: "validation_failed", issues: result.error.issues },
        400,
      ),
  );
}
