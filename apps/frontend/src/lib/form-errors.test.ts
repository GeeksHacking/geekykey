import type { UseFormReturn } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import type { ApiIssue } from "@/api/types";
import { applyApiIssues } from "@/lib/form-errors";

function formDouble() {
  return {
    getValues: () => ({ name: "" }),
    setError: vi.fn(),
  } as unknown as UseFormReturn<{ name: string }>;
}

describe("applyApiIssues", () => {
  it("ignores malformed issues and returns usable form-level messages", () => {
    const form = formDouble();
    const malformed = [
      null,
      "name is required",
      { path: "name", message: "name is required" },
      { path: ["name"], message: " " },
    ] as unknown as ApiIssue[];

    expect(applyApiIssues(form, malformed)).toEqual([]);
    expect(form.setError).not.toHaveBeenCalled();
    expect(applyApiIssues(form, [{ path: [], message: "Check the request." }])).toEqual([
      "Check the request.",
    ]);
  });
});
