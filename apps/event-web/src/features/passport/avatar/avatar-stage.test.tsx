import { render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AvatarStage } from "@/features/passport/avatar/avatar-stage";
import { DEFAULT_COLOURS } from "@/features/passport/avatar/avatar-colours";
import type { VoxelStageProps } from "@/features/passport/avatar/voxel-stage";

const device = vi.hoisted(() => ({
  webgl: true,
  downloadFails: false,
  stage: "loading" as "loading" | "ready" | "failed",
}));

vi.mock("@/features/passport/avatar/webgl", () => ({ hasWebGL: () => device.webgl }));
vi.mock("@/features/passport/avatar/load-voxel-stage", () => ({
  loadVoxelStage: vi.fn(() =>
    device.downloadFails
      ? Promise.reject(new Error("offline"))
      : Promise.resolve({ VoxelStage: FakeVoxelStage }),
  ),
}));

function FakeVoxelStage({ onReady, onFailed }: VoxelStageProps) {
  useEffect(() => {
    if (device.stage === "ready") onReady();
    if (device.stage === "failed") onFailed();
  }, [onReady, onFailed]);
  return <div data-testid="voxel" />;
}

function renderStage() {
  return render(
    <AvatarStage
      slots={[]}
      colours={DEFAULT_COLOURS}
      arriving={[]}
      completing={false}
      flatUrl="/avatar.png"
      title={
        <>
          <p>GeekyKey at the showcase</p>
          <h1>Alex Tan</h1>
        </>
      }
    />,
  );
}

beforeEach(() => {
  device.webgl = true;
  device.downloadFails = false;
  device.stage = "loading";
});

describe("AvatarStage", () => {
  it("keeps the flat avatar and a loading line until the first 3D frame", async () => {
    renderStage();

    expect(await screen.findByTestId("voxel")).toBeInTheDocument();
    expect(screen.getByText("Loading your avatar in 3D...")).toBeInTheDocument();
    expect(screen.queryByText("Drag to turn")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Alex Tan" })).toBeInTheDocument();
  });

  it("says the avatar can be turned once the first frame is ready", async () => {
    device.stage = "ready";
    renderStage();

    expect(await screen.findByText("Drag to turn")).toBeInTheDocument();
    expect(screen.queryByText("Loading your avatar in 3D...")).not.toBeInTheDocument();
  });

  it("keeps the flat avatar and explains when the browser has no WebGL", () => {
    device.webgl = false;
    renderStage();

    expect(screen.getByText("3D isn't available in this browser.")).toBeInTheDocument();
    expect(screen.queryByText("Drag to turn")).not.toBeInTheDocument();
    expect(screen.queryByTestId("voxel")).not.toBeInTheDocument();
  });

  it("keeps the flat avatar and says when the 3D download fails", async () => {
    device.downloadFails = true;
    renderStage();

    expect(
      await screen.findByText("3D couldn't load. Your avatar is still here."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Drag to turn")).not.toBeInTheDocument();
    expect(screen.queryByTestId("voxel")).not.toBeInTheDocument();
  });

  it("keeps the flat avatar and says when the renderer cannot start", async () => {
    device.stage = "failed";
    renderStage();

    expect(
      await screen.findByText("3D couldn't load. Your avatar is still here."),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("voxel")).not.toBeInTheDocument());
    expect(screen.queryByText("Drag to turn")).not.toBeInTheDocument();
  });
});
