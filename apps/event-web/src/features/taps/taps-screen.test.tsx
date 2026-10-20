import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { queryKeys } from "@/api/keys";
import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { TapsScreen } from "@/features/taps/taps-screen";
import { createTestProviders } from "@/test/providers";

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

function setup() {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  const providers = createTestProviders(api);
  return { api, ...providers };
}

describe("TapsScreen", () => {
  it("keeps the loaded taps and shows a quiet note when a poll is rate limited", async () => {
    const { api, Providers, queryClient } = setup();
    render(
      <Providers>
        <TapsScreen />
      </Providers>,
    );

    await waitFor(() => expect(screen.getByText(/Showing/).firstChild).toBeDefined());
    const before = screen.getAllByRole("row").length;
    expect(before).toBeGreaterThan(1);

    api.mock.failNext("rate_limited");
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: queryKeys.taps({}) });
    });

    expect(await screen.findByText("Showing the last update.")).toBeInTheDocument();
    // The table survives the failed poll.
    expect(screen.getAllByRole("row")).toHaveLength(before);
    expect(screen.queryByText("Live updates are delayed.")).not.toBeInTheDocument();
  });

  it("still offers a retry from the quiet note, and the log catches up", async () => {
    const { api, Providers, queryClient } = setup();
    const user = userEvent.setup();
    render(
      <Providers>
        <TapsScreen />
      </Providers>,
    );

    await waitFor(() => expect(screen.getAllByRole("row").length).toBeGreaterThan(1));
    const before = screen.getAllByRole("row").length;

    api.mock.failNext("rate_limited");
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: queryKeys.taps({}) });
    });
    await screen.findByText("Showing the last update.");

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(screen.queryByText("Showing the last update.")).not.toBeInTheDocument(),
    );
    expect(screen.getAllByRole("row")).toHaveLength(before);
  });

  it("shows the red error state when a first load is rate limited with no data", async () => {
    const { api, Providers } = setup();
    api.mock.failNext("rate_limited");
    render(
      <Providers>
        <TapsScreen />
      </Providers>,
    );

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
        <TapsScreen />
      </Providers>,
    );

    await waitFor(() => expect(screen.getAllByRole("row").length).toBeGreaterThan(1));

    api.mock.failNext("internal_error");
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: queryKeys.taps({}) });
    });

    expect(await screen.findByText("Live updates are delayed.")).toBeInTheDocument();
    expect(screen.queryByText("Showing the last update.")).not.toBeInTheDocument();
  });
});
