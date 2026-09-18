import { Prohibit } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import { Wordmark } from "@/components/layout/wordmark";
import { Button } from "@/components/ui/button";

/** The 403 view. Rendered in place, never a redirect, so the URL still says where they tried to go. */
export function ForbiddenView() {
  return (
    <main className="grid min-h-[100dvh] place-items-center p-6 text-center">
      <div className="flex max-w-sm flex-col items-center">
        <Wordmark />
        <Prohibit className="mt-8 h-10 w-10 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Organisers only</h1>
        <p className="mt-2 text-muted-foreground">
          This console is for the event team. Your account is a participant account. If you are
          helping run the event, ask the lead organiser to change your role.
        </p>
        <Button asChild className="mt-6">
          <Link to="/">Back to your passport</Link>
        </Button>
      </div>
    </main>
  );
}
