/*
  The booth plan of our table at the GeekyKey booth. The Event Service stores each
  station's booth as free text; these two names say where the screen places it.
  Coordinates leave room above the markers for booth names, between them for the relay,
  and below them for counts and open seats. No other furniture belongs on this plan.
*/

export interface Booth {
  /** What an organizer sets as the station's booth (9.12). */
  name: string;
  x: number;
  y: number;
}

export interface FloorPlan {
  name: string;
  /** The table's outline, in plan units. */
  width: number;
  height: number;
  booths: Booth[];
}

export const BOOTH_PLAN: FloorPlan = {
  name: "GeekyKey booth",
  width: 600,
  height: 244,
  booths: [
    { name: "Booth 1", x: 140, y: 120 },
    { name: "Booth 2", x: 460, y: 120 },
  ],
};
