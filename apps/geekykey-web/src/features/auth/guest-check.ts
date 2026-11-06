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
