import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";

/** A request as the fake Firebase received it. */
export interface Received {
  method: string;
  /** The path and query, such as `/__/auth/handler?apiKey=k`. */
  path: string;
  headers: IncomingHttpHeaders;
  body: string;
}

/** What the fake answers with. Headers are pairs, so one name can come twice, as Set-Cookie does. */
export interface Answer {
  status: number;
  headers: [string, string][];
  body: string;
}

export interface FakeFirebase {
  /** Where it listens, such as `http://127.0.0.1:53012`. */
  url: string;
  /** Every request since the last reset, oldest first. */
  received: Received[];
  /** The answer to every request from now until the next reset. */
  answerWith(answer: Answer): void;
  /** Forgets what it received, and goes back to answering 200 with `{}`. */
  reset(): void;
  close(): Promise<void>;
}

const DEFAULT_ANSWER: Answer = {
  status: 200,
  headers: [
    ["Content-Type", "application/json"],
    ["Cache-Control", "no-store"],
  ],
  body: "{}",
};

/** A stand-in for Firebase on this machine, on a free port. */
export async function startFakeFirebase(): Promise<FakeFirebase> {
  const received: Received[] = [];
  let answer = DEFAULT_ANSWER;

  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    received.push({
      method: req.method!,
      path: req.url!,
      headers: req.headers,
      body: Buffer.concat(chunks).toString("utf8"),
    });
    res.writeHead(answer.status, answer.headers.flat());
    res.end(answer.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    received,
    answerWith(next) {
      answer = next;
    },
    reset() {
      received.length = 0;
      answer = DEFAULT_ANSWER;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
