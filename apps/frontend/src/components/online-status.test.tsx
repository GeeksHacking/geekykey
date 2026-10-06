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
    render(<OnlineStatus online={false} lastSeenAt={null} />);

    expect(screen.getByText("Never connected")).toBeInTheDocument();
  });

  it("says Status unknown, not Offline, when the status is unknown", () => {
    // Agreement 9.2: a failed status call must not make an organiser restart a
    // healthy station.
    render(<OnlineStatus online={null} lastSeenAt={null} />);

    expect(screen.getByText("Status unknown")).toBeInTheDocument();
    expect(screen.queryByText("Offline")).not.toBeInTheDocument();
    expect(screen.queryByText("Never connected")).not.toBeInTheDocument();
  });

  it("prefers Status unknown over Offline even when a last-seen time exists", () => {
    render(<OnlineStatus online={null} lastSeenAt="2026-10-10T09:00:00.000Z" />);

    expect(screen.getByText("Status unknown")).toBeInTheDocument();
    expect(screen.queryByText("Offline")).not.toBeInTheDocument();
  });
});
