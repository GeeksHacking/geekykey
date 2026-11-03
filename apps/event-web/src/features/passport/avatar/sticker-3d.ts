import * as THREE from "three";

import type { AvatarColours } from "@/features/passport/avatar/avatar-colours";
import type { Slot } from "@/features/passport/avatar/outfit";
import { addLights, cubesFor } from "@/features/passport/avatar/voxel-world";

/**
 * The avatar as a sticker (FRO-115): one offscreen frame, square, with no floor and a
 * transparent background. It is a still of the cubes the dashboard shows, not a capture of
 * the live stage, which carries the floor, the title's space and the current sway.
 */
export async function renderStickerBlob(
  slots: readonly Slot[],
  colours: AvatarColours,
  size = 512,
): Promise<Blob> {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  let geometry: THREE.BoxGeometry | undefined;
  let material: THREE.MeshLambertMaterial | undefined;
  let mesh: THREE.InstancedMesh | undefined;

  try {
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    addLights(scene);

    const worn = slots.filter((slot) => slot.worn).map((slot) => slot.piece.key);
    const { body, pieces } = cubesFor(worn, colours);
    const cubes = [...body, ...pieces.flatMap((piece) => piece.cubes)];

    geometry = new THREE.BoxGeometry(1, 1, 1);
    material = new THREE.MeshLambertMaterial();
    const built = new THREE.InstancedMesh(geometry, material, cubes.length);
    mesh = built;
    built.frustumCulled = false;
    const matrix = new THREE.Matrix4();
    const colour = new THREE.Color();
    cubes.forEach((cube, i) => {
      built.setMatrixAt(i, matrix.makeTranslation(cube.x, cube.y, cube.z));
      built.setColorAt(i, colour.set(cube.color));
    });
    built.instanceMatrix.needsUpdate = true;
    if (built.instanceColor) built.instanceColor.needsUpdate = true;

    const figure = new THREE.Group();
    figure.add(built);
    // A small turn shows the cubes' depth without hiding the face.
    figure.rotation.y = 0.35;
    scene.add(figure);

    const box = new THREE.Box3().setFromObject(figure);
    const center = box.getCenter(new THREE.Vector3());
    const extent = box.getSize(new THREE.Vector3());
    const camera = new THREE.PerspectiveCamera(28, 1, 1, 1000);
    const distance = (Math.max(extent.y, extent.x) / 2 / Math.tan((14 * Math.PI) / 180)) * 1.15;
    camera.position.set(center.x, center.y, center.z + distance);
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    renderer.render(scene, camera);
    return await new Promise<Blob>((resolve, reject) => {
      renderer.domElement.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("No PNG"))),
        "image/png",
      );
    });
  } finally {
    mesh?.dispose();
    geometry?.dispose();
    material?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
