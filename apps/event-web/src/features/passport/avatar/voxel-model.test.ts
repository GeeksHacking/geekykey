import { describe, expect, it } from "vitest";

import { CHARACTERS, type CharacterKey } from "@/features/passport/avatar/art";
import { VOXEL_FIGURES } from "@/features/passport/avatar/voxel-data";
import { figureFor, type Figure } from "@/features/passport/avatar/voxel-model";

const where = ({ col, row, z }: { col: number; row: number; z: number }) => `${col},${row},${z}`;
const everyCube = (figure: Figure) => [
  ...figure.body,
  ...figure.pieces.flatMap((piece) => piece.cubes),
];
const characters = Object.keys(CHARACTERS) as CharacterKey[];

describe("figureFor", () => {
  it.each(characters)("dresses the character %s in each of their own pieces", (character) => {
    const pieces = CHARACTERS[character].pieces.map((piece) => piece.key);
    const figure = figureFor(character, pieces);

    expect(figure.body.length).toBeGreaterThan(0);
    expect(figure.pieces.map((piece) => piece.key)).toEqual(pieces);
    for (const piece of figure.pieces) expect(piece.cubes.length).toBeGreaterThan(0);
  });

  it.each(characters)("puts one cube in each place on the character %s", (character) => {
    const pieces = CHARACTERS[character].pieces.map((piece) => piece.key);
    const places = everyCube(figureFor(character, pieces)).map(where);

    expect(new Set(places).size).toBe(places.length);
  });

  it.each(characters)("moves the arm that lifts the glass on the character %s", (character) => {
    const without = figureFor(character, []).body.map(where);
    const holding = new Set(everyCube(figureFor(character, ["glass"])).map(where));

    expect(without.some((place) => !holding.has(place))).toBe(true);
  });

  it("leaves out the cubes inside the figure, which nobody sees", () => {
    const figure = VOXEL_FIGURES.find((f) => f.key === "suit")!;
    const body = figure.parts.find((part) => part.key === "body")!;
    let stored = 0;
    for (let n = 3; n < body.cubes.length; n += 5) stored += body.cubes[n]!;

    expect(figureFor("suit", []).body.length).toBeLessThan(stored / 2);
  });
});
