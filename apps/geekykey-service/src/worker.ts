/**
 * The GeekyKey Service as a Cloudflare Worker: `wrangler dev` locally, and
 * `geekykey-service` at key-api.geekshacking.com in production.
 *
 * It reads its settings once, here, as the Worker starts: from wrangler.jsonc
 * and the Worker's secrets, or dev.env locally. A missing or malformed required
 * setting throws ConfigError, naming the setting but never its value. The
 * optional TOKEN_WRITER_KEY_HASH disables uploads only.
 */
import { env } from "cloudflare:workers";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { stationConnections } from "./station-sockets.ts";

export { StationSockets } from "./station-sockets.ts";

export default createApp(loadConfig(env), {
  // Wrapped, so `fetch` is called as itself rather than as a method of something else.
  send: (url, init) => fetch(url, init),
  stationSockets: stationConnections(env.STATION_SOCKETS),
  stationLimit: env.STATION_LIMIT,
  userLimit: env.USER_LIMIT,
  tokenLimit: env.TOKEN_LIMIT,
  writerLimit: env.TOKEN_WRITER_LIMIT,
});
