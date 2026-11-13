import { arrivedByLoginLink } from "@/lib/login-link-arrival";

/**
 * What a sign-out says when Firebase can't say whether this is a guest. Going ahead as a guest
 * would release tokens, so a Google user must not end up there because Firebase didn't load,
 * and staying signed in costs one more tap (FRO-131).
 */
export const COULD_NOT_CHECK_LOGIN = "Couldn't check your login. Try again.";

/** Firebase is loaded only now, so a signed-in user's pages still don't load it. */
export async function isGuest(userId: string): Promise<boolean> {
  try {
    const { isSignedInAsGuest } = await import("@/lib/firebase");
    return await isSignedInAsGuest(userId);
  } catch (error) {
    console.error("Checking for a guest sign-in failed", error);
    throw error;
  }
}

/**
 * Whether the session is a guest's. Firebase is the judge, except when it doesn't remember this
 * user as an account and the session arrived by a login link: a guest has no Firebase sign-in
 * here, so the link is the only record of who they are. A Google user who arrived the same way
 * and never signed in here looks the same, and the warning is where they can stay signed in
 * instead.
 */
export async function isGuestOrLinkArrival(userId: string): Promise<boolean> {
  if (await isGuest(userId)) return true;
  if (!arrivedByLoginLink()) return false;
  const { remembersAccount } = await import("@/lib/firebase");
  return !(await remembersAccount(userId));
}
