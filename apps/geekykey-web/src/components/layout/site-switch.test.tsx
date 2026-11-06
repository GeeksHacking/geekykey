import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/errors";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import type { EventServiceLink, LoginLink } from "@/api/types";
import { SiteSwitch } from "@/components/layout/site-switch";
import { stubLocation } from "@/test/location";
import { createTestProviders } from "@/test/providers";

const EVENTS: EventServiceLink[] = [
  { id: "showcase", name: "Capstone Showcase", url: "https://event.geekshacking.com" },
];
const MORE_EVENTS: EventServiceLink[] = [
  ...EVENTS,
  { id: "grad-tea", name: "Grad Tea", url: "https://event.geekshacking.com" },
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

function renderSwitch(events: EventServiceLink[]) {
  const { Providers } = createTestProviders(api);
  return render(
    <Providers>
      <SiteSwitch events={events} />
    </Providers>,
  );
}

describe("SiteSwitch", () => {
  it("marks the key screens as the current site, not as a control", () => {
    renderSwitch(EVENTS);

    expect(screen.getByText("Key")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: "Key" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Key" })).not.toBeInTheDocument();
  });

  it("opens the only event through a login link", async () => {
    const create = vi.spyOn(api, "createLoginLink");
    renderSwitch(EVENTS);

    await userEvent.click(screen.getByRole("button", { name: "Event" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith("showcase", undefined));
    await waitFor(() => expect(location.assign).toHaveBeenCalledWith(MOCK_LINK_URL));
  });

  it("offers each event when there is more than one", async () => {
    const person = userEvent.setup();
    const create = vi.spyOn(api, "createLoginLink").mockResolvedValue({
      url: MOCK_LINK_URL,
      expires_at: "2026-11-06T12:00:00.000Z",
    });
    renderSwitch(MORE_EVENTS);

    const trigger = screen.getByRole("button", { name: "Event" });
    trigger.focus();
    await person.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Capstone Showcase" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Grad Tea" })).toBeInTheDocument();

    await person.click(within(menu).getByRole("menuitem", { name: "Grad Tea" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith("grad-tea", undefined));
    await waitFor(() => expect(location.assign).toHaveBeenCalledWith(MOCK_LINK_URL));
  });

  it("shows nothing when there are no events", () => {
    const { container } = renderSwitch([]);

    expect(container).toBeEmptyDOMElement();
  });

  it("is disabled while the link is being made", async () => {
    vi.spyOn(api, "createLoginLink").mockReturnValue(new Promise<LoginLink>(() => {}));
    renderSwitch(EVENTS);

    const button = screen.getByRole("button", { name: "Event" });
    await userEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());
  });

  it("says section 13's sentence when the service will not repeat the request", async () => {
    vi.spyOn(api, "createLoginLink").mockRejectedValueOnce(new ApiError(429, "rate_limited"));
    renderSwitch(EVENTS);

    await userEvent.click(screen.getByRole("button", { name: "Event" }));

    expect(
      await screen.findByText("Too many tries. Wait a minute and try again."),
    ).toBeInTheDocument();
  });
});
