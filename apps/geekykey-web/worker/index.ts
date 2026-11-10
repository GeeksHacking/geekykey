/**
 * The GeekyKey screens' Worker. Static assets serve the screens; only /api/*, /auth/*,
 * Firebase's sign-in pages and the build's hashed files under /assets/* reach this code
 * (`run_worker_first` in wrangler.jsonc). It passes Firebase's pages to Firebase
 * (firebase.ts), serves the hashed files to be kept (hashed-files.ts), and passes the rest to
 * geekykey-service through the service binding (forward.ts).
 *
 * It reads FIREBASE_AUTH_URL once, here, as the Worker starts. A wrong one throws
 * ConfigError, which stops it starting.
 */
import { env } from "cloudflare:workers";
import { firebaseAuthUrl } from "./config.ts";
import { isFirebasePath, toFirebase } from "./firebase.ts";
import { forward } from "./forward.ts";
import { hashedFile, isHashedFilePath } from "./hashed-files.ts";

const firebase = firebaseAuthUrl(env.FIREBASE_AUTH_URL);

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (isFirebasePath(pathname)) return toFirebase(firebase, request);
    if (isHashedFilePath(pathname)) return hashedFile(env.ASSETS, request);
    return forward(env.GEEKYKEY_SERVICE, request);
  },
} satisfies ExportedHandler<Env>;
