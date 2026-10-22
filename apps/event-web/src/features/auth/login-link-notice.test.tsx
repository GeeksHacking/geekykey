import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ApiError, NetworkError } from "@/api/errors";
import type { MeResponse } from "@/api/types";
import { LoginLinkNotice } from "@/features/auth/login-link-notice";
import { SessionContext, type SessionState } from "@/lib/session";

const me: MeResponse = {
  user: { id: "dev-organizer-1", display_name: "Priya Raman", role: "organizer" },
  points: 0,
  stamps: [],
  recent_taps: [],
};

const EXPIRED = "That link has expired. Tap your token again to get back in.";

function renderNotice(loginLinkError: unknown) {
  const session: SessionState = {
    status: "authenticated",
    me,
    error: undefined,
    loginLinkError,
    refresh: async () => {},
    signIn: async () => me,
    signInWithFirebase: async () => me,
    signOut: async () => {},
  };
  return render(
    <SessionContext.Provider value={session}>
      <LoginLinkNotice />
    </SessionContext.Provider>,
  );
}

describe("LoginLinkNotice", () => {
  it("says section 13's sentence for a link that has expired", () => {
    renderNotice(new ApiError(401, "invalid_login_link"));

    expect(screen.getByRole("alert")).toHaveTextContent(EXPIRED);
  });

  it("says the same for a link the service could not read", () => {
    // FRO-60: validation_failed is treated as invalid_login_link. The person can do the same
    // thing about either: tap their token again.
    renderNotice(new ApiError(400, "validation_failed"));

    expect(screen.getByRole("alert")).toHaveTextContent(EXPIRED);
  });

  it("says the same when the link could not be sent", () => {
    // The link is out of the address and works once, so trying again here cannot help.
    // Tapping the token again makes a new link, whatever stopped this one.
    renderNotice(new NetworkError());

    expect(screen.getByRole("alert")).toHaveTextContent(EXPIRED);
  });

  it("shows nothing when there was no link, or it worked", () => {
    const { container } = renderNotice(undefined);

    expect(container).toBeEmptyDOMElement();
  });
});
