import { UsersThree } from "@phosphor-icons/react";
import { useEffect } from "react";

import { describeError } from "@/api/errors";
import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { InlineQueryError } from "@/components/layout/inline-query-error";
import { LiveStamp } from "@/components/layout/live-stamp";
import { PageHeader } from "@/components/layout/page-header";
import { StaleDataNote } from "@/components/layout/stale-data-note";
import { Button } from "@/components/ui/button";
import { ConnectionChallengeSwitch } from "@/features/groups/connection-challenge-switch";
import { ConnectionRuleSwitch } from "@/features/groups/connection-rule-switch";
import { ExportGroupsButton } from "@/features/groups/export-groups-button";
import { GroupBoardSkeleton } from "@/features/groups/group-board-skeleton";
import { GroupPanel } from "@/features/groups/group-panel";
import { MakeGroupsDialog } from "@/features/groups/make-groups-dialog";
import { MemberRow } from "@/features/groups/member-row";
import { ResetGroupsDialog } from "@/features/groups/reset-groups-dialog";
import { useGroupBoard, useGroupBoardChange } from "@/features/groups/use-group-board";
import { showStaleNote } from "@/lib/rate-limit";

export function GroupsScreen() {
  const board = useGroupBoard();
  const allocate = useGroupBoardChange();
  const refetch = () => void board.refetch();
  const data = board.data;
  // There's nothing for Allocate to do otherwise, and pressing it again changes nothing.
  const allocateUseful = (data?.groups.length ?? 0) > 0 && (data?.waiting.length ?? 0) > 0;
  const { isError: allocateRefused, reset: forgetAllocate } = allocate;
  // Its sentences say to press Allocate again, so they go when the button does, and don't come
  // back with it for the next trial's crowd, by when they'd be untrue.
  useEffect(() => {
    if (allocateRefused && !allocateUseful) forgetAllocate();
  }, [allocateRefused, allocateUseful, forgetAllocate]);

  let body;
  if (!data) {
    body = board.isError ? (
      <ErrorState error={board.error} onRetry={refetch} />
    ) : (
      <GroupBoardSkeleton />
    );
  } else {
    body = (
      <div className="space-y-4">
        {showStaleNote(board.error, true) ? (
          <StaleDataNote onRetry={refetch} />
        ) : board.isError ? (
          <InlineQueryError
            error={board.error}
            onRetry={refetch}
            title="Group updates are delayed."
          />
        ) : null}
        <div className="look-label flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-muted-foreground">
          <span>
            <span className="font-mono text-foreground">{data.joined_count}</span> joined,{" "}
            <span className="font-mono text-foreground">{data.waiting.length}</span> waiting
          </span>
          <LiveStamp updatedAt={board.dataUpdatedAt} refreshing={board.isFetching} />
        </div>
        {data.groups.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {data.groups.map((group) => (
              <GroupPanel
                key={group.id}
                group={group}
                groups={data.groups}
                allocationStarted={data.allocation_started_at !== null}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={UsersThree}
            title="No groups yet"
            description="Once people have joined, press Make groups to split them into groups at once. Or use it to make each group by hand, then press Allocate."
          />
        )}
        <section aria-labelledby="groups-waiting" className="rounded-lg border p-4">
          <h2 id="groups-waiting" className="type-item">
            Waiting
          </h2>
          {data.waiting.length > 0 ? (
            <ul aria-label="Waiting" className="mt-3 space-y-1 text-sm">
              {data.waiting.map((member) => (
                <MemberRow
                  key={member.user_id}
                  member={member}
                  groupId={null}
                  groups={data.groups}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Nobody is waiting.</p>
          )}
        </section>
        <ConnectionRuleSwitch value={data.connect_across} />
        {/* An Event Service from before BAC-161 has no challenge to choose. */}
        {data.challenge ? <ConnectionChallengeSwitch value={data.challenge} /> : null}
        <ExportGroupsButton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Groups"
        description="Press Make groups to split everyone who has joined, by people per group or by number of groups, or to make each group by hand. Allocate places anyone waiting. Move anyone from their menu. Reset empties the groups for another trial. Refreshes every 5 seconds."
        actions={
          <>
            <MakeGroupsDialog
              disabled={!data || allocate.busy}
              joined={data?.joined_count ?? 0}
              groupsThere={data?.groups.length ?? 0}
              someonePlaced={data?.groups.some((group) => group.members.length > 0) ?? false}
            />
            {allocateUseful ? (
              <Button
                disabled={allocate.busy}
                onClick={() => allocate.mutate({ type: "allocate" })}
              >
                Allocate
              </Button>
            ) : null}
            <ResetGroupsDialog disabled={!data || allocate.busy} />
          </>
        }
      />
      {allocate.isError && allocateUseful ? (
        <p role="alert" className="text-sm text-destructive">
          {describeError(allocate.error)}
        </p>
      ) : null}
      {body}
    </div>
  );
}
