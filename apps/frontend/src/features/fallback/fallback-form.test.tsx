import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import type { Station } from "@/api/types";
import { FallbackForm } from "@/features/fallback/fallback-form";
import { createTestProviders } from "@/test/providers";

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

const station: Station = {
  id: "ca939e19-8216-4b95-8375-5b54e543c5f6",
  name: "Print Lab",
  location: "Hall A",
  points: 1,
  created_at: "2026-10-10T00:00:00.000Z",
  last_seen_at: null,
  online: false,
};

function setup(stations: Station[] = [station]) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  const { Providers } = createTestProviders(api);
  const user = userEvent.setup();
  render(
    <Providers>
      <FallbackForm stations={stations} />
    </Providers>,
  );
  return { api, user };
}

function chooseStation() {
  const select = document.querySelector("select");
  expect(select).not.toBeNull();
  fireEvent.change(select!, { target: { value: station.id } });
}

describe("FallbackForm", () => {
  it("shows only the Portal user ID field", () => {
    setup();

    expect(screen.getByLabelText("Portal user ID")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByText("Token UID")).not.toBeInTheDocument();
  });

  it("accepts an unknown Portal user ID and logs accepted then cooldown", async () => {
    const { api, user } = setup();
    chooseStation();
    await user.type(screen.getByLabelText("Portal user ID"), "new-user-123");
    await user.click(screen.getByRole("button", { name: "Log tap" }));

    expect(await screen.findByText("Accepted")).toBeInTheDocument();
    expect(api.mock.data.taps.some((tap) => tap.user_id === "new-user-123")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Log another" }));
    await user.type(screen.getByLabelText("Portal user ID"), "new-user-123");
    await user.click(screen.getByRole("button", { name: "Log tap" }));

    expect(await screen.findByText("Cooldown")).toBeInTheDocument();
  });

  it("explains when a station is not in the passport", async () => {
    const photoWall: Station = {
      ...station,
      id: "71e5c3a8-2b9d-4f0e-8a6c-3d1f7b2e9c04",
      name: "Photo Wall",
      points: 0,
    };
    const { user } = setup([photoWall]);
    const select = document.querySelector("select");
    fireEvent.change(select!, { target: { value: photoWall.id } });
    await user.type(screen.getByLabelText("Portal user ID"), "new-user-123");
    await user.click(screen.getByRole("button", { name: "Log tap" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This station isn't in the passport yet.",
    );
  });

  it("shows a form-level error when validation fails without issues", async () => {
    const { api, user } = setup();
    api.mock.failNext("validation_failed");
    chooseStation();
    await user.type(screen.getByLabelText("Portal user ID"), "dev-user-1");
    await user.click(screen.getByRole("button", { name: "Log tap" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Some of the details are not valid. Check the form and try again.",
    );
  });
});
