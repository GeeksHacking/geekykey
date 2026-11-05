import { useRef } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { ConnectionList } from "@/features/passport/connection-list";
import { ConnectionReveal } from "@/features/passport/connection-reveal";
import { DisplayNameRow } from "@/features/passport/display-name-row";
import { NamePrompt } from "@/features/passport/name-prompt";
import { NewStampBanner } from "@/features/passport/new-stamp-banner";
import { QuestionsPrompt } from "@/features/passport/questions-prompt";
import { StampGrid } from "@/features/passport/stamp-grid";
import { useNamePromptSkip } from "@/features/passport/use-name-prompt-skip";
import { useNewStampLink } from "@/features/passport/use-new-stamp-link";
import { usePassportChanges } from "@/features/passport/use-passport-changes";
import { useMe } from "@/lib/session";

export function PassportScreen() {
  const { me, refresh } = useMe();
  const namePrompt = useNamePromptSkip(me.user.id);
  const scope = useRef<HTMLDivElement>(null);
  const changes = usePassportChanges(scope, me);
  const newStamp = useNewStampLink(me);
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
      <ConnectionReveal me={me} />
      {!me.user.has_name && !namePrompt.skipped ? (
        <NamePrompt userId={me.user.id} onSkip={namePrompt.skip} />
      ) : null}
      {me.questions ? (
        <QuestionsPrompt
          key={me.user.id}
          questions={me.questions}
          answers={me.user.answers}
          answersFixed={me.connections.length > 0}
          onAnswersFixed={() => void refresh()}
        />
      ) : null}
      {newStamp.offer ? (
        <NewStampBanner
          offer={newStamp.offer}
          onDismiss={newStamp.dismiss}
          onPress={newStamp.press}
        />
      ) : null}
      <ConnectionList me={me} />
      <StampGrid stamps={me.stamps} stamped={changes.stamped} />
    </div>
  );
}
