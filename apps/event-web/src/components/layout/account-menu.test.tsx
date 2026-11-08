import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { User } from "@/api/types";
import { AccountMenu } from "@/components/layout/account-menu";

const user = { id: "user-1", display_name: "Alex Tan", role: "participant" } as User;

async function openMenu(onSignOut = vi.fn()) {
  const person = userEvent.setup();
  render(<AccountMenu user={user} onSignOut={onSignOut} />);
  screen.getByRole("button", { name: "Account menu" }).focus();
  await person.keyboard("{Enter}");
  return { person, menu: await screen.findByRole("menu") };
}

describe("AccountMenu", () => {
  it("keeps identity and sign-out together, without navigation", async () => {
    const { menu } = await openMenu();
    expect(within(menu).getByText("Alex Tan")).toBeInTheDocument();
    expect(within(menu).getByText("Participant")).toBeInTheDocument();
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
    expect(within(menu).getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
  });

  it("signs out from the menu", async () => {
    const onSignOut = vi.fn();
    const { person, menu } = await openMenu(onSignOut);
    await person.click(within(menu).getByRole("menuitem", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
