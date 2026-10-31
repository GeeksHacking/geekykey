import * as THREE from "three";

import {
  CHARACTERS,
  composite,
  SIZE,
  type Art,
  type Cell,
  type PieceKey,
} from "@/features/passport/avatar/art";
import { recolour, type AvatarColours } from "@/features/passport/avatar/avatar-colours";
import type { Slot } from "@/features/passport/avatar/outfit";

/*
  The avatar as cubes (FRO-105): every solid pixel of the art becomes a column of cubes, so the
  same art as the flat avatar turns into a figure the guest can turn. Only voxel-stage.tsx
  imports this, through import(), so three.js is its own file that loads after the dashboard.
*/

interface Cube {
  x: number;
  y: number;
  z: number;
  color: string;
}

/** The most cubes either side of the middle: a round head, and a body with a flat front. */
const HEAD_HALF = 6;
const BODY_HALF = 5;

function at(i: number) {
  const row = Math.floor(i / SIZE);
  return { row, x: (i % SIZE) - (SIZE - 1) / 2, y: SIZE - 1 - row - SIZE / 2 };
}

/**
 * Half the figure's thickness at each pixel, or -1 where there's no pixel. Each run of pixels
 * across a row is cut as a circle, capped so the torso has a flat front, and each run down a
 * column rounds off the top of the head and the shoulders. Arms, legs and a cane come out
 * round, and a hat's brim comes out thin.
 */
function halfDepths(art: Art, chin: number): number[] {
  const across = Array.from({ length: SIZE * SIZE }, () => -1);
  const down = Array.from({ length: SIZE * SIZE }, () => -1);
  const solid = (x: number, y: number) => art[y * SIZE + x] != null;
  for (let line = 0; line < SIZE; line++) {
    for (const [isRow, out] of [
      [true, across],
      [false, down],
    ] as const) {
      let k = 0;
      while (k < SIZE) {
        if (!(isRow ? solid(k, line) : solid(line, k))) {
          k++;
          continue;
        }
        let end = k;
        while (end + 1 < SIZE && (isRow ? solid(end + 1, line) : solid(line, end + 1))) end++;
        const r = (end - k + 1) / 2;
        const middle = (k + end) / 2;
        for (let j = k; j <= end; j++) {
          const round = Math.sqrt(Math.max(r * r - (j - middle) ** 2, 0));
          const cap = isRow ? (line < chin ? HEAD_HALF : BODY_HALF) : Infinity;
          out[isRow ? line * SIZE + j : j * SIZE + line] = Math.min(round, cap);
        }
        k = end + 1;
      }
    }
  }
  return across.map((a, i) => (a < 0 ? -1 : Math.floor(Math.min(a, down[i]!))));
}

const luma = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};

/** The cubes the guest wears: the body and, for each worn piece, the cubes it adds. */
function cubesFor(slots: readonly Slot[], colours: AvatarColours) {
  const who = CHARACTERS[colours.character];
  const worn = slots.filter((slot) => slot.worn);
  const dressed = composite(
    who.body,
    worn.map((slot) => slot.piece.layer),
  );
  const half = halfDepths(dressed, who.rows.chin);
  const coloured = recolour(dressed, colours);
  const [hair, suit] = recolour(
    [
      { colour: who.base.hair, tag: "hair" },
      { colour: who.base.suit, tag: "suit" },
    ],
    colours,
  ) as [string, string];

  const depthAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= SIZE || y >= SIZE ? -1 : half[y * SIZE + x]!;
  const neighbours = (i: number) => {
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    return [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ].filter(([nx, ny]) => depthAt(nx!, ny!) >= 0);
  };
  // Inside the figure, cubes nobody can see are left out: a cube shows on the front or back
  // face, or where a neighbouring column is thinner.
  const shows = (i: number, z: number) =>
    Math.abs(z) === half[i] ||
    neighbours(i).length < 4 ||
    neighbours(i).some(([nx, ny]) => depthAt(nx!, ny!) < Math.abs(z));
  // The dark outline is drawn on the front. Round the side, the column takes the colour of
  // the pixel inside it instead, so the outline doesn't run round the figure as a stripe.
  const sideColour = (i: number, cell: Cell, color: string) => {
    if (cell.tag !== null || luma(cell.colour) >= 30) return color;
    const inside = neighbours(i)
      .map(([nx, ny]) => ny! * SIZE + nx!)
      .sort((a, b) => half[b]! - half[a]!)[0];
    return inside === undefined ? color : (coloured[inside] ?? color);
  };

  function column(i: number, cell: Cell, color: string, out: Cube[]) {
    const { row, x, y } = at(i);
    const side = sideColour(i, cell, color);
    // The back of the head is hair, and the back of the jacket or dress is plain, with no
    // shirt or lapels. Hands, shoes and the pieces look the same from behind.
    const back =
      cell.tag === "item"
        ? side
        : row < who.rows.chin
          ? hair
          : cell.tag === "skin" || row >= who.rows.shoes
            ? side
            : suit;
    const h = half[i]!;
    for (let z = -h; z <= h; z++) {
      if (shows(i, z)) out.push({ x, y, z, color: z === h ? color : z >= 0 ? side : back });
    }
  }

  // Each pixel belongs to the last worn layer that changed it.
  const owner = new Map<number, number>();
  worn.forEach((slot, w) => slot.piece.layer.forEach((cell, i) => cell && owner.set(i, w)));

  const body: Cube[] = [];
  dressed.forEach((cell, i) => {
    if (cell && !owner.has(i)) column(i, cell, coloured[i]!, body);
  });

  // A piece that lies on the body, like a monocle, sits one cube in front of the body's
  // surface, and the body stays whole under it.
  const under = composite(
    who.body,
    worn.map((slot) =>
      slot.piece.layer.map((cell) => (cell === "erase" || cell?.tag !== "item" ? cell : null)),
    ),
  );
  const underColours = recolour(under, colours);

  const pieces = worn.map((slot, w) => {
    const cubes: Cube[] = [];
    slot.piece.layer.forEach((cell, i) => {
      if (!cell || cell === "erase" || owner.get(i) !== w) return;
      const below = under[i];
      if (cell.tag === "item" && slot.piece.shape === "front" && below) {
        const { x, y } = at(i);
        cubes.push({ x, y, z: half[i]! + 1, color: cell.colour });
        column(i, below, underColours[i]!, body);
      } else column(i, cell, coloured[i]!, cubes);
    });
    return { key: slot.piece.key, cubes };
  });

  return { body, pieces, feet: at(who.body.findLastIndex((cell) => cell !== null)).y };
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
    const { body, pieces, feet } = cubesFor(slots, colours);
    floor.position.y = feet - 0.4;
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
