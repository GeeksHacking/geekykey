import gsap from "gsap";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import type { Connection } from "@/api/types";
import { BOX_FACE_VALUES, landingRotation } from "@/features/passport/dice/dice-faces";

/*
  The reveal's two dice (FRO-133), drawn with three.js and moved by GSAP. Only dice-stage.tsx
  imports this, and only through load-dice-stage.ts, so neither library loads with the page.
  The rolls come from the service: the tumble ends on them and decides nothing, so both phones
  show the same dice.
*/

export type Dice = NonNullable<Connection["dice"]>;

// The kit's yellow for your die, its light grey for theirs, and its near-black for the pips.
const YOURS = "#fff200";
const THEIRS = "#f5f5f5";
const PIP = "#1c1b1b";
const REST_Y = 0.5;
const APART = 0.85;

/** Where the pips sit on a face, from 0 to 1 across it. */
const PIPS: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  1: [[0.5, 0.5]],
  2: [
    [0.27, 0.27],
    [0.73, 0.73],
  ],
  3: [
    [0.27, 0.27],
    [0.5, 0.5],
    [0.73, 0.73],
  ],
  4: [
    [0.27, 0.27],
    [0.73, 0.27],
    [0.27, 0.73],
    [0.73, 0.73],
  ],
  5: [
    [0.27, 0.27],
    [0.73, 0.27],
    [0.5, 0.5],
    [0.27, 0.73],
    [0.73, 0.73],
  ],
  6: [
    [0.27, 0.25],
    [0.73, 0.25],
    [0.27, 0.5],
    [0.73, 0.5],
    [0.27, 0.75],
    [0.73, 0.75],
  ],
};

function faceTexture(value: number, body: string) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas for the dice's faces");
  context.fillStyle = body;
  context.fillRect(0, 0, size, size);
  context.fillStyle = PIP;
  for (const [x, y] of PIPS[value]!) {
    context.beginPath();
    context.arc(x * size, y * size, size * 0.085, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeDie(geometry: THREE.BufferGeometry, body: string) {
  const materials = BOX_FACE_VALUES.map(
    (value) => new THREE.MeshStandardMaterial({ map: faceTexture(value, body), roughness: 0.45 }),
  );
  const die = new THREE.Mesh(geometry, materials);
  die.rotation.order = "YXZ";
  return { die, materials };
}

/** A soft dark disc under a die, which shrinks and fades as the die rises. */
function makeShadow() {
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.001;
  return shadow;
}

export function createDiceWorld(host: HTMLElement) {
  // The faces first: if their canvas fails, no WebGL context has been taken yet.
  const geometry = new RoundedBoxGeometry(1, 1, 1, 4, 0.14);
  const yours = makeDie(geometry, YOURS);
  const theirs = makeDie(geometry, THEIRS);
  const materials = [...yours.materials, ...theirs.materials];

  let renderer: THREE.WebGLRenderer;
  try {
    // Throws when the browser won't give a WebGL context, which dice-stage.tsx turns into numbers.
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (error) {
    geometry.dispose();
    for (const material of materials) {
      material.map?.dispose();
      material.dispose();
    }
    throw error;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  Object.assign(renderer.domElement.style, { width: "100%", height: "100%", display: "block" });
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 2, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2, 6, 4);
  scene.add(key);

  const dice = [yours.die, theirs.die];
  const shadows = [makeShadow(), makeShadow()];
  dice.forEach((die, i) => {
    const x = i === 0 ? -APART : APART;
    // Tilted while they wait, so no face reads as a roll before the tap.
    die.position.set(x, REST_Y + 0.15, 0);
    die.rotation.set(0.55, i === 0 ? 0.7 : -0.5, 0.35);
    shadows[i]!.position.x = x;
    scene.add(die, shadows[i]!);
  });

  // Nothing draws until the first resize has placed the camera, or while the reveal is scrolled
  // off screen, so dice waiting for a tap don't use the battery out of sight.
  let sized = false;
  let visible = true;
  function render() {
    if (!sized || !visible) return;
    dice.forEach((die, i) => {
      const lift = Math.max(die.position.y - REST_Y, 0);
      const shadow = shadows[i]!;
      shadow.scale.setScalar(1 / (1 + lift * 0.35));
      shadow.material.opacity = 0.18 / (1 + lift * 0.8);
    });
    renderer.render(scene, camera);
  }

  // Frames the two dice and the top of their jump at any width of the reveal.
  const resize = new ResizeObserver(([entry]) => {
    if (!entry) return;
    const { width, height } = entry.contentRect;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const halfFov = Math.tan((camera.fov * Math.PI) / 360);
    const distance = Math.max(4.6, 3.9 / (2 * halfFov * camera.aspect));
    const tilt = (48 * Math.PI) / 180;
    camera.position.set(0, distance * Math.sin(tilt) + 0.4, distance * Math.cos(tilt));
    camera.lookAt(0, 0.75, 0);
    camera.updateProjectionMatrix();
    sized = true;
    render();
  });
  resize.observe(host);
  const seen = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    // Draws the landed dice too, which the ticker no longer does once the roll ends.
    render();
  });
  seen.observe(host);

  // While they wait: a slow turn and a gentle hover, drawn on GSAP's ticker.
  gsap.ticker.add(render);
  const idle = gsap.timeline();
  dice.forEach((die, i) => {
    idle.to(die.rotation, { y: `+=${Math.PI * 2}`, duration: 7 + i, ease: "none", repeat: -1 }, 0);
    idle.to(
      die.position,
      { y: REST_Y + 0.3, duration: 1.1, ease: "sine.inOut", yoyo: true, repeat: -1 },
      i * 0.4,
    );
  });

  let roll: gsap.core.Timeline | undefined;

  return {
    /**
     * Tumbles both dice onto the service's rolls, then calls `onLanded`. It plays once: a later
     * call, as each /me poll re-renders the stage, does nothing.
     */
    roll(rolls: Dice, onLanded: () => void) {
      if (roll) return;
      idle.kill();
      const values = [rolls.your_roll, rolls.their_roll];
      const winners =
        rolls.your_roll === rolls.their_roll
          ? dice
          : rolls.result === "win"
            ? [yours.die]
            : [theirs.die];
      roll = gsap.timeline({
        onComplete: () => {
          gsap.ticker.remove(render);
          render();
        },
      });
      dice.forEach((die, i) => {
        const at = i * 0.12;
        const target = landingRotation(values[i]!, {
          turns: 2 + i,
          yaw: gsap.utils.random(-0.45, 0.45),
        });
        roll!
          .to(die.position, { y: REST_Y + 2.1, duration: 0.42, ease: "power2.out" }, at)
          .to(die.position, { y: REST_Y, duration: 0.95, ease: "bounce.out" }, at + 0.42)
          .to(die.rotation, { ...target, duration: 1.3, ease: "power3.out" }, at);
      });
      const landed = roll.duration();
      roll.call(onLanded, undefined, landed);
      for (const die of winners) {
        roll.to(
          die.scale,
          { x: 1.14, y: 1.14, z: 1.14, duration: 0.18, ease: "power2.out", yoyo: true, repeat: 1 },
          landed,
        );
      }
    },
    dispose() {
      idle.kill();
      roll?.kill();
      gsap.ticker.remove(render);
      resize.disconnect();
      seen.disconnect();
      geometry.dispose();
      for (const material of materials) {
        material.map?.dispose();
        material.dispose();
      }
      for (const shadow of shadows) {
        shadow.geometry.dispose();
        shadow.material.dispose();
      }
      renderer.dispose();
      // Each new connection's reveal takes a context, and a phone allows only a few at once.
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

export type DiceWorld = ReturnType<typeof createDiceWorld>;
