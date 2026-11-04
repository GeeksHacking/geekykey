import { useEffect, type ReactNode } from "react";

import { describeError } from "@/api/errors";
import { InlineQueryError } from "@/components/layout/inline-query-error";
import { StaleDataNote } from "@/components/layout/stale-data-note";
import { CornerBrackets } from "@/components/look/corner-brackets";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NamePrompt } from "@/features/passport/name-prompt";
import { useJoinGroups } from "@/features/passport/use-join-groups";
import { useMyGroup } from "@/features/passport/use-my-group";
import { useNamePromptSkip } from "@/features/passport/use-name-prompt-skip";
import { showStaleNote } from "@/lib/rate-limit";
import { useMe, useSession } from "@/lib/session";

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="relative rounded-lg border bg-card p-4">
      <CornerBrackets />
      <p className="look-label text-muted-foreground">{label}</p>
      {children}
    </section>
  );
}

/** The card's loading state, from the first read through a join on arrival. */
function Loading() {
  return (
    <div
      className="space-y-2 rounded-lg border bg-card p-4"
      role="status"
      aria-label="Loading your group"
    >
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-5 w-48" />
    </div>
  );
}

/**
 * The top of the participant's dashboard (spec: participant groups): the name prompt while
 * they have no name, then a Join button until they join, then that they're waiting, then their
 * group and its members' names. A page that arrived through a login link joins by itself, so
 * the token is all the participant needs.
 */
export function GroupCard() {
  const { me } = useMe();
  const namePrompt = useNamePromptSkip(me.user.id);
  return (
    <div className="space-y-3">
      {!me.user.has_name && !namePrompt.skipped ? (
        <NamePrompt userId={me.user.id} onSkip={namePrompt.skip} />
      ) : null}
      <GroupCardBody />
    </div>
  );
}

/** The card's join state, below the name prompt. */
function GroupCardBody() {
  const myGroup = useMyGroup();
  const {
    mutate: joinGroups,
    isPending: joinPending,
    isError: joinFailed,
    error: joinError,
  } = useJoinGroups();
  const { consumeLoginLinkArrival, loginLinkArrival } = useSession();
  const refetch = () => void myGroup.refetch();

  // Spend the arrival on the first status, and join only when they haven't already. A join that
  // fails leaves the status alone, so the button below is still there with its error.
  useEffect(() => {
    if (!myGroup.data) return;
    if (!consumeLoginLinkArrival()) return;
    if (myGroup.data.status === "not_joined") joinGroups();
  }, [consumeLoginLinkArrival, joinGroups, myGroup.data]);

  if (!myGroup.data) {
    return myGroup.isError ? (
      <InlineQueryError
        error={myGroup.error}
        onRetry={refetch}
        title="Your group couldn't be loaded."
      />
    ) : (
      <Loading />
    );
  }

  // A token visitor should never read the away-from-event hint while the join is on its way.
  if (myGroup.data.status === "not_joined" && (loginLinkArrival === true || joinPending)) {
    return <Loading />;
  }

  const { status, group } = myGroup.data;
  // What a failed poll means, kept with the last answer so a card isn't lost to it.
  const pollProblem = !myGroup.isError ? null : showStaleNote(myGroup.error, true) ? (
    <StaleDataNote onRetry={refetch} />
  ) : (
    <InlineQueryError
      error={myGroup.error}
      onRetry={refetch}
      title="Your group's updates are delayed."
    />
  );

  return (
    <div className="space-y-3">
      {pollProblem}
      {status === "placed" && group ? (
        <Frame label="Your group">
          <h2 className="mt-1 text-xl font-semibold tracking-heading">{group.name}</h2>
          <ul aria-label="Members" className="mt-3 space-y-1 text-sm">
            {/* Names can repeat, and the answer has no IDs, so the order tells them apart. */}
            {group.members.map((member, index) => (
              <li key={index}>{member.display_name}</li>
            ))}
          </ul>
        </Frame>
      ) : status === "waiting" ? (
        <Frame label="Groups">
          <p className="mt-1 text-lg font-semibold">You&apos;re waiting for a group.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It will show here. You don&apos;t need to do anything else.
          </p>
        </Frame>
      ) : (
        <Frame label="Groups">
          <p className="mt-1 text-sm text-muted-foreground">
            Press Join when you&apos;re at the event, and you&apos;ll be put in a group.
          </p>
          <Button
            type="button"
            className="mt-3"
            disabled={joinPending}
            onClick={() => joinGroups()}
          >
            Join
          </Button>
          {joinFailed ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {describeError(joinError)}
            </p>
          ) : null}
        </Frame>
      )}
    </div>
  );
}
