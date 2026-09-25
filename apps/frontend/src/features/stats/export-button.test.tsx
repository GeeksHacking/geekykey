import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { ApiProvider } from "@/api/provider";
import { ExportButton } from "@/features/stats/export-button";

let createdBlob: Blob | undefined;
const createObjectUrl = vi.fn((blob: Blob) => {
  createdBlob = blob;
  return "blob:export";
});
const revokeObjectUrl = vi.fn();
const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

beforeEach(() => {
  vi.useFakeTimers();
  createdBlob = undefined;
  createObjectUrl.mockClear();
  revokeObjectUrl.mockClear();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectUrl,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectUrl,
  });
});

afterEach(() => {
  vi.useRealTimers();
  if (originalCreateObjectUrl)
    Object.defineProperty(URL, "createObjectURL", originalCreateObjectUrl);
  if (originalRevokeObjectUrl)
    Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectUrl);
  vi.restoreAllMocks();
});

describe("ExportButton", () => {
  it("sanitizes the downloaded CSV and revokes its URL after the click", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ORGANIZER_ID);
    const station = api.mock.data.stations.at(0);
    if (!station) throw new Error("Expected a seeded station");
    station.name = "=2+2";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(
      <ApiProvider client={api}>
        <ExportButton />
      </ApiProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    });

    expect(click).toHaveBeenCalledTimes(1);
    expect(createdBlob).toBeInstanceOf(Blob);
    expect(await createdBlob?.text()).toContain("'=2+2");
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    await act(async () => {
      vi.runAllTimers();
    });
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:export");
  });
});
