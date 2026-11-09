import { type ReleaseControls, ReleaseButton } from "@/components/release-button";
import { ReleaseError } from "@/components/release-error";

/*
  Lives in components/ so two features can host it (apps/event-web/CLAUDE.md: shared
  feature components go here, never feature to feature): the token page's owner view
  and My tokens' rows both hand in the same releasing controls.
*/

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
