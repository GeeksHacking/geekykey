import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_GUEST_ID } from "@/api/mock/fixtures";
import type { MeResponse } from "@/api/types";
import { useAvatarLook } from "@/features/passport/avatar/use-avatar-look";
import { makeMe } from "@/test/make-me";
import { createTestProviders } from "@/test/providers";

const KEY = `gk-avatar-colours:${SEEDED_GUEST_ID}`;
const SAVED = { character: "dress", skin: "deep", hair: "black", suit: "emerald" };
const FROM_SERVICE = { character: "suit", skin: "warm", hair: "auburn", suit: "emerald" };

function Probe({ me }: { me: MeResponse }) {
  useAvatarLook(me);
  return null;
}

function setup(me: MeResponse) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_GUEST_ID);
  const spy = vi.spyOn(api, "updateMe");
  const { Providers } = createTestProviders(api, { session: true });
  const view = render(
    <Providers>
      <Probe me={me} />
    </Providers>,
  );
  return { api, spy, Providers, ...view };
}

beforeEach(() => localStorage.clear());

describe("the look on the service and in this browser (FRO-181)", () => {
  it("sends a look this browser saved when the service has none, once", async () => {
    localStorage.setItem(KEY, JSON.stringify(SAVED));
    const me = makeMe({ user: { id: SEEDED_GUEST_ID, avatar: null } });
    const { spy, Providers, rerender } = setup(me);

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenCalledWith({ avatar: SAVED });

    rerender(
      <Providers>
        <Probe me={{ ...me }} />
      </Providers>,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("writes the service's look into this browser, so another phone's change arrives", async () => {
    localStorage.setItem(KEY, JSON.stringify(SAVED));
    setup(makeMe({ user: { id: SEEDED_GUEST_ID, avatar: FROM_SERVICE } }));

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(KEY) ?? "null")).toEqual(FROM_SERVICE),
    );
  });

  it("sends nothing when neither has a look", async () => {
    const { spy } = setup(makeMe({ user: { id: SEEDED_GUEST_ID, avatar: null } }));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(spy).not.toHaveBeenCalled();
  });
});
