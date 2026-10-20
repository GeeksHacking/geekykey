/** A service binding, as far as forwarding needs one. */
export interface Service {
  fetch(request: Request, init: RequestInit): Promise<Response>;
}

/**
 * Passes a request to the service and its answer back, unchanged both ways: the same
 * request, cookie and body included. A redirect isn't followed. It goes back to the browser
 * with its Set-Cookie, as the service sent it, for the Portal's login after the showcase.
 * Every answer keeps its Cache-Control.
 */
export async function forward(service: Service, request: Request): Promise<Response> {
  try {
    return await service.fetch(request, { redirect: "manual" });
  } catch (error) {
    // No answer at all, as when geekykey-service throws or can't start. Without this the
    // browser gets Cloudflare's own error page, which the screens can't read.
    console.error("geekykey-service didn't answer", error);
    return Response.json(
      { error: "service_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
