import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import type { ApiClient } from "@/api/client";
import { useApi } from "@/api/context";
import { NetworkError } from "@/api/errors";
import { queryKeys } from "@/api/keys";
import type {
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
  | { type: "remove"; userId: string }
  | { type: "rule"; connectAcross: ConnectAcross };

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
    case "remove":
      await api.removeGroupMember(change.userId);
      return null;
    case "rule":
      await api.setConnectionRule({ connect_across: change.connectAcross });
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

/** Every write shares the board, including the connection rule carried by whole-board replies. */
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
        if (error instanceof NetworkError) {
          // A lost reply can follow a committed write. Reconcile with a read, never retry it.
          await queryClient.cancelQueries({ queryKey: queryKeys.groupBoard });
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
