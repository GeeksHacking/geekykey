/**
 * Reads /api/v1/me from a running Event Service and checks it against the schema the screens use.
 * A field the screens require and the service doesn't send makes every signed-in screen fail, and
 * the tests can't see what is deployed. Run from apps/event-web:
 *
 *   EVENT_SESSION=<cookie value> pnpm check:me https://event-api.geekshacking.com
 *
 * EVENT_SESSION is the `event_session` cookie, from the browser's developer tools once signed in.
 * It is a login, so keep it out of chat and shell history. This sends one GET and changes nothing.
 * It prints field names and counts, and no values, so its output is safe to paste.
 */
import { createServer } from "vite";

interface MeSchema {
  safeParse(
    input: unknown,
  ):
    | { success: true; data: Record<string, unknown> & { connections: unknown[] } }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}

const base = process.argv[2];
const session = process.env.EVENT_SESSION;
if (!base || !session) {
  console.error("Usage: EVENT_SESSION=<cookie value> pnpm check:me <service address>");
  process.exit(2);
}

const url = new URL("/api/v1/me", base);
const response = await fetch(url, { headers: { cookie: `event_session=${session}` } });
if (!response.ok) {
  console.error(`${url} answered ${response.status}. A 401 means the cookie has expired.`);
  process.exit(1);
}
const body: unknown = await response.json();

// The schema's file imports through the `@/` alias, which only Vite understands.
const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});
try {
  const { meResponseSchema } = (await vite.ssrLoadModule("/src/api/schemas.ts")) as {
    meResponseSchema: MeSchema;
  };
  const result = meResponseSchema.safeParse(body);
  if (!result.success) {
    console.error(`${url} doesn't match the screens' schema, so they would refuse it:\n`);
    for (const { path, message } of result.error.issues) {
      console.error(`  ${path.join(".") || "(top level)"}: ${message}`);
    }
    process.exitCode = 1;
  } else {
    const { questions, connections } = result.data;
    const questionCount = Array.isArray(questions) ? questions.length : "none";
    console.log(`${url} matches. Questions: ${questionCount}. Connections: ${connections.length}.`);
  }
} finally {
  await vite.close();
}
