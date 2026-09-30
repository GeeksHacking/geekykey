import { Hono } from "hono";
import type { Db } from "../db/hyperdrive.ts";
import {
  requireSession,
  type SessionEnv,
  type SessionOptions,
} from "../middleware/session-auth.ts";
import { loadMe } from "../services/me.ts";

export interface MeRouteDeps {
  db: Db;
  session: SessionOptions;
}

/**
 * GET /  (mounted at /api/v1/me)
 *
 * Everything the participant dashboard and passport need in one call, for a
 * signed-in user of any role. A 401 is how the frontend learns that nobody is
 * signed in.
 */
export function meRoutes({ db, session }: MeRouteDeps) {
  return new Hono<SessionEnv>().get(
    "/",
    requireSession(session),
    async (c) => {
      // The session already loaded the profile, so only the rest is read here.
      const user = c.var.user;
      const me = await loadMe(db, user.id);
      return c.json({
        user: { id: user.id, display_name: user.displayName, role: user.role },
        tokens: me.tokens.map((t) => ({ uid: t.uid, paired_at: t.pairedAt })),
        points: me.points,
        // The wire calls the passport's slots `stamps`. Fields are never renamed within /api/v1.
        stamps: me.passport.map((slot) => ({
          station_id: slot.stationId,
          name: slot.name,
          location: slot.location,
          points: slot.points,
          earned_at: slot.earnedAt,
        })),
        recent_taps: me.recentTaps.map((t) => ({
          id: t.id,
          station_id: t.stationId,
          station_name: t.stationName,
          status: t.status,
          source: t.source,
          tapped_at: t.tappedAt,
          received_at: t.receivedAt,
        })),
      });
    },
  );
}
