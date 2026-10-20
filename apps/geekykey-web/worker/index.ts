/**
 * The GeekyKey screens' Worker. Static assets serve the screens; only /api/* and /auth/*
 * reach this code (`run_worker_first` in wrangler.jsonc), and it passes each one to
 * geekykey-service through the service binding, unchanged both ways.
 */
export default {
  async fetch(request, env) {
    // The same request, cookie and body included.
    // A redirect isn't followed. It goes back to the browser with its Set-Cookie, as
    // geekykey-service sent it, for the Portal's login after the showcase. Every answer keeps
    // its Cache-Control.
    return env.GEEKYKEY_SERVICE.fetch(request, { redirect: "manual" });
  },
} satisfies ExportedHandler<Env>;
