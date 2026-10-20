import { pathToFileURL } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { openPage, pagePath, station } from "./page";

async function connect(page: Page) {
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("status")).toHaveText("The station is in setup mode.");
}

test("connecting shows the station's current settings", async ({ page }) => {
  await openPage(page, {
    settings: { server: "https://key-api.geekshacking.com", wifi: "Pixel_4936" },
  });

  await page.getByRole("button", { name: "Connect" }).click();

  const settings = page.getByRole("region", { name: "Its settings now" });
  await expect(settings).toContainText("https://key-api.geekshacking.com");
  await expect(settings).toContainText("gk_sta_...0001");
  await expect(settings).toContainText("Pixel_4936");
});

test("a new Wi-Fi network goes in, and the restart shows the station working on it", async ({
  page,
}) => {
  await openPage(page);
  await connect(page);

  await page.getByLabel("Wi-Fi name").fill("VenueNet");
  await page.getByLabel("Wi-Fi password").fill("venuepass1");
  await page.getByRole("button", { name: "Set up the station" }).click();

  const results = page.getByRole("region", { name: "What happened" });
  await expect(results).toContainText("Wi-Fi: joined VenueNet.");
  await expect(results).toContainText("It's on Wi-Fi.");
  await expect(results).toContainText("The server accepted its heartbeat");
  await expect(page.getByRole("region", { name: "Its settings now" })).toContainText(
    "VenueNet  (setup mode)",
  );
  expect((await station(page)).received).toEqual([
    "setup",
    "wifi",
    "VenueNet",
    "venuepass1",
    "exit",
  ]);
});

test("the Wi-Fi network, the server and a replaced key go in that order, then the station restarts", async ({
  page,
}) => {
  await openPage(page);
  await connect(page);

  await page.getByLabel("Server address").fill("https://geekykey-staging.example.run.app");
  await page.getByLabel("An organizer replaced this station's key on the station board").check();
  await page.getByLabel("Station key").fill("gk_sta_newnewnewnewnew0002");
  await page.getByLabel("Wi-Fi name").fill("VenueNet");
  await page.getByLabel("Wi-Fi password").fill("venuepass1");
  await page.getByRole("button", { name: "Set up the station" }).click();

  const results = page.getByRole("region", { name: "What happened" });
  await expect(results).toContainText("The server accepted its heartbeat");
  await expect(results).toContainText("Server: stored. The server knows this station's key.");
  await expect(results).toContainText(
    "Key: stored, and its saved taps are kept. The server knows this station's key.",
  );
  expect((await station(page)).received).toEqual([
    "setup",
    "wifi",
    "VenueNet",
    "venuepass1",
    "server",
    "https://geekykey-staging.example.run.app",
    "key",
    "gk_sta_newnewnewnewnew0002",
    "exit",
  ]);
});

test("fields the station would refuse are caught before anything is typed", async ({ page }) => {
  await openPage(page);
  await connect(page);

  await page.getByLabel("Server address").fill("http://key-api.geekshacking.com");
  await page.getByLabel("Station key").fill("gk_sta_newnewnewnewnew0002");
  await page.getByLabel("Wi-Fi name").fill("VenueNet");
  await page.getByLabel("Wi-Fi password").fill("short");
  await page.getByRole("button", { name: "Set up the station" }).click();

  await expect(page.locator("#server-error")).toHaveText(
    "Plain http:// only works to a .local address. Use https://.",
  );
  await expect(page.locator("#key-error")).toHaveText(
    "Pick where the key comes from: a replaced key, or a move to another event.",
  );
  await expect(page.locator("#wifi-error")).toHaveText(
    "A Wi-Fi password is 8 to 63 characters, or empty for an open network.",
  );
  expect((await station(page)).received).toEqual(["setup"]);
});

test("a key that isn't a station key, and a Wi-Fi name too long for the station, are caught", async ({
  page,
}) => {
  await openPage(page);
  await connect(page);

  await page.getByLabel("This station is moving to another event").check();
  await page.getByLabel("Station key").fill("not-a-key");
  // 13 characters, but 33 bytes, which is what the station counts.
  await page.getByLabel("Wi-Fi name").fill("ネットワーク名前です!!!");
  await page.getByRole("button", { name: "Set up the station" }).click();

  await expect(page.locator("#key-error")).toHaveText(
    "A station key starts with gk_sta_ and has no spaces.",
  );
  await expect(page.locator("#wifi-error")).toHaveText(
    "A Wi-Fi name is 1 to 32 bytes. This one is 33.",
  );
  expect((await station(page)).received).toEqual(["setup"]);
});

test("when the station refuses a setting, nothing after it is sent and the station stays in setup mode", async ({
  page,
}) => {
  await openPage(page, { storeFails: ["server"] });
  await connect(page);

  await page.getByLabel("Server address").fill("https://geekykey-staging.example.run.app");
  await page.getByLabel("An organizer replaced this station's key on the station board").check();
  await page.getByLabel("Station key").fill("gk_sta_newnewnewnewnew0002");
  await page.getByRole("button", { name: "Set up the station" }).click();

  const results = page.getByRole("region", { name: "What happened" });
  await expect(results).toContainText(
    "Server: not changed. The station said: Could not store it. Not changed.",
  );
  await expect(results).toContainText(
    "Nothing after it was sent. The station is still in setup mode",
  );
  await expect(page.getByRole("button", { name: "Set up the station" })).toBeEnabled();
  expect((await station(page)).received).toEqual([
    "setup",
    "server",
    "https://geekykey-staging.example.run.app",
  ]);
});

test("a move goes before the Wi-Fi network, so its saved taps go out on the old settings", async ({
  page,
}) => {
  await openPage(page, { settings: { savedTaps: 2 } });
  await connect(page);

  await page.getByLabel("This station is moving to another event").check();
  await page.getByLabel("Station key").fill("gk_sta_otherotherother0003");
  await page.getByLabel("Wi-Fi name").fill("VenueNet");
  await page.getByLabel("Wi-Fi password").fill("venuepass1");
  await page.getByRole("button", { name: "Set up the station" }).click();

  const results = page.getByRole("region", { name: "What happened" });
  await expect(results).toContainText("The server accepted its heartbeat");
  await expect(results).toContainText(
    "Move: its saved taps went out with the old key, and the new key is stored. It's now a new station at the other event. The server knows this station's key.",
  );
  expect((await station(page)).received).toEqual([
    "setup",
    "move",
    "gk_sta_otherotherother0003",
    "wifi",
    "VenueNet",
    "venuepass1",
    "exit",
  ]);
});

async function startMoveWithTapsLeft(page: Page) {
  await openPage(page, { settings: { savedTaps: 3 }, tapsLeftAfterSending: 2 });
  await connect(page);
  await page.getByLabel("This station is moving to another event").check();
  await page.getByLabel("Station key").fill("gk_sta_otherotherother0003");
  await page.getByLabel("Wi-Fi name").fill("VenueNet");
  await page.getByLabel("Wi-Fi password").fill("venuepass1");
  await page.getByRole("button", { name: "Set up the station" }).click();
  await expect(page.getByRole("region", { name: "What happened" })).toContainText(
    "2 saved taps couldn't be sent (no Wi-Fi).",
  );
}

test("a move with taps it couldn't send waits for the person, and cancelling sends nothing more", async ({
  page,
}) => {
  await startMoveWithTapsLeft(page);
  // The page never types "clear" by itself.
  expect((await station(page)).received).toEqual(["setup", "move", "gk_sta_otherotherother0003"]);

  await page.getByRole("button", { name: "Cancel the move" }).click();

  const results = page.getByRole("region", { name: "What happened" });
  await expect(results).toContainText(
    "Move: not changed. The station said: Cancelled. The key and the saved taps are unchanged.",
  );
  await expect(page.getByRole("button", { name: "Drop them and finish the move" })).toBeHidden();
  const received = (await station(page)).received;
  expect(received).toHaveLength(4);
  expect(received[3]).not.toBe("clear");
});

test("dropping the taps finishes the move and carries on", async ({ page }) => {
  await startMoveWithTapsLeft(page);

  await page.getByRole("button", { name: "Drop them and finish the move" }).click();

  const results = page.getByRole("region", { name: "What happened" });
  await expect(results).toContainText("The server accepted its heartbeat");
  await expect(results).toContainText(
    "Move: the saved taps it couldn't send were dropped, and the new key is stored.",
  );
  expect((await station(page)).received).toEqual([
    "setup",
    "move",
    "gk_sta_otherotherother0003",
    "clear",
    "wifi",
    "VenueNet",
    "venuepass1",
    "exit",
  ]);
});

test("the page never shows the key or the Wi-Fi password back", async ({ page }) => {
  const key = "gk_sta_secretsecretsecret9876";
  const password = "hunter2hunter2";
  await openPage(page);
  await connect(page);

  await page.getByLabel("An organizer replaced this station's key on the station board").check();
  await page.getByLabel("Station key").fill(key);
  await page.getByLabel("Wi-Fi name").fill("VenueNet");
  await page.getByLabel("Wi-Fi password").fill(password);
  await page.getByRole("button", { name: "Set up the station" }).click();
  await expect(page.getByRole("region", { name: "What happened" })).toContainText("ready for taps");

  // The station got both, and the page holds neither: not in its text, its log,
  // its fields or its storage.
  const received = (await station(page)).received;
  expect(received).toContain(key);
  expect(received).toContain(password);
  await page.locator("details summary").click();
  const shown = await page.evaluate(() => ({
    text: document.body.innerText,
    values: [...document.querySelectorAll("input")].map((input) => input.value).join("\n"),
    storage: JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
  }));
  for (const secret of [key, password]) {
    expect(shown.text).not.toContain(secret);
    expect(shown.values).not.toContain(secret);
    expect(shown.storage).not.toContain(secret);
  }
  await expect(page.getByLabel("Station key")).toHaveValue("");
  await expect(page.getByLabel("Wi-Fi password")).toHaveValue("");
});

test("a station whose firmware has no setup mode is told apart, and nothing more is sent", async ({
  page,
}) => {
  await openPage(page, { setupMode: false });

  await page.getByRole("button", { name: "Connect" }).click();

  await expect(page.getByRole("status")).toHaveText(
    "This station has no setup mode. Its firmware is older than 19 Oct 2026 and needs a reflash.",
    { timeout: 10_000 },
  );
  await expect(page.getByRole("region", { name: "What changes" })).toBeHidden();
  expect((await station(page)).received).toEqual([]);
});

test("a station already in setup mode is picked up where it is", async ({ page }) => {
  await openPage(page, { restartOnOpen: false, startInSetupMode: true });

  await connect(page);

  await expect(page.getByRole("region", { name: "Its settings now" })).toContainText("Pixel_4936");
  expect((await station(page)).received).toEqual(["setup", "show"]);
});

test("a station that doesn't restart when the port opens is still put into setup mode", async ({
  page,
}) => {
  await openPage(page, { restartOnOpen: false });

  await connect(page);

  expect((await station(page)).received).toEqual(["setup"]);
  expect((await station(page)).restarts).toBe(0);
});

test("if the USB port drops while the station restarts, the page opens it again and reads the result", async ({
  page,
}) => {
  await openPage(page, { dropPortOnRestart: true });
  await connect(page);

  await page.getByLabel("Wi-Fi name").fill("VenueNet");
  await page.getByLabel("Wi-Fi password").fill("venuepass1");
  await page.getByRole("button", { name: "Set up the station" }).click();

  const results = page.getByRole("region", { name: "What happened" });
  await expect(results).toContainText("The server accepted its heartbeat", { timeout: 10_000 });
});

test("a key the server rejects shows after the restart", async ({ page }) => {
  await openPage(page, { rejectedKeys: ["gk_sta_newnewnewnewnew0002"] });
  await connect(page);

  await page.getByLabel("An organizer replaced this station's key on the station board").check();
  await page.getByLabel("Station key").fill("gk_sta_newnewnewnewnew0002");
  await page.getByRole("button", { name: "Set up the station" }).click();

  const results = page.getByRole("region", { name: "What happened" });
  await expect(results).toContainText(
    "Key: stored, and its saved taps are kept. The server rejected the key (401): it doesn't know it, or the station is disabled.",
  );
  await expect(results).toContainText(
    "The server rejected its key (401). Check the key, and that the station isn't disabled on the station board.",
  );
});

test("a network the station can't join shows as stored but not joined, before and after the restart", async ({
  page,
}) => {
  await openPage(page, { wifiJoins: false });
  await connect(page);

  await page.getByLabel("Wi-Fi name").fill("TomorrowsVenue");
  await page.getByLabel("Wi-Fi password").fill("venuepass1");
  await page.getByRole("button", { name: "Set up the station" }).click();

  const results = page.getByRole("region", { name: "What happened" });
  await expect(results).toContainText(
    "Wi-Fi: stored, but it couldn't join TomorrowsVenue yet. It tries again after it restarts.",
  );
  await expect(results).toContainText(
    "It isn't on Wi-Fi yet. It keeps trying, and saves taps until it joins.",
  );
});

test("with nothing filled in, the page says so and sends nothing", async ({ page }) => {
  await openPage(page);
  await connect(page);

  await page.getByRole("button", { name: "Set up the station" }).click();

  await expect(page.locator("#changes-error")).toHaveText("Fill in at least one part.");
  expect((await station(page)).received).toEqual(["setup"]);
});

test("a browser without Web Serial is told to use Chrome or Edge", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "serial", {
      get: () => undefined,
      configurable: true,
    });
  });
  await page.goto(pathToFileURL(pagePath).href);

  await expect(page.getByText("This page needs Chrome or Edge on a laptop")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect" })).toBeDisabled();
});

test("after the restart the form goes away until the station is put back into setup mode", async ({
  page,
}) => {
  await openPage(page);
  await connect(page);
  await page.getByLabel("Wi-Fi name").fill("VenueNet");
  await page.getByLabel("Wi-Fi password").fill("venuepass1");
  await page.getByRole("button", { name: "Set up the station" }).click();
  await expect(page.getByRole("region", { name: "What happened" })).toContainText("ready for taps");

  await expect(page.getByRole("region", { name: "What changes" })).toBeHidden();
  await page.getByRole("button", { name: "Set up again" }).click();

  await expect(page.getByRole("status")).toHaveText("The station is in setup mode.");
  await expect(page.getByRole("region", { name: "What changes" })).toBeVisible();
  expect((await station(page)).received).toEqual([
    "setup",
    "wifi",
    "VenueNet",
    "venuepass1",
    "exit",
    "setup",
  ]);
});
