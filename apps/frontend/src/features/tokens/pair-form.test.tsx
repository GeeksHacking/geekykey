import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { PairForm } from "@/features/tokens/pair-form";
import { createTestProviders } from "@/test/providers";

function setup() {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_PARTICIPANT_ID);
  const { Providers } = createTestProviders(api);
  const user = userEvent.setup();
  render(
    <Providers>
      <PairForm />
    </Providers>,
  );
  return { api, user };
}

describe("PairForm", () => {
  it("shows a form-level error when validation fails without issues", async () => {
    const { api, user } = setup();
    api.mock.failNext("validation_failed");

    await user.type(screen.getByLabelText("Token UID"), "04AABBCCDDEE");
    await user.click(screen.getByRole("button", { name: "Pair token" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Some of the details are not valid. Check the form and try again.",
    );
  });
});
