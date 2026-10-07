/**
 * A TCP proxy between a test and the TiDB from `mise run db:up`, which can
 * break the connections through it the way a network or a restarting server
 * does. The pool's tests use it to see what the pool does when a connection
 * dies.
 */
import { createConnection, createServer, type Socket } from "node:net";
import { LOCAL_ROOT } from "../scripts/local-tidb.ts";

/** The first byte of a COM_QUERY packet's payload, after its 4-byte header. */
const COM_QUERY = 0x03;

interface ProxiedConnection {
  client: Socket;
  tidb: Socket;
  /** TiDB has gone, but the client hasn't been told. */
  dead: boolean;
}

export interface TidbProxy {
  /** The geekykey login's URL for a database, through the proxy. */
  url(database: string): string;
  /** Connections the client still has open through the proxy. */
  openConnections(): number;
  /** Connections the client has made through the proxy, ever. */
  connectionsMade(): number;
  /**
   * Cuts TiDB off from every open connection without telling the client, as
   * a network that forgets an idle connection does. The client only finds out
   * when it next sends something, and gets a reset.
   */
  killOpenConnections(): void;
  /**
   * Passes the next query on to TiDB, which runs it, then breaks that
   * connection before TiDB's reply gets back.
   */
  loseNextReply(): void;
  close(): Promise<void>;
}

export async function startTidbProxy(): Promise<TidbProxy> {
  const connections = new Set<ProxiedConnection>();
  let connectionCount = 0;
  let losingNextReply = false;

  const server = createServer((client) => {
    connectionCount++;
    const tidb = createConnection({ host: LOCAL_ROOT.host, port: LOCAL_ROOT.port });
    const connection: ProxiedConnection = { client, tidb, dead: false };
    connections.add(connection);
    let losingThisReply = false;

    client.on("data", (chunk) => {
      if (connection.dead) {
        client.resetAndDestroy();
        return;
      }
      if (losingNextReply && chunk[4] === COM_QUERY) {
        losingNextReply = false;
        losingThisReply = true;
      }
      tidb.write(chunk);
    });
    tidb.on("data", (chunk) => {
      if (losingThisReply) {
        client.resetAndDestroy();
        tidb.destroy();
        return;
      }
      client.write(chunk);
    });

    client.on("close", () => {
      connections.delete(connection);
      tidb.destroy();
    });
    tidb.on("close", () => {
      if (!connection.dead) client.destroy();
    });
    // A reset is how a broken connection ends, so it's no failure here.
    client.on("error", () => {});
    tidb.on("error", () => {});
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };

  return {
    url: (database) => `mysql://geekykey:geekykey@127.0.0.1:${port}/${database}`,
    openConnections: () => connections.size,
    connectionsMade: () => connectionCount,
    killOpenConnections() {
      for (const connection of connections) {
        connection.dead = true;
        connection.tidb.destroy();
      }
    },
    loseNextReply() {
      losingNextReply = true;
    },
    async close() {
      for (const { client } of connections) client.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
