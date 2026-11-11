import { Button } from "@/components/ui/button";
import { CHECK_FAILED, CHECKING_RESULT } from "@/features/passport/reaction/reaction-wording";

/** The wait while the reaction test reads /me, and the retry if that read fails (FRO-152). */
export function ReactionCheck({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  return (
    <div className="rounded-lg bg-muted p-3 text-center text-sm">
      {failed ? (
        <>
          <p role="alert">{CHECK_FAILED}</p>
          <Button type="button" className="mt-2" onClick={onRetry}>
            Try again
          </Button>
        </>
      ) : (
        <p role="status">{CHECKING_RESULT}</p>
      )}
    </div>
  );
}
