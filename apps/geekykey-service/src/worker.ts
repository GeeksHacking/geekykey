/**
 * The GeekyKey Service as a Cloudflare Worker: `wrangler dev` locally, and
 * `geekykey-service` at key-api.geekshacking.com in production.
 *
 * It reads its settings once, here, as the Worker starts: from wrangler.jsonc
 * and the Worker's secrets, or dev.env locally. A missing or malformed one
 * throws ConfigError, which stops it starting, and names the setting but
 * never its value.
 */
import { env } from "cloudflare:workers";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

export default createApp(loadConfig(env), {
  // Wrapped, so `fetch` is called as itself rather than as a method of something else.
  send: (url, init) => fetch(url, init),
  stationLimit: env.STATION_LIMIT,
  userLimit: env.USER_LIMIT,
  tokenLimit: env.TOKEN_LIMIT,
});
