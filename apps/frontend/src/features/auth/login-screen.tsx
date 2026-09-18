import { useEffect } from "react";

import { useApi } from "@/api/context";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Wordmark } from "@/components/layout/wordmark";
import { Button } from "@/components/ui/button";
import { DevLoginForm } from "@/features/auth/dev-login-form";
import { useGoAfterLogin } from "@/features/auth/use-go-after-login";
import { useSession } from "@/lib/session";

export function LoginScreen({ returnTo }: { returnTo?: string }) {
  const api = useApi();
  const session = useSession();
  const goAfterLogin = useGoAfterLogin();

  // Already signed in (for example, pressed back after logging in): skip the form.
  const signedInRole = session.status === "authenticated" ? session.me?.user.role : undefined;
  useEffect(() => {
    if (signedInRole) goAfterLogin(returnTo, signedInRole);
  }, [signedInRole, returnTo, goAfterLogin]);

  return (
    <main className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-6 py-16">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Wordmark size="lg" />
      <h1 className="mt-10 text-3xl font-semibold tracking-tight">
        Tap in, collect stamps, earn points.
      </h1>
      <p className="mt-3 text-muted-foreground">
        Sign in with your GeeksHacking account to open your passport for this event.
      </p>
      <Button asChild size="lg" className="mt-8 w-full">
        <a href={api.loginUrl(returnTo ?? "/")}>Sign in with GeeksHacking</a>
      </Button>
      {import.meta.env.DEV ? <DevLoginForm returnTo={returnTo} /> : null}
    </main>
  );
}
