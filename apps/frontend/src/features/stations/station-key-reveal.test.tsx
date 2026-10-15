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

  // 9.7 says the key is returned only in the create response and there is no endpoint to
  // read it back, so the clipboard is the only way it leaves this dialog. The key copied has
  // to be the one the service returned, not the label or a trimmed version of it.
  it("copies the key the service returned, and says it did", async () => {
    renderReveal();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy key" }));
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("gk_sta_example");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  // A refused clipboard must not claim success, because the organizer would close the dialog
  // believing the key is somewhere it can reach. The toast itself is not asserted: no other
  // test in this app mounts a Toaster or mocks sonner, so the button's own state is the
  // only thing on screen that tells the truth either way.
  it("leaves the button saying Copy key when the clipboard refuses", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("denied"));
    renderReveal();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy key" }));
    });

    expect(screen.getByRole("button", { name: "Copy key" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
  });

  // The field is read-only on purpose. Nothing reads the key back, so a key edited here is a
  // key the service never issued and the organizer finds out at the station, not here.
  it("shows the key the service returned, and will not let it be edited", () => {
    renderReveal();

    const field = screen.getByLabelText("Station key");
    expect(field).toHaveValue("gk_sta_example");
    expect(field).toHaveAttribute("readonly");
  });

  // Focusing selects the whole key, so a second copy takes all of it rather than the word
  // under the caret. A key is long and unreadable, and nobody drags to the end of one. The
  // test measures the fixture's own length rather than a number written in, because the
  // agreement fixes the gk_sta_ prefix and no length.
  it("selects the whole key when it takes focus", () => {
    renderReveal();
    const field = screen.getByLabelText("Station key") as HTMLInputElement;

    fireEvent.focus(field);

    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe("gk_sta_example".length);
  });

  // 9.8 replaces a key while keeping the station's ID, its passport settings and its
  // stamps, so telling an organizer to create a new station sent them off to lose all
  // three. The agreement does not say how a brand new station's key reaches it, but 9.8 and
  // the 8 Oct 2026 change both say the setup mode, and rule out a reflash.
  //
  // Asserted against the container's text, not an element: this file mocks the dialog parts
  // as pass-throughs, so the description has no element of its own here.
  it("says the key goes into the setup mode, and that replacing it keeps the station", () => {
    const { container } = renderReveal();
    const shown = container.textContent ?? "";

    // The whole sentence, not a fragment, so the JSX line wrap has to collapse to single
    // spaces or this fails.
    expect(shown).toContain(
      "Put this key into the station's setup mode. You can replace it later, and the station keeps its ID, its passport settings and its stamps.",
    );
    expect(shown).not.toContain("create a new station");
  });

  // 9.7 returns the key in the create response and says no endpoint reads it back, so this
  // warning is the only place an organizer learns the key cannot be recovered.
  it("warns that the key is shown once and cannot be seen again", () => {
    const { container } = renderReveal();

    expect(container.textContent).toContain(
      "Copy it now. It is shown once, and closing this dialog hides it for good.",
    );
  });
});
