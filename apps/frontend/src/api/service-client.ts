import type { ApiClient } from "@/api/client";

/** Session calls are shared by both services during the staged migration. */
export type SessionApi = Pick<ApiClient, "me" | "devLogin" | "logout" | "loginUrl">;

/** The GeekyKey Service owns token claims/releases in the current client surface. */
export type GeekyKeyApi = Pick<ApiClient, "pairToken" | "unpairToken">;

/** The Event Service owns the current event board, history, stats, export, and fallback. */
export type EventApi = Pick<
  ApiClient,
  "listStations" | "createStation" | "listTaps" | "createFallbackTap" | "stats" | "exportCsv"
>;

export interface ServiceClientBundle {
  session: SessionApi;
  geekykey: GeekyKeyApi;
  event: EventApi;
}

/**
 * Prepares the future service boundary without changing any screen contract.
 * Screens still consume the single ApiClient until their routes are migrated.
 */
export function createServiceClients(api: ApiClient): ServiceClientBundle {
  return {
    session: {
      me: api.me.bind(api),
      devLogin: api.devLogin.bind(api),
      logout: api.logout.bind(api),
      loginUrl: api.loginUrl.bind(api),
    },
    geekykey: {
      pairToken: api.pairToken.bind(api),
      unpairToken: api.unpairToken.bind(api),
    },
    event: {
      listStations: api.listStations.bind(api),
      createStation: api.createStation.bind(api),
      listTaps: api.listTaps.bind(api),
      createFallbackTap: api.createFallbackTap.bind(api),
      stats: api.stats.bind(api),
      exportCsv: api.exportCsv.bind(api),
    },
  };
}
