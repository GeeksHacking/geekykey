import { describeError, isApiErrorCode } from "@/api/errors";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/*
  Lives in components/ so two features can host it (apps/frontend/CLAUDE.md: shared
  feature components go here, never feature to feature): the token page's owner view
  and My tokens' rows both hand in the same releasing controls.
*/

/**
 * What a screen passes in for one release: the mutation from useReleaseToken, written from
 * the start to serve the token page and My tokens alike. A structural shape keeps this
 * file from importing back into a feature.
 */
export interface ReleaseControls {
  /** The DELETE is running; the button disables while it does. */
  isPending: boolean;
  /** The last failed release, if any. */
  error: unknown;
  mutate: (ownerId?: string) => void;
}

/**
 * Release, behind a confirmation because it cannot be undone: after it anyone can claim
 * the token, so the copy says what still counts (agreement 8.3: taps made with the token
 * before the release still count).
 *
 * `mine` picks whose taps are being counted. The ticket fixes the wording for the owner,
 * where "you" is the person who tapped. A GeekyKey admin releasing someone else's token
 * has made no taps at all, so that view says the same thing without putting words in
 * their mouth.
 */
export function ReleaseTokenBlock({
  release,
  ownerId,
  mine,
}: {
  release: ReleaseControls;
  ownerId?: string | null;
  mine: boolean;
}) {
  return (
    <div className="flex flex-col items-start gap-3">
      {release.error ? <ReleaseError error={release.error} /> : null}
      <ReleaseButton release={release} ownerId={ownerId} mine={mine} />
    </div>
  );
}

function ReleaseButton({
  release,
  ownerId,
  mine,
}: {
  release: ReleaseControls;
  ownerId?: string | null;
  mine: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {/* Disabled while the release is in flight, for the reason 8.3 gives for a double
            click. A second DELETE would come back not_found, which ReleaseError would then
            read as "someone else claimed this token now", to someone who had just released
            their own token. */}
        <Button variant="outline" disabled={release.isPending}>
          {release.isPending ? "Releasing" : "Release"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Release this token?</AlertDialogTitle>
          <AlertDialogDescription>
            {mine
              ? "Anyone will be able to claim this token. Taps you've already made still count."
              : "Anyone will be able to claim this token. The taps already made with it still count."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          {/* Named differently from the trigger, so the two buttons are not the same
              control twice and a screen reader announces the final action for what it is. */}
          <AlertDialogAction
            disabled={release.isPending}
            onClick={() => release.mutate(ownerId ?? undefined)}
          >
            Release token
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * A failed release. 8.3's not_found means the token was already released, or claimed by
 * someone else since the page loaded, so the page's data is stale and describeError's
 * "That was not found. It may have been removed." would be wrong: the token still exists.
 */
function ReleaseError({ error }: { error: unknown }) {
  if (isApiErrorCode(error, "not_found")) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Someone else has claimed this token now, or it has already been released.
      </p>
    );
  }
  // forbidden, claims_unavailable and rate_limited are all things describeError already
  // words for, and section 13 fixes the wording for two of them.
  return (
    <p role="alert" className="text-sm text-destructive">
      {describeError(error)}
    </p>
  );
}
