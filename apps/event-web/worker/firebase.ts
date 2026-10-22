/**
 * Firebase's sign-in pages, served from this host (agreement 7.2). The screens set
 * `authDomain` to this host, so the sign-in popup opens Firebase's handler here, and Google's
 * account chooser names this address rather than firebaseapp.com. These are the paths the
 * popup loads: the handler, its iframe and their scripts under /__/auth/, and the
 * init.json the handler asks for. Each one is also under `run_worker_first` in
 * wrangler.jsonc.
 */
export function isFirebasePath(pathname: string): boolean {
  return pathname.startsWith("/__/auth/") || pathname === "/__/firebase/init.json";
}

/**
 * Passes the request to Firebase at `firebase` and its answer back, unchanged both ways but
 * for the cookie. The cookie is our session, so it stays here. A redirect isn't followed. It
 * goes back to the browser, as Firebase sent it.
 */
export function toFirebase(firebase: string, request: Request): Promise<Response> {
  const { pathname, search } = new URL(request.url);
  const forwarded = new Request(firebase + pathname + search, request);
  forwarded.headers.delete("Cookie");
  return fetch(forwarded, { redirect: "manual" });
}
