import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { PlaceMenu } from "@/components/layout/place-menu";
import { GEEKYKEY_SCREENS_URL } from "@/lib/constants";
import { EARLY_LINK_FRESH_MS } from "@/lib/use-open-my-tokens";
import { stubLocation } from "@/test/location";
import { createTestProviders } from "@/test/providers";

let location: ReturnType<typeof stubLocation>;

beforeEach(() => {
  location = stubLocation();
});

afterEach(() => {
  location.restore();
});

/** The place menu on a signed-in page, over the mock Event Service. */
async function openMenu(api: MockApiClient) {
  const { Providers } = createTestProviders(api);
  const rootRoute = createRootRoute({
    component: () => <PlaceMenu place="event" isOrganiser={false} />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => null }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <Providers>
      <RouterProvider router={router as never} />
    </Providers>,
  );
  const person = userEvent.setup();
  (await screen.findByRole("button", { name: "Switch place, Event screens" })).focus();
  await person.keyboard("{Enter}");
  return { person, menu: await screen.findByRole("menu") };
}

async function signedInService() {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  await api.devLogin(SEEDED_PARTICIPANT_ID);
  return api;
}

describe("PlaceMenu's My tokens (agreement 8.12, BAC-157)", () => {
  it("opens My tokens with a login link, so the same user is logged in there", async () => {
    const api = await signedInService();
    const create = vi.spyOn(api, "createGeekykeyLoginLink");
    const { person, menu } = await openMenu(api);

    await person.click(within(menu).getByRole("menuitem", { name: "My tokens" }));

    await waitFor(() => expect(location.assign).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledOnce();
    const { login_link } = await create.mock.results[0]!.value;
    expect(location.assign).toHaveBeenCalledWith(`${GEEKYKEY_SCREENS_URL}#login=${login_link}`);
  });

  it("opens My tokens without a link when none can be had, where the usual login takes over", async () => {
    const api = await signedInService();
    vi.spyOn(api, "createGeekykeyLoginLink").mockRejectedValue(new Error("no link"));
    const { person, menu } = await openMenu(api);

    await person.click(within(menu).getByRole("menuitem", { name: "My tokens" }));

    await waitFor(() => expect(location.assign).toHaveBeenCalledWith(GEEKYKEY_SCREENS_URL));
    expect(location.assign).toHaveBeenCalledOnce();
  });

  it("keeps the plain address on the item, for a new tab or a copied link", async () => {
    const { menu } = await openMenu(await signedInService());
    expect(within(menu).getByRole("menuitem", { name: "My tokens" })).toHaveAttribute(
      "href",
      GEEKYKEY_SCREENS_URL,
    );
  });
});

describe("PlaceMenu gets My tokens ready while the menu is open (FRO-162)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.head.querySelectorAll('link[rel="preconnect"]').forEach((hint) => hint.remove());
  });

  it("asks for the login link and starts the connection when the menu opens", async () => {
    const api = await signedInService();
    const create = vi.spyOn(api, "createGeekykeyLoginLink");

    await openMenu(api);

    expect(create).toHaveBeenCalledOnce();
    const hints = document.head.querySelectorAll('link[rel="preconnect"]');
    expect(hints).toHaveLength(1);
    expect(hints[0]).toHaveAttribute("href", new URL(GEEKYKEY_SCREENS_URL).origin);
    expect(location.assign).not.toHaveBeenCalled();
  });

  it("opens the link once it arrives, when the click came first", async () => {
    const api = await signedInService();
    let arrive!: (answer: { login_link: string; expires_at: string }) => void;
    const create = vi.spyOn(api, "createGeekykeyLoginLink").mockReturnValue(
      new Promise((resolve) => {
        arrive = resolve;
      }),
    );
    const { person, menu } = await openMenu(api);

    await person.click(within(menu).getByRole("menuitem", { name: "My tokens" }));
    expect(location.assign).not.toHaveBeenCalled();
    arrive({ login_link: "early", expires_at: "2026-11-18T13:01:00.000Z" });

    await waitFor(() =>
      expect(location.assign).toHaveBeenCalledWith(`${GEEKYKEY_SCREENS_URL}#login=early`),
    );
    expect(create).toHaveBeenCalledOnce();
  });

  it("asks again on the click when the early request failed", async () => {
    const api = await signedInService();
    const create = vi.spyOn(api, "createGeekykeyLoginLink");
    api.mock.failNext("internal_error");
    const { person, menu } = await openMenu(api);
    await expect(create.mock.results[0]!.value).rejects.toBeDefined();

    await person.click(within(menu).getByRole("menuitem", { name: "My tokens" }));

    await waitFor(() => expect(location.assign).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledTimes(2);
    const { login_link } = await create.mock.results[1]!.value;
    expect(location.assign).toHaveBeenCalledWith(`${GEEKYKEY_SCREENS_URL}#login=${login_link}`);
  });

  it("asks again on the click when the early link is 45 seconds old, since it expires at 60", async () => {
    const api = await signedInService();
    const create = vi.spyOn(api, "createGeekykeyLoginLink");
    const { person, menu } = await openMenu(api);
    await create.mock.results[0]!.value;
    const opened = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(opened + EARLY_LINK_FRESH_MS);

    await person.click(within(menu).getByRole("menuitem", { name: "My tokens" }));

    await waitFor(() => expect(location.assign).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledTimes(2);
    const { login_link } = await create.mock.results[1]!.value;
    expect(location.assign).toHaveBeenCalledWith(`${GEEKYKEY_SCREENS_URL}#login=${login_link}`);
  });

  it("drops the early link when the menu closes, and asks again when it opens", async () => {
    const api = await signedInService();
    const create = vi.spyOn(api, "createGeekykeyLoginLink");
    const { person } = await openMenu(api);
    await create.mock.results[0]!.value;

    await person.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    await person.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    expect(create).toHaveBeenCalledTimes(2);

    await person.click(within(menu).getByRole("menuitem", { name: "My tokens" }));

    await waitFor(() => expect(location.assign).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledTimes(2);
    const { login_link } = await create.mock.results[1]!.value;
    expect(location.assign).toHaveBeenCalledWith(`${GEEKYKEY_SCREENS_URL}#login=${login_link}`);
  });
});
