/**
 * The Event screens' Worker. Static assets serve the screens; only /api/*, /auth/*,
 * Firebase's sign-in pages and the build's hashed files under /assets/* reach this code
 * (`run_worker_first` in wrangler.jsonc). It passes Firebase's pages to Firebase
 * (firebase.ts), serves the hashed files to be kept (hashed-files.ts), and passes the rest to
 * the Event Service, unchanged both ways.
 *
 * It reads EVENT_API_URL and FIREBASE_AUTH_URL once, here, as the Worker starts. A wrong one
 * throws ConfigError, which stops it starting.
 */
import { env } from "cloudflare:workers";
import { eventApiUrl, firebaseAuthUrl } from "./config.ts";
import { isFirebasePath, toFirebase } from "./firebase.ts";
import { hashedFile, isHashedFilePath } from "./hashed-files.ts";

const eventService = eventApiUrl(env.EVENT_API_URL);
const firebase = firebaseAuthUrl(env.FIREBASE_AUTH_URL);

export default {
  async fetch(request) {
    const { pathname, search } = new URL(request.url);
    if (isFirebasePath(pathname)) return toFirebase(firebase, request);
    if (isHashedFilePath(pathname)) return hashedFile(env.ASSETS, request);
    // The same method, headers, cookie and body, at the Event Service's address.
    // A redirect isn't followed. It goes back to the browser with its Set-Cookie, as
    // the Event Service sent it, for the Portal's login after the showcase. Every answer keeps
    // its Cache-Control.
    try {
      return await fetch(new Request(eventService + pathname + search, request), {
        redirect: "manual",
      });
    } catch (error) {
      // No answer at all, as when the Event Service is down. Without this the browser gets
      // Cloudflare's own error page, which the screens can't read.
      console.error("The Event Service didn't answer", error);
      return serviceUnavailable();
    }
  },
} satisfies ExportedHandler<Env>;

/** The agreement's answer when the screens' service doesn't answer (section 2's errors). */
function serviceUnavailable(): Response {
  return Response.json(
    { error: "service_unavailable" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
