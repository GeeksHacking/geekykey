/**
 * The build's hashed files, under /assets/. Vite names each one after a hash of its contents,
 * so an address never comes to mean different contents, and a browser may keep its copy
 * without asking again (FRO-162).
 *
 * They come through the Worker because static assets answer any path with no file with
 * index.html, for the router, and can't tell these paths apart. Kept for a year, that page
 * would stand in for a script the browser asked for a moment before a deploy reached it,
 * and the screens would stay broken in that browser. So a path with no file is a 404 here,
 * and nothing keeps it.
 */

const HASHED_FILES = "/assets/";

/** A year, the longest a browser is asked to keep anything. */
const KEEP = "public, max-age=31536000, immutable";

export function isHashedFilePath(pathname: string): boolean {
  return pathname.startsWith(HASHED_FILES);
}

export async function hashedFile(assets: Fetcher, request: Request): Promise<Response> {
  // Without the browser's "only if it changed" headers, so the answer is always the file or
  // the page, never a 304 that says which of the two the browser already holds.
  const whole = new Request(request);
  whole.headers.delete("If-None-Match");
  whole.headers.delete("If-Modified-Since");

  const answer = await assets.fetch(whole);
  if (isPage(answer)) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  // A part of a file (206) and anything unexpected keep the headers they came with.
  if (answer.status !== 200) return answer;
  const kept = new Response(answer.body, answer);
  kept.headers.set("Cache-Control", KEEP);
  return kept;
}

/** The build puts no page under /assets/, so a page there is index.html standing in. */
function isPage(answer: Response): boolean {
  return (answer.headers.get("Content-Type") ?? "").startsWith("text/html");
}
