import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_GUEST_ID } from "@/api/mock/fixtures";
import { AvatarColourPicker } from "@/features/passport/avatar/avatar-colour-picker";
import { createTestProviders } from "@/test/providers";

const KEY = `gk-avatar-colours:${SEEDED_GUEST_ID}`;

function setUp() {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_GUEST_ID);
  const { Providers } = createTestProviders(api, { session: true });
  render(
    <Providers>
      <AvatarColourPicker userId={SEEDED_GUEST_ID} />
    </Providers>,
  );
  return { api, user: userEvent.setup() };
}

function guestOf(api: ReturnType<typeof setUp>["api"]) {
  const guest = api.mock.data.users.find((user) => user.id === SEEDED_GUEST_ID);
  if (!guest) throw new Error("The fixtures have no guest");
  return guest;
}

beforeEach(() => localStorage.clear());

describe("choosing a look (FRO-181)", () => {
  it("saves the look to the service when a colour changes", async () => {
    const { api, user } = setUp();

    await user.click(screen.getByRole("radio", { name: "Deep" }));

    await waitFor(() => expect(guestOf(api).avatar).toMatchObject({ skin: "deep" }));
    // The browser keeps its copy too, for the first paint.
    expect(JSON.parse(localStorage.getItem(KEY) ?? "null")).toMatchObject({ skin: "deep" });
  });

  it("saves the character with that character's own colours", async () => {
    const { api, user } = setUp();

    await user.click(screen.getByRole("radio", { name: "In a dress" }));

    await waitFor(() =>
      expect(guestOf(api).avatar).toEqual({
        character: "dress",
        skin: "light",
        hair: "black",
        suit: "emerald",
      }),
    );
  });
});
