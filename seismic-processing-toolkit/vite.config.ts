import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const packageInfo = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { readonly version: string };
function gitCommit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  try { return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return "unavailable"; }
}

export default defineConfig({
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(packageInfo.version),
    __GIT_COMMIT__: JSON.stringify(gitCommit())
  },
  preview: { headers: { "X-Seismic-Runtime": "vite-preview" } },
  build: {
    target: "es2022",
    // Keep deployable source private by default; enable maps explicitly when debugging a release.
    sourcemap: false
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
