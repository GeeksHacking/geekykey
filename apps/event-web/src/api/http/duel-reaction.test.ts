import { afterEach, expect, it, vi } from "vitest";
import { createHttpClient } from "@/api/http/client";
import { mockDuelRound } from "@/api/mock/duel-round";

afterEach(() => vi.unstubAllGlobals());
it("posts the same reaction body to the duel endpoint and parses the answer", async () => {
  const reaction = mockDuelRound("playing", Date.now()).duels[0]!.reaction;
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ reaction }), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  expect(await createHttpClient().playDuelReaction("duel/1", { early: true })).toEqual({
    reaction,
  });
  expect(fetch).toHaveBeenCalledWith(
    "/api/v1/me/duels/duel%2F1/reaction",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ early: true }),
      credentials: "include",
    }),
  );
});
