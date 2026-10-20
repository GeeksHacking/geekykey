/**
 * The GeekyKey screens' Worker. Static assets serve the screens; only /api/* and /auth/*
 * reach this code (`run_worker_first` in wrangler.jsonc), and it passes each one to
 * geekykey-service through the service binding (forward.ts).
 */
import { forward } from "./forward.ts";

export default {
  async fetch(request, env) {
    return forward(env.GEEKYKEY_SERVICE, request);
  },
} satisfies ExportedHandler<Env>;
