#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm run local must be invoked through npm so the locked build command can be used.");
const noOpen = process.argv.includes("--no-open");

function run(command, argumentsList) { return new Promise((resolvePromise, rejectPromise) => { const child = spawn(command, argumentsList, { cwd: projectRoot, stdio: "inherit" }); child.once("error", rejectPromise); child.once("exit", (code, signal) => code === 0 ? resolvePromise() : rejectPromise(new Error(`Command stopped with ${signal ?? `exit code ${code ?? 1}`}.`))); }); }

await run(process.execPath, [npmCli, "run", "build"]);
await run(process.execPath, [resolve(projectRoot, "scripts", "serve-local.mjs"), "--root", "dist", noOpen ? "--no-open" : "--open", ...process.argv.slice(2).filter((argument) => argument !== "--no-open")]);
