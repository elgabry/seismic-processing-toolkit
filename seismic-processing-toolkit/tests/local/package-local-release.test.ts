import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

interface PackageModule { readonly packageLocalRelease: (options: { readonly output: string; readonly dist: string; readonly skipBuild: boolean }) => Promise<{ readonly packageRoot: string; readonly fileCount: number }>; }
const packageModule = await import(new URL("../../scripts/package-local-release.mjs", import.meta.url).href) as unknown as PackageModule;
interface LocalServerModule { readonly startLocalServer: (options: { readonly root: string; readonly port: number; readonly strictPort: boolean }) => Promise<{ readonly url: string; readonly close: () => Promise<void> }>; }
const localServerModule = await import(new URL("../../scripts/serve-local.mjs", import.meta.url).href) as unknown as LocalServerModule;
const temporaryDirectories: string[] = [];
afterEach(async () => { await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

async function filesAt(directory: string): Promise<string[]> { const entries = await readdir(directory, { withFileTypes: true }); const files: string[] = []; for (const entry of entries) { const path = join(directory, entry.name); if (entry.isDirectory()) files.push(...await filesAt(path)); else files.push(path); } return files; }
function checksum(bytes: Buffer): string { return createHash("sha256").update(bytes).digest("hex"); }

describe("local release packager", () => {
  it("creates a self-contained static package without source maps, tests, sources, or node_modules", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "seismic-package-dist-")); temporaryDirectories.push(fixture);
    await mkdir(join(fixture, "assets")); await mkdir(join(fixture, "legacy"));
    await writeFile(join(fixture, "index.html"), "<script type=module src=./assets/index.js></script>"); await writeFile(join(fixture, "assets", "index.js"), "new Worker(new URL('./smartsolo.worker.js', import.meta.url), { type: 'module' });"); await writeFile(join(fixture, "assets", "smartsolo.worker.js"), "self.postMessage('ready');"); await writeFile(join(fixture, "legacy", "segy-wiggle-viewer-v2.2.html"), "legacy");
    const outputBase = await mkdtemp(join(process.cwd(), "tests", ".tmp-local-release-")); temporaryDirectories.push(outputBase); const output = join(outputBase, "seismic-processing-toolkit");
    const result = await packageModule.packageLocalRelease({ output, dist: fixture, skipBuild: true }); expect(result.fileCount).toBeGreaterThan(8);
    const paths = (await filesAt(output)).map((path) => relative(output, path).replaceAll("\\", "/"));
    expect(paths).toEqual(expect.arrayContaining(["app/index.html", "app/assets/smartsolo.worker.js", "app/legacy/segy-wiggle-viewer-v2.2.html", "server/serve-local.mjs", "start-local.cmd", "start-local.ps1", "start-local.sh", "README_LOCAL.md", "VERSION", "BUILD.json", "SHA256SUMS"]));
    expect(paths.some((path) => path.includes("node_modules") || path.startsWith("src/") || path.startsWith("tests/") || path.endsWith(".map"))).toBe(false);
    expect(await readFile(join(output, "app", "assets", "index.js"), "utf8")).not.toContain(process.cwd());
    const sums = await readFile(join(output, "SHA256SUMS"), "utf8"); for (const line of sums.trim().split("\n")) { const [hash, file] = line.split("  "); if (!hash || !file) throw new Error("Invalid checksum row."); expect(checksum(await readFile(join(output, file)))).toBe(hash); }
    const moved = join(outputBase, "release in a path with spaces"); await cp(output, moved, { recursive: true }); expect(await readFile(join(moved, "server", "serve-local.mjs"), "utf8")).toContain("127.0.0.1");
    expect(await readFile(join(moved, "start-local.cmd"), "utf8")).toContain("%~dp0"); expect(await readFile(join(moved, "start-local.ps1"), "utf8")).toContain("$MyInvocation.MyCommand.Path"); expect(await readFile(join(moved, "start-local.sh"), "utf8")).toContain("dirname");
    const server = await localServerModule.startLocalServer({ root: join(moved, "app"), port: 0, strictPort: true });
    try { expect((await fetch(`${server.url}/assets/smartsolo.worker.js`)).headers.get("content-type")).toContain("text/javascript"); } finally { await server.close(); }
  });
});
