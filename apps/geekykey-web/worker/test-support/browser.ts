import { request, type IncomingMessage } from "node:http";

/**
 * How a browser sends a request: a page load (`navigate`), such as opening the CSV export at
 * /api/v1/admin/export.csv, or a call from the screens' code (`same-origin`). They differ,
 * because for a path with no file, single-page-app mode answers a page load with index.html,
 * and without `run_worker_first` passes any other request to the Worker. So the tests send
 * both, to show that only /api, /auth and Firebase's sign-in pages reach the Worker, and
 * every other path gets the screens.
 */
export type FetchMode = "navigate" | "same-origin";

export interface BrowserRequest {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Sends a request to the Worker at `base` as a browser would, and never follows a redirect.
 * Sent with node:http, because Node's fetch() replaces Sec-Fetch-Mode with its own.
 */
export async function browser(
  base: URL,
  mode: FetchMode,
  path: string,
  init: BrowserRequest = {},
): Promise<Response> {
  const headers: Record<string, string> = { ...init.headers, "Sec-Fetch-Mode": mode };
  if (mode === "navigate") headers.Accept = "text/html";
  const res = await new Promise<IncomingMessage>((resolve, reject) => {
    request(new URL(path, base), { method: init.method ?? "GET", headers }, resolve)
      .on("error", reject)
      .end(init.body);
  });
  const chunks: Buffer[] = [];
  for await (const chunk of res) chunks.push(chunk as Buffer);
  // Headers one by one, so a name that comes twice, as Set-Cookie does, keeps both.
  const answer = new Headers();
  for (let i = 0; i < res.rawHeaders.length; i += 2) {
    answer.append(res.rawHeaders[i]!, res.rawHeaders[i + 1]!);
  }
  const body = res.statusCode === 204 ? null : Buffer.concat(chunks);
  return new Response(body, { status: res.statusCode, headers: answer });
}
