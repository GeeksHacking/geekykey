import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { createMockClient } from "@/api/mock/client";
import { mockDuelRound } from "@/api/mock/duel-round";
import { TeamRoundNotice } from "@/features/passport/team-round-notice";
import { createTestProviders } from "@/test/providers";
const location = vi.hoisted(() => ({ pathname: "/passport" }));
const useMe = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session", () => ({ useMe }));
vi.mock("@tanstack/react-router", () => ({
  useLocation: () => location.pathname,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
beforeEach(() => {
  localStorage.clear();
  location.pathname = "/passport";
});
it.each(["opening", "playing", "win"] as const)(
  "links back from other routes for %s",
  async (scenario) => {
    const api = createMockClient({ storage: null, latencyMs: [0, 0] });
    api.mock.setSession("dev-user-1");
    const me = { ...(await api.me()), round: mockDuelRound(scenario, Date.now()) };
    useMe.mockReturnValue({ me });
    const { Providers } = createTestProviders(api);
    render(<TeamRoundNotice />, { wrapper: Providers });
    expect(screen.getByRole("link")).toHaveAttribute("href", "/");
  },
);
it("hides absent rounds, dismissed results, and the dashboard notice", async () => {
  const api = createMockClient({ storage: null, latencyMs: [0, 0] });
  api.mock.setSession("dev-user-1");
  const base = await api.me();
  useMe.mockReturnValue({ me: base });
  const { Providers } = createTestProviders(api);
  const view = render(<TeamRoundNotice />, { wrapper: Providers });
  expect(view.container).toBeEmptyDOMElement();
  view.unmount();
  const round = mockDuelRound("win", Date.now());
  localStorage.setItem(`gk-round-dismissed:${base.user.id}`, round.id);
  useMe.mockReturnValue({ me: { ...base, round } });
  const ended = createTestProviders(api);
  const result = render(<TeamRoundNotice />, { wrapper: ended.Providers });
  expect(result.container).toBeEmptyDOMElement();
  result.unmount();
  location.pathname = "/";
  useMe.mockReturnValue({ me: { ...base, round: mockDuelRound("playing", Date.now()) } });
  const playing = createTestProviders(api);
  const home = render(<TeamRoundNotice />, { wrapper: playing.Providers });
  expect(home.container).toBeEmptyDOMElement();
});
