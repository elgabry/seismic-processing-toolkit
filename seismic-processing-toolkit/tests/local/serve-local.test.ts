import { afterEach, describe, expect, it } from "vitest";
import { createServer, request } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface LocalServer { readonly url: string; readonly port: number; readonly close: () => Promise<void>; }
interface LocalServerModule {
  readonly mimeTypeForPath: (filePath: string) => string;
  readonly parseServerArguments: (argumentsList: readonly string[], cwd?: string) => { readonly host: string; readonly port: number; readonly root: string; readonly open: boolean; readonly strictPort: boolean; readonly crossOriginIsolated: boolean };
  readonly startLocalServer: (options: { readonly root: string; readonly port?: number; readonly strictPort?: boolean; readonly crossOriginIsolated?: boolean }) => Promise<LocalServer>;
}

const localServerModule = await import(new URL("../../scripts/serve-local.mjs", import.meta.url).href) as unknown as LocalServerModule;
const temporaryDirectories: string[] = [];
afterEach(async () => { await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "seismic-local-server-")); temporaryDirectories.push(root);
  await mkdir(join(root, "assets")); await mkdir(join(root, "legacy"));
  await writeFile(join(root, "index.html"), "<!doctype html><title>fixture</title>");
  await writeFile(join(root, "assets", "index.js"), "export const fixture = true;");
  await writeFile(join(root, "assets", "smartsolo.worker.js"), "self.postMessage('ready');");
  await writeFile(join(root, "legacy", "viewer.html"), "<!doctype html><title>legacy</title>");
  return root;
}

async function rawRequest(server: LocalServer, path: string, method = "GET", headers: Record<string, string> = {}): Promise<{ readonly status: number; readonly headers: Record<string, string | string[] | undefined>; readonly body: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const responseRequest = request({ host: "127.0.0.1", port: server.port, path, method, headers }, (response) => {
      const chunks: Buffer[] = []; response.on("data", (chunk: Buffer) => chunks.push(chunk)); response.on("end", () => resolvePromise({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
    }); responseRequest.once("error", rejectPromise); responseRequest.end();
  });
}

describe("dependency-free local static server", () => {
  it("uses loopback defaults and validates command-line arguments", () => {
    const parsed = localServerModule.parseServerArguments([], "/example");
    expect(parsed.host).toBe("127.0.0.1"); expect(parsed.port).toBe(4173); expect(parsed.root).toBe("/example/dist"); expect(parsed.open).toBe(false);
    expect(() => localServerModule.parseServerArguments(["--port", "not-a-port"])).toThrow(/Invalid port/);
    expect(() => localServerModule.parseServerArguments(["--unexpected"])).toThrow(/Unknown option/);
  });

  it("serves application files, workers, health, HEAD, and an HTML-only history fallback", async () => {
    const server = await localServerModule.startLocalServer({ root: await fixtureRoot(), port: 0, strictPort: true });
    try {
      const root = await rawRequest(server, "/"); expect(root.status).toBe(200); expect(root.headers["content-type"]).toContain("text/html"); expect(root.headers["x-content-type-options"]).toBe("nosniff"); expect(root.headers["x-seismic-local-server"]).toBe("1");
      const worker = await rawRequest(server, "/assets/smartsolo.worker.js"); expect(worker.status).toBe(200); expect(worker.headers["content-type"]).toContain("text/javascript");
      const head = await rawRequest(server, "/assets/index.js", "HEAD"); expect(head.status).toBe(200); expect(head.body).toBe("");
      const health = await rawRequest(server, "/healthz"); expect(health.status).toBe(200); expect(JSON.parse(health.body)).toMatchObject({ status: "ok", application: "seismic-processing-toolkit" });
      const fallback = await rawRequest(server, "/saved/view", "GET", { accept: "text/html" }); expect(fallback.status).toBe(200); expect(fallback.body).toContain("fixture");
      expect((await rawRequest(server, "/missing.js")).status).toBe(404); expect((await rawRequest(server, "/legacy/")).status).toBe(404); expect((await rawRequest(server, "/", "POST")).status).toBe(405);
    } finally { await server.close(); }
  });

  it("rejects literal and encoded traversal while retaining only the configured root", async () => {
    const root = await fixtureRoot(); const outside = join(root, "..", "seismic-secret.txt"); await writeFile(outside, "not public");
    const server = await localServerModule.startLocalServer({ root, port: 0, strictPort: true });
    try {
      expect((await rawRequest(server, "/../seismic-secret.txt")).status).toBeGreaterThanOrEqual(400);
      expect((await rawRequest(server, "/%2e%2e/seismic-secret.txt")).status).toBeGreaterThanOrEqual(400);
      expect((await rawRequest(server, "/%252e%252e/seismic-secret.txt")).status).toBeGreaterThanOrEqual(400);
    } finally { await server.close(); await rm(outside, { force: true }); }
  });

  it("uses alternate local ports unless strict-port is requested and can enable isolation headers", async () => {
    const occupied = createServer(); await new Promise<void>((resolvePromise) => occupied.listen({ host: "127.0.0.1", port: 0 }, resolvePromise));
    const address = occupied.address(); if (!address || typeof address === "string") throw new Error("Expected a TCP port.");
    const root = await fixtureRoot();
    await expect(localServerModule.startLocalServer({ root, port: address.port, strictPort: true })).rejects.toThrow(/Unable to bind/);
    const alternate = await localServerModule.startLocalServer({ root, port: address.port });
    const isolated = await localServerModule.startLocalServer({ root, port: 0, strictPort: true, crossOriginIsolated: true });
    try {
      expect(alternate.port).not.toBe(address.port); const response = await rawRequest(isolated, "/"); expect(response.headers["cross-origin-opener-policy"]).toBe("same-origin"); expect(response.headers["cross-origin-embedder-policy"]).toBe("require-corp");
    } finally { await alternate.close(); await isolated.close(); await new Promise<void>((resolvePromise) => occupied.close(() => resolvePromise())); }
  });

  it("uses suitable MIME types without a server dependency", () => {
    expect(localServerModule.mimeTypeForPath("worker.js")).toContain("text/javascript"); expect(localServerModule.mimeTypeForPath("data.wasm")).toBe("application/wasm"); expect(localServerModule.mimeTypeForPath("unknown.bin")).toBe("application/octet-stream");
  });
});
