import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/errors";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_GUEST_ID } from "@/api/mock/fixtures";
import { DashboardScreen } from "@/features/passport/dashboard-screen";
import { useSession } from "@/lib/session";
import { ThemeProvider } from "@/lib/theme-provider";
import { createTestProviders } from "@/test/providers";

vi.mock("@/lib/firebase", () => ({ signOutOfFirebase: vi.fn() }));

const WHO_SEES_BIO = "Anyone who taps your token or whose token you tap sees this.";
const WHO_SEES_CONTACT_LINE = "People you connect with see this.";

function SignedIn({ children }: { children: ReactNode }) {
  const session = useSession();
  return session.status === "authenticated" ? children : <p>Loading</p>;
}

function guestOf(api: MockApiClient) {
  const guest = api.mock.data.users.find((user) => user.id === SEEDED_GUEST_ID);
  if (!guest) throw new Error("The fixtures have no guest");
  return guest;
}

/** The dashboard, for a guest after `arrange` has changed the mock's data. */
function renderDashboard(arrange: (api: MockApiClient) => void = () => {}) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_GUEST_ID);
  arrange(api);
  const { Providers } = createTestProviders(api, { session: true });
  render(
    <Providers>
      <ThemeProvider>
        <SignedIn>
          <DashboardScreen />
        </SignedIn>
      </ThemeProvider>
    </Providers>,
  );
  return { api, user: userEvent.setup() };
}

/** Gives the guest a bio and a contact line. */
const withProfile = (api: MockApiClient) =>
  Object.assign(guestOf(api), { bio: "Old bio", contact_line: "@old" });

async function openForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Change profile" }));
  return screen.findByRole("dialog", { name: "Change profile" });
}

describe("the profile on the dashboard (BAC-147)", () => {
  it("says so when there's no bio or contact line", async () => {
    renderDashboard();

    expect(
      await screen.findByText(
        "No bio or contact line yet. Add them so people you connect with can reach you.",
      ),
    ).toBeInTheDocument();
  });

  it("adds both, and shows them without another read", async () => {
    const { api, user } = renderDashboard();
    const dialog = await openForm(user);

    // BAC-151: the bio shows before the two connect, and the contact line never does.
    expect(within(dialog).getByText(WHO_SEES_BIO)).toBeInTheDocument();
    expect(within(dialog).getByText(WHO_SEES_CONTACT_LINE)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Bio"), "  Building a robot arm ");
    await user.type(within(dialog).getByLabelText("Contact line"), "@alex on Telegram");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Building a robot arm")).toBeInTheDocument();
    expect(screen.getByText("Contact: @alex on Telegram")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(guestOf(api).bio).toBe("Building a robot arm");
    expect(guestOf(api).contact_line).toBe("@alex on Telegram");
  });

  it("starts the form from what's saved, and edits it", async () => {
    const { api, user } = renderDashboard(withProfile);
    const dialog = await openForm(user);
    const bio = within(dialog).getByLabelText("Bio");
    expect(bio).toHaveValue("Old bio");
    expect(within(dialog).getByLabelText("Contact line")).toHaveValue("@old");

    await user.clear(bio);
    await user.type(bio, "New bio");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("New bio")).toBeInTheDocument();
    expect(guestOf(api).contact_line).toBe("@old");
  });

  it("clears both, and goes back to saying there's none", async () => {
    const { api, user } = renderDashboard(withProfile);
    const dialog = await openForm(user);
    await user.clear(within(dialog).getByLabelText("Bio"));
    await user.clear(within(dialog).getByLabelText("Contact line"));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(
        "No bio or contact line yet. Add them so people you connect with can reach you.",
      ),
    ).toBeInTheDocument();
    expect(guestOf(api).bio).toBeNull();
    expect(guestOf(api).contact_line).toBeNull();
  });

  it("says why a value over its limit is refused, counting code points, and saves nothing", async () => {
    const { api, user } = renderDashboard();
    const dialog = await openForm(user);
    const bio = within(dialog).getByLabelText("Bio");
    const contact = within(dialog).getByLabelText("Contact line");

    await user.click(bio);
    await user.paste("😀".repeat(161));
    await user.click(contact);
    await user.paste("x".repeat(81));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("Use at most 160 characters.")).toBeInTheDocument();
    expect(within(dialog).getByText("Use at most 80 characters.")).toBeInTheDocument();
    expect(guestOf(api).bio ?? null).toBeNull();

    await user.clear(bio);
    await user.paste("😀".repeat(160));
    await user.clear(contact);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await screen.findByText("😀".repeat(160));
  });

  it("puts the service's refusal under the field it names", async () => {
    const { api, user } = renderDashboard();
    const dialog = await openForm(user);
    vi.spyOn(api, "updateMe").mockRejectedValueOnce(
      new ApiError(400, "validation_failed", [{ path: ["contact_line"], message: "Too long" }]),
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("Use at most 80 characters.")).toBeInTheDocument();
    expect(within(dialog).queryByText("Use at most 160 characters.")).not.toBeInTheDocument();
  });

  it("says what went wrong when the save fails for another reason", async () => {
    const { api, user } = renderDashboard();
    const dialog = await openForm(user);
    api.mock.failNext("network");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("isn't there for an event with no connections game", async () => {
    renderDashboard((api) => {
      api.mock.data.questions = null;
    });

    await screen.findByRole("heading", { name: "Latest stamps" });
    expect(screen.queryByRole("button", { name: "Change profile" })).not.toBeInTheDocument();
  });
});
