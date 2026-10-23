// The Paris relay, which plays a station in Europe (BAC-63). The placement hint in
// wrangler.jsonc runs this Worker near Paris, and global_fetch_strictly_public
// sends its fetch out over the Internet, so Cloudflare answers it in Europe,
// as it answered Adam's hotspot on 21 Oct.
//
// edge-timing.mjs POSTs it one request as JSON, { url, method, headers, body },
// and it sends that request on and answers with when it sent it, how long the
// answer took, the status, the cf-ray and cf-placement headers, and the body.
// It only sends to the hosts below, so it can't be used to reach anything
// else.
const allowed = [
  "key-api.geekshacking.com",
  "event-api.geekshacking.com",
  "event-service-staging-468223998400.asia-southeast1.run.app",
];
const allowedSuffix = ".lee-jun-lei-adam.workers.dev";

export default {
  async fetch(request) {
    if (request.method !== "POST") return new Response("POST a request as JSON\n", { status: 405 });
    const { url, method = "GET", headers = {}, body } = await request.json();
    const host = new URL(url).hostname;
    if (!allowed.includes(host) && !host.endsWith(allowedSuffix)) {
      return new Response("host not allowed\n", { status: 403 });
    }
    // A Worker's clock only moves on I/O, so these two readings are the time
    // the fetch took.
    const sentAt = Date.now();
    const answer = await fetch(url, { method, headers: { ...headers, "cache-control": "no-store" }, body });
    const text = await answer.text();
    return Response.json({
      sent_at: new Date(sentAt).toISOString(),
      total: (Date.now() - sentAt) / 1000,
      http: answer.status,
      ray: answer.headers.get("cf-ray"),
      placement: answer.headers.get("cf-placement"),
      body: text,
    });
  },
};
