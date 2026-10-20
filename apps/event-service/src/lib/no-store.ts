import type { MiddlewareHandler } from "hono";

/**
 * Tells browsers, and anything between them and us, never to keep a copy of
 * the response. Every answer is about one person or station at one moment, so
 * a kept copy would show old data, or someone else's.
 *
 * Set after the handler runs, so errors and 404s carry it too.
 */
export const noStore: MiddlewareHandler = async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
};
