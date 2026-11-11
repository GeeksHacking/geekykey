import type { ApiClient } from "@/api/client";

/** Session calls are shared by both services during the staged migration. */
export type SessionApi = Pick<
  ApiClient,
  "me" | "devLogin" | "firebaseLogin" | "loginLink" | "logout"
>;

/**
 * The Event Service owns every other call: every station call, 9.2 and 9.7 to 9.9, plus the tap
 * log, stats, the export, the fallback, the map and the groups. Version 0.3 left the GeekyKey
 * Service with token claims and releases, which the Event screens never call, so there is no
 * GeekyKey slice here. It is everything but the session, so a new `ApiClient` method fails the
 * typecheck until `createServiceClients` binds it.
 */
export type EventApi = Omit<ApiClient, keyof SessionApi>;

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
      setStationBooth: api.setStationBooth.bind(api),
      setStationPassport: api.setStationPassport.bind(api),
      listTaps: api.listTaps.bind(api),
      createFallbackTap: api.createFallbackTap.bind(api),
      stats: api.stats.bind(api),
      exportCsv: api.exportCsv.bind(api),
      map: api.map.bind(api),
      updateMe: api.updateMe.bind(api),
      acceptConnectionRequest: api.acceptConnectionRequest.bind(api),
      declineConnectionRequest: api.declineConnectionRequest.bind(api),
      playReaction: api.playReaction.bind(api),
      playDuelReaction: api.playDuelReaction.bind(api),
      setStationGame: api.setStationGame.bind(api),
      createGeekykeyLoginLink: api.createGeekykeyLoginLink.bind(api),
      myGroup: api.myGroup.bind(api),
      joinGroups: api.joinGroups.bind(api),
      groupBoard: api.groupBoard.bind(api),
      createGroup: api.createGroup.bind(api),
      allocateGroups: api.allocateGroups.bind(api),
      splitGroups: api.splitGroups.bind(api),
      resetGroups: api.resetGroups.bind(api),
      exportGroupsCsv: api.exportGroupsCsv.bind(api),
      updateGroup: api.updateGroup.bind(api),
      deleteGroup: api.deleteGroup.bind(api),
      placeGroupMember: api.placeGroupMember.bind(api),
      removeGroupMember: api.removeGroupMember.bind(api),
      setConnectionRule: api.setConnectionRule.bind(api),
      setConnectionChallenge: api.setConnectionChallenge.bind(api),
      setPhrase: api.setPhrase.bind(api),
    },
  };
}
