#!/usr/bin/env node
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";

const MINIMUM_NODE = [22, 12, 0];
const MINIMUM_NPM = 10;

function versionParts(value) { return value.replace(/^v/, "").split(".").map((part) => Number(part)); }
function supportedNode(value) { const [major = 0, minor = 0, patch = 0] = versionParts(value); return major > MINIMUM_NODE[0] || (major === MINIMUM_NODE[0] && (minor > MINIMUM_NODE[1] || (minor === MINIMUM_NODE[1] && patch >= MINIMUM_NODE[2]))); }
function availablePort(port) { return new Promise((resolvePromise) => { const probe = createServer(); probe.once("error", () => resolvePromise(false)); probe.listen({ host: "127.0.0.1", port }, () => probe.close(() => resolvePromise(true))); }); }

const npmVersion = process.env.npm_config_user_agent?.match(/npm\/(\d+(?:\.\d+){0,2})/)?.[1] ?? "unknown";
console.log(`Node.js: ${process.version}`); console.log(`npm: ${npmVersion}`);
let valid = true;
if (!supportedNode(process.version)) { console.error("Node.js 22.12.0 or newer is required (Node 24 LTS recommended)."); valid = false; }
if (npmVersion === "unknown" || versionParts(npmVersion)[0] < MINIMUM_NPM) { console.error("npm 10 or newer is required. Run this command through the supported npm installation."); valid = false; }
if (!existsSync(resolve("node_modules"))) { console.error("Dependencies are not installed. Run npm ci before starting from a source checkout."); valid = false; } else console.log("Dependencies: present");
if (existsSync(resolve("dist"))) console.log("Production build: present"); else console.log("Production build: absent (npm run local will build it; npm run local:serve requires it).");
if (await availablePort(4173)) console.log("Port 4173: available"); else console.warn("Port 4173: occupied (the local server will select the next local port unless --strict-port is used).");
if (!valid) process.exitCode = 1;
