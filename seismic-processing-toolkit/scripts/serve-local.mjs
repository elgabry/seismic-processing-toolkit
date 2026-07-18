#!/usr/bin/env node
/**
 * Dependency-free static server for the local application and portable release.
 * It intentionally exposes only a configured built-app root on loopback by default.
 */
import { createServer } from "node:http";
import { access, stat, readFile, realpath } from "node:fs/promises";
import { constants as fileConstants } from "node:fs";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4173;
const MAX_PORT_ATTEMPTS = 100;

const MIME_TYPES = new Map([
  [".avif", "image/avif"], [".css", "text/css; charset=utf-8"], [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"], [".ico", "image/x-icon"], [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"], [".js", "text/javascript; charset=utf-8"], [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"], [".png", "image/png"], [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"], [".wasm", "application/wasm"], [".webmanifest", "application/manifest+json"],
  [".webp", "image/webp"], [".woff", "font/woff"], [".woff2", "font/woff2"], [".xml", "application/xml; charset=utf-8"]
]);

export function mimeTypeForPath(filePath) {
  return MIME_TYPES.get(extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

export function isLoopbackHost(host) {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid port: ${value}`);
  return port;
}

export function parseServerArguments(argumentsList, cwd = process.cwd()) {
  const options = { root: resolve(cwd, "dist"), host: DEFAULT_HOST, port: DEFAULT_PORT, open: false, strictPort: false, crossOriginIsolated: false };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--root") {
      const value = argumentsList[index + 1];
      if (!value) throw new Error("--root requires a directory.");
      options.root = resolve(cwd, value); index += 1;
    } else if (argument === "--host") {
      const value = argumentsList[index + 1];
      if (!value) throw new Error("--host requires a host.");
      options.host = value; index += 1;
    } else if (argument === "--port") {
      const value = argumentsList[index + 1];
      if (!value) throw new Error("--port requires a number.");
      options.port = parsePort(value); index += 1;
    } else if (argument === "--open") options.open = true;
    else if (argument === "--no-open") options.open = false;
    else if (argument === "--strict-port") options.strictPort = true;
    else if (argument === "--cross-origin-isolated") options.crossOriginIsolated = true;
    else if (argument === "--help" || argument === "-h") return { ...options, help: true };
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function usage() {
  return [
    "Usage: node serve-local.mjs [options]",
    "  --root <directory>          Static application root (default: dist)",
    "  --host <host>               Bind host (default: 127.0.0.1)",
    "  --port <port>               Preferred port (default: 4173)",
    "  --open | --no-open          Open the default browser after start",
    "  --strict-port               Fail instead of selecting the next local port",
    "  --cross-origin-isolated     Send COOP/COEP headers",
    "  --help                      Show this help"
  ].join("\n");
}

function responseHeaders(contentType, crossOriginIsolated) {
  const headers = { "Content-Type": contentType, "X-Content-Type-Options": "nosniff", "X-Seismic-Local-Server": "1", "Cache-Control": "no-store" };
  if (crossOriginIsolated) {
    headers["Cross-Origin-Opener-Policy"] = "same-origin";
    headers["Cross-Origin-Embedder-Policy"] = "require-corp";
  }
  return headers;
}

function requestAcceptsHtml(request) {
  const accept = request.headers.accept ?? "";
  return accept.includes("text/html");
}

function safelyDecodePathname(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return undefined; }
  if (decoded.includes("\0") || decoded.includes("\\")) return undefined;
  return decoded;
}

function rootContains(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot));
}

async function regularFile(filePath) {
  try { return (await stat(filePath)).isFile(); } catch { return false; }
}

function send(request, response, status, headers, body) {
  response.writeHead(status, headers);
  if (request.method !== "HEAD" && body !== undefined) response.end(body);
  else response.end();
}

function serverHandler(root, options) {
  const indexPath = resolve(root, "index.html");
  return async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      send(request, response, 405, responseHeaders("text/plain; charset=utf-8", options.crossOriginIsolated), "Method not allowed");
      return;
    }
    let url;
    try { url = new URL(request.url ?? "/", "http://local.invalid"); } catch {
      send(request, response, 400, responseHeaders("text/plain; charset=utf-8", options.crossOriginIsolated), "Bad request"); return;
    }
    if (url.pathname === "/healthz") {
      const body = JSON.stringify({ status: "ok", application: "seismic-processing-toolkit", server: "local-static", root: basename(root) });
      send(request, response, 200, responseHeaders("application/json; charset=utf-8", options.crossOriginIsolated), body); return;
    }
    const decoded = safelyDecodePathname(url.pathname);
    if (!decoded) { send(request, response, 400, responseHeaders("text/plain; charset=utf-8", options.crossOriginIsolated), "Bad request path"); return; }
    const requested = decoded === "/" ? indexPath : resolve(root, `.${decoded}`);
    if (!rootContains(root, requested)) { send(request, response, 403, responseHeaders("text/plain; charset=utf-8", options.crossOriginIsolated), "Forbidden"); return; }
    let filePath = requested;
    if (!(await regularFile(filePath))) {
      const hasExtension = extname(decoded) !== "";
      if (!hasExtension && requestAcceptsHtml(request) && await regularFile(indexPath)) filePath = indexPath;
      else { send(request, response, 404, responseHeaders("text/plain; charset=utf-8", options.crossOriginIsolated), "Not found"); return; }
    }
    try {
      const resolvedFile = await realpath(filePath);
      if (!rootContains(root, resolvedFile)) { send(request, response, 403, responseHeaders("text/plain; charset=utf-8", options.crossOriginIsolated), "Forbidden"); return; }
      const body = request.method === "HEAD" ? undefined : await readFile(resolvedFile);
      send(request, response, 200, responseHeaders(mimeTypeForPath(resolvedFile), options.crossOriginIsolated), body);
    } catch {
      send(request, response, 500, responseHeaders("text/plain; charset=utf-8", options.crossOriginIsolated), "Unable to read local application asset");
    }
  };
}

async function ensureDirectory(root) {
  try { await access(root, fileConstants.R_OK); } catch { throw new Error(`Application root does not exist or is not readable: ${root}`); }
  if (!(await stat(root)).isDirectory()) throw new Error(`Application root is not a directory: ${root}`);
  return realpath(root);
}

function listen(server, host, port) {
  return new Promise((resolvePromise, rejectPromise) => {
    const onError = (error) => { server.off("listening", onListening); rejectPromise(error); };
    const onListening = () => { server.off("error", onError); resolvePromise(server.address()); };
    server.once("error", onError); server.once("listening", onListening); server.listen({ host, port, exclusive: true });
  });
}

export async function startLocalServer(overrides = {}) {
  const options = { root: resolve(process.cwd(), "dist"), host: DEFAULT_HOST, port: DEFAULT_PORT, open: false, strictPort: false, crossOriginIsolated: false, ...overrides };
  const requestedRoot = resolve(options.root);
  const root = await ensureDirectory(requestedRoot);
  let lastError;
  for (let offset = 0; offset < MAX_PORT_ATTEMPTS; offset += 1) {
    const server = createServer(serverHandler(root, options));
    const candidatePort = options.port === 0 ? 0 : options.port + offset;
    try {
      const address = await listen(server, options.host, candidatePort);
      if (!address || typeof address === "string") throw new Error("The local server did not return a TCP address.");
      const hostForUrl = options.host.includes(":") ? `[${options.host}]` : options.host;
      const url = `http://${hostForUrl}:${address.port}`;
      return { server, root, host: options.host, port: address.port, url, crossOriginIsolated: options.crossOriginIsolated, close: () => new Promise((resolvePromise, rejectPromise) => server.close((error) => error ? rejectPromise(error) : resolvePromise())) };
    } catch (error) {
      server.close(); lastError = error;
      if (!(error && typeof error === "object" && error.code === "EADDRINUSE") || options.strictPort || options.port === 0) break;
    }
  }
  const suffix = options.strictPort ? " (strict port requested)" : " after trying local alternatives";
  throw new Error(`Unable to bind ${options.host}:${options.port}${suffix}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

export function openBrowser(url) {
  let command; let argumentsList;
  if (process.platform === "win32") { command = "cmd"; argumentsList = ["/c", "start", "", url]; }
  else if (process.platform === "darwin") { command = "open"; argumentsList = [url]; }
  else { command = "xdg-open"; argumentsList = [url]; }
  try {
    const child = spawn(command, argumentsList, { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", () => {}); child.unref(); return true;
  } catch { return false; }
}

async function main() {
  let options;
  try { options = parseServerArguments(process.argv.slice(2)); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); console.error(usage()); process.exitCode = 2; return; }
  if (options.help) { console.log(usage()); return; }
  if (!isLoopbackHost(options.host)) console.warn(`Warning: ${options.host} is not loopback. Anyone able to reach this interface may load the local application.`);
  let running;
  try { running = await startLocalServer(options); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; return; }
  console.log("Seismic Processing Toolkit is running locally."); console.log(`URL: ${running.url}`); console.log("Seismic files remain inside your browser."); console.log("Press Ctrl+C to stop.");
  if (options.open && !openBrowser(running.url)) console.log("Browser opening is unavailable; open the URL above manually.");
  let closing = false;
  const close = async () => { if (closing) return; closing = true; await running.close(); };
  process.once("SIGINT", () => { void close(); }); process.once("SIGTERM", () => { void close(); });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
