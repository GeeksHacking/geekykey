import { type Env as HonoEnv, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { BlankEnv } from "hono/types";
import { noStore } from "./middleware/no-store.ts";

/**
 * The parts of the backend that answer the same wherever it runs: no /api or
 * /auth answer is ever cached, errors use the agreement's JSON envelope, and
 * `/` and `/api/health` say it's up. src/app.ts starts from this.
 */
export function createBaseApp<E extends HonoEnv = BlankEnv>() {
  const app = new Hono<E>();

  app.use("/api/*", noStore);
  app.use("/auth/*", noStore);

  // Hono's default is a plain-text body; the agreement puts every error in the JSON envelope.
  app.notFound((c) => c.json({ error: "not_found" }, 404));

  app.onError((err, c) => {
    // Hono raises a 400 HTTPException when a body will not parse as JSON. That is
    // the client's fault, so it must not surface as 5xx: the firmware contract
    // retries on 5xx, and a station that truncated its buffer would resend the
    // same unparseable payload forever. Re-shaped rather than passed through,
    // because HTTPException's own response body is plain text.
    if (err instanceof HTTPException && err.status === 400) {
      return c.json(
        {
          error: "validation_failed",
          issues: [{ path: [], message: err.message }],
        },
        400,
      );
    }
    console.error(`${c.req.method} ${c.req.path} failed:`, err);
    return c.json({ error: "internal_error" }, 500);
  });

  app.get("/", (c) => c.text("App is running"));

  app.get("/api/health", (c) =>
    c.json({
      status: "ok",
      service: "geekykey-backend",
      timestamp: new Date().toISOString(),
    }),
  );

  return app;
}
