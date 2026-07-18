#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const production = process.argv.includes("--production");
const child = spawn(process.execPath, [resolve(projectRoot, "node_modules", "@playwright", "test", "cli.js"), "test", ...process.argv.slice(2).filter((argument) => argument !== "--production")], { cwd: projectRoot, stdio: "inherit", env: { ...process.env, ...(production ? { PLAYWRIGHT_PRODUCTION: "1" } : {}) } });
child.once("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.once("exit", (code) => { process.exitCode = code ?? 1; });
