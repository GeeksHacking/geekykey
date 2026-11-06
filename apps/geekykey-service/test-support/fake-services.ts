import type { MeetingsRequest, RegisteredStation } from "@geekykey/handoff";
import type { Config } from "../src/config.ts";
import type { Send } from "../src/service-request.ts";

/** A request the Worker sent out, as the fake services saw it. */
export interface SentRequest {
  method: string;
  url: string;
  authorization: string | null;
  redirect: RequestInit["redirect"];
  body: unknown;
}

/** A tap in a hand-off, as the API agreement's 11.2 has it. */
export interface HandedOffTap {
  client_tap_id: string;
  user_id: string;
  tapped_at: string | null;
  kind?: string | null;
}

/** Answers one kind of request in place of the fake's own answer, as a service might fail. */
type Answer = (request: SentRequest) => Promise<Response>;

/**
 * The services the Worker calls, faked behind `fetch` (its `send`): each of
 * `config`'s Event Services, with the four requests in the API agreement's
 * section 11, and the claims stand-in's `POST /owners`,
 * `POST /tokens/{uid}/claim`, `POST /tokens/{uid}/release`,
 * `GET /users/{id}/tokens`, `GET /token-kinds` and `POST /token-kinds`. Each
 * checks the
 * key the Worker sends, as the real ones do, and answers what a test sets:
 *
 * - `stations`, each Event Service's registered stations, by its ID;
 * - `owners`, who owns each token, by its normalised UID;
 * - `kinds`, each token's kind in the list beside the stand-in, by its
 *   normalised UID. The owners' answer gives it, or null. A load writes to it,
 *   and the totals count it;
 * - `tokens`, each user's tokens, by user ID, in the order the stand-in
 *   gives them: oldest claim first;
 * - `now`, when a claim the fake takes is made. A claim of a token nobody
 *   owns adds it to `owners` and the end of the user's `tokens`, as the
 *   stand-in's table would. A release by the token's owner takes it out of
 *   both;
 * - `statusOf`, each handed-off tap's status, `accepted` unless a test says
 *   otherwise;
 * - `meetingStatusOf`, each half's status in the meeting hand-off, by the
 *   Event Service's ID, `waiting` unless a test says otherwise.
 *
 * A test can replace one kind of answer in `answers`, as a service that's
 * down or wrong would answer. Every request is in `sent`, in order.
 */
export function fakeServices(config: Config) {
  const fake = {
    stations: new Map<string, RegisteredStation[]>(),
    owners: new Map<string, string>(),
    kinds: new Map<string, string>(),
    tokens: new Map<string, { uid: string; claimed_at: string }[]>(),
    now: "2026-11-18T06:00:00.000Z",
    statusOf: (_tap: HandedOffTap, _stationId: string): string => "accepted",
    meetingStatusOf: (_meeting: MeetingsRequest, _eventServiceId: string): string => "waiting",
    answers: {} as Partial<
      Record<
        | "stations"
        | "taps"
        | "heartbeats"
        | "meetings"
        | "owners"
        | "claim"
        | "release"
        | "tokens"
        | "kindTotals"
        | "loadKinds"
        | "listKindTokens"
        | "removeKind",
        Answer
      >
    >,
    sent: [] as SentRequest[],
    send: (async () => new Response()) as Send,
  };

  const unauthorised = (error: string) => Response.json({ error }, { status: 401 });

  fake.send = async (url, init) => {
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    const request: SentRequest = {
      method: init.method ?? "GET",
      url,
      authorization: new Headers(init.headers).get("Authorization"),
      redirect: init.redirect,
      body,
    };
    fake.sent.push(request);

    if (url.startsWith(`${config.claimsStandIn.url}/`)) {
      const path = url.slice(config.claimsStandIn.url.length);
      if (request.authorization !== `Bearer ${config.claimsStandIn.key}`) {
        return unauthorised("unauthenticated");
      }
      const tokensPath = /^\/users\/([^/]+)\/tokens$/.exec(path);
      if (request.method === "GET" && tokensPath) {
        if (fake.answers.tokens) return fake.answers.tokens(request);
        const userId = decodeURIComponent(tokensPath[1]!);
        return Response.json({ tokens: fake.tokens.get(userId) ?? [] });
      }
      const claimPath = /^\/tokens\/([^/]+)\/claim$/.exec(path);
      if (request.method === "POST" && claimPath) {
        if (fake.answers.claim) return fake.answers.claim(request);
        const uid = claimPath[1]!;
        const { user_id: userId } = body as { user_id: string };
        const owner = fake.owners.get(uid);
        if (owner === undefined) {
          fake.owners.set(uid, userId);
          fake.tokens.set(userId, [
            ...(fake.tokens.get(userId) ?? []),
            { uid, claimed_at: fake.now },
          ]);
          return Response.json({ result: "claimed", claimed_at: fake.now });
        }
        if (owner !== userId) return Response.json({ result: "taken", claimed_at: null });
        const mine = fake.tokens.get(userId)?.find((token) => token.uid === uid);
        return Response.json({ result: "already_yours", claimed_at: mine?.claimed_at ?? fake.now });
      }
      const releasePath = /^\/tokens\/([^/]+)\/release$/.exec(path);
      if (request.method === "POST" && releasePath) {
        if (fake.answers.release) return fake.answers.release(request);
        const uid = releasePath[1]!;
        const { owner_id: ownerId } = body as { owner_id: string };
        if (fake.owners.get(uid) !== ownerId) return Response.json({ result: "not_owner" });
        fake.owners.delete(uid);
        fake.tokens.set(
          ownerId,
          (fake.tokens.get(ownerId) ?? []).filter((token) => token.uid !== uid),
        );
        return Response.json({ result: "released" });
      }
      if (request.method === "GET" && path === "/token-kinds") {
        if (fake.answers.kindTotals) return fake.answers.kindTotals(request);
        const totals = new Map<string, number>();
        for (const kind of fake.kinds.values()) totals.set(kind, (totals.get(kind) ?? 0) + 1);
        return Response.json({
          kinds: [...totals]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([kind, tokens]) => ({ kind, tokens })),
        });
      }
      if (request.method === "GET" && path === "/token-kinds/tokens") {
        if (fake.answers.listKindTokens) return fake.answers.listKindTokens(request);
        const uids = [...new Set([...fake.kinds.keys(), ...fake.owners.keys()])].sort();
        return Response.json({
          tokens: uids.map((uid) => {
            const owner_id = fake.owners.get(uid) ?? null;
            return {
              uid,
              kind: fake.kinds.get(uid) ?? null,
              owner_id,
              claimed_at:
                owner_id === null
                  ? null
                  : (fake.tokens.get(owner_id)?.find((t) => t.uid === uid)?.claimed_at ?? fake.now),
            };
          }),
        });
      }
      if (request.method === "DELETE" && path.startsWith("/token-kinds/")) {
        if (fake.answers.removeKind) return fake.answers.removeKind(request);
        const uid = path.slice("/token-kinds/".length);
        const result = fake.owners.has(uid)
          ? "claimed"
          : fake.kinds.delete(uid)
            ? "removed"
            : "not_found";
        return Response.json({ result });
      }
      if (request.method === "POST" && path === "/token-kinds") {
        if (fake.answers.loadKinds) return fake.answers.loadKinds(request);
        const { tokens } = body as { tokens: { uid: string; kind: string }[] };
        const counts = { new: 0, changed: 0, unchanged: 0 };
        for (const { uid, kind } of tokens) {
          const before = fake.kinds.get(uid);
          if (before === undefined) counts.new++;
          else if (before === kind) counts.unchanged++;
          else counts.changed++;
          fake.kinds.set(uid, kind);
        }
        return Response.json(counts);
      }
      if (request.method !== "POST" || path !== "/owners") {
        return Response.json({ error: "not_found" }, { status: 404 });
      }
      if (fake.answers.owners) return fake.answers.owners(request);
      const { uids } = body as { uids: string[] };
      return Response.json({
        owners: uids.flatMap((uid) => {
          const userId = fake.owners.get(uid);
          if (userId === undefined) return [];
          return [{ uid, user_id: userId, kind: fake.kinds.get(uid) ?? null }];
        }),
      });
    }

    for (const eventService of config.eventServices) {
      if (!url.startsWith(`${eventService.url}/`)) continue;
      const path = url.slice(eventService.url.length);
      if (request.authorization !== `Bearer ${eventService.key}`) {
        return unauthorised("invalid_event_service_key");
      }
      if (request.method === "GET" && path === "/geekykey/v1/stations") {
        if (fake.answers.stations) return fake.answers.stations(request);
        return Response.json({ stations: fake.stations.get(eventService.id) ?? [] });
      }
      if (request.method === "POST" && path === "/geekykey/v1/taps") {
        if (fake.answers.taps) return fake.answers.taps(request);
        const { station_id, taps } = body as { station_id: string; taps: HandedOffTap[] };
        return Response.json({
          results: taps.map((tap) => ({
            client_tap_id: tap.client_tap_id,
            status: fake.statusOf(tap, station_id),
          })),
        });
      }
      if (request.method === "POST" && path === "/geekykey/v1/heartbeats") {
        if (fake.answers.heartbeats) return fake.answers.heartbeats(request);
        return new Response(null, { status: 204 });
      }
      if (request.method === "POST" && path === "/geekykey/v1/meetings") {
        if (fake.answers.meetings) return fake.answers.meetings(request);
        return Response.json({
          status: fake.meetingStatusOf(body as MeetingsRequest, eventService.id),
        });
      }
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    throw new TypeError(`The tests have no service at ${url}`);
  };

  return fake;
}
