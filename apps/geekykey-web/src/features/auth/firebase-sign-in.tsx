import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  GEEKSHACKING_PROVIDER_ENABLED,
  hasFirebaseConfig,
  isPopupClosed,
  signInAsGuest,
  signInWithGeeksHacking,
  signInWithGoogle,
} from "@/lib/firebase";
import { useSession } from "@/lib/session";

/**
 * The sentence for a sign-in that did not work. Section 13 of the agreement gives it for
 * the two codes the service answers on the login, and a Firebase failure is the same thing
 * from the person's side.
 */
const SIGN_IN_FAILED = "Couldn't log you in. Try again.";

/**
 * The Firebase sign-in buttons (agreement 7.2). Google is always here. GeeksHacking's own
 * login appears only once its OpenID Connect provider is set up in Firebase, and is left
 * out until then (ADR 0004). "Continue as guest" is the GeekyKey screens' own (ADR 0005):
 * the Event screens don't offer it, because a guest there would be a different guest.
 *
 * Every button is disabled while a sign-in runs. For the popups, a second popup cancels the
 * first (`auth/cancelled-popup-request`); for the guest, a second click would make a
 * second guest.
 */
export function FirebaseSignIn() {
  const session = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = hasFirebaseConfig();

  async function signIn(getIdToken: () => Promise<string>) {
    setPending(true);
    setError(null);
    try {
      const idToken = await getIdToken();
      await session.signInWithFirebase(idToken);
    } catch (err) {
      // A popup the user closed is not a failure, so there is nothing to say about it.
      if (!isPopupClosed(err)) setError(SIGN_IN_FAILED);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-8 grid gap-3">
      <Button
        size="lg"
        className="w-full"
        disabled={pending || !configured}
        onClick={() => void signIn(signInWithGoogle)}
      >
        Continue with Google
      </Button>
      {GEEKSHACKING_PROVIDER_ENABLED ? (
        <Button
          variant="outline"
          size="lg"
          className="w-full"
          disabled={pending || !configured}
          onClick={() => void signIn(signInWithGeeksHacking)}
        >
          Continue with GeeksHacking
        </Button>
      ) : null}
      <Button
        variant="outline"
        size="lg"
        className="w-full"
        disabled={pending || !configured}
        onClick={() => void signIn(signInAsGuest)}
      >
        Continue as guest
      </Button>
      <p className="text-sm text-muted-foreground">
        No account needed. Keep using this phone and browser.
      </p>
      {!configured ? (
        <p className="text-sm text-muted-foreground">Sign-in is not set up in this build.</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
