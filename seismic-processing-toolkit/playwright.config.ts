import { defineConfig, devices } from "@playwright/test";

const production = process.env.PLAYWRIGHT_PRODUCTION === "1";
const port = production ? 4173 : 4174;

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["**/local-release*.spec.ts"],
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { outputFolder: "playwright-report", open: "never" }], ["list"]] : "list",
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure", screenshot: "only-on-failure", video: "off" },
  webServer: {
    command: production ? `npm run build && vite preview --host 127.0.0.1 --port ${port}` : `vite --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox-smoke", grep: /@smoke/, use: { ...devices["Desktop Firefox"] } },
    { name: "webkit-smoke", grep: /@smoke/, use: { ...devices["Desktop Safari"] } }
  ]
});
