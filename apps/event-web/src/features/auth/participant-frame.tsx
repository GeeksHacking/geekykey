import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { describeError } from "@/api/errors";
import { PageHeader } from "@/components/layout/page-header";
import { ParticipantShell } from "@/components/layout/participant-shell";
import { SessionErrorBanner } from "@/components/layout/session-error-banner";
import { LoginLinkNotice } from "@/features/auth/login-link-notice";
import { NamePrompt } from "@/features/passport/name-prompt";
import { QuestionsPrompt } from "@/features/passport/questions-prompt";
import { useMe, useSession } from "@/lib/session";

/** Joins the session to the participant shell. Route files stay one line. */
export function ParticipantFrame({ children }: { children: ReactNode }) {
  const { me } = useMe();
  const session = useSession();
  const navigate = useNavigate();
  const needsName = !me.user.has_name;
  const needsAnswers = me.questions?.some(({ id }) => !Object.hasOwn(me.user.answers, id)) ?? false;
  const needsSetup = me.user.role === "participant" && (needsName || needsAnswers);

  async function signOut() {
    try {
      await session.signOut();
      await navigate({ to: "/login", replace: true });
    } catch (error) {
      // The session provider has already cleared identity data; keep the failure visible without
      // leaving an unhandled promise rejection from the shell callback.
      toast.error(describeError(error));
    }
  }

  return (
    <ParticipantShell user={me.user} onSignOut={() => void signOut()} showNavigation={!needsSetup}>
      <LoginLinkNotice className="mb-6" />
      {session.me && session.error ? (
        <SessionErrorBanner error={session.error} onRetry={() => void session.refresh()} />
      ) : null}
      {needsSetup ? (
        <div className="space-y-6">
          <PageHeader title={me.questions?.length ? "Your name and answers" : "Your name"} />
          {needsName ? (
            <NamePrompt key={me.user.id} userId={me.user.id} />
          ) : (
            <QuestionsPrompt
              key={me.user.id}
              questions={me.questions ?? []}
              answers={me.user.answers}
              required
              answersFixed={me.connections.length > 0}
              onAnswersFixed={() => void session.refresh()}
            />
          )}
        </div>
      ) : (
        children
      )}
    </ParticipantShell>
  );
}
