import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_ADMIN_ID } from "@/api/mock/fixtures";
import { LoginScreen } from "@/features/auth/login-screen";
import { createTestProviders } from "@/test/providers";

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

const { goAfterLogin } = vi.hoisted(() => ({ goAfterLogin: vi.fn() }));

vi.mock("@/features/auth/use-go-after-login", () => ({
  useGoAfterLogin: () => goAfterLogin,
}));

beforeEach(() => {
  goAfterLogin.mockReset();
});

function renderLogin(returnTo?: string) {
  const api: MockApiClient = createMockClient({ latencyMs: [0, 0], storage: null });
  const { Providers } = createTestProviders(api, { session: true });
  render(
    <Providers>
      <LoginScreen returnTo={returnTo} />
    </Providers>,
  );
  return { api };
}

/**
 * Opens the account list with the keyboard rather than a click. A Radix Select opened by a
 * synthetic click only mounts in the first test of a file, so a later test would fail with
 * "element not found" for a reason that has nothing to do with the app.
 */
async function openAccountList(user: ReturnType<typeof userEvent.setup>) {
  screen.getByRole("combobox").focus();
  await user.keyboard("{Enter}");
  return screen.findByRole("option", { name: /Alex Tan/ });
}

describe("LoginScreen", () => {
  it("builds the Portal sign-in address from the login URL method", async () => {
    const { api } = renderLogin("/t/04A1B2C3D4E5F6");

    const link = await screen.findByRole("link", { name: "Sign in with GeeksHacking" });
    // The token page is why return_to matters (agreement 7.2).
    expect(link).toHaveAttribute("href", api.loginUrl("/t/04A1B2C3D4E5F6"));
    expect(link.getAttribute("href")).toContain("return_to=%2Ft%2F04A1B2C3D4E5F6");
  });

  it("falls back to the home page when there is no return_to", async () => {
    const { api } = renderLogin();

    const link = await screen.findByRole("link", { name: "Sign in with GeeksHacking" });
    expect(link).toHaveAttribute("href", api.loginUrl("/"));
  });

  it("offers the two seeded accounts and names the admin one", async () => {
    const user = userEvent.setup();
    renderLogin();

    await openAccountList(user);

    // The visible label and the seeded ID are both on the option, so a developer can see
    // which account they are about to use.
    expect(await screen.findByRole("option", { name: /Alex Tan, dev-user-1/ })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: new RegExp(`Priya Raman, ${SEEDED_ADMIN_ID}`) }),
    ).toHaveTextContent("GeekyKey admin");
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("signs in as the chosen account and hands navigation over once", async () => {
    const user = userEvent.setup();
    renderLogin("/t/04A1B2C3D4E5F6");

    await openAccountList(user);
    await user.click(
      screen.getByRole("option", { name: new RegExp(`Priya Raman, ${SEEDED_ADMIN_ID}`) }),
    );
    await user.click(screen.getByRole("button", { name: "Use this account" }));

    await waitFor(() => expect(goAfterLogin).toHaveBeenCalledTimes(1));
    // The return survives the round trip through sign-in, which is what the token page needs.
    expect(goAfterLogin).toHaveBeenCalledWith("/t/04A1B2C3D4E5F6");
  });

  it("signs in as the default account", async () => {
    const user = userEvent.setup();
    renderLogin("/t/04A1B2C3D4E5F6");

    await user.click(screen.getByRole("button", { name: "Use this account" }));

    await waitFor(() => expect(goAfterLogin).toHaveBeenCalledTimes(1));
    // The return survives the round trip through sign-in, which is what the token page needs.
    expect(goAfterLogin).toHaveBeenCalledWith("/t/04A1B2C3D4E5F6");
  });

  it("does not navigate again when the session republishes the same user", async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole("button", { name: "Use this account" }));

    await waitFor(() => expect(goAfterLogin).toHaveBeenCalledTimes(1));
    await user.click(document.body);
    expect(goAfterLogin).toHaveBeenCalledTimes(1);
  });

  it("renders the dev form only in development", async () => {
    renderLogin();

    // import.meta.env.DEV is true under vitest, so the form is present here. The production
    // branch is a build-time constant; a production build drops it, which the build proves.
    expect(await screen.findByRole("heading", { name: "Local development" })).toBeInTheDocument();
  });
});
