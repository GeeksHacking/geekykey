import { afterEach, describe, expect, it, vi } from "vitest";

import type { AvatarColours } from "@/features/passport/avatar/avatar-colours";
import { drawSticker, stickerFile, stickerMode } from "@/features/passport/avatar/sticker";

const colours: AvatarColours = {
  character: "suit",
  skin: "warm",
  hair: "black",
  suit: "navy",
};

describe("stickerMode", () => {
  it("is auto unless a dev query says otherwise", () => {
    expect(stickerMode("", true)).toBe("auto");
    expect(stickerMode("?sticker=flat", true)).toBe("flat");
    expect(stickerMode("?sticker=3d", true)).toBe("3d");
    expect(stickerMode("?sticker=other", true)).toBe("auto");
  });

  it("ignores the query outside development", () => {
    expect(stickerMode("?sticker=flat", false)).toBe("auto");
  });
});

describe("stickerFile", () => {
  it("names the picture my-avatar.png", () => {
    const file = stickerFile(new Blob(["png"], { type: "image/png" }));

    expect(file.name).toBe("my-avatar.png");
    expect(file.type).toBe("image/png");
  });
});

describe("drawSticker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("draws the flat art where there is no WebGL", async () => {
    const context = { fillStyle: "", fillRect: vi.fn() } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((type) =>
      type === "2d" ? context : null,
    );
    const png = new Blob(["png"], { type: "image/png" });
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
      configurable: true,
      value: (callback: BlobCallback) => callback(png),
    });

    const blob = await drawSticker([], colours);

    expect(blob).toBe(png);
    expect(context.fillRect).toHaveBeenCalled();
  });
});

describe("hasWebGL", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks the browser once for the whole page", async () => {
    vi.resetModules();
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({} as WebGL2RenderingContext);
    const { hasWebGL } = await import("@/features/passport/avatar/webgl");

    expect(hasWebGL()).toBe(true);
    expect(hasWebGL()).toBe(true);
    expect(getContext).toHaveBeenCalledTimes(1);
  });
});
