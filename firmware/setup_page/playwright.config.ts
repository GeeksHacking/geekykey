import { defineConfig, devices } from "@playwright/test";

// The page is opened as a file, as someone who downloaded it would open it, so
// there is no web server.
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? "line" : "list",
  use: { trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
