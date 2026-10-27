import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { queryKeys } from "@/api/keys";
import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { SummaryScreen } from "@/features/stats/summary-screen";
import { createTestProviders } from "@/test/providers";

function setup() {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  return { api, ...createTestProviders(api) };
}

describe("SummaryScreen", () => {
  it("keeps the summary and shows a quiet note when a poll is rate limited", async () => {
    const { api, Providers, queryClient } = setup();
    render(
      <Providers>
        <SummaryScreen />
      </Providers>,
    );

    await screen.findByText("Total taps");
    api.mock.failNext("rate_limited");
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: queryKeys.stats });
    });

    expect(await screen.findByText("Showing the last update.")).toBeInTheDocument();
    // The numbers survive the failed poll.
    expect(screen.getByText("Total taps")).toBeInTheDocument();
    expect(screen.queryByText("Summary updates are delayed.")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Too many requests. Wait a minute and try again."),
    ).not.toBeInTheDocument();
  });
});
