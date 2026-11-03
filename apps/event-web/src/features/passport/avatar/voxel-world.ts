import * as THREE from "three";

import { SIZE, type PieceKey, type Tag } from "@/features/passport/avatar/art";
import { recolour, type AvatarColours } from "@/features/passport/avatar/avatar-colours";
import { figureFor, type Cube as ModelCube } from "@/features/passport/avatar/voxel-model";

/*
  The avatar as cubes (FRO-105), drawn with three.js from the figure in voxel-model.ts. Only
  voxel-stage.tsx and the avatar lab import this, through import(), so three.js is its own
  file that loads after the dashboard.
*/

interface Cube {
  x: number;
  y: number;
  z: number;
  color: string;
  source: ModelCube;
}

/** What the avatar lab shows about a cube someone clicked. */
export interface PickedCube {
  part: string;
  col: number;
  row: number;
  z: number;
  colour: string;
  tag: Tag;
}

/** The cubes the guest wears, in their colours: the body and each worn piece's own. */
export function cubesFor(worn: readonly PieceKey[], colours: AvatarColours) {
  const figure = figureFor(colours.character, worn);
  const paint = (cubes: ModelCube[]): Cube[] => {
    const painted = recolour(
      cubes.map((cube) => cube.cell),
      colours,
    );
    return cubes.map((cube, i) => ({
      x: cube.col - (SIZE - 1) / 2,
      y: SIZE / 2 - 1 - cube.row,
      z: cube.z,
      color: painted[i]!,
      source: cube,
    }));
  };
  const lowest = Math.max(...figure.body.map((cube) => cube.row));
  return {
    body: paint(figure.body),
    pieces: figure.pieces.map(({ key, cubes }) => ({ key, cubes: paint(cubes) })),
    feet: SIZE / 2 - 1 - lowest,
  };
}

const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const SPIN_SECONDS = 1.4;

interface Arrival {
  mesh: THREE.InstancedMesh;
  cubes: Cube[];
  from: THREE.Vector3[];
  spin: THREE.Euler[];
  delay: number[];
  t0: number;
}

/** The lights the live stage and the sticker share, so both see the same colours. */
export function addLights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x202030, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(20, 30, 40);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd4af37, 2.5);
  rim.position.set(-30, 10, -30);
  scene.add(rim);
}

export function createWorld(host: HTMLElement, { still }: { still: boolean }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  Object.assign(renderer.domElement.style, { width: "100%", height: "100%", display: "block" });
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 1, 1000);
  addLights(scene);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(18, 48),
    // Faint, as it's drawn on the page in either theme.
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const figure = new THREE.Group();
  scene.add(figure);
  // Whole cubes, with no gap between them: the figure is hollow, so a gap would show its
  // inside as dark lines across the face.
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial();
  let meshes: { mesh: THREE.InstancedMesh; part: string; cubes: Cube[] }[] = [];
  let arrivals: Arrival[] = [];

  function build(cubes: Cube[]) {
    const mesh = new THREE.InstancedMesh(geo, mat, cubes.length);
    mesh.frustumCulled = false;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    cubes.forEach((cube, i) => {
      mesh.setMatrixAt(i, m.makeTranslation(cube.x, cube.y, cube.z));
      mesh.setColorAt(i, c.set(cube.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  /**
   * Rebuilds the figure wearing `worn`, in slot order. The pieces in `arriving` fly in from
   * around it and snap into place.
   */
  function setOutfit(
    worn: readonly PieceKey[],
    colours: AvatarColours,
    arriving: readonly PieceKey[],
  ) {
    for (const { mesh } of meshes) {
      figure.remove(mesh);
      mesh.dispose();
    }
    meshes = [];
    arrivals = [];
    const { body, pieces, feet } = cubesFor(worn, colours);
    floor.position.y = feet - 0.4;
    meshes.push({ mesh: build(body), part: "body", cubes: body });
    for (const { key, cubes } of pieces) {
      const mesh = build(cubes);
      meshes.push({ mesh, part: key, cubes });
      if (still || !arriving.includes(key)) continue;
      arrivals.push({
        mesh,
        cubes,
        from: cubes.map(() =>
          new THREE.Vector3().randomDirection().multiplyScalar(60 + Math.random() * 50),
        ),
        spin: cubes.map(
          () => new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        ),
        delay: cubes.map(() => Math.random() * 0.35),
        t0: performance.now(),
      });
    }
    for (const { mesh } of meshes) figure.add(mesh);
  }

  // Drag to turn, with a little inertia; sway and bob when left alone.
  let angle = 0;
  let velocity = 0;
  let dragging = false;
  let lastX = 0;
  let swayT = 0;
  let spinStart: number | null = null;
  const canvas = renderer.domElement;
  // Only sideways drags turn the figure, so a finger can still scroll the page past it.
  canvas.style.touchAction = "pan-y";
  const down = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!dragging) return;
    velocity = (e.clientX - lastX) * 0.012;
    angle += velocity;
    lastX = e.clientX;
  };
  const up = () => {
    dragging = false;
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);

  const resize = new ResizeObserver(([entry]) => {
    if (!entry) return;
    const { width, height } = entry.contentRect;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Fit about 100 cubes of height and 72 of width, and look above the figure's middle, so
    // the name over the top of the stage stays clear of a hat or a feather, and "Drag to
    // turn" under it clear of the shoes, at any width.
    const dist = Math.max(100, 72 / camera.aspect) / (2 * Math.tan((14 * Math.PI) / 180));
    camera.position.set(0, 11, dist);
    camera.lookAt(0, 7, 0);
    camera.updateProjectionMatrix();
  });
  resize.observe(host);

  // Off screen, the figure stops drawing, so a guest scrolled down to their taps saves battery.
  let visible = true;
  const seen = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
  });
  seen.observe(host);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const e = new THREE.Euler();
  let last = performance.now();
  let frame = 0;

  function playArrivals(now: number) {
    arrivals = arrivals.filter((a) => {
      const elapsed = (now - a.t0) / 1000;
      let done = true;
      a.cubes.forEach((cube, i) => {
        const t = Math.min(Math.max((elapsed - a.delay[i]!) / 0.75, 0), 1);
        if (t < 1) done = false;
        p.set(cube.x, cube.y, cube.z).lerp(a.from[i]!, 1 - easeOutBack(t));
        const s = (1 - t) ** 2;
        const spin = a.spin[i]!;
        e.set(spin.x * s, spin.y * s, spin.z * s);
        a.mesh.setMatrixAt(i, m.compose(p, q.setFromEuler(e), one));
      });
      a.mesh.instanceMatrix.needsUpdate = true;
      return !done;
    });
  }

  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!visible) return;
    if (!dragging) {
      angle += velocity;
      velocity *= 0.93;
      if (Math.abs(velocity) < 0.002 && !still) swayT += dt;
    }
    let spin = 0;
    if (spinStart !== null) {
      const t = Math.min((now - spinStart) / 1000 / SPIN_SECONDS, 1);
      spin = easeInOut(t) * Math.PI * 2;
      if (t === 1) spinStart = null;
    }
    figure.rotation.y = angle + spin + Math.sin(swayT * 0.7) * 0.45;
    figure.position.y = still ? 0 : Math.abs(Math.sin(now / 420)) * 1;
    if (arrivals.length > 0) playArrivals(now);
    renderer.render(scene, camera);
  }
  frame = requestAnimationFrame(tick);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  return {
    setOutfit,
    /** Turns the figure to face `radians` from the front, for the avatar lab. */
    turnTo(radians: number) {
      angle = radians;
      velocity = 0;
    },
    /** The cube under a point on the screen, for the avatar lab. */
    cubeAt(clientX: number, clientY: number): PickedCube | null {
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const [hit] = raycaster.intersectObjects(meshes.map((m) => m.mesh));
      const owner = meshes.find((m) => m.mesh === hit?.object);
      const cube = hit?.instanceId === undefined ? undefined : owner?.cubes[hit.instanceId];
      if (!owner || !cube) return null;
      const { col, row, z, cell } = cube.source;
      return { part: owner.part, col, row, z, colour: cell.colour, tag: cell.tag };
    },
    /** Turns the figure round once, for the moment the outfit is complete. */
    spinOnce() {
      if (!still) spinStart = performance.now();
    },
    dispose() {
      cancelAnimationFrame(frame);
      resize.disconnect();
      seen.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      for (const { mesh } of meshes) mesh.dispose();
      geo.dispose();
      mat.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}

export type World = ReturnType<typeof createWorld>;
