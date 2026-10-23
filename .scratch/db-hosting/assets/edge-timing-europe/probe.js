// Makes two calls to staging's Cloud Run, one after the other, as the
// GeekyKey Service's Worker does for a tap, and answers with how long each
// took (BAC-63). Deployed twice on Adam's own account, the same code with and
// without the placement hint: probe-local.jsonc and probe-placed.jsonc.
const target = "https://event-service-staging-468223998400.asia-southeast1.run.app/api/health";

export default {
  async fetch() {
    const calls = [];
    for (let i = 0; i < 2; i++) {
      const sentAt = Date.now();
      const answer = await fetch(`${target}?n=${crypto.randomUUID()}`, { headers: { "cache-control": "no-store" } });
      await answer.arrayBuffer();
      calls.push({ status: answer.status, ms: Date.now() - sentAt });
    }
    return Response.json({ calls });
  },
};
