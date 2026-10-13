// BAC-20's throwaway check: can a Worker check a Firebase ID token, and set its
// own signed cookie, within the free plan's 10 ms of CPU? It uses the same
// function the Event Service will, so the measurement is of the real check.
//
//   GET  /                  the sign-in page (localhost only: Firebase allows no other host here)
//   POST /auth/firebase     { "id_token": "..." } -> 204 and a signed cookie, or 401
//   POST /auth/firebase?keys=fresh   the same, fetching Google's keys for this request alone
//   GET  /me                who the cookie says you are
//   GET  /noop              204, the baseline: a request that does nothing

import {
  googleSigningKeys,
  verifyFirebaseIdToken,
} from "../../../../apps/backend/src/lib/firebase-id-token.ts";
import page from "./page.html";

interface Env {
  FIREBASE_PROJECT_ID: string;
}

const COOKIE = "gk_session";
const MAX_AGE_SECONDS = 12 * 60 * 60;

// One key set per isolate, as the real service would keep one per process.
const cachedKeys = googleSigningKeys();

// A throwaway Worker needs no stable secret: each isolate makes its own, so a
// cookie works only on the isolate that set it, which is enough to show it.
let secret: Uint8Array | undefined;
function sessionSecret(): Uint8Array {
  // Workers forbid randomness at the top level, so it's made on first use.
  secret ??= crypto.getRandomValues(new Uint8Array(32));
  return secret;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/noop") return new Response(null, { status: 204 });

    if (request.method === "POST" && url.pathname === "/auth/firebase") {
      const body = (await request.json().catch(() => null)) as { id_token?: unknown } | null;
      if (typeof body?.id_token !== "string") return json({ error: "validation_failed" }, 400);

      const keys = url.searchParams.get("keys") === "fresh" ? googleSigningKeys() : cachedKeys;
      let identity;
      try {
        identity = await verifyFirebaseIdToken(body.id_token, {
          projectId: env.FIREBASE_PROJECT_ID,
          keys,
        });
      } catch {
        return json({ error: "login_unavailable" }, 503);
      }
      if (!identity) return json({ error: "invalid_token" }, 401);

      // Signed as hono's setSignedCookie does, which the real route will use.
      const value = `${Date.now() + MAX_AGE_SECONDS * 1000}:${identity.userId}`;
      const cookie = `${value}.${await hmac(value)}`;
      const secure = url.protocol === "https:" ? "; Secure" : "";
      return new Response(null, {
        status: 204,
        headers: {
          "set-cookie": `${COOKIE}=${encodeURIComponent(cookie)}; Max-Age=${MAX_AGE_SECONDS}; Path=/; HttpOnly; SameSite=Lax${secure}`,
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/me") {
      const raw = readCookie(request, COOKIE);
      const dot = raw?.lastIndexOf(".") ?? -1;
      if (!raw || dot < 0) return json({ error: "unauthenticated" }, 401);
      const value = raw.slice(0, dot);
      if ((await hmac(value)) !== raw.slice(dot + 1)) return json({ error: "unauthenticated" }, 401);
      const separator = value.indexOf(":");
      return json({ user_id: value.slice(separator + 1) }, 200);
    }

    return json({ error: "not_found" }, 404);
  },
};

async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    sessionSecret(),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}
