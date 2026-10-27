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

function renderExportButton(configure?: (api: ReturnType<typeof createMockClient>) => void) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  configure?.(api);
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

  render(
    <ApiProvider client={api}>
      <ExportButton />
    </ApiProvider>,
  );

  return { api, click };
}

describe("ExportButton", () => {
  // The export is the feed for the A/B analysis, so the file the organiser gets is the
  // file the service sent. Section 13 says the rule under the button, and says when a
  // file was changed that it is not the service's own.
  it("hands the browser the file the service sent, and revokes its URL after the click", async () => {
    const { api, click } = renderExportButton();

    expect(
      screen.getByText(
        "A value that a spreadsheet could run as a formula gets an apostrophe, so it stays text.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Some values were escaped, so this file is not the service's own."),
    ).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    });

    expect(click).toHaveBeenCalledTimes(1);
    expect(createdBlob).toBeInstanceOf(Blob);
    expect(await createdBlob?.text()).toBe(await (await api.exportCsv()).text());
    expect(
      screen.queryByText("Some values were escaped, so this file is not the service's own."),
    ).not.toBeInTheDocument();
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    await act(async () => {
      vi.runAllTimers();
    });
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:export");
  });

  it("says the file is not the service's own when a name was escaped", async () => {
    const { click } = renderExportButton((api) => {
      const station = api.mock.data.stations.at(0);
      if (!station?.passport) throw new Error("Expected a seeded passport station");
      // The export writes the passport name, not the physical station name (agreement 9.6).
      station.passport.name = "=2+2";
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    });

    expect(click).toHaveBeenCalledTimes(1);
    expect(await createdBlob?.text()).toContain("'=2+2");
    expect(
      screen.getByText("Some values were escaped, so this file is not the service's own."),
    ).toBeInTheDocument();
  });
});
