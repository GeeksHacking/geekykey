import type {
  AcceptConnectionRequestResponse,
  ConnectionChallenge,
  ConnectionRule,
  CreateGroupRequest,
  CreateStationRequest,
  EventGroup,
  EventStationBoardResponse,
  FallbackTapRequest,
  FallbackTapResponse,
  GroupBoardResponse,
  ListTapsQuery,
  ListTapsResponse,
  MapResponse,
  MapRelayResponse,
  MeResponse,
  MyGroupResponse,
  GeekykeyLoginLinkResponse,
  PlayReactionResponse,
  ReactionPlayRequest,
  SetPhraseRequest,
  SetStationBoothRequest,
  SetStationPassportRequest,
  SetStationPassportResponse,
  SplitGroupsRequest,
  StationKeyResponse,
  StationResponse,
  StatsResponse,
  UpdateGroupRequest,
  UpdateMeRequest,
  UpdateMeResponse,
} from "@/api/types";

/*
  The one interface every feature consumes. Two implementations:
  - src/api/mock: in-memory data shaped like the agreement (current phase)
  - src/api/http: fetch against /api/v1 with credentials (integration phase)
  Screens never know which one they are talking to.
*/
export interface ApiClient {
  /** GET /api/v1/me. Rejects with `unauthenticated` when there is no session. */
  me(): Promise<MeResponse>;

  /**
   * PATCH /api/v1/me (agreement 8.7). Sets the name the event shows for the current user,
   * some or all of their answers, or both, and answers with the same `user` object as
   * GET /api/v1/me.
   */
  updateMe(input: UpdateMeRequest): Promise<UpdateMeResponse>;

  /**
   * POST /api/v1/me/connection-requests/{id}/accept (BAC-149, draft for the agreement's next
   * version). The request goes whatever it answers, and only `connected` connects the two.
   * `not_found` means it no longer waits for this user.
   */
  acceptConnectionRequest(requestId: string): Promise<AcceptConnectionRequestResponse>;

  /** POST /api/v1/me/connection-requests/{id}/decline (BAC-149). The tapper isn't told. */
  declineConnectionRequest(requestId: string): Promise<void>;

  /**
   * POST /api/v1/me/connections/{id}/reaction (BAC-156, for the agreement's next version, 8.11).
   * The user's one play in a connection's reaction test. A second play answers `already_played`,
   * and one after `play_by` answers `too_late`.
   */
  playDuelReaction(duelId: string, play: ReactionPlayRequest): Promise<PlayReactionResponse>;
  setStationGame(stationId: string, game: string | null): Promise<StationResponse>;

  playReaction(connectionId: string, play: ReactionPlayRequest): Promise<PlayReactionResponse>;

  /** POST /auth/dev-login. Local development only. */
  devLogin(userId: string): Promise<void>;

  /**
   * POST /auth/firebase (agreement 7.2). Signs in with the ID token Firebase's web SDK
   * gave the screens. The service checks it and sets its own cookie, and the screens read
   * GET /api/v1/me as usual afterwards.
   */
  firebaseLogin(idToken: string): Promise<void>;

  /**
   * POST /auth/login-link (agreement 7.4). Logs in with the login link the GeekyKey screens'
   * event buttons put in the address, as the user who was logged in there. It replaces any
   * session the browser had, and one that fails leaves that session as it was.
   */
  loginLink(link: string): Promise<void>;

  /**
   * POST /api/v1/login-links (agreement 8.12, BAC-157, for the next version). A login link to
   * the GeekyKey screens for the signed-in user, which My tokens opens there so the same user
   * is logged in, a guest included. It works once and expires after 60 seconds.
   */
  createGeekykeyLoginLink(): Promise<GeekykeyLoginLinkResponse>;

  /** POST /auth/logout */
  logout(): Promise<void>;

  /**
   * GET /api/v1/admin/stations, the Event Service's own registered stations, enabled or
   * disabled (agreement 9.2). Version 0.3 removed the old station registry that sat
   * behind the GeekyKey Service, so there is no second stations call.
   */
  listStationBoard(): Promise<EventStationBoardResponse>;

  /** POST /api/v1/admin/stations (agreement 9.7). The key in the response is shown once. */
  createStation(input: CreateStationRequest): Promise<StationKeyResponse>;

  /**
   * POST /api/v1/admin/stations/{id}/key (agreement 9.8). Replaces the key, keeping the
   * station's ID, its passport settings and its stamps. No request body, and the same answer
   * as a create, with the new key shown once.
   */
  replaceStationKey(stationId: string): Promise<StationKeyResponse>;

  /** POST /api/v1/admin/stations/{id}/disable (agreement 9.9). Sets `disabled_at`. */
  disableStation(stationId: string): Promise<StationResponse>;

  /** POST /api/v1/admin/stations/{id}/enable (agreement 9.9). Clears `disabled_at`. */
  enableStation(stationId: string): Promise<StationResponse>;

  /**
   * PUT /api/v1/admin/stations/{id}/booth (agreement 9.12). Sets the booth the map draws
   * the station at, on any station, whatever game it runs and however many taps it has.
   * A blank booth clears it, and the answer is the station as the board lists it.
   */
  setStationBooth(stationId: string, input: SetStationBoothRequest): Promise<StationResponse>;

  /**
   * PUT /api/v1/admin/stations/{id}/passport. Adds the station to the passport or changes
   * its settings. Agreement 9.1.
   */
  setStationPassport(
    stationId: string,
    input: SetStationPassportRequest,
  ): Promise<SetStationPassportResponse>;

  /** GET /api/v1/admin/taps */
  listTaps(query?: ListTapsQuery): Promise<ListTapsResponse>;

  /** POST /api/v1/admin/taps */
  createFallbackTap(input: FallbackTapRequest): Promise<FallbackTapResponse>;

  /** GET /api/v1/admin/stats */
  stats(): Promise<StatsResponse>;

  /** GET /api/v1/admin/export.csv as a file the browser can save. */
  exportCsv(): Promise<Blob>;

  /**
   * GET /api/v1/map (agreement 9.10), for the map on the big screen. An organizer or a user
   * on the map screen list may read it, and anyone else gets `forbidden`.
   */
  map(): Promise<MapResponse>;

  /** GET /api/v1/map/relay (9.13), with the same read-only roles as map. */
  mapRelay(): Promise<MapRelayResponse>;

  /**
   * GET /api/v1/me/group (draft for agreement 0.14). Whether the current user has joined, and
   * their own group with its members' names. An organizer reads `not_joined`.
   */
  myGroup(): Promise<MyGroupResponse>;

  /**
   * POST /api/v1/me/group (draft for agreement 0.14). Joins the current user, and answers as
   * `myGroup` does. Joining twice changes nothing, and an organizer gets `forbidden`.
   */
  joinGroups(): Promise<MyGroupResponse>;

  /** GET /api/v1/admin/groups (draft for agreement 0.14). */
  groupBoard(): Promise<GroupBoardResponse>;

  /** POST /api/v1/admin/groups (draft for agreement 0.14), or `name_taken`. */
  createGroup(input: CreateGroupRequest): Promise<EventGroup>;

  /** POST /api/v1/admin/groups/allocate (draft for agreement 0.14). Answers with the board. */
  allocateGroups(): Promise<GroupBoardResponse>;

  /**
   * POST /api/v1/admin/groups/split (BAC-138, BAC-141, BAC-146, draft for agreement 0.14). Takes
   * exactly one of the people per group, from which it works out the number of groups, and the
   * number of groups. It makes them and allocates everyone, in one step, and answers with the
   * board. Groups with nobody in them are replaced. It makes nothing on a refusal: `groups_exist`
   * with anyone placed, or `too_few_participants` with fewer than 2 joined for each group.
   */
  splitGroups(input: SplitGroupsRequest): Promise<GroupBoardResponse>;

  /**
   * POST /api/v1/admin/groups/reset (draft for agreement 0.14). Everyone leaves their group and
   * the waiting list, and allocation goes back to not started. The groups stay. Answers with the
   * board.
   */
  resetGroups(): Promise<GroupBoardResponse>;

  /** GET /api/v1/admin/groups/export.csv (draft for agreement 0.14) as a file the browser can save. */
  exportGroupsCsv(): Promise<Blob>;

  /**
   * PUT /api/v1/admin/groups/{id} (draft for agreement 0.14). Sets every field and moves nobody,
   * even below a lower capacity. `not_found` or `name_taken`.
   */
  updateGroup(groupId: string, input: UpdateGroupRequest): Promise<EventGroup>;

  /**
   * DELETE /api/v1/admin/groups/{id} (draft for agreement 0.14). Its members go back to waiting.
   * `not_found`.
   */
  deleteGroup(groupId: string): Promise<void>;

  /**
   * PUT /api/v1/admin/groups/members/{user_id} (draft for agreement 0.14). Puts the user in the
   * group, past its capacity if need be, or back to waiting with null, joining them first if
   * they haven't. Answers with the board. `not_found`, or `forbidden` for an organizer account.
   */
  placeGroupMember(userId: string, groupId: string | null): Promise<GroupBoardResponse>;

  /**
   * DELETE /api/v1/admin/groups/members/{user_id} (draft for agreement 0.14). They can join
   * again. `not_found` when they haven't joined.
   */
  removeGroupMember(userId: string): Promise<void>;

  /**
   * PUT /api/v1/admin/connections/rule (BAC-140, draft for the agreement's next version). Sets
   * whether a connection needs two token kinds or two groups, from the next tap on, and answers
   * with the setting. Connections already made stay.
   */
  setConnectionRule(input: ConnectionRule): Promise<ConnectionRule>;

  /**
   * PUT /api/v1/admin/connections/challenge (BAC-161, draft for the agreement's next version).
   * Sets which challenge a new connection plays, at random or always one of them, from the next
   * connection on, and answers with the setting. Connections already made keep theirs.
   */
  setConnectionChallenge(input: ConnectionChallenge): Promise<ConnectionChallenge>;

  /**
   * PUT /api/v1/admin/groups/phrase (BAC-169, draft for the agreement's next version). Sets the
   * phrase participants complete, 2 to 12 words of at most 20 characters each, or turns the
   * activity off with null or blank text. A phrase that differs from the one set deals every word
   * again. Answers with the board. `validation_failed` for a phrase outside the limits.
   */
  setPhrase(input: SetPhraseRequest): Promise<GroupBoardResponse>;
}
