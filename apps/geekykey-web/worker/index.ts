/**
 * The GeekyKey screens' Worker. Static assets serve the screens; only /api/*, /auth/* and
 * Firebase's sign-in pages reach this code (`run_worker_first` in wrangler.jsonc). It passes
 * Firebase's pages to Firebase (firebase.ts), and the rest to geekykey-service through the
 * service binding (forward.ts).
 *
 * It reads FIREBASE_AUTH_URL once, here, as the Worker starts. A wrong one throws
 * ConfigError, which stops it starting.
 */
import { env } from "cloudflare:workers";
import { firebaseAuthUrl } from "./config.ts";
import { isFirebasePath, toFirebase } from "./firebase.ts";
import { forward } from "./forward.ts";

const firebase = firebaseAuthUrl(env.FIREBASE_AUTH_URL);

export default {
  async fetch(request) {
    if (isFirebasePath(new URL(request.url).pathname)) return toFirebase(firebase, request);
    return forward(env.GEEKYKEY_SERVICE, request);
  },
} satisfies ExportedHandler<Env>;
