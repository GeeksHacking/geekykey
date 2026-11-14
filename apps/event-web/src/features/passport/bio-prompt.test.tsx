import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/errors";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_GUEST_ID } from "@/api/mock/fixtures";
import { BioPrompt } from "@/features/passport/bio-prompt";
import { createTestProviders } from "@/test/providers";

function guestOf(api: MockApiClient) {
  const guest = api.mock.data.users.find((user) => user.id === SEEDED_GUEST_ID);
  if (!guest) throw new Error("The fixtures have no guest");
  return guest;
}

function renderPrompt() {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_GUEST_ID);
  const onSkip = vi.fn();
  const { Providers } = createTestProviders(api);
  render(
    <Providers>
      <BioPrompt bio={null} contactLine={null} onSkip={onSkip} />
    </Providers>,
  );
  return { api, onSkip, user: userEvent.setup() };
}

describe("the bio step (FRO-186)", () => {
  it("says what the step is for, and who sees each field", () => {
    renderPrompt();

    expect(screen.getByRole("heading", { name: "Your bio" })).toBeInTheDocument();
    expect(
      screen.getByText("Say what you're working on, and how people can reach you."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Anyone who taps your token or whose token you tap sees this."),
    ).toBeInTheDocument();
    expect(screen.getByText("Only people you connect with see this.")).toBeInTheDocument();
  });

  it("saves a bio and leaves the contact line empty", async () => {
    const { api, user } = renderPrompt();

    await user.type(screen.getByLabelText("Bio"), "  Building a robot arm ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(guestOf(api).bio).toBe("Building a robot arm"));
    expect(guestOf(api).contact_line ?? null).toBeNull();
  });

  it("saves a contact line on its own", async () => {
    const { api, user } = renderPrompt();

    await user.type(screen.getByLabelText("Contact line"), "@meilin");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(guestOf(api).contact_line).toBe("@meilin"));
    expect(guestOf(api).bio ?? null).toBeNull();
  });

  it("needs a bio or a contact line to save", async () => {
    const { api, user } = renderPrompt();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Add a bio or a contact line to save.",
    );
    expect(guestOf(api).bio ?? null).toBeNull();
    expect(guestOf(api).contact_line ?? null).toBeNull();
  });

  it("shows the service's refusal under the field it names and keeps what was typed", async () => {
    const { api, user } = renderPrompt();
    vi.spyOn(api, "updateMe").mockRejectedValueOnce(
      new ApiError(400, "validation_failed", [{ path: ["contact_line"], message: "Too long" }]),
    );

    await user.type(screen.getByLabelText("Bio"), "Robot arms");
    await user.type(screen.getByLabelText("Contact line"), "@alex");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Use at most 80 characters.")).toBeInTheDocument();
    expect(screen.getByLabelText("Bio")).toHaveValue("Robot arms");
    expect(screen.getByLabelText("Contact line")).toHaveValue("@alex");
  });

  it("skips", async () => {
    const { onSkip, user } = renderPrompt();

    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
