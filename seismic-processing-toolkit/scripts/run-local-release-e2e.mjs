#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("test:e2e:local-release must run through npm.");
function run(command, argumentsList, environment = process.env) { return new Promise((resolvePromise, rejectPromise) => { const child = spawn(command, argumentsList, { cwd: projectRoot, stdio: "inherit", env: environment }); child.once("error", rejectPromise); child.once("exit", (code) => code === 0 ? resolvePromise() : rejectPromise(new Error(`Command exited with ${code ?? 1}.`))); }); }
await run(process.execPath, [npmCli, "run", "package:local"]);
await run(process.execPath, [resolve(projectRoot, "node_modules", "@playwright", "test", "cli.js"), "test", "-c", "playwright.local-release.config.ts"], { ...process.env, PLAYWRIGHT_LOCAL_RELEASE: "1" });
await run(process.execPath, [resolve(projectRoot, "node_modules", "@playwright", "test", "cli.js"), "test", "-c", "playwright.local-release.config.ts"], { ...process.env, PLAYWRIGHT_LOCAL_RELEASE: "1", PLAYWRIGHT_CROSS_ORIGIN_ISOLATED: "1" });
