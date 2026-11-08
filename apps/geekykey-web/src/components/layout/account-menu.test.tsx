import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AccountMenu } from "@/components/layout/account-menu";

const USER_ID = "qxcUTVjDfgaK7FL1R3UAJmPW9Up2";

async function openMenu(isGeekyKeyAdmin = false, onSignOut = vi.fn()) {
  const person = userEvent.setup();
  render(<AccountMenu userId={USER_ID} isGeekyKeyAdmin={isGeekyKeyAdmin} onSignOut={onSignOut} />);
  const trigger = screen.getByRole("button", { name: "Account menu" });
  expect(trigger).toHaveTextContent("Account");
  expect(trigger).not.toHaveTextContent(USER_ID);
  trigger.focus();
  await person.keyboard("{Enter}");
  return { person, menu: await screen.findByRole("menu") };
}

describe("AccountMenu", () => {
  it("keeps the full user ID in the account menu, separate from navigation", async () => {
    const { menu } = await openMenu();
    expect(within(menu).getByText(USER_ID)).toBeInTheDocument();
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
    // GeekyKey knows no event role for this user.
    expect(within(menu).queryByText("Participant")).not.toBeInTheDocument();
  });

  it("identifies a GeekyKey admin", async () => {
    const { menu } = await openMenu(true);
    expect(within(menu).getByText("GeekyKey admin")).toBeInTheDocument();
  });

  it("calls sign-out", async () => {
    const onSignOut = vi.fn();
    const { person, menu } = await openMenu(false, onSignOut);
    await person.click(within(menu).getByRole("menuitem", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
