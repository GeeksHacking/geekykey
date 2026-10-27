import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("still offers a retry from the quiet note, and the numbers stay", async () => {
    const { api, Providers, queryClient } = setup();
    const user = userEvent.setup();
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
    await screen.findByText("Showing the last update.");

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(screen.queryByText("Showing the last update.")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Total taps")).toBeInTheDocument();
  });

  it("shows the red error state when a first load is rate limited with no data", async () => {
    const { api, Providers } = setup();
    api.mock.failNext("rate_limited");
    render(
      <Providers>
        <SummaryScreen />
      </Providers>,
    );

    // No data to keep, so the ticket allows the usual error with a retry.
    expect(
      await screen.findByText("Too many requests. Wait a minute and try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Showing the last update.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("keeps the red error state for a failure that is not a rate limit", async () => {
    const { api, Providers, queryClient } = setup();
    render(
      <Providers>
        <SummaryScreen />
      </Providers>,
    );

    await screen.findByText("Total taps");
    api.mock.failNext("internal_error");
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: queryKeys.stats });
    });

    expect(await screen.findByText("Summary updates are delayed.")).toBeInTheDocument();
    expect(screen.getByText("Total taps")).toBeInTheDocument();
    expect(screen.queryByText("Showing the last update.")).not.toBeInTheDocument();
  });
});
