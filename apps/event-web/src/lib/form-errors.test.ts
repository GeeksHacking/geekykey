import type { UseFormReturn } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import type { ApiIssue } from "@/api/types";
import { applyApiIssues } from "@/lib/form-errors";

function formDouble<T extends Record<string, string>>(fields: T) {
  return {
    getValues: () => fields,
    setError: vi.fn(),
  } as unknown as UseFormReturn<T>;
}

describe("applyApiIssues", () => {
  it("ignores malformed issues and returns usable form-level messages", () => {
    const form = formDouble({ name: "" });
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

  it("puts a well-formed issue on the field its path names", () => {
    // This is the whole point of the helper: a well-formed issue belongs on its field, and
    // not in the form-level line. Without these the caller could put every message on the
    // summary instead and nothing would notice.
    const form = formDouble({ name: "", points: "" });

    const unmatched = applyApiIssues(form, [
      { path: ["name"], message: "name must be 1 to 80 characters" },
    ]);

    expect(form.setError).toHaveBeenCalledTimes(1);
    expect(form.setError).toHaveBeenCalledWith("name", {
      type: "server",
      message: "name must be 1 to 80 characters",
    });
    // Nothing is left over, because the issue matched a field.
    expect(unmatched).toEqual([]);
  });

  it("routes each issue to its own field, and a form-level line only for the rest", () => {
    const form = formDouble({ name: "", points: "", location: "" });

    const unmatched = applyApiIssues(form, [
      { path: ["name"], message: "name must be 1 to 80 characters" },
      { path: ["points"], message: "points must be an integer of 0 or more" },
      // A nested path, as the agreement's own example shows, and an unknown field.
      { path: ["taps", 0, "uid"], message: "uid must be 4 to 10 hex bytes" },
    ]);

    expect(form.setError).toHaveBeenCalledTimes(2);
    expect(form.setError).toHaveBeenCalledWith("name", {
      type: "server",
      message: "name must be 1 to 80 characters",
    });
    expect(form.setError).toHaveBeenCalledWith("points", {
      type: "server",
      message: "points must be an integer of 0 or more",
    });
    // The nested path matches no field, so its message becomes the form-level line.
    expect(unmatched).toEqual(["uid must be 4 to 10 hex bytes"]);
  });

  it("does not treat a numeric path segment as a field name", () => {
    // `path.join(".")` on [1, 2] gives "1.2", which must not become a field.
    const form = formDouble({ name: "" });

    const unmatched = applyApiIssues(form, [{ path: [1, 2], message: "nope" }]);

    expect(form.setError).not.toHaveBeenCalled();
    expect(unmatched).toEqual(["nope"]);
  });
});
