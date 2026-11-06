/*
  Which way each face of a die points, and how to turn the die so the service's roll lands face
  up (FRO-133). It has no three.js in it, so the reveal can import it without the 3D file.
*/

type Normal = readonly [number, number, number];

/**
 * Each value's face, as the direction it points out of the die before any turn. Opposite faces
 * add up to 7, as on a real die. The order of three.js's box faces is +x, -x, +y, -y, +z, -z.
 */
export const FACE_NORMALS: Readonly<Record<number, Normal>> = {
  1: [0, 0, 1],
  6: [0, 0, -1],
  2: [0, 1, 0],
  5: [0, -1, 0],
  3: [1, 0, 0],
  4: [-1, 0, 0],
};

/** The face values in three.js's box face order, for painting the six sides. */
export const BOX_FACE_VALUES = [3, 4, 2, 5, 1, 6] as const;

/** The quarter turns that bring each face to the top. Each uses one axis only. */
const FACE_UP: Readonly<Record<number, { x: number; z: number }>> = {
  1: { x: -Math.PI / 2, z: 0 },
  6: { x: Math.PI / 2, z: 0 },
  2: { x: 0, z: 0 },
  5: { x: Math.PI, z: 0 },
  3: { x: 0, z: Math.PI / 2 },
  4: { x: 0, z: -Math.PI / 2 },
};

export interface Spin {
  /** Whole tumbles about each of x and z on the way down. Whole turns end where they began. */
  turns: number;
  /** A turn about the upright axis, so the dice don't land square to the camera. */
  yaw: number;
}

/**
 * The rotation, in three.js's "YXZ" order, that leaves `value` face up. With the order YXZ the
 * quarter turn comes first and the yaw last, so the yaw only turns the die about the vertical.
 */
export function landingRotation(value: number, { turns, yaw }: Spin = { turns: 0, yaw: 0 }) {
  const face = FACE_UP[value];
  if (!face) throw new RangeError(`A die has no face ${value}`);
  const whole = turns * 2 * Math.PI;
  return { x: face.x + whole, y: yaw, z: face.z + whole };
}
