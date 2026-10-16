import type { RegisteredStation } from "@geekykey/handoff";
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
}

/** Answers one kind of request in place of the fake's own answer, as a service might fail. */
type Answer = (request: SentRequest) => Promise<Response>;

/**
 * The services the Worker calls, faked behind `fetch` (its `send`): each of
 * `config`'s Event Services, with the three requests in the API agreement's
 * section 11, and the claims stand-in's `POST /owners`. Each checks the key
 * the Worker sends, as the real ones do, and answers what a test sets:
 *
 * - `stations`, each Event Service's registered stations, by its ID;
 * - `owners`, who owns each token, by its normalised UID;
 * - `statusOf`, each handed-off tap's status, `accepted` unless a test says
 *   otherwise.
 *
 * A test can replace one kind of answer in `answers`, as a service that's
 * down or wrong would answer. Every request is in `sent`, in order.
 */
export function fakeServices(config: Config) {
  const fake = {
    stations: new Map<string, RegisteredStation[]>(),
    owners: new Map<string, string>(),
    statusOf: (_tap: HandedOffTap, _stationId: string): string => "accepted",
    answers: {} as Partial<Record<"stations" | "taps" | "heartbeats" | "owners", Answer>>,
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
      if (path !== "/owners") return Response.json({ error: "not_found" }, { status: 404 });
      if (fake.answers.owners) return fake.answers.owners(request);
      const { uids } = body as { uids: string[] };
      return Response.json({
        owners: uids.flatMap((uid) => {
          const userId = fake.owners.get(uid);
          return userId === undefined ? [] : [{ uid, user_id: userId }];
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
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    throw new TypeError(`The tests have no service at ${url}`);
  };

  return fake;
}
