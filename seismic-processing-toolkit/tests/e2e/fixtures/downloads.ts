import { readFile } from "node:fs/promises";
import { expect, type Download } from "@playwright/test";

export async function readDownload(download: Download): Promise<Buffer> { const path = await download.path(); if (!path) throw new Error("Playwright did not provide a temporary download path."); return readFile(path); }
export async function readDownloadText(download: Download): Promise<string> { return (await readDownload(download)).toString("utf8"); }
export async function expectPng(download: Download, width: number, height: number): Promise<void> {
  const bytes = await readDownload(download); expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])); expect(bytes.readUInt32BE(16)).toBe(width); expect(bytes.readUInt32BE(20)).toBe(height); expect(bytes.byteLength).toBeGreaterThan(64);
}
