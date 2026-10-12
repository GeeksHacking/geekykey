import type { ApiClient } from "@/api/client";

/** Session calls are shared by both services during the staged migration. */
export type SessionApi = Pick<ApiClient, "me" | "devLogin" | "logout" | "loginUrl">;

/**
 * The GeekyKey Service owns token claims and releases. Section 10 has held no
 * endpoints since version 0.3, so the station registry is not here: each Event
 * Service registers and issues its own stations (9.7 to 9.9), and the GeekyKey
 * Service keeps only a copy in memory of what they registered.
 */
export type GeekyKeyApi = Pick<ApiClient, "listStations" | "createStation">;

/** The Event Service owns the station board, the tap log, stats, export, and fallback. */
export type EventApi = Pick<
  ApiClient,
  | "listStationBoard"
  | "setStationPassport"
  | "listTaps"
  | "createFallbackTap"
  | "stats"
  | "exportCsv"
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
      listStations: api.listStations.bind(api),
      createStation: api.createStation.bind(api),
    },
    event: {
      listStationBoard: api.listStationBoard.bind(api),
      setStationPassport: api.setStationPassport.bind(api),
      listTaps: api.listTaps.bind(api),
      createFallbackTap: api.createFallbackTap.bind(api),
      stats: api.stats.bind(api),
      exportCsv: api.exportCsv.bind(api),
    },
  };
}
