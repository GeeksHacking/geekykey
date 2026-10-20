import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LiveStamp } from "@/components/layout/live-stamp";

describe("LiveStamp", () => {
  it("does not turn frequent polling updates into live announcements", () => {
    const { container } = render(
      <LiveStamp updatedAt={Date.parse("2026-10-10T01:02:03.000Z")} refreshing />,
    );

    expect(container.querySelector("[aria-live]")).not.toBeInTheDocument();
  });
});
