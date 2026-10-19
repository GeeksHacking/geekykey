import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import type { output, ZodSafeParseResult, ZodType } from "zod";

/**
 * JSON body validation that fails with the agreement's error shape:
 * `{ error: "validation_failed", issues }`, where `issues` is Zod's own format.
 *
 * Every 400 in the API comes from here so they all look alike, which is what
 * the screens rely on to put each message under the right field.
 *
 * `quick`, when given, is a plain check tried before `schema`, for a body big
 * enough that Zod's own check costs too much CPU (see quickTapBody in
 * station-routes.ts). It returns what `schema` would, or undefined for
 * anything it isn't sure of, which `schema` then checks as usual. So a body
 * that fails still gets Zod's issues, and `schema` stays the rule.
 */
export function jsonBody<T extends ZodType>(
  schema: T,
  quick?: (value: unknown) => output<T> | undefined,
) {
  return zValidator(
    "json",
    schema,
    failValidation,
    quick && {
      validationFunction: async (schema, value) => {
        const data = quick(value);
        const result: ZodSafeParseResult<output<T>> =
          data === undefined ? await schema.safeParseAsync(value) : { success: true, data };
        // zod-validator types the result by a condition on T, which TypeScript
        // can't settle for a T that's still generic. This is the Zod 4 side of it.
        return result as never;
      },
    },
  );
}

function failValidation(
  result: { success: true } | { success: false; error: { issues: unknown } },
  c: Context,
) {
  return result.success
    ? undefined
    : c.json({ error: "validation_failed", issues: result.error.issues }, 400);
}
