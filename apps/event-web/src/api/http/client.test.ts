import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, AUTH_ERROR_EVENT, NetworkError } from "@/api/errors";
import { createHttpClient } from "@/api/http/client";
import type { ErrorCode } from "@/api/types";
import { makeMe } from "@/test/make-me";

const me = makeMe();

let fetchMock: ReturnType<typeof vi.fn>;

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function apiError(promise: Promise<unknown>) {
  return (await promise.catch((error: unknown) => error)) as ApiError;
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the groups' calls (draft for agreement 0.14)", () => {
  const myGroup = { status: "waiting", allocation_started: false, group: null };
  const group = {
    id: "g1",
    name: "Mixer A",
    tags: [],
    location: null,
    capacity: null,
    members: [],
  };
  const board = {
    allocation_started_at: null,
    connect_across: "token_kinds",
    joined_count: 0,
    groups: [group],
    waiting: [],
  };

  it("reads and joins at /api/v1/me/group", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(response(myGroup)));
    const api = createHttpClient();

    await expect(api.myGroup()).resolves.toEqual(myGroup);
    await expect(api.joinGroups()).resolves.toEqual(myGroup);

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/me/group", expect.anything());
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/me/group",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("resets, and answers with the board", async () => {
    const api = createHttpClient();

    fetchMock.mockResolvedValueOnce(response(board));
    await expect(api.resetGroups()).resolves.toEqual(board);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/admin/groups/reset",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("reads the board, creates a group by its name, and allocates", async () => {
    const api = createHttpClient();

    fetchMock.mockResolvedValueOnce(response(board));
    await expect(api.groupBoard()).resolves.toEqual(board);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/v1/admin/groups", expect.anything());

    fetchMock.mockResolvedValueOnce(response(group, 201));
    await expect(api.createGroup({ name: "Mixer A" })).resolves.toEqual(group);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/admin/groups",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Mixer A" }) }),
    );

    fetchMock.mockResolvedValueOnce(response(board));
    await expect(api.allocateGroups()).resolves.toEqual(board);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/admin/groups/allocate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("splits with the form's people per group and locations, and keeps its refusals", async () => {
    const api = createHttpClient();
    const input = { people_per_group: 3, locations: ["Hall", null] };

    fetchMock.mockResolvedValueOnce(response(board, 201));
    await expect(api.splitGroups(input)).resolves.toEqual(board);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/admin/groups/split",
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
    );

    fetchMock.mockResolvedValueOnce(response({ error: "groups_exist" }, 409));
    expect((await apiError(api.splitGroups(input))).code).toBe("groups_exist");

    fetchMock.mockResolvedValueOnce(response({ error: "too_few_participants", needed: 1 }, 409));
    expect((await apiError(api.splitGroups(input))).needed).toBe(1);
  });

  it("fetches the groups CSV as a file", async () => {
    const api = createHttpClient();

    fetchMock.mockResolvedValueOnce(new Response("user_id,display_name\r\n"));
    await expect((await api.exportGroupsCsv()).text()).resolves.toBe("user_id,display_name\r\n");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/admin/groups/export.csv",
      expect.anything(),
    );
  });

  it("keeps name_taken from the answer, and refuses an answer in the wrong shape", async () => {
    const api = createHttpClient();

    fetchMock.mockResolvedValueOnce(response({ error: "name_taken" }, 409));
    expect((await apiError(api.createGroup({ name: "Mixer A" }))).code).toBe("name_taken");

    fetchMock.mockResolvedValueOnce(response({ status: "placed" }));
    await expect(api.myGroup()).rejects.toBeInstanceOf(NetworkError);
  });

  it("keeps Allocate's refusals, and how many more too_few_participants needs", async () => {
    const api = createHttpClient();

    fetchMock.mockResolvedValueOnce(response({ error: "no_groups" }, 409));
    const noGroups = await apiError(api.allocateGroups());
    expect(noGroups.code).toBe("no_groups");
    expect(noGroups.needed).toBeNull();

    fetchMock.mockResolvedValueOnce(response({ error: "too_few_participants", needed: 2 }, 409));
    const tooFew = await apiError(api.allocateGroups());
    expect(tooFew.code).toBe("too_few_participants");
    expect(tooFew.needed).toBe(2);
  });

  it("edits and deletes a group by its ID", async () => {
    const api = createHttpClient();
    const fields = { name: "Mixer B", tags: ["Year 1"], location: "Hall", capacity: 4 };

    fetchMock.mockResolvedValueOnce(response({ ...group, ...fields }));
    await expect(api.updateGroup("g/1", fields)).resolves.toEqual({ ...group, ...fields });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/admin/groups/g%2F1",
      expect.objectContaining({ method: "PUT", body: JSON.stringify(fields) }),
    );

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api.deleteGroup("g/1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/admin/groups/g%2F1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("puts someone in a group or back to waiting, and removes them", async () => {
    const api = createHttpClient();

    fetchMock.mockResolvedValueOnce(response(board));
    await expect(api.placeGroupMember("user:1", "g1")).resolves.toEqual(board);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/admin/groups/members/user%3A1",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ group_id: "g1" }) }),
    );

    fetchMock.mockResolvedValueOnce(response(board));
    await api.placeGroupMember("user:1", null);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/admin/groups/members/user%3A1",
      expect.objectContaining({ body: JSON.stringify({ group_id: null }) }),
    );

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api.removeGroupMember("user:1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/admin/groups/members/user%3A1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("sets what connections need at /api/v1/admin/connections/rule (BAC-140)", async () => {
    const api = createHttpClient();
    fetchMock.mockResolvedValueOnce(response({ connect_across: "groups" }));

    await expect(api.setConnectionRule({ connect_across: "groups" })).resolves.toEqual({
      connect_across: "groups",
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/admin/connections/rule",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ connect_across: "groups" }),
      }),
    );
  });

  it("sends a group's capacity", async () => {
    const api = createHttpClient();
    const group = {
      id: "g_1",
      name: "Small room",
      tags: [],
      location: null,
      capacity: 6,
      members: [],
    };

    fetchMock.mockResolvedValueOnce(response(group, 201));
    await expect(api.createGroup({ name: "Small room", capacity: 6 })).resolves.toEqual(group);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/admin/groups",
      expect.objectContaining({ body: JSON.stringify({ name: "Small room", capacity: 6 }) }),
    );
  });
});

describe("HTTP client transport", () => {
  it("sends cookie credentials and parses a successful JSON response", async () => {
    fetchMock.mockResolvedValue(response(me));
    const api = createHttpClient();

    await expect(api.me()).resolves.toEqual(me);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/me",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("uses the configured base URL for every request", async () => {
    fetchMock.mockResolvedValue(response(me));
    const api = createHttpClient({ baseUrl: "https://example.test/" });

    await api.me();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/api/v1/me",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("does not read a 204 response body", async () => {
    const noBody = {
      ok: true,
      status: 204,
      json: vi.fn().mockRejectedValue(new Error("no body")),
    } as unknown as Response;
    fetchMock.mockResolvedValue(noBody);

    await expect(createHttpClient().logout()).resolves.toBeUndefined();
    expect(noBody.json).not.toHaveBeenCalled();
  });

  it("maps structured validation errors and keeps their field paths", async () => {
    fetchMock.mockResolvedValue(
      response(
        {
          error: "validation_failed",
          issues: [{ path: ["user_id"], message: "user_id is invalid" }],
        },
        400,
      ),
    );

    const error = await apiError(
      createHttpClient().createFallbackTap({ station_id: "station-1", user_id: "" }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.code).toBe("validation_failed");
    expect(error.issues).toEqual([{ path: ["user_id"], message: "user_id is invalid" }]);
  });

  it.each([
    [400, "validation_failed"],
    [401, "unauthenticated"],
    [403, "forbidden"],
    [404, "not_found"],
    [409, "internal_error"],
    [429, "rate_limited"],
    [503, "event_service_unavailable"],
    [500, "internal_error"],
    [418, "internal_error"],
  ])("maps status %i to %s when the error body is unusable", async (status, code) => {
    fetchMock.mockResolvedValue(new Response("<html>proxy error</html>", { status }));

    const error = await apiError(createHttpClient().me());
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
  });

  it("uses the status fallback when the JSON error code is unknown", async () => {
    fetchMock.mockResolvedValue(response({ error: "server_mystery" }, 403));

    const error = await apiError(createHttpClient().me());
    expect(error.code).toBe("forbidden");
  });

  it("keeps new contract error codes from the response", async () => {
    fetchMock.mockResolvedValue(response({ error: "event_service_unavailable" }, 503));

    const error = await apiError(createHttpClient().listTaps());
    expect(error.code).toBe("event_service_unavailable");
    expect(error.status).toBe(503);
  });

  it("keeps the Worker's service_unavailable, not the code its status means", async () => {
    // The Worker in front of the screens answers 503 service_unavailable when the service
    // behind it gave no answer at all (agreement section 2). The body the client can read
    // wins, so the screens are told the service is down rather than that a station's
    // Event Service is.
    fetchMock.mockResolvedValue(response({ error: "service_unavailable" }, 503));

    const error = await apiError(createHttpClient().me());
    expect(error.code).toBe("service_unavailable");
    expect(error.status).toBe(503);
  });

  it("gives a 401 on the login invalid_token, not a lost session", async () => {
    // Agreement 7.2: the login answers 401 invalid_token. Every other 401 is
    // unauthenticated, which the session provider reads as a signed-out user.
    fetchMock.mockResolvedValue(new Response("not json", { status: 401 }));

    const error = await apiError(createHttpClient().firebaseLogin("id-token"));
    expect(error.code).toBe("invalid_token");
    expect(error.status).toBe(401);
  });

  it("gives a 503 on the login login_unavailable, not a service that did not answer", async () => {
    // Agreement 7.2: the login answers 503 login_unavailable, so Google's keys could not be
    // fetched and the token may be fine.
    fetchMock.mockResolvedValue(new Response("not json", { status: 503 }));

    const error = await apiError(createHttpClient().firebaseLogin("id-token"));
    expect(error.code).toBe("login_unavailable");
    expect(error.status).toBe(503);
  });

  it("keeps the code a readable body on the login says", async () => {
    // The Worker in front of the screens answers 503 service_unavailable under /api and
    // /auth (agreement 2), and the service's own codes are the truth, so a body the client
    // can read wins over the endpoint's table.
    fetchMock.mockResolvedValue(response({ error: "unauthenticated" }, 401));

    const error = await apiError(createHttpClient().firebaseLogin("id-token"));
    expect(error.code).toBe("unauthenticated");
    expect(error.status).toBe(401);
  });

  it("does not publish the auth error for a refused token", async () => {
    // publishAuthError fires on unauthenticated and forbidden, and the session provider
    // reads it as a signed-out user. A refused token is a failed sign-in, not a lost
    // session, so the person stays signed in and can try again.
    const seen: unknown[] = [];
    const listener = (event: Event) => seen.push((event as CustomEvent).detail);
    window.addEventListener(AUTH_ERROR_EVENT, listener);
    try {
      fetchMock.mockResolvedValue(new Response("not json", { status: 401 }));
      await apiError(createHttpClient().firebaseLogin("id-token"));
    } finally {
      window.removeEventListener(AUTH_ERROR_EVENT, listener);
    }

    expect(seen).toEqual([]);
  });

  it("sends the login link as agreement 7.4's JSON body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await createHttpClient().loginLink("eyJ2IjoxfQ.c2ln");

    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/login-link",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login_link: "eyJ2IjoxfQ.c2ln" }),
        credentials: "include",
      }),
    );
  });

  it("gives a 401 on the login link invalid_login_link, not a lost session", async () => {
    // Agreement 7.4: a link that fails leaves the existing session as it was. Read as
    // unauthenticated, the session provider would sign the person out.
    const seen: unknown[] = [];
    const listener = (event: Event) => seen.push((event as CustomEvent).detail);
    window.addEventListener(AUTH_ERROR_EVENT, listener);
    try {
      fetchMock.mockResolvedValue(new Response("not json", { status: 401 }));
      const error = await apiError(createHttpClient().loginLink("eyJ2IjoxfQ.c2ln"));

      expect(error.code).toBe("invalid_login_link");
      expect(error.status).toBe(401);
    } finally {
      window.removeEventListener(AUTH_ERROR_EVENT, listener);
    }

    expect(seen).toEqual([]);
  });

  it("sends the name as agreement 8.7's PATCH and answers the user it gets back", async () => {
    const user = {
      id: "dev-user-1",
      display_name: "Mei Ling",
      role: "participant",
      has_name: true,
      answers: {},
    };
    fetchMock.mockResolvedValue(response({ user }));

    await expect(createHttpClient().updateMe({ display_name: "Mei Ling" })).resolves.toEqual({
      user,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/me",
      expect.objectContaining({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: "Mei Ling" }),
        credentials: "include",
      }),
    );
  });

  it("sends one answer as agreement 8.7's PATCH and answers the user's answers", async () => {
    const user = {
      id: "dev-user-1",
      display_name: "Alex",
      role: "participant",
      has_name: true,
      answers: { drink: "tea" },
    };
    fetchMock.mockResolvedValue(response({ user }));

    await expect(createHttpClient().updateMe({ answers: { drink: "tea" } })).resolves.toEqual({
      user,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/me",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ answers: { drink: "tea" } }),
      }),
    );
  });

  it("sends a booth as agreement 9.12's PUT and answers the station", async () => {
    const station = {
      id: "s1",
      label: "Reader 3",
      created_at: "2026-10-01T02:00:00.000Z",
      disabled_at: null,
      game: "passport",
      game_fixed: true,
      booth: "A3",
      passport: null,
      last_seen_at: null,
      online: false,
      firmware_version: null,
      buffered_taps: 0,
      reader_ok: null,
      last_tap_at: null,
    };
    fetchMock.mockResolvedValue(response({ station }));

    const answer = await createHttpClient().setStationBooth("s1", { booth: "A3" });

    expect(answer.station.booth).toBe("A3");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/stations/s1/booth",
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booth: "A3" }),
        credentials: "include",
      }),
    );
  });

  it("turns a name answer without has_name into a NetworkError", async () => {
    // The answer goes straight into the ["me"] cache, so a user the passport cannot read
    // must not get there.
    fetchMock.mockResolvedValue(
      response({ user: { id: "dev-user-1", display_name: "Mei Ling", role: "participant" } }),
    );

    const error = await createHttpClient()
      .updateMe({ display_name: "Mei Ling" })
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(NetworkError);
  });

  it("keeps the issue a refused name gets under display_name", async () => {
    fetchMock.mockResolvedValue(
      response(
        {
          error: "validation_failed",
          issues: [{ path: ["display_name"], message: "display_name must be 1 to 30 characters" }],
        },
        400,
      ),
    );

    const error = await apiError(createHttpClient().updateMe({ display_name: "" }));

    expect(error.code).toBe("validation_failed");
    expect(error.issues).toEqual([
      { path: ["display_name"], message: "display_name must be 1 to 30 characters" },
    ]);
  });

  it("publishes a 401 on the name's PATCH, though not on /me's read", async () => {
    // The session query reads /me's 401 as "nobody is signed in" by itself. A PATCH to the
    // same path is not that read, so its 401 has to sign the screens out like any other.
    const seen: unknown[] = [];
    const listener = (event: Event) => seen.push((event as CustomEvent).detail);
    window.addEventListener(AUTH_ERROR_EVENT, listener);
    try {
      fetchMock.mockImplementation(async () => response({ error: "unauthenticated" }, 401));
      await apiError(createHttpClient().me());
      expect(seen).toEqual([]);

      await apiError(createHttpClient().updateMe({ display_name: "Mei Ling" }));
    } finally {
      window.removeEventListener(AUTH_ERROR_EVENT, listener);
    }

    expect(seen).toEqual([expect.objectContaining({ code: "unauthenticated" })]);
  });

  it("reads every code from the error body, so a missing set entry cannot hide", async () => {
    // One case per code, all sharing a status the fallback cannot answer. If a code is
    // missing from the body's allowlist the body is ignored and the status map supplies the
    // answer instead, so the code read back is wrong and this fails. The same test exists in
    // apps/geekykey-web, for the same reason: a code can be renamed in the agreement and in
    // the union while the set that decides what to believe quietly drops it.
    const status = 418;
    for (const code of Object.keys(statusFor) as (keyof typeof statusFor)[]) {
      fetchMock.mockResolvedValue(response({ error: code }, status));

      const error = await apiError(createHttpClient().me());

      expect(error, `${code} did not reject`).toBeInstanceOf(ApiError);
      expect(error.code, `${code} was not read from the body`).toBe(code);
    }
  });

  it("ignores malformed issue entries without losing valid ones", async () => {
    fetchMock.mockResolvedValue(
      response(
        {
          error: "validation_failed",
          issues: [null, { path: ["bad", 2], message: "valid" }, { path: ["missing-message"] }],
        },
        400,
      ),
    );

    const error = await apiError(createHttpClient().me());
    expect(error.issues).toEqual([{ path: ["bad", 2], message: "valid" }]);
  });

  it("wraps fetch rejection as a NetworkError", async () => {
    fetchMock.mockRejectedValue(new TypeError("connection refused"));

    const error = await createHttpClient()
      .me()
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(NetworkError);
  });

  it("turns malformed successful JSON into a NetworkError", async () => {
    fetchMock.mockResolvedValue(new Response("<html>not json</html>", { status: 200 }));

    const error = await createHttpClient()
      .me()
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(NetworkError);
  });

  it("turns an organizer answer in the wrong shape into a NetworkError", async () => {
    // Every organizer answer is checked before a screen sees it, as /me's is, so a
    // service that drifted from section 9 fails here and not inside a table.
    const api = createHttpClient();
    const calls: [string, () => Promise<unknown>][] = [
      ["9.1", () => api.setStationPassport("s1", { name: "3D Printing Booth" })],
      ["9.3", () => api.listTaps()],
      ["9.4", () => api.createFallbackTap({ station_id: "s1", user_id: "dev-user-1" })],
      ["9.5", () => api.stats()],
      ["9.7", () => api.createStation({ label: "Reader 3" })],
      ["9.8", () => api.replaceStationKey("s1")],
      ["9.9 disable", () => api.disableStation("s1")],
      ["9.9 enable", () => api.enableStation("s1")],
      ["9.12", () => api.setStationBooth("s1", { booth: "A3" })],
    ];

    for (const [section, call] of calls) {
      fetchMock.mockResolvedValueOnce(response({ unexpected: true }));
      const error = await call().catch((reason: unknown) => reason);
      expect(error, section).toBeInstanceOf(NetworkError);
    }
  });

  it("aborts a request that exceeds the configured timeout", async () => {
    fetchMock.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    const error = await createHttpClient({ requestTimeoutMs: 5 })
      .me()
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(NetworkError);
  });
});

/**
 * Every code in `ErrorCode`, with the status agreement section 2 gives it. `satisfies`
 * makes this exhaustive in both directions: drop a code here, or add one to the union
 * without giving it a status, and the typecheck fails.
 */
const statusFor = {
  validation_failed: 400,
  unauthenticated: 401,
  invalid_token: 401,
  invalid_login_link: 401,
  missing_station_key: 401,
  invalid_station_key: 401,
  forbidden: 403,
  not_found: 404,
  answers_fixed: 409,
  name_taken: 409,
  no_groups: 409,
  too_few_participants: 409,
  groups_exist: 409,
  rate_limited: 429,
  invalid_event_service_key: 401,
  event_service_unavailable: 503,
  claims_unavailable: 503,
  login_unavailable: 503,
  service_unavailable: 503,
  internal_error: 500,
} as const satisfies Record<ErrorCode, number>;
