import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/errors";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { ClaimByCodeForm } from "@/features/home/claim-by-code-form";
import { createTestProviders } from "@/test/providers";

/*
  My tokens' claim-by-code form, agreement 8.2 and section 13. One test per
  acceptance case: a UID in each of the three separator styles, a UID that is not
  one, a claim that works, and each of the errors the service can answer with.

  The form is rendered on its own, without the page, because the page only decides
  where the form sits. What the form does with a UID, and what it says when the
  service refuses, is its own business.
*/

const UNCLAIMED = "04E5F7091B3D";
const UNCLAIMED_TYPED = "04:E5:F7:09:1B:3D";
const TAKEN_BY_SOMEONE_ELSE = "04C3D5F70912";
const TAKEN_TYPED = "04:C3:D5:F7:09:12";
const TICKET_UID = "04E45150324189";
const TICKET_TYPED = "04:E4:51:50:32:41:89";

let api: MockApiClient;

beforeEach(() => {
  api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_PARTICIPANT_ID);
});

function renderForm() {
  const { Providers } = createTestProviders(api);
  return render(
    <Providers>
      <ClaimByCodeForm />
    </Providers>,
  );
}

/** Fills the UID field and submits the form. */
async function claim(uid: string) {
  await userEvent.type(screen.getByLabelText("Token UID"), uid);
  await userEvent.click(screen.getByRole("button", { name: "Claim" }));
}

describe("claiming a token by its code", () => {
  it.each(["04E5F7091B3D", "04:E5:F7:09:1B:3D", "04-e5-f7-09-1b-3d"])(
    "claims a token typed as %s, whatever the separators",
    async (typed) => {
      const claimToken = vi.spyOn(api, "claimToken");
      renderForm();

      await claim(typed);

      // The service normalises the UID, so the two spellings of one token are one request.
      await waitFor(() => expect(claimToken).toHaveBeenCalledWith(UNCLAIMED));
    },
  );

  it("clears the field once the token is claimed, so the next one can be typed", async () => {
    renderForm();
    const field = screen.getByLabelText("Token UID");

    await claim(UNCLAIMED);

    await waitFor(() => expect(field).toHaveValue(""));
  });

  it.each([
    ["04A1B2", "too few bytes"],
    ["04A1B2C3D4E5F6A", "half a byte"],
    ["04A1B2C3D4E5F6A1B2C3D4", "too many bytes"],
  ])("rejects %s, %s, without sending a claim", async (typed) => {
    const claimToken = vi.spyOn(api, "claimToken");
    renderForm();

    await claim(typed);

    expect(
      await screen.findByText(
        "A token's UID is 4 to 10 bytes of hex, so an even number of characters, for example 04:A1:B2:C3:D4:E5:F6.",
      ),
    ).toBeInTheDocument();
    expect(claimToken).not.toHaveBeenCalled();
  });

  it("asks for a UID when the field is empty", async () => {
    const claimToken = vi.spyOn(api, "claimToken");
    renderForm();

    await userEvent.click(screen.getByRole("button", { name: "Claim" }));

    expect(await screen.findByText("Enter the token UID.")).toBeInTheDocument();
    expect(claimToken).not.toHaveBeenCalled();
  });

  it("says someone else claimed it, and keeps the UID for another try", async () => {
    vi.spyOn(api, "claimToken").mockRejectedValueOnce(new ApiError(409, "token_taken"));
    renderForm();

    await claim(TAKEN_BY_SOMEONE_ELSE);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Someone else already claimed this token.",
    );
    expect(screen.getByLabelText("Token UID")).toHaveValue(TAKEN_TYPED);
  });

  it("gives the 3-token cap the wording section 13 fixes", async () => {
    vi.spyOn(api, "claimToken").mockRejectedValueOnce(new ApiError(409, "token_limit_reached"));
    renderForm();

    await claim(UNCLAIMED);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You already have 3 tokens. Release one on My tokens first.",
    );
    expect(screen.getByLabelText("Token UID")).toHaveValue(UNCLAIMED_TYPED);
  });

  it("uses section 13's rate_limited wording", async () => {
    vi.spyOn(api, "claimToken").mockRejectedValueOnce(new ApiError(429, "rate_limited"));
    renderForm();

    await claim(UNCLAIMED);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many tries. Wait a minute and try again.",
    );
  });

  it("uses section 13's claims_unavailable wording", async () => {
    vi.spyOn(api, "claimToken").mockRejectedValueOnce(new ApiError(503, "claims_unavailable"));
    renderForm();

    await claim(UNCLAIMED);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't reach GeeksHacking. Try again.",
    );
  });

  it("puts a validation_failed issue on the field its path names", async () => {
    vi.spyOn(api, "claimToken").mockRejectedValueOnce(
      new ApiError(400, "validation_failed", [
        { path: ["uid"], message: "uid must be 4 to 10 hex bytes" },
      ]),
    );
    renderForm();

    await claim(UNCLAIMED);

    expect(await screen.findByText("uid must be 4 to 10 hex bytes")).toBeInTheDocument();
    expect(screen.getByLabelText("Token UID")).toHaveAccessibleDescription(
      /uid must be 4 to 10 hex bytes$/,
    );
  });

  it("puts validation_failed without issues on the field as well", async () => {
    vi.spyOn(api, "claimToken").mockRejectedValueOnce(new ApiError(400, "validation_failed"));
    renderForm();

    await claim(UNCLAIMED);

    expect(
      await screen.findByText("Some of the details are not valid. Check the form and try again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Token UID")).toHaveAccessibleDescription(
      /Some of the details are not valid\. Check the form and try again\.$/,
    );
  });
});

describe("the UID box (FRO-74)", () => {
  it("groups 04e45150324189 as it is typed, and claims the normalised UID", async () => {
    const claimToken = vi.spyOn(api, "claimToken");
    renderForm();

    await userEvent.type(screen.getByLabelText("Token UID"), "04e45150324189");

    expect(screen.getByLabelText("Token UID")).toHaveValue(TICKET_TYPED);
    await userEvent.click(screen.getByRole("button", { name: "Claim" }));
    await waitFor(() => expect(claimToken).toHaveBeenCalledWith(TICKET_UID));
  });

  it.each(["04E45150324189", "04:E4:51:50:32:41:89", "04 E4 51 50 32 41 89"])(
    "pastes %s into the same grouped UID and claims the same token",
    async (pasted) => {
      const claimToken = vi.spyOn(api, "claimToken");
      renderForm();
      const field = screen.getByLabelText("Token UID");

      await userEvent.click(field);
      await userEvent.paste(pasted);

      expect(field).toHaveValue(TICKET_TYPED);
      await userEvent.click(screen.getByRole("button", { name: "Claim" }));
      await waitFor(() => expect(claimToken).toHaveBeenCalledWith(TICKET_UID));
    },
  );

  it.each(["04E5F7091B3D", "04:E5:F7:09:1B:3D", "04-e5-f7-09-1b-3d"])(
    "shows %s in the same colon pairs",
    async (typed) => {
      renderForm();
      const field = screen.getByLabelText("Token UID");

      await userEvent.type(field, typed);

      expect(field).toHaveValue(UNCLAIMED_TYPED);
    },
  );

  it("keeps the caret where a digit is typed in the middle", async () => {
    renderForm();
    const field = screen.getByLabelText("Token UID") as HTMLInputElement;

    await userEvent.type(field, "04E451");
    expect(field).toHaveValue("04:E4:51");

    field.setSelectionRange(5, 5);
    await userEvent.keyboard("A");

    expect(field).toHaveValue("04:E4:A5:1");
    expect(field.selectionStart).toBe(7);
  });

  it("keeps the caret where a digit is deleted in the middle", async () => {
    renderForm();
    const field = screen.getByLabelText("Token UID") as HTMLInputElement;

    await userEvent.type(field, "04E451");
    field.setSelectionRange(7, 7);
    await userEvent.keyboard("{backspace}");

    expect(field).toHaveValue("04:E4:1");
    expect(field.selectionStart).toBe(5);
  });

  it("drops a character that is not hex without moving the caret to the end", async () => {
    renderForm();
    const field = screen.getByLabelText("Token UID") as HTMLInputElement;

    await userEvent.type(field, "04E451");
    field.setSelectionRange(4, 4);
    await userEvent.keyboard("z");

    expect(field).toHaveValue("04:E4:51");
    expect(field.selectionStart).toBe(4);
  });
});
