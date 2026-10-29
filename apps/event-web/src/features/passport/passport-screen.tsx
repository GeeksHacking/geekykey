import { useRef } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { DisplayNameRow } from "@/features/passport/display-name-row";
import { useNamePromptSkip } from "@/features/passport/use-name-prompt-skip";
import { NamePrompt } from "@/features/passport/name-prompt";
import { StampGrid } from "@/features/passport/stamp-grid";
import { usePassportChanges } from "@/features/passport/use-passport-changes";
import { useMe } from "@/lib/session";

export function PassportScreen() {
  const { me } = useMe();
  const namePrompt = useNamePromptSkip(me.user.id);
  const scope = useRef<HTMLDivElement>(null);
  const changes = usePassportChanges(scope, me);
  const earned = me.stamps.filter((stamp) => stamp.earned_at !== null).length;
  const description =
    me.stamps.length === 0
      ? "Your stamp book for this event."
      : `${earned} of ${me.stamps.length} stamps collected. Tap your token at a station to fill the next slot.`;
  return (
    <div ref={scope} className="space-y-6">
      <div className="space-y-3">
        <PageHeader title="Passport" description={description} />
        <DisplayNameRow displayName={me.user.display_name} />
      </div>
      {!me.user.has_name && !namePrompt.skipped ? <NamePrompt onSkip={namePrompt.skip} /> : null}
      <StampGrid stamps={me.stamps} stamped={changes.stamped} />
    </div>
  );
}
