import {
  heartbeatsRequest,
  type MeetingsAnswer,
  meetingsRequest,
  type StationsAnswer,
  tapsRequest,
} from "@geekykey/handoff";
import { eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../app.ts";
import { requireBearerKey } from "../lib/bearer-key.ts";
import { log } from "../lib/log.ts";
import { jsonBody, validationFailed } from "../lib/validate.ts";
import type { AnswersGame } from "./answers.ts";
import { participantIsReady } from "./participant-setup.ts";
import type { ConnectionsGame } from "./connections.ts";
import type { GameOnStations } from "./games.ts";
import { tokenOwnerOf } from "./profiles.ts";
import { stations } from "./schema.ts";
import { TapPipeline, UnknownStation } from "./tap-pipeline.ts";

/**
 * What the GeekyKey Service asks of this Event Service (mounted at
 * /geekykey/v1): the API agreement's section 11. Every request carries the
 * Event Service key, checked in constant time and never logged, and each
 * body is checked against packages/handoff. `games` judge the taps, and
 * `connections` takes the meeting hand-off's halves. With no connections
 * game, there's no meeting hand-off, and its `404` tells the GeekyKey
 * Service this event takes no meetings (11.10).
 */
export function handoffRoutes({
  key,
  games,
  connections,
  answers,
  now = () => new Date(),
}: {
  key: string;
  games: readonly GameOnStations[];
  connections: ConnectionsGame | null;
  answers: AnswersGame | null;
  /** The clock a half is timed by. Tests pin it. */
  now?: () => Date;
}) {
  const app = new Hono<AppEnv>()
    .use(requireBearerKey(key, "invalid_event_service_key"))
    .get("/stations", async (c) => {
      // The registered stations: the enabled ones, each with its key's hash (11.1).
      const enabled = await c.var.db
        .select({ station_id: stations.id, key_hash: stations.apiKeyHash })
        .from(stations)
        .where(isNull(stations.disabledAt));
      return c.json({ stations: enabled } satisfies StationsAnswer);
    })
    .post("/taps", jsonBody(tapsRequest), async (c) => {
      // The hand-off: a station's taps, each by a token's owner, as users (11.2).
      const { station_id, taps } = c.req.valid("json");
      const { db, config } = c.var;

      const pipeline = new TapPipeline(db, { cooldownSeconds: config.tapCooldownSeconds, games });
      let results;
      try {
        results = await pipeline.ingest(
          station_id,
          taps.map((tap) => ({
            clientTapId: tap.client_tap_id,
            userId: tap.user_id,
            tappedAt: tap.tapped_at,
            kind: tap.kind,
          })),
        );
      } catch (err) {
        if (!(err instanceof UnknownStation)) throw err;
        return validationFailed(
          c,
          ["station_id"],
          "station_id must be one of this Event Service's stations",
        );
      }

      // Heard from just now, for the station board's online light.
      await db
        .update(stations)
        .set({ lastSeenAt: new Date().toISOString() })
        .where(eq(stations.id, station_id));

      // With what each tap's game has the station show, if anything (6.1).
      return c.json({
        results: results.map(({ clientTapId, status, stationText }) => ({
          client_tap_id: clientTapId,
          status,
          ...(stationText !== null && {
            lines: stationText.lines,
            ...(stationText.complete && { complete: true }),
          }),
        })),
      });
    })
    .post("/heartbeats", jsonBody(heartbeatsRequest), async (c) => {
      // The heartbeat hand-off: the station's health, as it sent it (11.3).
      const { station_id, firmware_version, buffered_taps, reader_ok } = c.req.valid("json");
      const { db } = c.var;

      const [station] = await db
        .select({ id: stations.id })
        .from(stations)
        .where(eq(stations.id, station_id));
      if (station === undefined) {
        return validationFailed(
          c,
          ["station_id"],
          "station_id must be one of this Event Service's stations",
        );
      }

      // Heard from just now. A field the station left out is undefined, which
      // Drizzle leaves out of the update, so it keeps what the last one said.
      await db
        .update(stations)
        .set({
          lastSeenAt: new Date().toISOString(),
          firmwareVersion: firmware_version,
          bufferedTaps: buffered_taps,
          readerOk: reader_ok,
        })
        .where(eq(stations.id, station_id));

      return c.body(null, 204);
    });

  if (connections === null) return app;
  return app.post("/meetings", jsonBody(meetingsRequest), async (c) => {
    // One half of a connection: a user tapped their phone on someone else's token (11.10).
    const { user_id, user_kind, owner_id, owner_kind } = c.req.valid("json");
    // Read first, so a failed read leaves no half behind a "tap their token again".
    const owner = await tokenOwnerOf(c.var.db, owner_id);
    const status = await connections.meet(
      c.var.db,
      { userId: user_id, userKind: user_kind, ownerId: owner_id, ownerKind: owner_kind },
      now(),
      async (db, id) =>
        c.var.config.organizers.includes(id) || (await participantIsReady(db, id, answers)),
    );
    log("meeting_handled", { user_id, owner_id, status });
    return c.json({
      status,
      owner_name: owner.name,
      owner_bio: owner.bio,
    } satisfies MeetingsAnswer);
  });
}
