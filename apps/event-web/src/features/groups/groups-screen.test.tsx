import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { GroupsScreen } from "@/features/groups/groups-screen";
import { createTestProviders } from "@/test/providers";

/** The organizer's screen on the mock, with the fixtures' groups and waiting list unless cleared. */
function renderScreen({
  cleared = false,
  prepare,
}: { cleared?: boolean; prepare?: (api: MockApiClient) => void } = {}) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  if (cleared) {
    api.mock.data.groups = [];
    api.mock.data.groupMembers = [];
  }
  prepare?.(api);
  const { Providers } = createTestProviders(api);
  render(
    <Providers>
      <GroupsScreen />
    </Providers>,
  );
  return { api, user: userEvent.setup() };
}

async function createGroup(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  capacity?: string,
) {
  await user.click(screen.getByRole("button", { name: "Create group" }));
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("Name"), name);
  if (capacity !== undefined) await user.type(within(dialog).getByLabelText("Capacity"), capacity);
  await user.click(within(dialog).getByRole("button", { name: "Create group" }));
}

/** Catches the file a download saves, with its name, in place of the browser saving it. */
function catchDownload() {
  const saved: { blob?: Blob; name?: string } = {};
  const original = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (blob) => {
    saved.blob = blob as Blob;
    return "blob:groups";
  };
  URL.revokeObjectURL = () => {};
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.name = this.download;
  });
  onTestFinished(() => {
    URL.createObjectURL = original;
    URL.revokeObjectURL = originalRevoke;
    click.mockRestore();
  });
  return saved;
}

/** Opens the menu named for a group or a person, as an organiser does, and picks `action`. */
async function pick(user: ReturnType<typeof userEvent.setup>, name: string, action: string) {
  await user.click(await screen.findByRole("button", { name: `Actions for ${name}` }));
  await user.click(await screen.findByRole("menuitem", { name: action }));
}

/** The names listed under a group, or on the waiting list, by each person's menu. */
function namesIn(list: string) {
  return within(screen.getByRole("list", { name: list }))
    .queryAllByRole("button", { name: /^Actions for / })
    .map((button) => button.getAttribute("aria-label")?.replace("Actions for ", ""));
}

describe("GroupsScreen", () => {
  it("downloads everyone's group, times and how as a CSV, named for the groups", async () => {
    const saved = catchDownload();
    const { user } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });

    await user.click(screen.getByRole("button", { name: "Download CSV" }));

    await waitFor(() => expect(saved.name).toMatch(/^geekykey-groups-\d{8}-\d{4}\.csv$/));
    const lines = (await saved.blob!.text()).trimEnd().split("\r\n");
    expect(lines[0]).toBe("user_id,display_name,group_name,joined_at,placed_at,how");
    expect(lines).toHaveLength(6);
    expect(
      screen.getByText(
        "A value that a spreadsheet could run as a formula gets an apostrophe, so it stays text.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Some values were escaped, so this file is not the service's own."),
    ).not.toBeInTheDocument();
  });

  it("escapes a name a spreadsheet could run as a formula, and says the file was changed", async () => {
    const saved = catchDownload();
    const { api, user } = renderScreen();
    api.mock.data.users.find((candidate) => candidate.id === "u_7f3a")!.display_name = "=2+2";
    await screen.findByRole("list", { name: "Waiting" });

    await user.click(screen.getByRole("button", { name: "Download CSV" }));

    await screen.findByText("Some values were escaped, so this file is not the service's own.");
    expect(await saved.blob!.text()).toContain("u_7f3a,'=2+2,");
  });

  it("says why a download failed, saves nothing, and lets the organiser try again", async () => {
    const saved = catchDownload();
    const error = vi.spyOn(toast, "error");
    onTestFinished(() => error.mockRestore());
    const { api, user } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });
    api.mock.failNext("rate_limited");

    await user.click(screen.getByRole("button", { name: "Download CSV" }));

    await waitFor(() =>
      expect(error).toHaveBeenCalledWith("Too many requests. Wait a minute and try again."),
    );
    expect(saved.blob).toBeUndefined();
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeEnabled();
  });

  it("says what to do with no groups, and Allocate says why it can't run", async () => {
    const { user } = renderScreen({ cleared: true });

    expect(await screen.findByRole("heading", { name: "No groups yet" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Allocate" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Create a group first, then press Allocate.",
    );
  });

  it("says how many more people Allocate needs when too few have joined", async () => {
    const { api, user } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });
    // 5 have joined, and a third group makes 6 needed.
    await createGroup(user, "Mixer C");
    await screen.findByRole("heading", { name: "Mixer C" });

    await user.click(screen.getByRole("button", { name: "Allocate" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Each group needs at least 2 people. Wait for 1 more person to join, then press Allocate again.",
    );
    expect(api.mock.data.groupAllocationStartedAt).toBeNull();
    expect(
      within(screen.getByRole("list", { name: "Waiting" })).getAllByRole("listitem"),
    ).toHaveLength(5);
  });

  it("gives a group the capacity typed in the dialog, and none when it's left empty", async () => {
    const { api, user } = renderScreen({ cleared: true });
    await screen.findByRole("heading", { name: "No groups yet" });

    await createGroup(user, "Small room", "6");
    await screen.findByRole("heading", { name: "Small room" });
    await createGroup(user, "Hall");
    await screen.findByRole("heading", { name: "Hall" });

    expect(api.mock.data.groups.map(({ capacity }) => capacity)).toEqual([6, null]);
    expect(screen.getByText((_, element) => element?.textContent === "0 of 6")).toBeInTheDocument();
  });

  it("refuses a capacity that isn't a whole number above 0 before sending it", async () => {
    const { api, user } = renderScreen({ cleared: true });
    await screen.findByRole("heading", { name: "No groups yet" });

    for (const capacity of ["0", "2.5"]) {
      await createGroup(user, `Room ${capacity}`, capacity);
      expect(
        await screen.findByText("Enter a whole number above 0, or leave it empty."),
      ).toBeInTheDocument();
      await user.keyboard("{Escape}");
    }
    expect(api.mock.data.groups).toHaveLength(0);
  });

  it("shows a group over its capacity in words", async () => {
    const { api, user } = renderScreen();
    // Room for 4 of the 5 waiting, so the last overflows into Foyer, the older group.
    for (const group of api.mock.data.groups) group.capacity = 2;
    await screen.findByRole("list", { name: "Waiting" });

    await user.click(screen.getByRole("button", { name: "Allocate" }));

    const foyer = await screen.findByRole("region", { name: "Foyer mixer" });
    await waitFor(() => expect(within(foyer).getByText("Over capacity")).toBeInTheDocument());
    expect(
      within(foyer).getByText((_, element) => element?.textContent === "3 of 2"),
    ).toBeInTheDocument();
    const atrium = screen.getByRole("region", { name: "Atrium mixer" });
    expect(
      within(atrium).getByText((_, element) => element?.textContent === "2 of 2"),
    ).toBeInTheDocument();
    expect(within(atrium).queryByText("Over capacity")).not.toBeInTheDocument();
  });

  it("puts a group created through the dialog on the screen and closes the dialog", async () => {
    const { user } = renderScreen({ cleared: true });
    await screen.findByRole("heading", { name: "No groups yet" });

    await createGroup(user, "Mixer A");

    expect(await screen.findByRole("heading", { name: "Mixer A" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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

  it("gives a group tags and a location in the dialog, and shows them on its panel", async () => {
    const { api, user } = renderScreen({ cleared: true });
    await screen.findByRole("heading", { name: "No groups yet" });
    await user.click(screen.getByRole("button", { name: "Create group" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Mixer A");
    await user.type(within(dialog).getByLabelText("Tags"), "Mixer, Year 1, ");
    await user.type(within(dialog).getByLabelText("Location"), "Room 3-01");
    await user.click(within(dialog).getByRole("button", { name: "Create group" }));

    const panel = await screen.findByRole("region", { name: "Mixer A" });
    expect(api.mock.data.groups[0]).toMatchObject({
      tags: ["Mixer", "Year 1"],
      location: "Room 3-01",
    });
    expect(within(panel).getByText("Mixer")).toBeInTheDocument();
    expect(within(panel).getByText("Year 1")).toBeInTheDocument();
    expect(within(panel).getByText("Room 3-01")).toBeInTheDocument();
  });

  it("refuses a sixth tag, or a location past 80 characters, before sending", async () => {
    const { api, user } = renderScreen({ cleared: true });
    await screen.findByRole("heading", { name: "No groups yet" });
    await user.click(screen.getByRole("button", { name: "Create group" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Mixer A");
    await user.type(within(dialog).getByLabelText("Tags"), "a, b, c, d, e, f");
    await user.click(within(dialog).getByLabelText("Location"));
    await user.paste("x".repeat(81));
    await user.click(within(dialog).getByRole("button", { name: "Create group" }));

    expect(await within(dialog).findByText("Use at most 5 tags.")).toBeInTheDocument();
    expect(within(dialog).getByText("Keep it under 80 characters.")).toBeInTheDocument();
    expect(api.mock.data.groups).toHaveLength(0);
  });

  it("edits a group from its menu, starting from what it has", async () => {
    const { api, user } = renderScreen({
      prepare: (client) => {
        Object.assign(client.mock.data.groups[0]!, { tags: ["Mixer"], capacity: 6 });
      },
    });

    await pick(user, "Foyer mixer", "Edit group…");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Foyer mixer");
    expect(within(dialog).getByLabelText("Tags")).toHaveValue("Mixer");
    expect(within(dialog).getByLabelText("Capacity")).toHaveValue("6");
    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "Foyer");
    await user.type(within(dialog).getByLabelText("Location"), "Level 1 foyer");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("heading", { name: "Foyer" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.mock.data.groups[0]).toMatchObject({
      name: "Foyer",
      tags: ["Mixer"],
      location: "Level 1 foyer",
      capacity: 6,
    });
  });

  it("refuses an edit to a name another group has, under the name", async () => {
    const { api, user } = renderScreen();

    await pick(user, "Foyer mixer", "Edit group…");
    const dialog = await screen.findByRole("dialog");
    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "atrium mixer");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      await within(dialog).findByText("Another group has this name. Choose a different one."),
    ).toBeInTheDocument();
    expect(api.mock.data.groups[0]!.name).toBe("Foyer mixer");
  });

  it("lowers a capacity without moving anyone, and shows the group over capacity", async () => {
    const { user } = renderScreen();
    await user.click(await screen.findByRole("button", { name: "Allocate" }));
    await waitFor(() => expect(namesIn("Members of Foyer mixer")).toHaveLength(3));

    await pick(user, "Foyer mixer", "Edit group…");
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Capacity"), "1");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    const foyer = screen.getByRole("region", { name: "Foyer mixer" });
    expect(await within(foyer).findByText("Over capacity")).toBeInTheDocument();
    expect(namesIn("Members of Foyer mixer")).toHaveLength(3);
  });

  it("deletes a group with nobody in it without asking", async () => {
    const { api, user } = renderScreen();

    await pick(user, "Foyer mixer", "Delete group");

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Foyer mixer" })).not.toBeInTheDocument(),
    );
    expect(api.mock.data.groups.map(({ name }) => name)).toEqual(["Atrium mixer"]);
  });

  it("asks before deleting a group with members, then sends them back to waiting", async () => {
    const { api, user } = renderScreen();
    await user.click(await screen.findByRole("button", { name: "Allocate" }));
    await screen.findByText("Nobody is waiting.");

    await pick(user, "Foyer mixer", "Delete group…");
    const alert = await screen.findByRole("alertdialog");
    expect(alert).toHaveTextContent("Delete Foyer mixer?");
    expect(alert).toHaveTextContent(
      "Its 3 members go back to the waiting list. Press Allocate to place them again.",
    );
    await user.click(within(alert).getByRole("button", { name: "Cancel" }));
    expect(api.mock.data.groups).toHaveLength(2);

    await pick(user, "Foyer mixer", "Delete group…");
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() => expect(namesIn("Waiting")).toHaveLength(3));
    expect(screen.queryByRole("heading", { name: "Foyer mixer" })).not.toBeInTheDocument();
  });

  it("moves someone to another group from their menu", async () => {
    const { api, user } = renderScreen();
    await user.click(await screen.findByRole("button", { name: "Allocate" }));
    await screen.findByText("Nobody is waiting.");
    const [mover] = namesIn("Members of Foyer mixer");

    await pick(user, mover!, "Move to Atrium mixer");

    await waitFor(() => expect(namesIn("Members of Atrium mixer")).toContain(mover));
    expect(namesIn("Members of Foyer mixer")).not.toContain(mover);
    expect(api.mock.data.groupMembers.find(({ how }) => how === "organizer")).toBeDefined();
  });

  it("puts someone waiting in a full group, and shows it over capacity", async () => {
    const { user } = renderScreen({
      prepare: (client) => {
        client.mock.data.groups[1]!.capacity = 1;
      },
    });
    await screen.findByRole("list", { name: "Waiting" });

    await pick(user, "Kenji Ong", "Move to Atrium mixer");
    await waitFor(() => expect(namesIn("Members of Atrium mixer")).toEqual(["Kenji Ong"]));
    await pick(user, "Hui Min Loh", "Move to Atrium mixer");

    const atrium = screen.getByRole("region", { name: "Atrium mixer" });
    expect(await within(atrium).findByText("Over capacity")).toBeInTheDocument();
    expect(namesIn("Members of Atrium mixer")).toEqual(["Kenji Ong", "Hui Min Loh"]);
    expect(namesIn("Waiting")).not.toContain("Kenji Ong");
  });

  it("sends someone back to waiting, and removes someone who has left", async () => {
    const { user } = renderScreen();
    await user.click(await screen.findByRole("button", { name: "Allocate" }));
    await screen.findByText("Nobody is waiting.");
    const [back, gone] = namesIn("Members of Foyer mixer");

    await pick(user, back!, "Send back to waiting");
    await waitFor(() => expect(namesIn("Waiting")).toEqual([back]));

    await pick(user, gone!, "Remove");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: `Actions for ${gone}` })).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "SPAN" && element.textContent === "4 joined, 1 waiting",
      ),
    ).toBeInTheDocument();
  });

  it("says where a move failed, and keeps the screen", async () => {
    const { api, user } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });

    api.mock.failNext("not_found");
    await pick(user, "Kenji Ong", "Move to Atrium mixer");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That was not found. It may have been removed.",
    );
    expect(namesIn("Waiting")).toContain("Kenji Ong");
  });

  it("flags a group with fewer than 2 members once allocation has started", async () => {
    const { user } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });
    expect(screen.queryByText("Fewer than 2 members")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Allocate" }));
    await screen.findByText("Nobody is waiting.");
    expect(screen.queryByText("Fewer than 2 members")).not.toBeInTheDocument();
    for (const name of namesIn("Members of Atrium mixer").slice(1)) {
      await pick(user, name!, "Move to Foyer mixer");
    }

    const atrium = screen.getByRole("region", { name: "Atrium mixer" });
    expect(await within(atrium).findByText("Fewer than 2 members")).toBeInTheDocument();
    const foyer = screen.getByRole("region", { name: "Foyer mixer" });
    expect(within(foyer).queryByText("Fewer than 2 members")).not.toBeInTheDocument();
  });
});
