/*
  The map's floor plan: the screen's own file, as agreement 9.10 has it. The Event Service
  stores only each station's booth as free text, and this file says where each booth is.

  This is the example layout of the MPH from .scratch/mph/ (BAC-95), drawn from a sketch
  until the MPH's real floor plan arrives. Coordinates are in the plan's own units, with the
  hall 540 wide and 960 tall. The 3D model (FRO-80) will name the same booths, so a station's
  booth stays right when the drawing changes.
*/

export interface Booth {
  /** What an organizer sets as the station's booth (9.12). */
  name: string;
  x: number;
  y: number;
}

export interface FloorPlan {
  /** Shown over the map, so nobody takes an example layout for the real hall. */
  name: string;
  width: number;
  height: number;
  /** SVG paths of the rooms, filled behind the walls. */
  rooms: string[];
  /** The names of the rooms and the hall, drawn on the floor. */
  labels: { text: string; x: number; y: number }[];
  /** SVG paths for the walls and dividers. */
  walls: string[];
  /** Shapes from the sketch that have no name yet. */
  blocks: { x: number; y: number; width: number; height: number }[];
  booths: Booth[];
}

export const MPH_EXAMPLE_PLAN: FloorPlan = {
  name: "MPH, example layout",
  width: 540,
  height: 960,
  rooms: [
    "M12 0 H190 V247 H0 V12 A12 12 0 0 1 12 0 Z",
    "M190 0 H528 A12 12 0 0 1 540 12 V392 H190 Z",
  ],
  labels: [
    { text: "Room A", x: 95, y: 232 },
    { text: "Room B", x: 365, y: 377 },
    { text: "Hall", x: 340, y: 472 },
  ],
  walls: ["M190 0 V392", "M0 247 H190", "M190 392 H540", "M135 960 V630 H218 V960"],
  blocks: [{ x: 135, y: 630, width: 83, height: 330 }],
  booths: [
    { name: "A1", x: 107, y: 33 },
    { name: "A2", x: 46, y: 88 },
    { name: "A3", x: 46, y: 192 },
    { name: "B1", x: 254, y: 106 },
    { name: "B2", x: 254, y: 197 },
    { name: "B3", x: 386, y: 40 },
    { name: "B4", x: 418, y: 108 },
    { name: "B5", x: 429, y: 186 },
    { name: "B6", x: 448, y: 317 },
    { name: "C1", x: 486, y: 545 },
    { name: "C2", x: 486, y: 666 },
    { name: "C3", x: 486, y: 767 },
    { name: "C4", x: 486, y: 897 },
    { name: "C5", x: 317, y: 887 },
  ],
};
