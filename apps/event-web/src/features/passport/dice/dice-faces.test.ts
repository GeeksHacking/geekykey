import { Euler, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { FACE_NORMALS, landingRotation } from "@/features/passport/dice/dice-faces";

const up = new Vector3(0, 1, 0);

/** Where a face's outward normal points once the die is turned by `rotation`. */
function pointing(value: number, rotation: { x: number; y: number; z: number }) {
  const [x, y, z] = FACE_NORMALS[value]!;
  return new Vector3(x, y, z).applyEuler(new Euler(rotation.x, rotation.y, rotation.z, "YXZ"));
}

describe("the dice land on the service's roll (FRO-133)", () => {
  it.each([1, 2, 3, 4, 5, 6])("turns %i face up", (value) => {
    expect(pointing(value, landingRotation(value)).distanceTo(up)).toBeLessThan(1e-9);
  });

  it.each([
    { value: 1, turns: 3, yaw: 0.7 },
    { value: 4, turns: 2, yaw: -1.9 },
    { value: 6, turns: 4, yaw: 2.5 },
  ])("still turns $value face up after $turns tumbles and a turn of $yaw", ({ value, ...spin }) => {
    expect(pointing(value, landingRotation(value, spin)).distanceTo(up)).toBeLessThan(1e-9);
  });

  it("tumbles whole turns, so the die spins on its way down", () => {
    const still = landingRotation(5);
    const tumbled = landingRotation(5, { turns: 3, yaw: 0 });
    expect(Math.abs(tumbled.x - still.x)).toBeGreaterThanOrEqual(3 * 2 * Math.PI - 1e-9);
  });

  it("puts opposite faces on opposite sides, adding up to 7 like a real die", () => {
    for (const value of [1, 2, 3]) {
      const [x, y, z] = FACE_NORMALS[value]!;
      const [ox, oy, oz] = FACE_NORMALS[7 - value]!;
      expect([x + ox, y + oy, z + oz].every((sum) => sum === 0)).toBe(true);
      expect(Math.abs(x) + Math.abs(y) + Math.abs(z)).toBe(1);
    }
  });
});
