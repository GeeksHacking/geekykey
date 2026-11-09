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
    api.mock.failNext("internal_error");
    const { person, menu } = await openMenu(api);

    await person.click(within(menu).getByRole("menuitem", { name: "My tokens" }));

    await waitFor(() => expect(location.assign).toHaveBeenCalledWith(GEEKYKEY_SCREENS_URL));
  });

  it("keeps the plain address on the item, for a new tab or a copied link", async () => {
    const { menu } = await openMenu(await signedInService());
    expect(within(menu).getByRole("menuitem", { name: "My tokens" })).toHaveAttribute(
      "href",
      GEEKYKEY_SCREENS_URL,
    );
  });
});
