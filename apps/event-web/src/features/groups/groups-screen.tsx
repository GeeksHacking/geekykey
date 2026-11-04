import { UsersThree } from "@phosphor-icons/react";

import { describeError } from "@/api/errors";
import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { InlineQueryError } from "@/components/layout/inline-query-error";
import { LiveStamp } from "@/components/layout/live-stamp";
import { PageHeader } from "@/components/layout/page-header";
import { StaleDataNote } from "@/components/layout/stale-data-note";
import { Button } from "@/components/ui/button";
import { AddGroupDialog } from "@/features/groups/add-group-dialog";
import { GroupBoardSkeleton } from "@/features/groups/group-board-skeleton";
import { GroupPanel } from "@/features/groups/group-panel";
import { useAllocateGroups } from "@/features/groups/use-allocate-groups";
import { useGroupBoard } from "@/features/groups/use-group-board";
import { showStaleNote } from "@/lib/rate-limit";

export function GroupsScreen() {
  const board = useGroupBoard();
  const allocate = useAllocateGroups();
  const refetch = () => void board.refetch();
  const data = board.data;

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
              <GroupPanel key={group.id} group={group} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={UsersThree}
            title="No groups yet"
            description="Create the first group, then press Allocate once people have joined."
          />
        )}
        <section aria-labelledby="groups-waiting" className="rounded-lg border p-4">
          <h2 id="groups-waiting" className="font-semibold">
            Waiting
          </h2>
          {data.waiting.length > 0 ? (
            <ul aria-label="Waiting" className="mt-3 space-y-1 text-sm">
              {data.waiting.map((member) => (
                <li key={member.user_id}>{member.display_name}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Nobody is waiting.</p>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Groups"
        description="Create groups, then press Allocate to split everyone who has joined. Refreshes every 5 seconds."
        actions={
          <>
            <AddGroupDialog />
            <Button disabled={!data || allocate.isPending} onClick={() => allocate.mutate()}>
              Allocate
            </Button>
          </>
        }
      />
      {allocate.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {describeError(allocate.error)}
        </p>
      ) : null}
      {body}
    </div>
  );
}
