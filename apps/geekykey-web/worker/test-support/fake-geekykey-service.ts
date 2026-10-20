/**
 * A stand-in for geekykey-service, which the Worker's tests put behind its service binding.
 * It runs on workerd, beside the Worker. Two paths answer as the login and a signed-out
 * call would; any other path answers with what it received, for the test to check.
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/auth/login") {
      return new Response('{"ok":true}', {
        status: 302,
        headers: [
          ["Location", "https://accounts.example.com/login?next=%2F"],
          ["Set-Cookie", "gk_session=new; Path=/; HttpOnly; SameSite=Lax"],
          ["Set-Cookie", "other=1; Path=/"],
          ["Cache-Control", "no-store"],
        ],
      });
    }
    if (url.pathname === "/api/v1/me") {
      return Response.json(
        { error: "unauthenticated" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      {
        method: request.method,
        path: url.pathname + url.search,
        body: await request.text(),
        cookie: request.headers.get("Cookie"),
        contentType: request.headers.get("Content-Type"),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
} satisfies ExportedHandler;
