/**
 * Screenshots of one route at the widths and themes in CLAUDE.md's "Definition of done":
 * 360 and 1280 px, light and dark. Run from apps/event-web:
 *
 *   pnpm shot /admin/stations --as organiser
 *   pnpm shot /passport --as participant
 *   pnpm shot /login
 *
 * It uses the dev server on :5173 if one is running, and starts the mock one if not. A server
 * you started with `pnpm dev:live` is used as it is, so the shots show live data. The files go
 * to test-results/shots/, which git ignores. The first run on a machine needs
 * `pnpm exec playwright install chromium`, as `pnpm test:e2e` does.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";

import { chromium } from "@playwright/test";

const BASE_URL = "http://127.0.0.1:5173";
const OUT_DIR = "test-results/shots";
const WIDTHS = [360, 1280];
const THEMES = ["light", "dark"] as const;
/** The mock's seeded accounts (src/lib/constants.ts), signed in through its session key. */
const ACCOUNTS = { participant: "dev-user-1", organiser: "dev-organizer-1" } as const;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { as: { type: "string" } },
});
const route = positionals[0];
const as = values.as;
if (!route?.startsWith("/") || (as !== undefined && !(as in ACCOUNTS))) {
  console.error("Usage: pnpm shot <route> [--as participant|organiser]");
  process.exit(2);
}

async function serverIsUp() {
  try {
    await fetch(BASE_URL);
    return true;
  } catch {
    return false;
  }
}

function stop(server: ChildProcess) {
  if (server.pid) process.kill(-server.pid);
}

/** The mock dev server, as playwright.config.ts starts it, or null when one is already up. */
async function startServer(): Promise<ChildProcess | null> {
  if (await serverIsUp()) return null;
  // Its own process group, so stopping it stops Vite and not only pnpm. dev:mock sets its
  // variable the POSIX way, so this runs on macOS and Linux, not in PowerShell.
  const server = spawn("pnpm", ["dev:mock", "--host", "127.0.0.1"], {
    stdio: "ignore",
    detached: true,
  });
  for (let waited = 0; waited < 60_000; waited += 500) {
    if (await serverIsUp()) return server;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  stop(server);
  throw new Error(`The dev server did not answer on ${BASE_URL} within a minute.`);
}

const server = await startServer();
const browser = await chromium.launch();
await mkdir(OUT_DIR, { recursive: true });
const slug = route === "/" ? "home" : route.slice(1).replaceAll("/", "-");

try {
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme });
      if (as) {
        const userId = ACCOUNTS[as as keyof typeof ACCOUNTS];
        await page.addInitScript(`sessionStorage.setItem("gk-mock-session", "${userId}")`);
      }
      await page.goto(BASE_URL + route);
      // index.html puts the theme on <html> before React mounts, so wait for a page heading
      // first, then for every Skeleton (the full-page loader is one) to give way to data.
      await page.locator("h1").first().waitFor();
      await page.waitForFunction(`!document.querySelector(".animate-pulse")`);
      const file = `${OUT_DIR}/${slug}-${width}-${theme}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log(file);
      await page.close();
    }
  }
} finally {
  await browser.close();
  if (server) stop(server);
}
