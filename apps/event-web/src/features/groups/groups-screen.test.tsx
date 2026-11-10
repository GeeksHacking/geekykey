// jsdom has no drag events, which drag and drop on the board is made of (FRO-140).
import "@atlaskit/pragmatic-drag-and-drop-unit-testing/drag-event-polyfill";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { ApiError, NetworkError } from "@/api/errors";
import type { GroupBoardResponse } from "@/api/types";
import { queryKeys } from "@/api/keys";
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
  const { Providers, queryClient } = createTestProviders(api);
  const view = render(
    <Providers>
      <GroupsScreen />
    </Providers>,
  );
  return {
    api,
    Providers,
    queryClient,
    ...view,
    user: userEvent.setup(),
    /** What the screen's 5-second poll does, without the wait. */
    poll: () => queryClient.invalidateQueries({ queryKey: queryKeys.groupBoard }),
  };
}

/** Opens the Make groups dialog and gives it. */
async function openMakeGroups(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Make groups" }));
  return screen.findByRole("dialog");
}

/** Opens the Make groups dialog on its way of making each group by hand. */
async function openByHand(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await openMakeGroups(user);
  await user.click(within(dialog).getByRole("radio", { name: "By hand" }));
  return dialog;
}

async function createGroup(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  capacity?: string,
) {
  const dialog = await openByHand(user);
  await user.type(within(dialog).getByLabelText("Name"), name);
  if (capacity !== undefined) await user.type(within(dialog).getByLabelText("Capacity"), capacity);
  await user.click(within(dialog).getByRole("button", { name: "Create group" }));
}

/** Opens the Make groups dialog by people per group, as it starts, and gives it. */
const openSplit = openMakeGroups;

/** Opens the Make groups dialog by number of groups and gives it. */
async function openSplitByCount(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await openMakeGroups(user);
  await user.click(within(dialog).getByRole("radio", { name: "By number of groups" }));
  return dialog;
}

/** Fills the Make groups dialog by number of groups, as an organiser does, and presses Split. */
async function splitByCount(
  user: ReturnType<typeof userEvent.setup>,
  { count, locations = [] }: { count: string; locations?: string[] },
) {
  const dialog = await openSplitByCount(user);
  await user.type(within(dialog).getByLabelText("Number of groups"), count);
  for (const [i, location] of locations.entries()) {
    await user.type(within(dialog).getByLabelText(`Group ${i + 1} location`), location);
  }
  await user.click(within(dialog).getByRole("button", { name: "Split" }));
  return dialog;
}

/** Fills the Make groups dialog by people per group, as an organiser does, and presses Split. */
async function split(
  user: ReturnType<typeof userEvent.setup>,
  { perGroup, locations = [] }: { perGroup: string; locations?: string[] },
) {
  const dialog = await openSplit(user);
  await user.type(within(dialog).getByLabelText("People per group"), perGroup);
  for (const [i, location] of locations.entries()) {
    // A blank one is left as it is.
    if (location !== "")
      await user.type(within(dialog).getByLabelText(`Group ${i + 1} location`), location);
  }
  await user.click(within(dialog).getByRole("button", { name: "Split" }));
  return dialog;
}

/** Someone who has joined and is waiting. */
function waitingMember(user_id: string) {
  return {
    user_id,
    group_id: null,
    joined_at: new Date().toISOString(),
    placed_at: null,
    how: null,
  };
}

/** Sets the board to no groups and exactly `count` people joined, all waiting. */
function withJoined(api: MockApiClient, count: number) {
  api.mock.data.groups = [];
  api.mock.data.groupMembers = Array.from({ length: count }, (_, i) =>
    waitingMember(`u_trial${i}`),
  );
}

/** One more person joins, unseen by the screen until its next poll. */
function oneMoreJoins(api: MockApiClient) {
  api.mock.data.groupMembers.push(waitingMember(`u_late${api.mock.data.groupMembers.length}`));
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

  it("says why a download failed, saves nothing, and clears the message on the next press", async () => {
    const saved = catchDownload();
    const error = vi.spyOn(toast, "error");
    onTestFinished(() => error.mockRestore());
    const { api, user } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });
    api.mock.failNext("rate_limited");

    await user.click(screen.getByRole("button", { name: "Download CSV" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many requests. Wait a minute and try again.",
    );
    expect(error).not.toHaveBeenCalled();
    expect(saved.blob).toBeUndefined();
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Download CSV" }));

    await waitFor(() => expect(saved.name).toMatch(/^geekykey-groups-\d{8}-\d{4}\.csv$/));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says what to do with no groups, and offers one Make groups button and no Allocate", async () => {
    renderScreen({ cleared: true });

    expect(await screen.findByRole("heading", { name: "No groups yet" })).toBeInTheDocument();
    expect(screen.getByText(/press Make groups/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make groups" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reset" })).toBeEnabled();
    for (const gone of ["Create group", "Split into groups", "Allocate"]) {
      expect(screen.queryByRole("button", { name: gone })).not.toBeInTheDocument();
    }
  });

  it("offers the three ways of making groups in one dialog, and keeps the way chosen", async () => {
    const { user } = renderScreen({ cleared: true });
    await screen.findByRole("heading", { name: "No groups yet" });

    const dialog = await openMakeGroups(user);

    expect(screen.getByRole("dialog", { name: "Make groups" })).toBe(dialog);
    expect(within(dialog).getByRole("radiogroup", { name: "How to make groups" })).toBeVisible();
    expect(within(dialog).getByRole("radio", { name: "By people per group" })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: "By number of groups" })).not.toBeChecked();
    expect(within(dialog).getByRole("radio", { name: "By hand" })).not.toBeChecked();
    expect(within(dialog).getByLabelText("People per group")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Number of groups")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Name")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("radio", { name: "By number of groups" }));
    expect(within(dialog).getByLabelText("Number of groups")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("People per group")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("radio", { name: "By hand" }));
    expect(within(dialog).getByLabelText("Name")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Number of groups")).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    const again = await openMakeGroups(user);
    expect(within(again).getByRole("radio", { name: "By hand" })).toBeChecked();
  });

  it("makes a group by hand with its name, tags, location and capacity, and leaves the others", async () => {
    const { api, user } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });

    const dialog = await openByHand(user);
    expect(within(dialog).queryByText(/This replaces/)).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Name"), "Mixer C");
    await user.type(within(dialog).getByLabelText("Tags"), "Year 1, Mixer");
    await user.type(within(dialog).getByLabelText("Location"), "Room 3A");
    await user.type(within(dialog).getByLabelText("Capacity"), "6");
    await user.click(within(dialog).getByRole("button", { name: "Create group" }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(api.mock.data.groups.map(({ name }) => name)).toEqual([
      "Foyer mixer",
      "Atrium mixer",
      "Mixer C",
    ]);
    expect(api.mock.data.groups.at(-1)).toMatchObject({
      tags: ["Year 1", "Mixer"],
      location: "Room 3A",
      capacity: 6,
    });
  });

  it("shows Allocate only with groups and someone waiting, and takes it away once they're placed", async () => {
    const { api, user } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });

    await user.click(screen.getByRole("button", { name: "Allocate" }));

    await screen.findByText("Nobody is waiting.");
    expect(screen.queryByRole("button", { name: "Allocate" })).not.toBeInTheDocument();
    expect(api.mock.data.groupMembers.every(({ group_id }) => group_id !== null)).toBe(true);
  });

  it("brings Allocate back when someone waits again", async () => {
    const { api, user, poll } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });
    await user.click(screen.getByRole("button", { name: "Allocate" }));
    await screen.findByText("Nobody is waiting.");

    oneMoreJoins(api);
    await poll();

    expect(await screen.findByRole("button", { name: "Allocate" })).toBeEnabled();
  });

  it("shows no Allocate with people waiting and no groups", async () => {
    renderScreen({ prepare: (api) => withJoined(api, 4) });

    await screen.findByRole("list", { name: "Waiting" });

    expect(screen.queryByRole("button", { name: "Allocate" })).not.toBeInTheDocument();
  });

  it("drops Allocate's refusal for good once there's nobody left to allocate", async () => {
    const { api, user, poll } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });
    await createGroup(user, "Mixer C");
    await screen.findByRole("heading", { name: "Mixer C" });
    await user.click(screen.getByRole("button", { name: "Allocate" }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Reset" }));
    const alert = await screen.findByRole("alertdialog");
    await user.click(within(alert).getByRole("button", { name: "Reset" }));

    await screen.findByText("Nobody is waiting.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(api.mock.data.groupMembers).toEqual([]);

    // The next trial's crowd brings the button back, without the old sentence.
    for (let i = 0; i < 6; i++) oneMoreJoins(api);
    await poll();
    await screen.findByRole("button", { name: "Allocate" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says to make groups when another organiser deleted them just before Allocate", async () => {
    const { api, user } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });
    api.mock.data.groups = [];

    await user.click(screen.getByRole("button", { name: "Allocate" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Make groups first, then press Allocate.",
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
    const dialog = await openByHand(user);
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

  it("asks before a reset, then empties every group and the waiting list and keeps the groups", async () => {
    const { api, user } = renderScreen();
    const groups = api.mock.data.groups.map(({ name }) => name);
    await user.click(await screen.findByRole("button", { name: "Allocate" }));
    await screen.findByText("Nobody is waiting.");

    await user.click(screen.getByRole("button", { name: "Reset" }));
    const alert = await screen.findByRole("alertdialog");
    expect(alert).toHaveTextContent("Reset the groups?");
    expect(alert).toHaveTextContent(
      "Everyone leaves their group and has to join again, and Allocate starts over. The groups stay as they are. Download the CSV first to keep this trial's times.",
    );
    await user.click(within(alert).getByRole("button", { name: "Cancel" }));
    expect(api.mock.data.groupMembers).not.toHaveLength(0);
    expect(api.mock.data.groupAllocationStartedAt).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Reset" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reset" }),
    );

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "SPAN" && element.textContent === "0 joined, 0 waiting",
      ),
    ).toBeInTheDocument();
    for (const name of groups) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
      expect(screen.queryByRole("list", { name: `Members of ${name}` })).not.toBeInTheDocument();
    }
    expect(screen.getAllByText("Nobody here yet.")).toHaveLength(groups.length);
    expect(api.mock.data.groupAllocationStartedAt).toBeNull();
  });

  it("says why a reset failed in its alert, and keeps everyone where they are", async () => {
    const { api, user } = renderScreen();
    await user.click(await screen.findByRole("button", { name: "Allocate" }));
    await screen.findByText("Nobody is waiting.");

    await user.click(screen.getByRole("button", { name: "Reset" }));
    const alert = await screen.findByRole("alertdialog");
    api.mock.failNext("internal_error");
    await user.click(within(alert).getByRole("button", { name: "Reset" }));

    expect(await within(alert).findByRole("alert")).toHaveTextContent(
      "Something went wrong on the server. Try again in a moment.",
    );
    expect(screen.getByText("Nobody is waiting.")).toBeInTheDocument();
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
    const dialog = await openByHand(user);
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
    const dialog = await openByHand(user);
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

  it("asks before deleting a group with nobody in it too, since a latecomer may just have joined it", async () => {
    const { api, user } = renderScreen();

    await pick(user, "Foyer mixer", "Delete group…");
    const alert = await screen.findByRole("alertdialog");
    expect(alert).toHaveTextContent("Delete Foyer mixer?");
    expect(alert).toHaveTextContent("Nobody is in it.");
    await user.click(within(alert).getByRole("button", { name: "Delete" }));

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

  it("works out the groups from who has joined, with each group's location, in one press", async () => {
    // 5 have joined and there are no groups.
    const { api, user } = renderScreen({ prepare: (api) => (api.mock.data.groups = []) });
    await screen.findByRole("list", { name: "Waiting" });

    const dialog = await split(user, { perGroup: "2", locations: ["Room 3A"] });

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(screen.getByText("Nobody is waiting.")).toBeInTheDocument();
    const first = screen.getByRole("region", { name: "Group 1" });
    const second = screen.getByRole("region", { name: "Group 2" });
    expect(within(first).getByText("Room 3A")).toBeInTheDocument();
    expect(namesIn("Members of Group 1")).toHaveLength(3);
    expect(namesIn("Members of Group 2")).toHaveLength(2);
    // 3 in a group of 2 shows in words.
    expect(within(first).getByText("Over capacity")).toBeInTheDocument();
    expect(within(second).queryByText("Over capacity")).not.toBeInTheDocument();
    expect(api.mock.data.groups.map(({ capacity, location }) => [capacity, location])).toEqual([
      [2, "Room 3A"],
      [2, null],
    ]);
  });

  it("puts 3 joined at 2 per group in one group of 3, which shows Over capacity", async () => {
    const { user } = renderScreen({ prepare: (api) => withJoined(api, 3) });
    await screen.findByRole("list", { name: "Waiting" });

    const dialog = await split(user, { perGroup: "2" });

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    const only = screen.getByRole("region", { name: "Group 1" });
    expect(within(only).getByText("Over capacity")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Group 2" })).not.toBeInTheDocument();
  });

  it.each([
    [12, "4", "12 have joined. This makes 3 groups of 4."],
    [4, "2", "4 have joined. This makes 2 groups of 2."],
    [13, "4", "13 have joined. This makes 4 groups: 1 of 4 and 3 of 3."],
    [7, "3", "7 have joined. This makes 3 groups: 1 of 3 and 2 of 2."],
    [5, "2", "5 have joined. This makes 2 groups: 1 of 3 and 1 of 2."],
    [3, "2", "3 have joined. This makes 1 group of 3."],
    [3, "10", "3 have joined. This makes 1 group of 3."],
    [5, "", "5 have joined."],
    [5, "1", "5 have joined."],
    [2, "", "2 have joined."],
    [1, "2", "1 has joined. A split needs at least 2."],
    [0, "2", "Nobody has joined yet. A split needs at least 2."],
  ])("with %i joined at %j per group, the form says %j", async (count, perGroup, line) => {
    const { user } = renderScreen({ prepare: (api) => withJoined(api, count) });
    await screen.findByRole("heading", { name: "Waiting" });

    const dialog = await openSplit(user);
    if (perGroup !== "") {
      await user.type(within(dialog).getByLabelText("People per group"), perGroup);
    }

    expect(within(dialog).getByText(line)).toBeInTheDocument();
  });

  it("updates its line and location fields as people join, keeping what was typed", async () => {
    const { api, user, poll } = renderScreen({ prepare: (api) => withJoined(api, 5) });
    await screen.findByRole("list", { name: "Waiting" });
    const dialog = await openSplit(user);
    await user.type(within(dialog).getByLabelText("People per group"), "2");
    expect(within(dialog).getAllByLabelText(/^Group \d+ location$/)).toHaveLength(2);
    await user.type(within(dialog).getByLabelText("Group 1 location"), "Room 3A");

    oneMoreJoins(api);
    await poll();

    expect(
      await within(dialog).findByText("6 have joined. This makes 3 groups of 2."),
    ).toBeInTheDocument();
    expect(within(dialog).getAllByLabelText(/^Group \d+ location$/)).toHaveLength(3);
    expect(within(dialog).getByLabelText("Group 1 location")).toHaveValue("Room 3A");
  });

  it("gives a group with no field yet no location, when someone joined just before the press", async () => {
    const { api, user } = renderScreen({ prepare: (api) => withJoined(api, 4) });
    await screen.findByRole("list", { name: "Waiting" });
    const dialog = await openSplit(user);
    await user.type(within(dialog).getByLabelText("People per group"), "2");
    await user.type(within(dialog).getByLabelText("Group 1 location"), "Room 3A");
    await user.type(within(dialog).getByLabelText("Group 2 location"), "Lobby");

    oneMoreJoins(api);
    oneMoreJoins(api);
    await user.click(within(dialog).getByRole("button", { name: "Split" }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(api.mock.data.groups.map(({ location }) => location)).toEqual([
      "Room 3A",
      "Lobby",
      null,
    ]);
  });

  it("says in the dialog how many more people the split needs, makes nothing, and works once they join", async () => {
    const { api, user } = renderScreen({ prepare: (api) => withJoined(api, 1) });
    await screen.findByRole("list", { name: "Waiting" });

    const dialog = await split(user, { perGroup: "2" });

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Each group needs at least 2 people. Wait for 1 more person to join, then press Split again.",
    );
    expect(api.mock.data.groups).toEqual([]);
    expect(api.mock.data.groupAllocationStartedAt).toBeNull();

    oneMoreJoins(api);
    await user.click(within(dialog).getByRole("button", { name: "Split" }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(api.mock.data.groups.map(({ name }) => name)).toEqual(["Group 1"]);
    expect(await screen.findByText("Nobody is waiting.")).toBeInTheDocument();
  });

  it("splits by number of groups, with each group's location and no capacity", async () => {
    const { api, user } = renderScreen({ prepare: (api) => withJoined(api, 10) });
    await screen.findByRole("list", { name: "Waiting" });

    const dialog = await splitByCount(user, { count: "3", locations: ["Room 3A", "Lobby"] });

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(namesIn("Members of Group 1")).toHaveLength(4);
    expect(namesIn("Members of Group 2")).toHaveLength(3);
    expect(namesIn("Members of Group 3")).toHaveLength(3);
    expect(screen.queryByText("Over capacity")).not.toBeInTheDocument();
    expect(api.mock.data.groups.map(({ capacity, location }) => [capacity, location])).toEqual([
      [null, "Room 3A"],
      [null, "Lobby"],
      [null, null],
    ]);
  });

  it.each([
    [10, "3", "10 have joined. This makes 3 groups: 1 of 4 and 2 of 3."],
    [12, "3", "12 have joined. This makes 3 groups of 4."],
    [5, "1", "5 have joined. This makes 1 group of 5."],
    [5, "3", "5 have joined. 3 groups need at least 6."],
    [1, "1", "1 has joined. 1 group needs at least 2."],
    [0, "2", "Nobody has joined yet. 2 groups need at least 4."],
    [5, "", "5 have joined."],
    [5, "0", "5 have joined."],
    [1, "", "1 has joined. A split needs at least 2."],
  ])("with %i joined into %j groups, the form says %j", async (count, groups, line) => {
    const { user } = renderScreen({ prepare: (api) => withJoined(api, count) });
    await screen.findByRole("heading", { name: "Waiting" });

    const dialog = await openSplitByCount(user);
    if (groups !== "") await user.type(within(dialog).getByLabelText("Number of groups"), groups);

    expect(within(dialog).getByText(line)).toBeInTheDocument();
  });

  it("draws a location field for each group typed, even before enough have joined, and up to 30", async () => {
    const { user } = renderScreen({ prepare: (api) => withJoined(api, 5) });
    await screen.findByRole("list", { name: "Waiting" });
    const dialog = await openSplitByCount(user);
    const count = within(dialog).getByLabelText("Number of groups");

    await user.type(count, "3");
    expect(within(dialog).getAllByLabelText(/^Group \d+ location$/)).toHaveLength(3);

    await user.clear(count);
    await user.type(count, "31");
    expect(within(dialog).getAllByLabelText(/^Group \d+ location$/)).toHaveLength(30);
    expect(within(dialog).getByText(/Only the first 30 have a field here\./)).toBeInTheDocument();
  });

  it("says in the dialog that 1 more person is needed for 3 groups, and makes nothing, until they join", async () => {
    const { api, user } = renderScreen({ prepare: (api) => withJoined(api, 5) });
    await screen.findByRole("list", { name: "Waiting" });

    const dialog = await splitByCount(user, { count: "3" });

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Each group needs at least 2 people. Wait for 1 more person to join, then press Split again.",
    );
    expect(api.mock.data.groups).toEqual([]);

    oneMoreJoins(api);
    await user.click(within(dialog).getByRole("button", { name: "Split" }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(api.mock.data.groups.map(({ name }) => name)).toEqual(["Group 1", "Group 2", "Group 3"]);
  });

  it("refuses a number of groups below 1, or not whole, before sending", async () => {
    const { api, user } = renderScreen({ prepare: (api) => withJoined(api, 4) });
    await screen.findByRole("list", { name: "Waiting" });
    const dialog = await openSplitByCount(user);
    const count = within(dialog).getByLabelText("Number of groups");

    await user.click(within(dialog).getByRole("button", { name: "Split" }));
    expect(await within(dialog).findByText("Enter a whole number, 1 or more.")).toBeVisible();

    for (const typed of ["0", "2.5", "two"]) {
      await user.clear(count);
      await user.type(count, typed);
      expect(within(dialog).queryAllByLabelText(/^Group \d+ location$/)).toHaveLength(0);
      await user.click(within(dialog).getByRole("button", { name: "Split" }));

      expect(await within(dialog).findByText("Enter a whole number, 1 or more.")).toBeVisible();
      expect(api.mock.data.groups).toEqual([]);
    }
  });

  it.each([
    ["by people per group", openSplit],
    ["by number of groups", openSplitByCount],
  ])("warns %s that it replaces empty groups, then replaces them", async (_, open) => {
    // Foyer mixer and Atrium mixer, nobody placed and 5 waiting.
    const { api, user } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });

    const dialog = await open(user);

    expect(
      within(dialog).getByText(
        "This replaces the 2 empty groups, including their names and locations.",
      ),
    ).toBeInTheDocument();
    const field = within(dialog).getByRole("textbox", {
      name: /People per group|Number of groups/,
    });
    await user.type(field, "2");
    await user.click(within(dialog).getByRole("button", { name: "Split" }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(api.mock.data.groups.map(({ name }) => name)).toEqual(["Group 1", "Group 2"]);
    expect(screen.queryByRole("region", { name: "Foyer mixer" })).not.toBeInTheDocument();
    expect(await screen.findByText("Nobody is waiting.")).toBeInTheDocument();
  });

  it("names one empty group in the singular when it warns", async () => {
    const { user } = renderScreen({
      prepare: (api) => (api.mock.data.groups = api.mock.data.groups.slice(0, 1)),
    });
    await screen.findByRole("list", { name: "Waiting" });

    const dialog = await openSplit(user);

    expect(
      within(dialog).getByText("This replaces the empty group, including its name and location."),
    ).toBeInTheDocument();
  });

  it("gives no warning with no groups to replace", async () => {
    const { user } = renderScreen({ prepare: (api) => withJoined(api, 4) });
    await screen.findByRole("list", { name: "Waiting" });

    const dialog = await openSplit(user);

    expect(within(dialog).queryByText(/This replaces/)).not.toBeInTheDocument();
  });

  it("keeps the empty groups when a split is refused for too few people", async () => {
    const { api, user } = renderScreen({
      prepare: (api) => (api.mock.data.groupMembers = api.mock.data.groupMembers.slice(0, 1)),
    });
    await screen.findByRole("heading", { name: "Waiting" });

    const dialog = await split(user, { perGroup: "2" });

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Wait for 1 more person to join",
    );
    expect(api.mock.data.groups.map(({ name }) => name)).toEqual(["Foyer mixer", "Atrium mixer"]);
  });

  it("makes groups again after a split and a Reset, with different numbers", async () => {
    const { api, user, poll } = renderScreen({ prepare: (api) => withJoined(api, 6) });
    await screen.findByRole("list", { name: "Waiting" });
    const first = await split(user, { perGroup: "3" });
    await waitFor(() => expect(first).not.toBeInTheDocument());
    expect(api.mock.data.groups).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Reset" }));
    const alert = await screen.findByRole("alertdialog");
    await user.click(within(alert).getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(alert).not.toBeInTheDocument());
    for (let i = 0; i < 6; i++) oneMoreJoins(api);
    await poll();
    await screen.findByRole("list", { name: "Waiting" });

    const second = await splitByCount(user, { count: "3" });

    await waitFor(() => expect(second).not.toBeInTheDocument());
    expect(api.mock.data.groups.map(({ capacity }) => capacity)).toEqual([null, null, null]);
    expect(namesIn("Members of Group 3")).toHaveLength(2);
  });

  it("catches up after losing a race, so the dialog doesn't still promise groups", async () => {
    const { api, user } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });
    const dialog = await openSplit(user);
    await user.type(within(dialog).getByLabelText("People per group"), "2");
    expect(within(dialog).getByText(/This replaces the 2 empty groups/)).toBeInTheDocument();

    // Another organiser places someone, unseen by the screen until its next poll.
    const [member] = api.mock.data.groupMembers;
    member!.group_id = api.mock.data.groups[0]!.id;
    member!.placed_at = new Date().toISOString();
    member!.how = "organizer";
    await user.click(within(dialog).getByRole("button", { name: "Split" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "People are in groups already",
    );
    await waitFor(() =>
      expect(within(dialog).queryByText(/This replaces/)).not.toBeInTheDocument(),
    );
    expect(within(dialog).getByText("5 have joined.")).toBeInTheDocument();
  });

  it("with anyone placed, gives no warning, says why it refuses in the dialog, and changes nothing", async () => {
    const { api, user } = renderScreen({
      prepare: (api) => {
        const [member] = api.mock.data.groupMembers;
        member!.group_id = api.mock.data.groups[0]!.id;
        member!.placed_at = new Date().toISOString();
        member!.how = "organizer";
      },
    });
    await screen.findByRole("list", { name: "Waiting" });
    const before = structuredClone(api.mock.data.groupMembers);

    const dialog = await openSplit(user);
    expect(within(dialog).queryByText(/This replaces/)).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("People per group"), "2");
    expect(within(dialog).getByText("5 have joined.")).toBeInTheDocument();
    expect(within(dialog).queryAllByLabelText(/^Group \d+ location$/)).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Split" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "People are in groups already, so nothing changed. Press Reset to empty the groups, then make groups again.",
    );
    expect(api.mock.data.groups.map(({ name }) => name)).toEqual(["Foyer mixer", "Atrium mixer"]);
    expect(api.mock.data.groupMembers).toEqual(before);
  });

  it("refuses a people per group below 2, or not whole, before sending", async () => {
    const { api, user } = renderScreen({ prepare: (api) => withJoined(api, 4) });
    await screen.findByRole("list", { name: "Waiting" });
    const dialog = await openSplit(user);
    const perGroup = within(dialog).getByLabelText("People per group");

    for (const typed of ["1", "0", "2.5", "two"]) {
      await user.clear(perGroup);
      await user.type(perGroup, typed);
      expect(within(dialog).queryAllByLabelText(/^Group \d+ location$/)).toHaveLength(0);
      await user.click(within(dialog).getByRole("button", { name: "Split" }));

      expect(await within(dialog).findByText("Enter a whole number, 2 or more.")).toBeVisible();
      expect(api.mock.data.groups).toEqual([]);
    }
  });

  it("draws a location field for up to 30 groups, and says how to set the rest", async () => {
    // 62 at 2 per group makes 31 groups.
    const { user } = renderScreen({ prepare: (api) => withJoined(api, 62) });
    await screen.findByRole("list", { name: "Waiting" });
    const dialog = await openSplit(user);

    await user.type(within(dialog).getByLabelText("People per group"), "2");

    expect(within(dialog).getByText("62 have joined. This makes 31 groups of 2.")).toBeVisible();
    expect(within(dialog).getAllByLabelText(/^Group \d+ location$/)).toHaveLength(30);
    expect(
      within(dialog).getByText(
        /Only the first 30 have a field here\. Set the rest from each group's menu afterwards\./,
      ),
    ).toBeInTheDocument();
  });

  it("refuses a location past 80 characters before sending, and sends a blank one as none", async () => {
    const { api, user } = renderScreen({ prepare: (api) => withJoined(api, 4) });
    await screen.findByRole("list", { name: "Waiting" });

    const dialog = await split(user, { perGroup: "2", locations: ["", "a".repeat(81)] });

    expect(await within(dialog).findByText("Keep it under 80 characters.")).toBeInTheDocument();
    expect(api.mock.data.groups).toEqual([]);

    const second = within(dialog).getByLabelText("Group 2 location");
    await user.clear(second);
    await user.type(second, "Lobby");
    await user.click(within(dialog).getByRole("button", { name: "Split" }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(api.mock.data.groups.map(({ location }) => location)).toEqual([null, "Lobby"]);
  });

  it("neither checks nor sends a location whose field has gone", async () => {
    const { api, user } = renderScreen({ prepare: (api) => withJoined(api, 6) });
    await screen.findByRole("list", { name: "Waiting" });
    const dialog = await openSplit(user);
    const perGroup = within(dialog).getByLabelText("People per group");
    await user.type(perGroup, "2");
    await user.type(within(dialog).getByLabelText("Group 1 location"), "Room 3A");
    await user.type(within(dialog).getByLabelText("Group 3 location"), "a".repeat(81));

    // 3 per group makes 2 groups, so Group 3's field goes.
    await user.clear(perGroup);
    await user.type(perGroup, "3");
    expect(within(dialog).queryByLabelText("Group 3 location")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Split" }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(api.mock.data.groups.map(({ location }) => location)).toEqual(["Room 3A", null]);
  });

  it("shows what connections need, token kinds for a new event, and switches it to groups", async () => {
    const { api, user } = renderScreen();
    const kinds = await screen.findByRole("radio", { name: "Connect across token kinds" });
    const groups = screen.getByRole("radio", { name: "Connect across groups" });
    expect(kinds).toBeChecked();
    expect(groups).not.toBeChecked();

    await user.click(groups);

    await waitFor(() => expect(groups).toBeChecked());
    expect(kinds).not.toBeChecked();
    expect(api.mock.data.connectAcross).toBe("groups");
  });

  it("keeps the setting when a change fails, and says why", async () => {
    const { api, user } = renderScreen();
    const groups = await screen.findByRole("radio", { name: "Connect across groups" });
    api.mock.failNext("internal_error");

    await user.click(groups);

    expect(await screen.findByText(/Couldn't change what connections need\./)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Connect across token kinds" })).toBeChecked();
    expect(api.mock.data.connectAcross).toBe("token_kinds");
  });

  it("shows which challenge a new connection plays, Random for a new event, and switches it to Dice", async () => {
    const { api, user } = renderScreen();
    const random = await screen.findByRole("radio", { name: "Random" });
    const dice = screen.getByRole("radio", { name: "Dice" });
    const reaction = screen.getByRole("radio", { name: "Reaction" });
    expect(random).toBeChecked();

    await user.click(dice);

    await waitFor(() => expect(dice).toBeChecked());
    expect(random).not.toBeChecked();
    expect(reaction).not.toBeChecked();
    expect(api.mock.data.challenge).toBe("dice");
    // The connection rule stays as it was.
    expect(screen.getByRole("radio", { name: "Connect across token kinds" })).toBeChecked();
  });

  it("keeps the challenge when a change fails, and says why", async () => {
    const { api, user } = renderScreen();
    const reaction = await screen.findByRole("radio", { name: "Reaction" });
    api.mock.failNext("internal_error");

    await user.click(reaction);

    expect(await screen.findByText(/Couldn't change the challenge\./)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Random" })).toBeChecked();
    expect(api.mock.data.challenge).toBe("random");
  });

  it("offers no choice of challenge when the Event Service is from before it", async () => {
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    renderScreen({
      prepare: (api) => {
        const readBoard = api.groupBoard.bind(api);
        vi.spyOn(api, "groupBoard").mockImplementation(async () => {
          const { challenge: _left, ...older } = await readBoard();
          return older;
        });
      },
    });

    expect(
      await screen.findByRole("radio", { name: "Connect across token kinds" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Random" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Challenge" })).not.toBeInTheDocument();
  });
});

/** A person's row on the board, which is what an organiser drags. */
function rowOf(name: string) {
  return screen.getByRole("button", { name: `Actions for ${name}` }).closest("li")!;
}

/** A group's panel, or the waiting list's section, which a person is dropped on. */
function place(name: string) {
  return screen.getByRole("region", { name });
}

/** Picks up a person's row and holds it, as a mouse drag or a long press does. */
async function pickUp(name: string) {
  const row = rowOf(name);
  fireEvent.dragStart(row);
  // The drag begins on the next frame, after the browser has taken its picture of the row.
  await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  return row;
}

/** Carries the held row over `target`, as the pointer does on its way to a drop. */
function hoverOver(target: HTMLElement) {
  fireEvent.dragEnter(target);
  fireEvent.dragOver(target);
}

/**
 * Drags a person's row onto `target` and lets go there. A browser fires `drop` only on a place
 * that accepted the drag; anywhere else the drag just ends.
 */
async function dragTo(name: string, target: HTMLElement) {
  const row = await pickUp(name);
  hoverOver(target);
  if (target.hasAttribute("data-drop-over")) fireEvent.drop(target);
  else fireEvent.dragEnd(row);
}

describe("Dragging people between groups", () => {
  it("drags someone waiting into an empty group, and the counts follow", async () => {
    const { api } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });
    const move = vi.spyOn(api, "placeGroupMember");
    onTestFinished(() => {
      vi.restoreAllMocks();
    });

    await dragTo("Kenji Ong", place("Atrium mixer"));

    await waitFor(() => expect(namesIn("Members of Atrium mixer")).toEqual(["Kenji Ong"]));
    expect(namesIn("Waiting")).not.toContain("Kenji Ong");
    expect(move).toHaveBeenCalledExactlyOnceWith("u_2e8b", "g_atrium");
    expect(within(place("Atrium mixer")).getByText("1")).toBeInTheDocument();
  });

  it("drags someone from one group to another and back to waiting, and keeps it after a reload", async () => {
    const { api, user } = renderScreen();
    await user.click(await screen.findByRole("button", { name: "Allocate" }));
    await screen.findByText("Nobody is waiting.");
    const [mover] = namesIn("Members of Foyer mixer");

    await dragTo(mover!, place("Atrium mixer"));
    await waitFor(() => expect(namesIn("Members of Atrium mixer")).toContain(mover));
    expect(namesIn("Members of Foyer mixer")).not.toContain(mover);
    // What a reload reads.
    const saved = await api.groupBoard();
    const atrium = saved.groups.find(({ name }) => name === "Atrium mixer")!;
    expect(atrium.members.map(({ display_name }) => display_name)).toContain(mover);

    await dragTo(mover!, place("Waiting"));
    await waitFor(() => expect(namesIn("Waiting")).toEqual([mover]));
  });

  it("sends nothing for a drop on their own place, outside any place, or a cancelled drag", async () => {
    const { api } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });
    const move = vi.spyOn(api, "placeGroupMember");
    onTestFinished(() => {
      vi.restoreAllMocks();
    });

    await dragTo("Kenji Ong", place("Waiting"));
    expect(place("Waiting")).not.toHaveAttribute("data-drop-over");

    const row = await pickUp("Kenji Ong");
    hoverOver(screen.getByRole("heading", { name: "Groups" }));
    fireEvent.dragEnd(row);

    const again = await pickUp("Kenji Ong");
    hoverOver(place("Atrium mixer"));
    // Escape, or letting go somewhere the browser won't drop, ends the drag with no drop.
    fireEvent.dragEnd(again);

    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(move).not.toHaveBeenCalled();
    expect(namesIn("Waiting")).toContain("Kenji Ong");
    expect(within(place("Atrium mixer")).getByText("Nobody here yet.")).toBeInTheDocument();
  });

  it("sends nothing for a drop on their own group, as it is at the latest poll", async () => {
    const { api, user, poll } = renderScreen();
    await user.click(await screen.findByRole("button", { name: "Allocate" }));
    await screen.findByText("Nobody is waiting.");
    const [stayer] = namesIn("Members of Foyer mixer");
    const move = vi.spyOn(api, "placeGroupMember");
    onTestFinished(() => {
      vi.restoreAllMocks();
    });

    await dragTo(stayer!, place("Foyer mixer"));
    expect(place("Foyer mixer")).not.toHaveAttribute("data-drop-over");
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(move).not.toHaveBeenCalled();

    // Another organiser moves them while they're held: Atrium is now their place, and Foyer isn't.
    const { groups } = await api.groupBoard();
    const userId = groups
      .flatMap(({ members }) => members)
      .find(({ display_name }) => display_name === stayer)!.user_id;
    await pickUp(stayer!);
    await api.placeGroupMember(userId, "g_atrium");
    move.mockClear();
    await act(() => poll());
    await waitFor(() => expect(namesIn("Members of Atrium mixer")).toContain(stayer));
    hoverOver(place("Atrium mixer"));
    expect(place("Atrium mixer")).not.toHaveAttribute("data-drop-over");
    fireEvent.dragLeave(place("Atrium mixer"));
    hoverOver(place("Foyer mixer"));
    expect(place("Foyer mixer")).toHaveAttribute("data-drop-over");

    // Their row moved lists, so it's a new row, and the drop sends nothing rather than a move
    // the organiser didn't see.
    fireEvent.drop(place("Foyer mixer"));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(move).not.toHaveBeenCalled();
    expect(namesIn("Members of Atrium mixer")).toContain(stayer);
  });

  it("marks the person being dragged and the group that would take them", async () => {
    renderScreen();
    await screen.findByRole("list", { name: "Waiting" });

    const row = await pickUp("Kenji Ong");
    expect(row).toHaveAttribute("data-dragging");
    hoverOver(place("Atrium mixer"));
    expect(place("Atrium mixer")).toHaveAttribute("data-drop-over");
    expect(place("Foyer mixer")).not.toHaveAttribute("data-drop-over");

    fireEvent.dragLeave(place("Atrium mixer"));
    hoverOver(place("Foyer mixer"));
    expect(place("Atrium mixer")).not.toHaveAttribute("data-drop-over");
    expect(place("Foyer mixer")).toHaveAttribute("data-drop-over");

    fireEvent.dragEnd(row);
    await waitFor(() => expect(row).not.toHaveAttribute("data-dragging"));
    expect(place("Foyer mixer")).not.toHaveAttribute("data-drop-over");
  });

  it("drops someone into a full group, which shows Over capacity", async () => {
    renderScreen({
      prepare: (client) => {
        client.mock.data.groups[1]!.capacity = 1;
      },
    });
    await screen.findByRole("list", { name: "Waiting" });

    await dragTo("Kenji Ong", place("Atrium mixer"));
    await waitFor(() => expect(namesIn("Members of Atrium mixer")).toEqual(["Kenji Ong"]));
    await dragTo("Hui Min Loh", place("Atrium mixer"));

    expect(await within(place("Atrium mixer")).findByText("Over capacity")).toBeInTheDocument();
    expect(namesIn("Members of Atrium mixer")).toEqual(["Kenji Ong", "Hui Min Loh"]);
  });

  it("says on the row why a drop failed, and leaves them where they're saved", async () => {
    const { api } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });

    api.mock.failNext("not_found");
    await dragTo("Kenji Ong", place("Atrium mixer"));

    expect(await within(rowOf("Kenji Ong")).findByRole("alert")).toHaveTextContent(
      "That was not found. It may have been removed.",
    );
    expect(namesIn("Waiting")).toContain("Kenji Ong");
    expect(within(place("Atrium mixer")).getByText("Nobody here yet.")).toBeInTheDocument();
  });

  it("starts no drag and takes no drop while another group change saves", async () => {
    const { api, user } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });
    const held = deferred<GroupBoardResponse>();
    const placeMember = api.placeGroupMember.bind(api);
    const move = vi.spyOn(api, "placeGroupMember").mockReturnValueOnce(held.promise);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    await pick(user, "Kenji Ong", "Move to Atrium mixer");

    const row = await pickUp("Hui Min Loh");
    expect(row).not.toHaveAttribute("data-dragging");
    hoverOver(place("Foyer mixer"));
    expect(place("Foyer mixer")).not.toHaveAttribute("data-drop-over");
    fireEvent.drop(place("Foyer mixer"));
    fireEvent.dragEnd(row);

    const [userId, groupId] = move.mock.calls[0]!;
    await act(async () => held.resolve(await placeMember(userId, groupId)));
    await waitFor(() => expect(namesIn("Members of Atrium mixer")).toEqual(["Kenji Ong"]));
    expect(move).toHaveBeenCalledOnce();
    expect(within(place("Foyer mixer")).getByText("Nobody here yet.")).toBeInTheDocument();
  });

  it("keeps a drag going through a poll, and a delayed poll doesn't undo the drop", async () => {
    const { api, poll } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });
    const before = structuredClone(await api.groupBoard());
    const held = deferred<GroupBoardResponse>();
    vi.spyOn(api, "groupBoard").mockReturnValueOnce(held.promise);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });

    await pickUp("Kenji Ong");
    let polling!: Promise<void>;
    act(() => {
      polling = poll();
    });
    hoverOver(place("Atrium mixer"));
    fireEvent.drop(place("Atrium mixer"));
    await waitFor(() => expect(namesIn("Members of Atrium mixer")).toEqual(["Kenji Ong"]));
    await act(async () => {
      held.resolve(before);
      await polling;
    });

    expect(namesIn("Members of Atrium mixer")).toEqual(["Kenji Ong"]);
    expect(namesIn("Waiting")).not.toContain("Kenji Ong");
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("Putting several waiting people in a group (FRO-130)", () => {
  /** Ticks each person on the waiting list by their name. */
  async function tick(user: ReturnType<typeof userEvent.setup>, ...names: string[]) {
    const list = await screen.findByRole("list", { name: "Waiting" });
    for (const name of names) await user.click(within(list).getByRole("checkbox", { name }));
  }

  /** Presses Move ticked and picks the group. */
  async function putIn(user: ReturnType<typeof userEvent.setup>, group: string) {
    await user.click(screen.getByRole("button", { name: "Move ticked" }));
    await user.click(await screen.findByRole("menuitem", { name: `Move to ${group}` }));
  }

  it("puts everyone ticked in the group chosen, as an organiser's placement, and unticks them", async () => {
    const { api, user } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });
    const others = namesIn("Waiting").filter(
      (name) => name !== "Kenji Ong" && name !== "Hui Min Loh",
    );
    expect(screen.getByRole("button", { name: "Move ticked" })).toBeDisabled();

    await tick(user, "Kenji Ong", "Hui Min Loh");
    expect(screen.getByText("2 ticked")).toBeInTheDocument();
    await putIn(user, "Atrium mixer");

    await waitFor(() =>
      expect(namesIn("Members of Atrium mixer")).toEqual(["Kenji Ong", "Hui Min Loh"]),
    );
    expect(namesIn("Waiting")).toEqual(others);
    expect(api.mock.data.groupMembers.filter(({ how }) => how === "organizer")).toHaveLength(2);
    for (const box of screen.getAllByRole("checkbox")) expect(box).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Move ticked" })).toBeDisabled();
  });

  it("passes a group's capacity, and the group shows Over capacity", async () => {
    const { user } = renderScreen({
      prepare: (client) => {
        client.mock.data.groups[1]!.capacity = 1;
      },
    });

    await tick(user, "Kenji Ong", "Hui Min Loh");
    await putIn(user, "Atrium mixer");

    const atrium = screen.getByRole("region", { name: "Atrium mixer" });
    expect(await within(atrium).findByText("Over capacity")).toBeInTheDocument();
    expect(namesIn("Members of Atrium mixer")).toEqual(["Kenji Ong", "Hui Min Loh"]);
  });

  it("names who wasn't placed with the reason, keeps them ticked, and places the rest", async () => {
    const { api, user } = renderScreen();
    await tick(user, "Kenji Ong", "Hui Min Loh");

    api.mock.failNext("not_found");
    await putIn(user, "Atrium mixer");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Not placed: Kenji Ong. That was not found. It may have been removed.",
    );
    await waitFor(() => expect(namesIn("Members of Atrium mixer")).toEqual(["Hui Min Loh"]));
    const list = screen.getByRole("list", { name: "Waiting" });
    expect(within(list).getByRole("checkbox", { name: "Kenji Ong" })).toBeChecked();
    expect(screen.getByText("1 ticked")).toBeInTheDocument();

    await putIn(user, "Atrium mixer");

    await waitFor(() =>
      expect(namesIn("Members of Atrium mixer")).toEqual(["Kenji Ong", "Hui Min Loh"]),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sends nobody else once the rate limit refuses one, and names everyone left", async () => {
    const { api, user } = renderScreen();
    await tick(user, "Kenji Ong", "Hui Min Loh");
    const move = vi.spyOn(api, "placeGroupMember");
    onTestFinished(() => {
      vi.restoreAllMocks();
    });

    api.mock.failNext("rate_limited");
    await putIn(user, "Atrium mixer");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Not placed: Kenji Ong, Hui Min Loh. Too many requests. Wait a minute and try again.",
    );
    expect(move).toHaveBeenCalledOnce();
    expect(screen.getByText("2 ticked")).toBeInTheDocument();
  });

  it("stops at a failure that would refuse everyone, and shows those already placed", async () => {
    const { api, user } = renderScreen();
    await tick(user, "Kenji Ong", "Hui Min Loh", "Darren Koh");
    const place = api.placeGroupMember.bind(api);
    const move = vi
      .spyOn(api, "placeGroupMember")
      .mockImplementationOnce(place)
      .mockRejectedValueOnce(new ApiError(401, "unauthenticated"));
    onTestFinished(() => {
      vi.restoreAllMocks();
    });

    await putIn(user, "Atrium mixer");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Not placed: Hui Min Loh, Darren Koh. You are signed out. Sign in again to continue.",
    );
    expect(move).toHaveBeenCalledTimes(2);
    expect(namesIn("Members of Atrium mixer")).toEqual(["Kenji Ong"]);
  });

  it("unticks someone who leaves the waiting list, so they aren't ticked when they come back", async () => {
    const { user } = renderScreen();
    await tick(user, "Kenji Ong", "Hui Min Loh");

    await pick(user, "Kenji Ong", "Move to Atrium mixer");
    await waitFor(() => expect(namesIn("Members of Atrium mixer")).toEqual(["Kenji Ong"]));
    await pick(user, "Kenji Ong", "Send back to waiting");

    const list = await screen.findByRole("list", { name: "Waiting" });
    await waitFor(() =>
      expect(within(list).getByRole("checkbox", { name: "Kenji Ong" })).not.toBeChecked(),
    );
    expect(within(list).getByRole("checkbox", { name: "Hui Min Loh" })).toBeChecked();
    expect(screen.getByText("1 ticked")).toBeInTheDocument();
  });

  it("disables the tick boxes and the button while another group change saves", async () => {
    const { api, user } = renderScreen();
    await tick(user, "Kenji Ong");
    const held = deferred<GroupBoardResponse>();
    vi.spyOn(api, "allocateGroups").mockReturnValueOnce(held.promise);
    const read = api.groupBoard.bind(api);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });

    await user.click(screen.getByRole("button", { name: "Allocate" }));

    expect(screen.getByRole("button", { name: "Move ticked" })).toBeDisabled();
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();

    await act(async () => held.resolve(await read()));
    await waitFor(() => expect(screen.getByRole("button", { name: "Move ticked" })).toBeEnabled());
  });

  it("says to make a group when there is none to put people in", async () => {
    const { user } = renderScreen({
      prepare: (client) => {
        client.mock.data.groups = [];
      },
    });
    await tick(user, "Kenji Ong");

    expect(screen.getByText("Make a group to move people to.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move ticked" })).toBeDisabled();
  });
});

describe("Groups board coordination", () => {
  it("disables every other change while a move saves, keeps reads available, and queues nothing", async () => {
    const { api, user, poll } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });
    const held = deferred<GroupBoardResponse>();
    const place = api.placeGroupMember.bind(api);
    const move = vi.spyOn(api, "placeGroupMember").mockReturnValueOnce(held.promise);
    const allocate = vi.spyOn(api, "allocateGroups");
    const read = vi.spyOn(api, "groupBoard");
    onTestFinished(() => {
      vi.restoreAllMocks();
    });

    await pick(user, "Kenji Ong", "Move to Atrium mixer");

    for (const name of ["Make groups", "Allocate", "Reset"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    for (const button of screen.getAllByRole("button", { name: /^Actions for / })) {
      expect(button).toBeDisabled();
    }
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeEnabled();
    await poll();
    expect(read).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Allocate" }));
    expect(allocate).not.toHaveBeenCalled();

    const [userId, groupId] = move.mock.calls[0]!;
    await act(async () => held.resolve(await place(userId, groupId)));

    await waitFor(() => expect(screen.getByRole("button", { name: "Allocate" })).toBeEnabled());
    expect(namesIn("Members of Atrium mixer")).toContain("Kenji Ong");
    expect(allocate).not.toHaveBeenCalled();
  });

  it("sends only one create when form submissions arrive before the controls disable", async () => {
    const { api, user } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });
    const held = deferred<Awaited<ReturnType<typeof api.createGroup>>>();
    const create = api.createGroup.bind(api);
    const write = vi.spyOn(api, "createGroup").mockReturnValueOnce(held.promise);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    const dialog = await openByHand(user);
    await user.type(within(dialog).getByLabelText("Name"), "Garden mixer");
    const form = within(dialog).getByRole("button", { name: "Create group" }).closest("form")!;

    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    await waitFor(() => expect(write).toHaveBeenCalledOnce());
    // Both submissions have finished validation; the refused one must not close the dialog.
    await within(dialog).findByRole("alert");
    expect(write).toHaveBeenCalledOnce();
    expect(within(dialog).getByRole("button", { name: /Creat/ })).toBeDisabled();

    await act(async () => held.resolve(await create(write.mock.calls[0]![0])));
    await screen.findByRole("heading", { name: "Garden mixer" });
    expect(write).toHaveBeenCalledOnce();
  });

  it("keeps a delayed poll from undoing a completed allocation", async () => {
    const { api, user, poll } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });
    const before = structuredClone(await api.groupBoard());
    const held = deferred<GroupBoardResponse>();
    vi.spyOn(api, "groupBoard").mockReturnValueOnce(held.promise);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    let polling!: Promise<void>;
    act(() => {
      polling = poll();
    });

    await user.click(screen.getByRole("button", { name: "Allocate" }));
    await screen.findByText("Nobody is waiting.");
    await act(async () => {
      held.resolve(before);
      await polling;
    });

    expect(screen.getByText("Nobody is waiting.")).toBeInTheDocument();
    expect(namesIn("Members of Atrium mixer").length).toBeGreaterThan(0);
  });

  it("releases all controls after a refusal and keeps the error on the row", async () => {
    const { api, user } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });
    const held = deferred<GroupBoardResponse>();
    const move = vi.spyOn(api, "placeGroupMember").mockReturnValueOnce(held.promise);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    await pick(user, "Kenji Ong", "Move to Atrium mixer");
    expect(screen.getByRole("button", { name: "Allocate" })).toBeDisabled();

    await act(async () => held.reject(new ApiError(404, "not_found")));

    expect(await screen.findByRole("alert")).toHaveTextContent("That was not found.");
    expect(namesIn("Waiting")).toContain("Kenji Ong");
    expect(screen.getByRole("button", { name: "Allocate" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Connect across groups" })).toBeEnabled();
    await pick(user, "Kenji Ong", "Move to Atrium mixer");
    await waitFor(() => expect(namesIn("Members of Atrium mixer")).toContain("Kenji Ong"));
    expect(move).toHaveBeenCalledTimes(2);
  });

  it("keeps changes disabled across navigation until the original write updates the board", async () => {
    const { api, user, Providers, rerender } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });
    const held = deferred<GroupBoardResponse>();
    const allocate = api.allocateGroups.bind(api);
    vi.spyOn(api, "allocateGroups").mockReturnValueOnce(held.promise);
    const setRule = vi.spyOn(api, "setConnectionRule");
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    await user.click(screen.getByRole("button", { name: "Allocate" }));
    rerender(
      <Providers>
        <p>Another screen</p>
      </Providers>,
    );
    rerender(
      <Providers>
        <GroupsScreen />
      </Providers>,
    );

    expect(await screen.findByRole("button", { name: "Allocate" })).toBeDisabled();
    const groups = screen.getByRole("radio", { name: "Connect across groups" });
    expect(groups).toBeDisabled();
    await user.click(groups);
    expect(setRule).not.toHaveBeenCalled();

    await act(async () => held.resolve(await allocate()));

    await screen.findByText("Nobody is waiting.");
    await waitFor(() => expect(groups).toBeEnabled());
    await user.click(groups);
    await waitFor(() => expect(groups).toBeChecked());
    expect(setRule).toHaveBeenCalledOnce();
  });

  it("waits for a fresh board after a rule change even when the screen unmounts", async () => {
    const { api, user, Providers, rerender, queryClient } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });
    const rule = deferred<Awaited<ReturnType<typeof api.setConnectionRule>>>();
    const board = deferred<GroupBoardResponse>();
    const readBoard = api.groupBoard.bind(api);
    vi.spyOn(api, "setConnectionRule").mockReturnValueOnce(rule.promise);
    const read = vi.spyOn(api, "groupBoard").mockReturnValueOnce(board.promise);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    await user.click(screen.getByRole("radio", { name: "Connect across groups" }));
    rerender(
      <Providers>
        <p>Another screen</p>
      </Providers>,
    );

    await act(async () => {
      api.mock.data.connectAcross = "groups";
      rule.resolve({ connect_across: "groups" });
    });
    await waitFor(() => expect(read).toHaveBeenCalledOnce());
    rerender(
      <Providers>
        <GroupsScreen />
      </Providers>,
    );
    expect(await screen.findByRole("button", { name: "Allocate" })).toBeDisabled();

    await act(async () => board.resolve(await readBoard()));
    await waitFor(() => expect(screen.getByRole("button", { name: "Allocate" })).toBeEnabled());
    expect(screen.getByRole("radio", { name: "Connect across groups" })).toBeChecked();
    expect(queryClient.getQueryData<GroupBoardResponse>(queryKeys.groupBoard)?.connect_across).toBe(
      "groups",
    );
  });

  it("reads back an uncertain write after a lost reply and never repeats it", async () => {
    const { api, user } = renderScreen();
    await screen.findByRole("list", { name: "Waiting" });
    const setRule = api.setConnectionRule.bind(api);
    const write = vi.spyOn(api, "setConnectionRule").mockImplementationOnce(async (input) => {
      await setRule(input);
      throw new NetworkError();
    });
    onTestFinished(() => {
      vi.restoreAllMocks();
    });

    await user.click(screen.getByRole("radio", { name: "Connect across groups" }));

    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "Connect across groups" })).toBeChecked(),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach the server. Check the Wi-Fi and try again.",
    );
    expect(screen.getByRole("button", { name: "Allocate" })).toBeEnabled();
    expect(write).toHaveBeenCalledOnce();
  });
});

describe("GroupsScreen's groups reached (BAC-167)", () => {
  /** Ana and Ben in Foyer, Cara in Atrium and Dev in Hall, connected as `pairs` says. */
  function threeGroups(api: MockApiClient, pairs: [string, string][]) {
    const placedAt = new Date().toISOString();
    api.mock.data.groups.push({
      id: "g_hall",
      name: "Hall mixer",
      tags: [],
      location: null,
      capacity: null,
    });
    api.mock.data.groupAllocationStartedAt = placedAt;
    api.mock.data.groupMembers = (
      [
        ["u_7f3a", "g_foyer"],
        ["u_9c21", "g_foyer"],
        ["u_2e8b", "g_atrium"],
        ["u_b514", "g_hall"],
      ] as const
    ).map(([user_id, group_id]) => ({
      user_id,
      group_id,
      joined_at: placedAt,
      placed_at: placedAt,
      how: "organizer",
    }));
    api.mock.data.connectedPairs = pairs;
  }

  it("shows on each group which others it has reached, by name", async () => {
    const { api, poll } = renderScreen({
      prepare: (client) => threeGroups(client, [["u_7f3a", "u_2e8b"]]),
    });

    const foyer = await screen.findByRole("region", { name: "Foyer mixer" });
    expect(within(foyer).getByText("Reached Atrium mixer")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Atrium mixer" })).getByText("Reached Foyer mixer"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Hall mixer" })).getByText(
        "Reached no other group yet",
      ),
    ).toBeInTheDocument();

    // Ben connects with Dev in Hall, and Foyer has reached both at the next poll.
    api.mock.data.connectedPairs.push(["u_9c21", "u_b514"]);
    await act(() => poll());
    expect(await within(foyer).findByText("Reached every other group")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Hall mixer" })).getByText("Reached Foyer mixer"),
    ).toBeInTheDocument();
  });

  it("counts only groups with someone in them toward every other group", async () => {
    renderScreen({
      prepare: (client) => {
        threeGroups(client, [["u_7f3a", "u_2e8b"]]);
        client.mock.data.groupMembers = client.mock.data.groupMembers.filter(
          ({ group_id }) => group_id !== "g_hall",
        );
      },
    });

    const foyer = await screen.findByRole("region", { name: "Foyer mixer" });
    expect(within(foyer).getByText("Reached every other group")).toBeInTheDocument();
  });

  it("says nothing of other groups on a group with nobody in it", async () => {
    renderScreen();

    const foyer = await screen.findByRole("region", { name: "Foyer mixer" });
    expect(within(foyer).getByText("Nobody here yet.")).toBeInTheDocument();
    expect(within(foyer).queryByText(/^Reached/)).not.toBeInTheDocument();
  });

  it("says nothing of other groups with only one group", async () => {
    renderScreen({
      prepare: (client) => {
        client.mock.data.groups = client.mock.data.groups.slice(0, 1);
      },
    });

    const foyer = await screen.findByRole("region", { name: "Foyer mixer" });
    expect(within(foyer).queryByText(/^Reached/)).not.toBeInTheDocument();
  });

  it("says nothing of other groups from an Event Service that doesn't give them", async () => {
    renderScreen({
      prepare: (client) => {
        threeGroups(client, [["u_7f3a", "u_2e8b"]]);
        const real = client.groupBoard.bind(client);
        vi.spyOn(client, "groupBoard").mockImplementation(async () => {
          const board = await real();
          for (const group of board.groups) delete group.reached_group_ids;
          return board;
        });
      },
    });

    const foyer = await screen.findByRole("region", { name: "Foyer mixer" });
    expect(within(foyer).queryByText(/^Reached/)).not.toBeInTheDocument();
  });
});
