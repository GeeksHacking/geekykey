import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ADMIN_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { HomePage } from "@/features/home/home-page";
import { createTestProviders } from "@/test/providers";

describe("HomePage", () => {
  it("names the signed-in user from the session", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    const { Providers } = createTestProviders(api, { session: true });

    render(
      <Providers>
        <HomePage />
      </Providers>,
    );

    expect(screen.getByRole("heading", { name: "My tokens" })).toBeInTheDocument();
    // The session query is async, so the ID arrives a tick later.
    expect(await screen.findByText(SEEDED_PARTICIPANT_ID)).toBeInTheDocument();
    expect(screen.getByText(/Claiming and releasing arrive with them/)).toBeInTheDocument();
  });

  it("says so when the user is a GeekyKey admin", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ADMIN_ID);
    const { Providers } = createTestProviders(api, { session: true });

    render(
      <Providers>
        <HomePage />
      </Providers>,
    );

    expect(await screen.findByText(/a GeekyKey admin/)).toBeInTheDocument();
  });
});
