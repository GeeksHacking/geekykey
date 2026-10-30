import { useState } from "react";

import type { MeResponse } from "@/api/types";
import { newStampLink, type NewStampLink } from "@/features/passport/passport-changes";

export interface NewStampLinkState {
  offer: NewStampLink | null;
  dismiss: () => void;
  press: () => void;
}

/**
 * The group's page to offer after a new stamp, held until the visitor presses it, dismisses
 * it, or another stamp fills. The first /me is the baseline, so a stamp already there when
 * the page loaded never offers a page. A new stamp without a link clears the previous offer.
 */
export function useNewStampLink(me: MeResponse): NewStampLinkState {
  const [seen, setSeen] = useState(me);
  const [offer, setOffer] = useState<NewStampLink | null>(null);

  if (seen !== me) {
    const sameUser = seen.user.id === me.user.id;
    setSeen(me);
    if (!sameUser) {
      setOffer(null);
    } else {
      const result = newStampLink(seen, me);
      if (result.changed) setOffer(result.offer);
    }
  }

  return {
    offer,
    dismiss: () => setOffer(null),
    press: () => setOffer(null),
  };
}
