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
  Shared by the token page, through ReleaseTokenBlock, and My tokens' rows, which lay out
  the button and its error themselves (FRO-155).
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
 * The Release button and its confirmation, for a screen that lays out the error itself:
 * My tokens' rows put Release beside the UID and the error under both (FRO-155). `compact`
 * is the 36px button Token kinds' rows use, so a row's Release stays secondary to the
 * event's button.
 */
export function ReleaseButton({
  release,
  ownerId,
  mine,
  compact = false,
}: {
  release: ReleaseControls;
  ownerId?: string | null;
  mine: boolean;
  compact?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {/* Disabled while the release is in flight, for the reason 8.3 gives for a double
            click. A second DELETE would come back not_found, which ReleaseError would then
            read as "someone else claimed this token now", to someone who had just released
            their own token. */}
        <Button
          variant="outline"
          size={compact ? "sm" : "default"}
          className={compact ? "h-9 text-sm" : undefined}
          disabled={release.isPending}
        >
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
