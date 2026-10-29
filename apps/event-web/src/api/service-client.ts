import type { ApiClient } from "@/api/client";

/** Session calls are shared by both services during the staged migration. */
export type SessionApi = Pick<
  ApiClient,
  "me" | "devLogin" | "firebaseLogin" | "loginLink" | "logout"
>;

/**
 * The Event Service owns every station call, 9.2 and 9.7 to 9.9, plus the tap log, stats,
 * the export, the fallback and the map. Version 0.3 left the GeekyKey Service with token claims and
 * releases, which the Event screens never call, so there is no GeekyKey slice here.
 */
export type EventApi = Pick<
  ApiClient,
  | "listStationBoard"
  | "createStation"
  | "replaceStationKey"
  | "disableStation"
  | "enableStation"
  | "setStationPassport"
  | "listTaps"
  | "createFallbackTap"
  | "stats"
  | "exportCsv"
  | "map"
>;

export interface ServiceClientBundle {
  session: SessionApi;
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
      firebaseLogin: api.firebaseLogin.bind(api),
      loginLink: api.loginLink.bind(api),
      logout: api.logout.bind(api),
    },
    event: {
      listStationBoard: api.listStationBoard.bind(api),
      createStation: api.createStation.bind(api),
      replaceStationKey: api.replaceStationKey.bind(api),
      disableStation: api.disableStation.bind(api),
      enableStation: api.enableStation.bind(api),
      setStationPassport: api.setStationPassport.bind(api),
      listTaps: api.listTaps.bind(api),
      createFallbackTap: api.createFallbackTap.bind(api),
      stats: api.stats.bind(api),
      exportCsv: api.exportCsv.bind(api),
      map: api.map.bind(api),
    },
  };
}
