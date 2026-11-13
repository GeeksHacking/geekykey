type VoxelStageModule = typeof import("@/features/passport/avatar/voxel-stage");

let loading: Promise<VoxelStageModule> | undefined;

/*
  three.js comes through import() only, when the dashboard first shows the avatar, so the page
  paints with the flat picture first. A failed download is forgotten, so the next mount tries
  again (FRO-164).
*/
export function loadVoxelStage(): Promise<VoxelStageModule> {
  loading ??= import("@/features/passport/avatar/voxel-stage").catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
  return loading;
}
