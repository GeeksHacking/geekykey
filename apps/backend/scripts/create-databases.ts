/**
 * Creates the two local databases in the TiDB that the root compose.yaml
 * starts: geekykey_dev for `wrangler dev`, and geekykey_test for the tests.
 * They are kept apart so that running the tests never wipes the data you
 * develop with.
 *
 * It also creates the login the backend uses for both. Hyperdrive won't
 * connect without a password, and TiDB's root login has none. The password
 * isn't a secret: TiDB only listens on this machine, and holds only dev data.
 *
 * `mise run db:up` and `db:reset` run this with Node. It connects straight to
 * TiDB with mysql2, not through Hyperdrive, and only ever to this machine.
 */
import { createConnection } from "mysql2/promise";

const DATABASES = ["geekykey_dev", "geekykey_test"];

const connection = await createConnection({
  host: "127.0.0.1",
  port: 4000,
  user: "root",
});
try {
  // `%`, not `localhost`: Docker hands TiDB the connection from its own
  // network, not from this machine's.
  await connection.query(
    "CREATE USER IF NOT EXISTS 'geekykey'@'%' IDENTIFIED BY 'geekykey'",
  );
  for (const name of DATABASES) {
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${name}`);
    await connection.query(`GRANT ALL PRIVILEGES ON ${name}.* TO 'geekykey'@'%'`);
    console.log(`${name} is ready`);
  }
} finally {
  await connection.end();
}
