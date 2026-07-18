#!/usr/bin/env node
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = resolve(projectRoot, "local-release", "seismic-processing-toolkit");

function optionValue(argumentsList, name) { const index = argumentsList.indexOf(name); return index >= 0 ? argumentsList[index + 1] : undefined; }
function outsideProject(path) { const pathFromProject = relative(projectRoot, path); return pathFromProject.startsWith(`..${sep}`) || pathFromProject === ".."; }
function runBuild() { const npmCli = process.env.npm_execpath; if (!npmCli) throw new Error("package:local must run through npm so it can execute the locked build command."); const result = spawnSync(process.execPath, [npmCli, "run", "build"], { cwd: projectRoot, stdio: "inherit" }); if (result.status !== 0) throw new Error(`Production build failed with exit code ${result.status ?? 1}.`); }
function gitCommit() { const result = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); return result.status === 0 ? result.stdout.trim() : "unavailable"; }
async function walk(directory) { const entries = await readdir(directory, { withFileTypes: true }); const paths = []; for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) { const entryPath = resolve(directory, entry.name); if (entry.isDirectory()) paths.push(...await walk(entryPath)); else if (entry.isFile()) paths.push(entryPath); } return paths; }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
async function assertNoSourceMaps(directory) { const files = await walk(directory); const maps = files.filter((file) => file.endsWith(".map")); if (maps.length > 0) throw new Error(`Refusing to package source maps: ${maps.map((file) => relative(directory, file)).join(", ")}`); }

export async function packageLocalRelease({ output = defaultOutput, dist = resolve(projectRoot, "dist"), skipBuild = false } = {}) {
  const packageRoot = resolve(output); const distribution = resolve(dist);
  if (outsideProject(packageRoot)) throw new Error("Release output must remain within the project directory.");
  if (!skipBuild) runBuild();
  if (!existsSync(distribution)) throw new Error(`Built application directory does not exist: ${distribution}`);
  await assertNoSourceMaps(distribution);
  await rm(packageRoot, { recursive: true, force: true }); await mkdir(packageRoot, { recursive: true });
  await cp(distribution, resolve(packageRoot, "app"), { recursive: true, force: false });
  await mkdir(resolve(packageRoot, "server"), { recursive: true });
  await cp(resolve(projectRoot, "scripts", "serve-local.mjs"), resolve(packageRoot, "server", "serve-local.mjs"));
  for (const file of ["start-local.cmd", "start-local.ps1", "start-local.sh"]) await cp(resolve(projectRoot, "scripts", "release-launchers", file), resolve(packageRoot, file));
  await cp(resolve(projectRoot, "scripts", "release-launchers", "README_LOCAL.md"), resolve(packageRoot, "README_LOCAL.md"));
  const packageJson = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));
  const assets = (await walk(resolve(packageRoot, "app", "assets"))).map((file) => relative(resolve(packageRoot, "app"), file).split(sep).join("/"));
  const build = { applicationVersion: packageJson.version, gitCommit: gitCommit(), buildChannel: "local-release", nodeVersion: process.version, mainBundles: assets.filter((file) => file.endsWith(".js") && !file.includes(".worker-")), workerBundles: assets.filter((file) => file.includes(".worker-") && file.endsWith(".js")), sourceMapsEnabled: false };
  await writeFile(resolve(packageRoot, "VERSION"), `${packageJson.version}\n`, "utf8");
  await writeFile(resolve(packageRoot, "BUILD.json"), `${JSON.stringify(build, null, 2)}\n`, "utf8");
  const files = await walk(packageRoot); const sums = [];
  for (const file of files) { const normalized = relative(packageRoot, file).split(sep).join("/"); if (normalized === "SHA256SUMS") continue; sums.push(`${sha256(await readFile(file))}  ${normalized}`); }
  await writeFile(resolve(packageRoot, "SHA256SUMS"), `${sums.join("\n")}\n`, "utf8");
  return { packageRoot, fileCount: (await walk(packageRoot)).length, build };
}

async function main() {
  const argumentsList = process.argv.slice(2);
  const output = optionValue(argumentsList, "--output") ?? defaultOutput;
  const dist = optionValue(argumentsList, "--dist") ?? resolve(projectRoot, "dist");
  const skipBuild = argumentsList.includes("--skip-build");
  const result = await packageLocalRelease({ output, dist, skipBuild });
  console.log(`Created portable local release: ${result.packageRoot}`); console.log(`Runtime files: ${result.fileCount}`); console.log("The package needs Node.js but does not contain node_modules or require npm install.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
