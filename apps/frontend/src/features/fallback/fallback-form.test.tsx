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
  id: "station-print",
  name: "Print Lab",
  location: "Hall A",
  points: 1,
  created_at: "2026-10-10T00:00:00.000Z",
  last_seen_at: null,
  online: false,
};

function setup() {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  const { Providers } = createTestProviders(api);
  const user = userEvent.setup();
  render(
    <Providers>
      <FallbackForm stations={[station]} />
    </Providers>,
  );
  return { api, user };
}

describe("FallbackForm", () => {
  it("names the radio group and clears the identifier when its meaning changes", async () => {
    const { user } = setup();
    expect(
      screen.getByRole("radiogroup", { name: "Identify the participant by" }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Portal user ID"), "dev-user-1");
    await user.click(screen.getByRole("radio", { name: /Token UID/ }));

    expect(screen.getByLabelText("Token UID")).toHaveValue("");
  });

  it("rejects a malformed UID before calling the API", async () => {
    const { user } = setup();
    const select = document.querySelector("select");
    fireEvent.change(select!, { target: { value: station.id } });
    await user.click(screen.getByRole("radio", { name: /Token UID/ }));
    await user.type(screen.getByLabelText("Token UID"), "zz");
    await user.click(screen.getByRole("button", { name: "Log tap" }));

    expect(await screen.findByText(/A UID is 4 to 10 hex bytes/)).toBeInTheDocument();
  });

  it("shows a form-level error when validation fails without issues", async () => {
    const { api, user } = setup();
    api.mock.failNext("validation_failed");

    const select = document.querySelector("select");
    expect(select).not.toBeNull();
    fireEvent.change(select!, { target: { value: station.id } });
    expect(screen.getByRole("combobox", { name: "Station" })).toHaveTextContent(
      "Print Lab (offline)",
    );
    await user.type(screen.getByLabelText("Portal user ID"), "dev-user-1");
    await user.click(screen.getByRole("button", { name: "Log tap" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Some of the details are not valid. Check the form and try again.",
    );
  });
});
