import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateStationResponse } from "@/api/types";
import { StationKeyReveal } from "@/features/stations/station-key-reveal";

vi.mock("@/components/ui/dialog", () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    DialogDescription: Passthrough,
    DialogFooter: Passthrough,
    DialogHeader: Passthrough,
    DialogTitle: Passthrough,
  };
});

const result: CreateStationResponse = {
  station: {
    id: "station-1",
    label: "Reader 3",
    created_at: "2026-10-10T00:00:00.000Z",
    disabled_at: null,
    passport: null,
    last_seen_at: null,
    online: false,
    firmware_version: null,
    buffered_taps: 0,
    reader_ok: null,
    last_tap_at: null,
  },
  api_key: "gk_sta_example",
};

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  vi.useRealTimers();
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
});

function renderReveal() {
  return render(<StationKeyReveal result={result} onDone={vi.fn()} />);
}

describe("StationKeyReveal", () => {
  it("restarts and clears the copied-state timeout", async () => {
    renderReveal();
    const copy = screen.getByRole("button", { name: "Copy key" });

    await act(async () => {
      fireEvent.click(copy);
    });
    act(() => vi.advanceTimersByTime(1500));
    await act(async () => {
      fireEvent.click(copy);
    });
    act(() => vi.advanceTimersByTime(600));

    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1400));
    expect(screen.getByRole("button", { name: "Copy key" })).toBeInTheDocument();
  });

  it("clears the pending timeout when the reveal unmounts", async () => {
    const view = renderReveal();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy key" }));
    });
    expect(vi.getTimerCount()).toBe(1);

    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
