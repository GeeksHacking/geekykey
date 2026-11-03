import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { shareOrDownload } from "@/features/passport/avatar/share-file";

const file = new File(["picture"], "my-avatar.png", { type: "image/png" });

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

describe("shareOrDownload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the share sheet on a phone that can share the file", async () => {
    setPointer(true);
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", { configurable: true, value: share });

    await shareOrDownload(file, { title: "The Grad Tea" });

    expect(share).toHaveBeenCalledWith({ files: [file], title: "The Grad Tea" });
  });

  it("downloads the file when the phone can't share it", async () => {
    setPointer(true);
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false });
    const saved: { download: string; href: string }[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push({ download: this.download, href: this.href });
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:test"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });

    await shareOrDownload(file);

    expect(click).toHaveBeenCalledTimes(1);
    expect(saved).toEqual([{ download: "my-avatar.png", href: "blob:test" }]);
  });

  it("downloads on a laptop even where the browser can share files", async () => {
    setPointer(false);
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
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

    await shareOrDownload(file);

    expect(saved).toEqual(["my-avatar.png"]);
  });

  it("doesn't download when the share sheet is closed", async () => {
    setPointer(true);
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: vi.fn(async () => {
        throw new DOMException("cancelled", "AbortError");
      }),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:test"),
    });

    await shareOrDownload(file);

    expect(click).not.toHaveBeenCalled();
  });

  it("downloads when the share sheet fails for another reason", async () => {
    setPointer(true);
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: vi.fn(async () => {
        throw new Error("no share target");
      }),
    });
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

    await shareOrDownload(file);

    expect(saved).toEqual(["my-avatar.png"]);
  });
});
