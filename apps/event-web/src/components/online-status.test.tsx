import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OnlineStatus } from "@/components/online-status";

describe("OnlineStatus", () => {
  it("says Online when the station is answering", () => {
    render(<OnlineStatus online={true} lastSeenAt="2026-10-10T09:00:00.000Z" />);

    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("says Offline when a station that was here stops answering", () => {
    render(<OnlineStatus online={false} lastSeenAt="2026-10-10T09:00:00.000Z" />);

    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("says Never connected for a station that has never checked in", () => {
    // Agreement 9.2: last_seen_at is set by every hand-off, so a station created by 9.7
    // and not yet heard from has none, and it is offline rather than unknown.
    render(<OnlineStatus online={false} lastSeenAt={null} />);

    expect(screen.getByText("Never connected")).toBeInTheDocument();
    expect(screen.queryByText("Offline")).not.toBeInTheDocument();
  });
});
