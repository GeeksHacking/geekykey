import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import type { ApiClient } from "@/api/client";
import { useApi } from "@/api/context";
import { isApiError, NetworkError } from "@/api/errors";
import { queryKeys } from "@/api/keys";
import type {
  Challenge,
  ConnectAcross,
  CreateGroupRequest,
  GroupBoardResponse,
  SplitGroupsRequest,
  UpdateGroupRequest,
} from "@/api/types";
import { POLL_GROUP_BOARD_MS } from "@/lib/constants";

const CHANGE_KEY = ["groupBoard", "change"] as const;
// QueryClient outlives the route. A pending write must still exclude another after navigation.
const changing = new WeakSet<QueryClient>();

type GroupBoardChange =
  | { type: "create"; input: CreateGroupRequest }
  | { type: "edit"; groupId: string; input: UpdateGroupRequest }
  | { type: "delete"; groupId: string }
  | { type: "allocate" }
  | { type: "split"; input: SplitGroupsRequest }
  | { type: "reset" }
  | { type: "move"; userId: string; groupId: string | null }
  | { type: "place"; userIds: string[]; groupId: string }
  | { type: "remove"; userId: string }
  | { type: "rule"; connectAcross: ConnectAcross }
  | { type: "challenge"; challenge: Challenge };

/** Someone who wasn't placed, and what the service or the connection said. */
type FailedPlacement = { userId: string; error: unknown };

/**
 * Some of the people ticked weren't placed (FRO-130). `board` is the reply to the last placement
 * that went through, if any did.
 */
export class PlacementsFailed extends Error {
  constructor(
    readonly failed: FailedPlacement[],
    readonly board: GroupBoardResponse | null,
  ) {
    super("Some people were not placed");
    this.name = "PlacementsFailed";
  }
}

/**
 * Places each person with the single move's request, one after another, so each CSV row says an
 * organizer placed them (FRO-130). The agreement has no request for several. Someone who has
 * gone (`not_found`) leaves the others to be placed. Any other failure, such as a lost connection,
 * the rate limit or a signed-out organizer, would refuse everyone left too, so the rest aren't
 * sent and count as not placed.
 */
async function placeSeveral(api: ApiClient, userIds: string[], groupId: string) {
  let board: GroupBoardResponse | null = null;
  const failed: FailedPlacement[] = [];
  for (const [index, userId] of userIds.entries()) {
    try {
      board = await api.placeGroupMember(userId, groupId);
    } catch (error) {
      failed.push({ userId, error });
      if (isApiError(error) && error.code === "not_found") continue;
      failed.push(...userIds.slice(index + 1).map((unsent) => ({ userId: unsent, error })));
      break;
    }
  }
  if (failed.length > 0) throw new PlacementsFailed(failed, board);
  return board;
}

async function sendChange(
  api: ApiClient,
  change: GroupBoardChange,
): Promise<GroupBoardResponse | null> {
  switch (change.type) {
    case "create":
      await api.createGroup(change.input);
      return null;
    case "edit":
      await api.updateGroup(change.groupId, change.input);
      return null;
    case "delete":
      await api.deleteGroup(change.groupId);
      return null;
    case "allocate":
      return api.allocateGroups();
    case "split":
      return api.splitGroups(change.input);
    case "reset":
      return api.resetGroups();
    case "move":
      return api.placeGroupMember(change.userId, change.groupId);
    case "place":
      return placeSeveral(api, change.userIds, change.groupId);
    case "remove":
      await api.removeGroupMember(change.userId);
      return null;
    case "rule":
      await api.setConnectionRule({ connect_across: change.connectAcross });
      return null;
    case "challenge":
      await api.setConnectionChallenge({ challenge: change.challenge });
      return null;
  }
}

/** The organizers' board of groups, polled so they can watch people arrive. */
export function useGroupBoard() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.groupBoard,
    queryFn: () => api.groupBoard(),
    refetchInterval: POLL_GROUP_BOARD_MS,
  });
}

/**
 * Every write shares the board, including the connection rule and the challenge carried by
 * whole-board replies.
 */
export function useGroupBoardBusy() {
  return useIsMutating({ mutationKey: CHANGE_KEY }) > 0;
}

/**
 * Each caller keeps its own errors, while this module owns ordering and cache settlement.
 * The guard rejects overlapping submissions rather than queueing an action for a later board.
 * Polling stays on; a reply asked for before the write cannot undo the completed change.
 */
export function useGroupBoardChange() {
  const api = useApi();
  const queryClient = useQueryClient();
  const busy = useGroupBoardBusy();
  const mutation = useMutation({
    mutationKey: CHANGE_KEY,
    retry: false,
    mutationFn: async (change: GroupBoardChange) => {
      if (changing.has(queryClient)) throw new Error("A group change is already being saved");
      changing.add(queryClient);
      try {
        const board = await sendChange(api, change);
        await queryClient.cancelQueries({ queryKey: queryKeys.groupBoard });
        if (board) {
          queryClient.setQueryData(queryKeys.groupBoard, board);
        } else {
          // A partial reply cannot settle the board. Read it before enabling another change.
          await queryClient.invalidateQueries({
            queryKey: queryKeys.groupBoard,
            refetchType: "all",
          });
        }
      } catch (error) {
        if (error instanceof NetworkError || error instanceof PlacementsFailed) {
          // A lost reply can follow a committed write, and some of several placements may have
          // gone through. Reconcile with a read, never retry it.
          await queryClient.cancelQueries({ queryKey: queryKeys.groupBoard });
          // Those placed show at once, even if the read after a refusal fails too.
          if (error instanceof PlacementsFailed && error.board)
            queryClient.setQueryData(queryKeys.groupBoard, error.board);
          await queryClient.invalidateQueries({
            queryKey: queryKeys.groupBoard,
            refetchType: "all",
          });
        } else if (change.type === "split") {
          // A refused split can follow a changed board. Keep the refusal immediate while its
          // line and replacement warning catch up (BAC-146).
          void queryClient.invalidateQueries({
            queryKey: queryKeys.groupBoard,
            refetchType: "all",
          });
        }
        throw error;
      } finally {
        changing.delete(queryClient);
      }
    },
  });
  return { ...mutation, busy };
}
