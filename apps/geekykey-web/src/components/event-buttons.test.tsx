import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/errors";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import type { EventServiceLink, LoginLink } from "@/api/types";
import { EventButtons } from "@/components/event-buttons";
import { stubLocation } from "@/test/location";
import { createTestProviders } from "@/test/providers";

/** The one event the fixtures carry, as /me lists it. */
const EVENTS: EventServiceLink[] = [
  { id: "showcase", name: "Capstone Showcase", url: "https://event.geekshacking.com" },
];

/** The link the mock answers: the Event screens' local address, with the link they take. */
const MOCK_LINK_URL = "http://localhost:5173/#login=mock";

let api: MockApiClient;
let location: ReturnType<typeof stubLocation>;

beforeEach(() => {
  api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_PARTICIPANT_ID);
  location = stubLocation();
});

afterEach(() => {
  location.restore();
});

function renderButtons(events: EventServiceLink[]) {
  const { Providers } = createTestProviders(api);
  return render(
    <Providers>
      <EventButtons events={events} />
    </Providers>,
  );
}

describe("EventButtons", () => {
  it("names each button after its event", () => {
    renderButtons(EVENTS);

    expect(screen.getByRole("button", { name: "Open Capstone Showcase" })).toBeInTheDocument();
  });

  it("shows nothing when there are no events", () => {
    // The ticket says no events, no buttons, and nothing else changes.
    const { container } = renderButtons([]);

    expect(container).toBeEmptyDOMElement();
  });

  it("opens the url the answer carries", async () => {
    renderButtons(EVENTS);

    await userEvent.click(screen.getByRole("button", { name: "Open Capstone Showcase" }));

    await waitFor(() => expect(location.assign).toHaveBeenCalledWith(MOCK_LINK_URL));
  });

  it("is disabled while the request is out", async () => {
    // A request that never answers, so the button stays disabled.
    vi.spyOn(api, "createLoginLink").mockReturnValue(new Promise<LoginLink>(() => {}));
    renderButtons(EVENTS);

    await userEvent.click(screen.getByRole("button", { name: "Open Capstone Showcase" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Open Capstone Showcase" })).toBeDisabled(),
    );
  });

  it("stays disabled once the link is open, while the page leaves for it", async () => {
    renderButtons(EVENTS);

    const button = screen.getByRole("button", { name: "Open Capstone Showcase" });
    await userEvent.click(button);
    await waitFor(() => expect(location.assign).toHaveBeenCalledWith(MOCK_LINK_URL));

    // The link works once, so a second press while the browser leaves would ask for a
    // second one.
    expect(button).toBeDisabled();
  });

  it("works again when Back shows the page from the back/forward cache", async () => {
    renderButtons(EVENTS);

    const button = screen.getByRole("button", { name: "Open Capstone Showcase" });
    await userEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());

    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });

    await waitFor(() => expect(button).toBeEnabled());
  });

  it("says section 13's sentence when the service will not repeat the request", async () => {
    vi.spyOn(api, "createLoginLink").mockRejectedValueOnce(new ApiError(429, "rate_limited"));
    renderButtons(EVENTS);

    await userEvent.click(screen.getByRole("button", { name: "Open Capstone Showcase" }));

    expect(
      await screen.findByText("Too many tries. Wait a minute and try again."),
    ).toBeInTheDocument();
  });

  it("says nothing when the service does not have the event, since /me settles it", async () => {
    // Section 13 sets no sentence for 8.6's not_found. The hook asks /me again, and the
    // fresh events decide which buttons there are.
    vi.spyOn(api, "createLoginLink").mockRejectedValueOnce(new ApiError(404, "not_found"));
    renderButtons(EVENTS);

    const button = screen.getByRole("button", { name: "Open Capstone Showcase" });
    await userEvent.click(button);
    await waitFor(() => expect(button).toBeEnabled());

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says nothing when the session is gone, because the login is on its way", async () => {
    let rejectLink: (error: unknown) => void;
    vi.spyOn(api, "createLoginLink").mockReturnValue(
      new Promise<LoginLink>((_, reject) => {
        rejectLink = reject;
      }),
    );
    renderButtons(EVENTS);

    const button = screen.getByRole("button", { name: "Open Capstone Showcase" });
    await userEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());

    await act(async () => {
      rejectLink(new ApiError(401, "unauthenticated"));
    });
    // The button is offered again, so the request has settled and any message would
    // have been read by now.
    await waitFor(() => expect(button).toBeEnabled());

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
