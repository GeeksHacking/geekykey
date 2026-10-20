import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RootError } from "@/components/layout/root-error";

describe("RootError", () => {
  it("shows a retry action for an unexpected render error", async () => {
    const reset = vi.fn();
    render(
      <RootError
        error={new Error("render failed")}
        reset={reset}
        info={{ componentStack: "test" } as never}
      />,
    );

    expect(screen.getByText("The app hit an unexpected error")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
