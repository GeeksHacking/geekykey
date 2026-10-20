import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { stationLines } from "./page";

// The page reads the station's answers by matching what geekykey_station.ino
// prints, so a reworded line in the sketch must fail here until the page's
// #station-lines block changes with it.
const sketch = readFileSync(
  new URL("../../geekykey_station/geekykey_station.ino", import.meta.url),
  "utf8",
);

for (const [name, line] of Object.entries(stationLines())) {
  test(`the sketch still prints the page's "${name}" line`, () => {
    expect(sketch).toContain(line);
  });
}
