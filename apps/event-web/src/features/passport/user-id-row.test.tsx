import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserIdRow } from "@/features/passport/user-id-row";

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
});

describe("UserIdRow", () => {
  it("labels the ID plainly and shows it in the mono font", () => {
    render(<UserIdRow userId="user-1" />);

    expect(screen.getByText(/Your user ID/)).toBeInTheDocument();
    expect(screen.getByText("user-1")).toHaveClass("font-mono");
  });

  it("copies the user ID and confirms briefly", async () => {
    render(<UserIdRow userId="user-1" />);
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith("user-1");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});
