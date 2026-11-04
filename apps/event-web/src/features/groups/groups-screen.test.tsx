import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { GroupsScreen } from "@/features/groups/groups-screen";
import { createTestProviders } from "@/test/providers";

/** The organizer's screen on the mock, with the fixtures' groups and waiting list unless cleared. */
function renderScreen({ cleared = false } = {}) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  if (cleared) {
    api.mock.data.groups = [];
    api.mock.data.groupMembers = [];
  }
  const { Providers } = createTestProviders(api);
  render(
    <Providers>
      <GroupsScreen />
    </Providers>,
  );
  return { api, user: userEvent.setup() };
}

async function createGroup(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: "Create group" }));
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("Name"), name);
  await user.click(within(dialog).getByRole("button", { name: "Create group" }));
}

describe("GroupsScreen", () => {
  it("says what to do with no groups, and Allocate waits for one", async () => {
    renderScreen({ cleared: true });

    expect(await screen.findByRole("heading", { name: "No groups yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allocate" })).toBeDisabled();
  });

  it("puts a group created through the dialog on the screen and closes the dialog", async () => {
    const { user } = renderScreen({ cleared: true });
    await screen.findByRole("heading", { name: "No groups yet" });

    await createGroup(user, "Mixer A");

    expect(await screen.findByRole("heading", { name: "Mixer A" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allocate" })).toBeEnabled();
  });

  it("shows name_taken under the name and keeps the dialog open", async () => {
    const { api, user } = renderScreen({ cleared: true });
    await screen.findByRole("heading", { name: "No groups yet" });
    await createGroup(user, "Mixer A");
    await screen.findByRole("heading", { name: "Mixer A" });
    expect(api.mock.data.groups).toHaveLength(1);

    await createGroup(user, "Mixer A");

    expect(
      await screen.findByText("Another group has this name. Choose a different one."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(api.mock.data.groups).toHaveLength(1);
  });

  it("refuses a blank name before sending it", async () => {
    const { api, user } = renderScreen({ cleared: true });
    await screen.findByRole("heading", { name: "No groups yet" });

    await createGroup(user, "   ");

    expect(await screen.findByText("Give the group a name.")).toBeInTheDocument();
    expect(api.mock.data.groups).toHaveLength(0);
  });

  it("counts a name in characters, so 80 emoji are allowed and 81 are not", async () => {
    const { api, user } = renderScreen({ cleared: true });
    await screen.findByRole("heading", { name: "No groups yet" });
    await user.click(screen.getByRole("button", { name: "Create group" }));
    const dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByLabelText("Name");
    const submit = within(dialog).getByRole("button", { name: "Create group" });

    await user.click(name);
    await user.paste("😀".repeat(81));
    await user.click(submit);
    expect(await within(dialog).findByText("Keep it under 80 characters.")).toBeInTheDocument();
    expect(api.mock.data.groups).toHaveLength(0);

    await user.clear(name);
    await user.paste("😀".repeat(80));
    await user.click(submit);
    await waitFor(() => expect(api.mock.data.groups).toHaveLength(1));
  });

  it("counts who has joined and lists who is waiting", async () => {
    const { api } = renderScreen();
    const waiting = api.mock.data.groupMembers.length;

    const list = await screen.findByRole("list", { name: "Waiting" });

    expect(within(list).getAllByRole("listitem")).toHaveLength(waiting);
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "SPAN" &&
          element.textContent === `${waiting} joined, ${waiting} waiting`,
      ),
    ).toBeInTheDocument();
  });

  it("places everyone waiting when Allocate is pressed", async () => {
    const { api, user } = renderScreen();
    const names = api.mock.data.groupMembers.length;
    await screen.findByRole("list", { name: "Waiting" });

    await user.click(screen.getByRole("button", { name: "Allocate" }));

    await waitFor(() => expect(screen.getByText("Nobody is waiting.")).toBeInTheDocument());
    const members = api.mock.data.groups.flatMap(({ name }) =>
      within(screen.getByRole("list", { name: `Members of ${name}` })).queryAllByRole("listitem"),
    );
    expect(members).toHaveLength(names);
  });

  it("shows why Allocate failed where it was pressed, and keeps the screen", async () => {
    const { api, user } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });

    api.mock.failNext("internal_error");
    await user.click(screen.getByRole("button", { name: "Allocate" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong on the server. Try again in a moment.",
    );
    expect(screen.getByRole("list", { name: "Waiting" })).toBeInTheDocument();
  });

  it("offers a retry when the first load fails", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ORGANIZER_ID);
    api.mock.failNext("internal_error");
    const { Providers } = createTestProviders(api);
    const user = userEvent.setup();
    render(
      <Providers>
        <GroupsScreen />
      </Providers>,
    );

    await user.click(await screen.findByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("list", { name: "Waiting" })).toBeInTheDocument();
  });
});
