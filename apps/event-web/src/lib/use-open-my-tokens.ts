import { useMutation } from "@tanstack/react-query";

import { useApi } from "@/api/context";
import { GEEKYKEY_SCREENS_URL } from "@/lib/constants";

/**
 * Opens My tokens on the GeekyKey screens as the user signed in here (agreement 8.12, BAC-157).
 * It asks the Event Service for a login link and opens it in the address's fragment, which never
 * reaches a server or a log, so a guest whose sign-in there is gone still sees their own tokens.
 *
 * When no link can be had, it opens My tokens anyway, where the user's session there, Firebase's
 * saved sign-in or the login takes over, as before. The link is opened at once and kept nowhere.
 */
export function useOpenMyTokens() {
  const api = useApi();
  return useMutation({
    mutationFn: async () => {
      try {
        const { login_link } = await api.createGeekykeyLoginLink();
        return `${GEEKYKEY_SCREENS_URL}#login=${login_link}`;
      } catch {
        return GEEKYKEY_SCREENS_URL;
      }
    },
    onSuccess: (url) => window.location.assign(url),
  });
}
