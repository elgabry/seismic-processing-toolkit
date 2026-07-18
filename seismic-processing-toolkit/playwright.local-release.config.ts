import { defineConfig, devices } from "@playwright/test";

const isolated = process.env.PLAYWRIGHT_CROSS_ORIGIN_ISOLATED === "1";
const port = isolated ? 4192 : 4191;
const releaseRoot = "local-release/seismic-processing-toolkit";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: isolated ? "local-release-isolated.spec.ts" : "local-release.spec.ts",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: process.env.CI ? "list" : "list",
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure", screenshot: "only-on-failure", video: "off" },
  webServer: {
    command: `node ${releaseRoot}/server/serve-local.mjs --root ${releaseRoot}/app --host 127.0.0.1 --port ${port} --no-open --strict-port${isolated ? " --cross-origin-isolated" : ""}`,
    url: `http://127.0.0.1:${port}/healthz`,
    reuseExistingServer: false,
    timeout: 30_000
  },
  projects: [{ name: "chromium-local-release", use: { ...devices["Desktop Chrome"] } }]
});
