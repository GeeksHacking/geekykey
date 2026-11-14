import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { ParticipantShell } from "@/components/layout/participant-shell";
import { SessionErrorBanner } from "@/components/layout/session-error-banner";
import { LoginLinkNotice } from "@/features/auth/login-link-notice";
import { useAvatarLook } from "@/features/passport/avatar/use-avatar-look";
import { BioPrompt } from "@/features/passport/bio-prompt";
import { TeamRoundNotice } from "@/features/passport/team-round-notice";
import { NamePrompt } from "@/features/passport/name-prompt";
import { QuestionsPrompt } from "@/features/passport/questions-prompt";
import { useBioPromptSkip } from "@/features/passport/use-bio-prompt-skip";
import { useMe, useSession } from "@/lib/session";
import { useSignOut } from "@/lib/use-sign-out";

/** Joins the session to the participant shell. Route files stay one line. */
export function ParticipantFrame({ children }: { children: ReactNode }) {
  const { me } = useMe();
  useAvatarLook(me);
  const session = useSession();
  const signOut = useSignOut();
  const bioPrompt = useBioPromptSkip(me.user.id);
  const needsName = !me.user.has_name;
  const needsAnswers = me.questions?.some(({ id }) => !Object.hasOwn(me.user.answers, id)) ?? false;
  const needsProfile =
    me.user.role === "participant" && !me.user.bio && !me.user.contact_line && !bioPrompt.skipped;
  const needsSetup = me.user.role === "participant" && (needsName || needsAnswers || needsProfile);

  return (
    <ParticipantShell
      user={me.user}
      onSignOut={() => void signOut()}
      showNavigation={!needsSetup}
      connectionRequests={me.connection_requests.length}
    >
      <TeamRoundNotice />
      <LoginLinkNotice className="mb-6" />
      {session.me && session.error ? (
        <SessionErrorBanner error={session.error} onRetry={() => void session.refresh()} />
      ) : null}
      {needsSetup ? (
        <div className="space-y-6">
          <PageHeader title={me.questions?.length ? "Your name and answers" : "Your name"} />
          {needsName ? (
            <NamePrompt key={me.user.id} userId={me.user.id} />
          ) : needsAnswers ? (
            <QuestionsPrompt
              key={me.user.id}
              questions={me.questions ?? []}
              answers={me.user.answers}
              required
              answersFixed={me.connections.length > 0}
              onAnswersFixed={() => void session.refresh()}
            />
          ) : (
            <BioPrompt
              key={me.user.id}
              bio={me.user.bio}
              contactLine={me.user.contact_line}
              onSkip={bioPrompt.skip}
            />
          )}
        </div>
      ) : (
        children
      )}
    </ParticipantShell>
  );
}
