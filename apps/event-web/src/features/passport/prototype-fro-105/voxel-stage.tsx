/*
  PROTOTYPE (FRO-105), throwaway. The voxel avatar: every solid pixel of a layer becomes a
  cube, so the same PNGs as the flat view turn into a figure you can spin. Loaded lazily, so
  three.js only downloads when this view is shown.
*/
import { useEffect, useRef } from "react";
import * as THREE from "three";

import { BODY, SIZE } from "@/features/passport/prototype-fro-105/art";
import type { Slot } from "@/features/passport/prototype-fro-105/use-outfit";

interface Cube {
  x: number;
  y: number;
  z: number;
  color: string;
}

const HAIR = "#3b2a1e";
const SUIT = "#17171c";
const FACE = new Set(["#f1c27d", "#d29f6a", "#101014", "#a8584a"]);

function at(i: number) {
  const col = i % SIZE;
  const row = Math.floor(i / SIZE);
  return { row, x: col - (SIZE - 1) / 2, y: SIZE - 1 - row - SIZE / 2 };
}

/** The body's cubes, minus what worn "cover" pieces replace, then each worn piece's cubes. */
function cubesFor(slots: Slot[]) {
  const covered = new Set<number>();
  for (const slot of slots) {
    if (!slot.worn || slot.piece.fit !== "cover" || slot.piece.depth !== 3) continue;
    slot.piece.pixels.forEach((px, i) => px && covered.add(i));
  }

  const body: Cube[] = [];
  BODY.forEach((color, i) => {
    if (!color || covered.has(i)) return;
    const { row, x, y } = at(i);
    // The back of the head is hair and the back of the shirt is jacket, not the face again.
    const back = row <= 12 && FACE.has(color) ? HAIR : color === "#f4f1e8" ? SUIT : color;
    for (const z of [2, 1, 0, -1]) body.push({ x, y, z, color });
    body.push({ x, y, z: -2, color: back });
  });

  const pieces = slots.flatMap((slot, index) => {
    if (!slot.worn) return [];
    const cubes: Cube[] = [];
    slot.piece.pixels.forEach((color, i) => {
      if (!color) return;
      const { x, y } = at(i);
      const onBody = BODY[i] !== null;
      // A thin piece over the body sits in front of it rather than cutting through it.
      if (onBody && (slot.piece.fit === "front" || slot.piece.depth === 1)) {
        cubes.push({ x, y, z: 3, color });
      } else if (onBody || slot.piece.depth === 3) {
        for (const z of [2, 1, 0, -1, -2]) cubes.push({ x, y, z, color });
      } else cubes.push({ x, y, z: 0, color });
    });
    return [{ index, cubes }];
  });

  return { body, pieces };
}

const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

function createWorld(host: HTMLDivElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  Object.assign(renderer.domElement.style, { width: "100%", height: "100%", display: "block" });
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 1, 500);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x202030, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(20, 30, 40);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd4af37, 2.5);
  rim.position.set(-30, 10, -30);
  scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(9, 40),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -14.1;
  scene.add(floor);

  const figure = new THREE.Group();
  scene.add(figure);
  const geo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
  const mat = new THREE.MeshLambertMaterial();
  let meshes: THREE.InstancedMesh[] = [];

  type Anim = {
    mesh: THREE.InstancedMesh;
    cubes: Cube[];
    from: THREE.Vector3[];
    spin: THREE.Euler[];
    delay: number[];
    t0: number;
  };
  let anim: Anim | null = null;

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

  function setOutfit(slots: Slot[], lastAdded: { index: number; at: number } | null) {
    for (const mesh of meshes) {
      figure.remove(mesh);
      mesh.dispose();
    }
    meshes = [];
    anim = null;
    const { body, pieces } = cubesFor(slots);
    meshes.push(build(body));
    for (const { index, cubes } of pieces) {
      const mesh = build(cubes);
      meshes.push(mesh);
      if (lastAdded?.index === index && Date.now() - lastAdded.at < 1500) {
        anim = {
          mesh,
          cubes,
          from: cubes.map(() =>
            new THREE.Vector3().randomDirection().multiplyScalar(30 + Math.random() * 25),
          ),
          spin: cubes.map(
            () => new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
          ),
          delay: cubes.map(() => Math.random() * 0.35),
          t0: performance.now(),
        };
      }
    }
    for (const mesh of meshes) figure.add(mesh);
  }

  // Drag to spin, with a little inertia; sway and bob when left alone.
  let angle = 0;
  let velocity = 0;
  let dragging = false;
  let lastX = 0;
  let swayT = 0;
  const canvas = renderer.domElement;
  canvas.style.touchAction = "none";
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
    const dist = Math.max(38, 32 / camera.aspect) / (2 * Math.tan((14 * Math.PI) / 180));
    camera.position.set(0, 5, dist);
    camera.lookAt(0, 3, 0);
    camera.updateProjectionMatrix();
  });
  resize.observe(host);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const e = new THREE.Euler();
  let last = performance.now();
  let frame = 0;

  function tick(now: number) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!dragging) {
      angle += velocity;
      velocity *= 0.93;
      if (Math.abs(velocity) < 0.002) swayT += dt;
    }
    figure.rotation.y = angle + Math.sin(swayT * 0.7) * 0.45;
    figure.position.y = Math.abs(Math.sin(now / 420)) * 0.5;

    if (anim) {
      const elapsed = (now - anim.t0) / 1000;
      let done = true;
      const a = anim;
      a.cubes.forEach((cube, i) => {
        const t = Math.min(Math.max((elapsed - a.delay[i]!) / 0.75, 0), 1);
        if (t < 1) done = false;
        const k = easeOutBack(t);
        p.set(cube.x, cube.y, cube.z).lerp(a.from[i]!, 1 - k);
        const s = (1 - t) ** 2;
        const spin = a.spin[i]!;
        e.set(spin.x * s, spin.y * s, spin.z * s);
        a.mesh.setMatrixAt(i, m.compose(p, q.setFromEuler(e), one));
      });
      anim.mesh.instanceMatrix.needsUpdate = true;
      if (done) anim = null;
    }

    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);

  return {
    setOutfit,
    dispose() {
      cancelAnimationFrame(frame);
      resize.disconnect();
      for (const mesh of meshes) mesh.dispose();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}

export default function VoxelStage({
  slots,
  lastAdded,
}: {
  slots: Slot[];
  lastAdded: { index: number; at: number } | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<ReturnType<typeof createWorld> | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const w = createWorld(host.current);
    world.current = w;
    return () => {
      w.dispose();
      world.current = null;
    };
  }, []);

  useEffect(() => {
    world.current?.setOutfit(slots, lastAdded);
  }, [slots, lastAdded]);

  return <div ref={host} className="size-full" />;
}
