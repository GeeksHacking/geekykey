import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AvatarColours } from "@/features/passport/avatar/avatar-colours";
import { StickerButton } from "@/features/passport/avatar/sticker-button";

const drawSticker = vi.hoisted(() => vi.fn());

vi.mock("@/features/passport/avatar/sticker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/passport/avatar/sticker")>();
  return { ...actual, drawSticker };
});

const colours: AvatarColours = {
  character: "suit",
  skin: "warm",
  hair: "black",
  suit: "navy",
};

function setPointer(coarse: boolean) {
  vi.mocked(window.matchMedia).mockImplementation(
    (query) =>
      ({
        matches: coarse && query === "(pointer: coarse)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => false),
      }) as MediaQueryList,
  );
}

function renderButton() {
  return render(<StickerButton slots={[]} colours={colours} />);
}

describe("StickerButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    drawSticker.mockReset();
    drawSticker.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the share sheet with my-avatar.png on a phone", async () => {
    const user = userEvent.setup();
    setPointer(true);
    const share = vi.fn(async (_data: ShareData) => {});
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    renderButton();

    const button = screen.getByRole("button", { name: "Save as sticker" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    expect(share).toHaveBeenCalledTimes(1);
    const [data] = share.mock.calls[0]!;
    expect(data.files?.[0]?.name).toBe("my-avatar.png");
    expect(data.files?.[0]?.type).toBe("image/png");
  });

  it("downloads my-avatar.png on a laptop", async () => {
    const user = userEvent.setup();
    setPointer(false);
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:test"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    renderButton();

    const button = screen.getByRole("button", { name: "Save as sticker" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    expect(saved).toEqual(["my-avatar.png"]);
  });

  it("says so when the picture can't be made, and tries again on the next press", async () => {
    const user = userEvent.setup();
    drawSticker.mockRejectedValueOnce(new Error("no canvas"));
    renderButton();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't make the sticker. Try again.",
    );
    const button = screen.getByRole("button", { name: "Save as sticker" });
    expect(button).toBeEnabled();
    await user.click(button);

    await waitFor(() => expect(drawSticker).toHaveBeenCalledTimes(2));
  });

  it("draws again when the colours change, and disables the old picture", async () => {
    let finish: ((blob: Blob) => void) | undefined;
    drawSticker
      .mockResolvedValueOnce(new Blob(["one"], { type: "image/png" }))
      .mockImplementationOnce(
        () =>
          new Promise<Blob>((resolve) => {
            finish = resolve;
          }),
      );
    const { rerender } = render(<StickerButton slots={[]} colours={colours} />);
    const button = screen.getByRole("button", { name: "Save as sticker" });
    await waitFor(() => expect(button).toBeEnabled());

    rerender(<StickerButton slots={[]} colours={{ ...colours, suit: "emerald" }} />);
    expect(button).toBeDisabled();
    await waitFor(() => expect(drawSticker).toHaveBeenCalledTimes(2));

    finish?.(new Blob(["two"], { type: "image/png" }));
    await waitFor(() => expect(button).toBeEnabled());
  });
});
