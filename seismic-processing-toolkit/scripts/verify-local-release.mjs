#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = resolve(projectRoot, "local-release", "seismic-processing-toolkit");
const appRoot = resolve(packageRoot, "app");
const serverPath = resolve(packageRoot, "server", "serve-local.mjs");
const port = Number(process.env.LOCAL_RELEASE_PORT ?? 4173);
if (existsSync(resolve(packageRoot, "node_modules"))) throw new Error("Portable release must not contain node_modules.");
if (!existsSync(serverPath) || !existsSync(resolve(appRoot, "index.html"))) throw new Error("Portable release is incomplete. Run npm run package:local first.");
const build = JSON.parse(await readFile(resolve(packageRoot, "BUILD.json"), "utf8"));
const worker = build.workerBundles?.[0]; if (!worker) throw new Error("Portable release BUILD.json does not list a SmartSolo worker bundle.");
const output = [];
const server = spawn(process.execPath, [serverPath, "--root", appRoot, "--host", "127.0.0.1", "--port", String(port), "--no-open", "--strict-port"], { cwd: packageRoot });
server.stdout.on("data", (chunk) => output.push(String(chunk))); server.stderr.on("data", (chunk) => output.push(String(chunk)));
function wait(milliseconds) { return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)); }
async function request(path) { let lastError; for (let attempt = 0; attempt < 40; attempt += 1) { try { const response = await fetch(`http://127.0.0.1:${port}${path}`); if (response.ok) return response; lastError = new Error(`${path} returned ${response.status}`); } catch (error) { lastError = error; } await wait(125); } throw lastError instanceof Error ? lastError : new Error(String(lastError)); }
let verificationError;
try {
  const health = await request("/healthz"); const status = await health.json(); if (status.status !== "ok") throw new Error("Local health endpoint did not report ok.");
  if (!(await request("/")).headers.get("content-type")?.includes("text/html")) throw new Error("Portable root did not return HTML.");
  if (!(await request(`/${worker}`)).headers.get("content-type")?.includes("javascript")) throw new Error("SmartSolo worker did not return JavaScript.");
  console.log(`Portable local release verified at http://127.0.0.1:${port}`);
} catch (error) { verificationError = error; }
if (server.exitCode === null) { server.kill("SIGTERM"); await new Promise((resolvePromise) => server.once("exit", resolvePromise)); }
if (server.exitCode && server.exitCode !== 0) throw new Error(`Portable server exited unsuccessfully: ${output.join("")}`);
if (verificationError) throw verificationError;
