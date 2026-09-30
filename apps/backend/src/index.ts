import { createApp } from "./app.ts";
import { loadConfig, loadDenoServerConfig } from "./config.ts";
import { createDb, ensureLocalDbDir } from "./db/client.ts";
import { migrate } from "./db/migrate.ts";

const env = Deno.env.toObject();
const config = loadConfig(env);
const serverConfig = loadDenoServerConfig(env);
await ensureLocalDbDir(serverConfig.databaseUrl);
const db = createDb(serverConfig.databaseUrl, serverConfig.databaseAuthToken);
await migrate(db);

const app = createApp({ db, config });
Deno.serve({ port: serverConfig.port }, app.fetch);
