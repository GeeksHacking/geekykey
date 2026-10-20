import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Page } from "@playwright/test";

import {
  installFakeStation,
  type FakeStationOptions,
  type FakeStationRecord,
} from "./fake-station";

export const pagePath = fileURLToPath(new URL("../setup_page.html", import.meta.url));

/** The page's list of the station lines it waits for, from its #station-lines block. */
export function stationLines(): Record<string, string> {
  const html = readFileSync(pagePath, "utf8");
  const match = html.match(
    /<script type="application\/json" id="station-lines">([\s\S]*?)<\/script>/,
  );
  if (!match) throw new Error("setup_page.html has no #station-lines block");
  return JSON.parse(match[1]) as Record<string, string>;
}

/** Opens the page from disk, as someone who downloaded it would, with a fake station on the port. */
export async function openPage(page: Page, options: Omit<FakeStationOptions, "lines"> = {}) {
  await page.addInitScript(installFakeStation, { ...options, lines: stationLines() });
  await page.goto(pathToFileURL(pagePath).href);
}

export function station(page: Page): Promise<FakeStationRecord> {
  return page.evaluate(() => (window as unknown as { __station: FakeStationRecord }).__station);
}
