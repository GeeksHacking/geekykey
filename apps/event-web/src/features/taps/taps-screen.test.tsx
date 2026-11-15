import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/api/keys";
import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { TapsScreen } from "@/features/taps/taps-screen";
import { createTestProviders } from "@/test/providers";

function setup() {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  const providers = createTestProviders(api);
  return { api, ...providers };
}

/** More taps than one page, so the log offers its older page. */
function manyTaps(api: ReturnType<typeof setup>["api"]) {
  const base = api.mock.data.taps[0]!;
  api.mock.data.taps = Array.from({ length: 51 }, (_, index) => ({
    ...base,
    id: index + 1,
    client_tap_id: `tap-${index}`,
    user_id: `user-${index}`,
  }));
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

  it("says there are no taps yet when the log is empty", async () => {
    const { api, Providers } = setup();
    api.mock.data.taps = [];
    render(
      <Providers>
        <TapsScreen />
      </Providers>,
    );

    expect(await screen.findByText("No taps yet")).toBeInTheDocument();
    expect(
      screen.getByText("Taps appear here within a few seconds of a token touching a station."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load older taps" })).not.toBeInTheDocument();
  });

  it("says no taps match when a filter is set", async () => {
    const { api, Providers } = setup();
    api.mock.data.taps = [];
    const user = userEvent.setup();
    render(
      <Providers>
        <TapsScreen />
      </Providers>,
    );

    await screen.findByText("No taps yet");
    await user.click(screen.getByRole("combobox", { name: "Status" }));
    await user.click(await screen.findByRole("option", { name: "Accepted" }));

    expect(await screen.findByText("No taps match these filters")).toBeInTheDocument();
    expect(screen.getByText("Try a different station or status.")).toBeInTheDocument();
  });

  it("says older taps could not load, and retries them", async () => {
    const { api, Providers } = setup();
    manyTaps(api);
    const user = userEvent.setup();
    render(
      <Providers>
        <TapsScreen />
      </Providers>,
    );

    await screen.findByText(/Showing/);
    api.mock.failNext("internal_error");
    await user.click(await screen.findByRole("button", { name: "Load older taps" }));

    expect(await screen.findByText("Older taps could not load.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(52));
  });

  it("says Loading while older taps are on their way", async () => {
    const { api, Providers } = setup();
    manyTaps(api);
    const user = userEvent.setup();
    render(
      <Providers>
        <TapsScreen />
      </Providers>,
    );

    await screen.findByText(/Showing/);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(api, "listTaps").mockImplementationOnce(async () => {
      await gate;
      return { taps: [], next_before_id: null };
    });

    await user.click(await screen.findByRole("button", { name: "Load older taps" }));
    expect(await screen.findByRole("button", { name: "Loading" })).toBeInTheDocument();

    release();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Loading" })).not.toBeInTheDocument(),
    );
  });

  it("says the station filters are delayed when the board fails", async () => {
    const { api, Providers } = setup();
    api.mock.failNext("internal_error");
    render(
      <Providers>
        <TapsScreen />
      </Providers>,
    );

    expect(await screen.findByText("Station filters are delayed.")).toBeInTheDocument();
  });

  it("keeps the station filter and says it is old when the board poll is rate limited", async () => {
    const { api, Providers, queryClient } = setup();
    render(
      <Providers>
        <TapsScreen />
      </Providers>,
    );

    await screen.findByRole("combobox", { name: "Station" });
    api.mock.failNext("rate_limited");
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: queryKeys.stationBoard });
    });

    expect(await screen.findByText("Showing the last update.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Station" })).toBeInTheDocument();
  });
});
