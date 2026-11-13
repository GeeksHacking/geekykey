import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_COLOURS } from "@/features/passport/avatar/avatar-colours";
import { VoxelStage } from "@/features/passport/avatar/voxel-stage";

const world = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@/features/passport/avatar/voxel-world", () => ({ createWorld: world.create }));

beforeEach(() => {
  world.create.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderStage(onReady: () => void, onFailed: () => void) {
  return render(
    <VoxelStage
      slots={[]}
      colours={DEFAULT_COLOURS}
      arriving={[]}
      completing={false}
      onReady={onReady}
      onFailed={onFailed}
    />,
  );
}

describe("VoxelStage", () => {
  it("says when the first frame with the figure is ready", () => {
    const onReady = vi.fn();
    world.create.mockImplementation((_host, options) => {
      options.onFirstFrame?.();
      return { setOutfit: vi.fn(), spinOnce: vi.fn(), dispose: vi.fn() };
    });

    renderStage(onReady, vi.fn());

    expect(onReady).toHaveBeenCalledOnce();
  });

  it("says when the renderer cannot start, so the flat avatar stays", () => {
    const onFailed = vi.fn();
    world.create.mockImplementation(() => {
      throw new Error("no context");
    });

    renderStage(vi.fn(), onFailed);

    expect(onFailed).toHaveBeenCalledOnce();
  });
});
