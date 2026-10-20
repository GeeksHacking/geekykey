/**
 * The Event screens' Worker. Static assets serve the screens; only /api/* and /auth/*
 * reach this code (`run_worker_first` in wrangler.jsonc), and it passes each one to the
 * Event Service, unchanged both ways.
 *
 * It reads EVENT_API_URL once, here, as the Worker starts. A wrong one throws ConfigError,
 * which stops it starting.
 */
import { env } from "cloudflare:workers";
import { eventApiUrl } from "./config.ts";

const eventService = eventApiUrl(env.EVENT_API_URL);

export default {
  async fetch(request) {
    const { pathname, search } = new URL(request.url);
    // The same method, headers, cookie and body, at the Event Service's address.
    // A redirect isn't followed. It goes back to the browser with its Set-Cookie, as
    // the Event Service sent it, for the Portal's login after the showcase. Every answer keeps
    // its Cache-Control.
    return fetch(new Request(eventService + pathname + search, request), {
      redirect: "manual",
    });
  },
} satisfies ExportedHandler<Env>;
