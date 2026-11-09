import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { drawMemoryCard, saveMemoryCard } from "@/features/passport/avatar/memory-card";
import { shareOrDownload } from "@/features/passport/avatar/share-file";

vi.mock("@/features/passport/avatar/share-file", () => ({ shareOrDownload: vi.fn() }));

function fakeContext() {
  const fillText = vi.fn<(text: string, x: number, y: number) => void>();
  const context = {
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText,
    measureText: () => ({ width: 10 }),
  } as unknown as CanvasRenderingContext2D;
  return { context, fillText };
}

describe("the memory card picture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("draws the showcase's name and date", async () => {
    const { context, fillText } = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((type) =>
      type === "2d" ? context : null,
    );
    const png = new Blob(["png"], { type: "image/png" });
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
      configurable: true,
      value: (callback: BlobCallback) => callback(png),
    });
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { load: vi.fn(async () => []) },
    });

    await drawMemoryCard([], "Alex Tan");

    const title = fillText.mock.calls
      .filter(([, , y]) => y === 160)
      .map(([char]) => char)
      .join("");
    expect(title).toBe("GEEKYKEY AT THE SHOWCASE");
    expect(fillText).toHaveBeenCalledWith("17 November 2026 · GeekyKey", 540, 1235);
  });

  it("names the saved card after the guest and the showcase", async () => {
    await saveMemoryCard(new Blob(["png"], { type: "image/png" }), "Alex Tan");

    const [file, options] = vi.mocked(shareOrDownload).mock.calls[0]!;
    expect(file.name).toBe("showcase-alex-tan.png");
    expect(options).toEqual({ title: "GeekyKey at the showcase" });
  });
});
