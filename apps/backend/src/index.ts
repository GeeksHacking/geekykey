import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createDb, ensureLocalDbDir } from "./db/client.ts";
import { migrate } from "./db/migrate.ts";

const config = loadConfig();
await ensureLocalDbDir(config.databaseUrl);
const db = createDb(config.databaseUrl, config.databaseAuthToken);
await migrate(db);

const app = createApp({ db, config });
Deno.serve({ port: config.port }, app.fetch);
