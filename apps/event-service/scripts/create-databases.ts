/**
 * Creates the two local databases (LOCAL_DATABASES) in the TiDB that the root
 * compose.yaml starts.
 *
 * It also creates the login the backend uses for both, so that, as in
 * production, the backend never connects as TiDB's root login. The password
 * isn't a secret: TiDB only listens on this machine, and holds only dev data.
 *
 * `mise run db:up` and `db:reset` run this with Node. It connects straight to
 * TiDB with mysql2, and only ever to this machine.
 */
import { createConnection } from "mysql2/promise";
import { LOCAL_DATABASES, LOCAL_ROOT } from "./local-tidb.ts";

const connection = await createConnection(LOCAL_ROOT);
try {
  // `%`, not `localhost`: Docker hands TiDB the connection from its own
  // network, not from this machine's.
  await connection.query("CREATE USER IF NOT EXISTS 'geekykey'@'%' IDENTIFIED BY 'geekykey'");
  for (const name of LOCAL_DATABASES) {
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${name}`);
    await connection.query(`GRANT ALL PRIVILEGES ON ${name}.* TO 'geekykey'@'%'`);
    console.log(`${name} is ready`);
  }
} finally {
  await connection.end();
}
