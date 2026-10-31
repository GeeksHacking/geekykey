import * as THREE from "three";

import {
  BASE,
  BODY,
  composite,
  ROWS,
  SIZE,
  type Cell,
  type PieceKey,
  type Shape,
} from "@/features/passport/avatar/art";
import { recolour, type AvatarColours } from "@/features/passport/avatar/avatar-colours";
import type { Slot } from "@/features/passport/avatar/outfit";

/*
  The avatar as cubes (FRO-105): every solid pixel of a layer becomes a cube, so the same art
  as the flat avatar turns into a figure the guest can turn. Only voxel-stage.tsx imports
  this, through import(), so three.js is its own file that loads after the dashboard.
*/

interface Cube {
  x: number;
  y: number;
  z: number;
  color: string;
}

/** The body runs from -DEPTH to DEPTH cubes front to back. */
const DEPTH = 4;
const BODY_Z = Array.from({ length: 2 * DEPTH + 1 }, (_, k) => DEPTH - k);

function at(i: number) {
  const row = Math.floor(i / SIZE);
  return { row, x: (i % SIZE) - (SIZE - 1) / 2, y: SIZE - 1 - row - SIZE / 2 };
}

/** The lowest row with a pixel, where the feet stand. */
const FEET_Y = at(BODY.findLastIndex((cell) => cell !== null)).y;

/** The cubes the guest wears: the body and, for each worn piece, the cubes it adds. */
function cubesFor(slots: readonly Slot[], colours: AvatarColours) {
  const worn = slots.filter((slot) => slot.worn);
  const dressed = composite(
    BODY,
    worn.map((slot) => slot.piece.layer),
  );
  const [hair, suit] = recolour(
    [
      { colour: BASE.hair, tag: "hair" },
      { colour: BASE.suit, tag: "suit" },
    ],
    colours,
  ) as [string, string];

  // A pixel on the figure's outline is a full column of cubes; inside, only the front and
  // the back, which is all anyone sees and a third of the cubes.
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < SIZE && y < SIZE && dressed[y * SIZE + x] != null;
  const edge = (i: number) => {
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    return !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1);
  };

  function bodyColumn(i: number, cell: Cell, color: string, out: Cube[]) {
    const { row, x, y } = at(i);
    // The back of the head is hair, and the back of the jacket is plain suit, with no shirt
    // or lapels. Hands and shoes look the same from behind.
    const back =
      row < ROWS.chin
        ? hair
        : row < ROWS.shoes && cell.tag !== "skin" && cell.tag !== "item"
          ? suit
          : color;
    for (const z of edge(i) ? BODY_Z : [DEPTH, -DEPTH]) {
      out.push({ x, y, z, color: z === -DEPTH ? back : color });
    }
  }

  function pieceColumn(i: number, shape: Shape, color: string, out: Cube[]) {
    const { x, y } = at(i);
    const onBody = BODY[i] != null;
    if (shape === "solid") for (const z of BODY_Z) out.push({ x, y, z, color });
    // A thin piece over the body sits in front of it rather than cutting through it.
    else if (shape === "front" || onBody) out.push({ x, y, z: DEPTH + 1, color });
    else out.push({ x, y, z: 0, color });
  }

  // Each pixel belongs to the last worn layer that changed it.
  const owner = new Map<number, number>();
  worn.forEach((slot, w) => slot.piece.layer.forEach((cell, i) => cell && owner.set(i, w)));

  const coloured = recolour(dressed, colours);
  const body: Cube[] = [];
  dressed.forEach((cell, i) => {
    if (cell && !owner.has(i)) bodyColumn(i, cell, coloured[i]!, body);
  });

  // A piece that isn't solid sits on the body, so the body stays under it: a monocle
  // mustn't leave a hole through the head.
  const under = composite(
    BODY,
    worn.map((slot) =>
      slot.piece.layer.map((cell) => (cell === "erase" || cell?.tag !== "item" ? cell : null)),
    ),
  );
  const underColours = recolour(under, colours);
  const keepUnder = (i: number, shape: Shape) => {
    const cell = under[i];
    if (cell && shape !== "solid") bodyColumn(i, cell, underColours[i]!, body);
  };

  const pieces = worn.map((slot, w) => {
    const cubes: Cube[] = [];
    slot.piece.layer.forEach((cell, i) => {
      if (!cell || cell === "erase" || owner.get(i) !== w) return;
      if (cell.tag === "item") {
        pieceColumn(i, slot.piece.shape, cell.colour, cubes);
        keepUnder(i, slot.piece.shape);
      } else bodyColumn(i, cell, coloured[i]!, cubes);
    });
    return { key: slot.piece.key, cubes };
  });

  return { body, pieces };
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

export function createWorld(host: HTMLElement, { still }: { still: boolean }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  Object.assign(renderer.domElement.style, { width: "100%", height: "100%", display: "block" });
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 1, 1000);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x202030, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(20, 30, 40);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd4af37, 2.5);
  rim.position.set(-30, 10, -30);
  scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(18, 48),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FEET_Y - 0.4;
  scene.add(floor);

  const figure = new THREE.Group();
  scene.add(figure);
  const geo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
  const mat = new THREE.MeshLambertMaterial();
  let meshes: THREE.InstancedMesh[] = [];
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

  /** Rebuilds the figure. The pieces in `arriving` fly in from around it and snap into place. */
  function setOutfit(
    slots: readonly Slot[],
    colours: AvatarColours,
    arriving: readonly PieceKey[],
  ) {
    for (const mesh of meshes) {
      figure.remove(mesh);
      mesh.dispose();
    }
    meshes = [];
    arrivals = [];
    const { body, pieces } = cubesFor(slots, colours);
    meshes.push(build(body));
    for (const { key, cubes } of pieces) {
      const mesh = build(cubes);
      meshes.push(mesh);
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
    for (const mesh of meshes) figure.add(mesh);
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
    // Fit about 92 cubes of height and 68 of width, and look above the figure's middle, so
    // the name over the top of the stage stays clear of the hat at any width.
    const dist = Math.max(92, 68 / camera.aspect) / (2 * Math.tan((14 * Math.PI) / 180));
    camera.position.set(0, 14, dist);
    camera.lookAt(0, 10, 0);
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

  return {
    setOutfit,
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
      for (const mesh of meshes) mesh.dispose();
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
