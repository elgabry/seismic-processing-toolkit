import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { expect, type Download } from "@playwright/test";

export async function readDownload(download: Download): Promise<Buffer> { const path = await download.path(); if (!path) throw new Error("Playwright did not provide a temporary download path."); return readFile(path); }
export async function readDownloadText(download: Download): Promise<string> { return (await readDownload(download)).toString("utf8"); }
export async function expectPng(download: Download, width: number, height: number): Promise<void> {
  const bytes = await readDownload(download); expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])); expect(bytes.readUInt32BE(16)).toBe(width); expect(bytes.readUInt32BE(20)).toBe(height); expect(bytes.byteLength).toBeGreaterThan(64);
}

/** Minimal deterministic PNG decoder for Canvas RGBA output; avoids a second image dependency in browser tests. */
export function decodeRgbaPng(bytes: Buffer): { readonly width: number; readonly height: number; readonly pixels: Buffer } {
  const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20); const bitDepth = bytes[24] ?? 0; const colorType = bytes[25] ?? 0; if (bitDepth !== 8 || colorType !== 6) throw new Error(`Expected 8-bit RGBA PNG, got bit depth ${bitDepth} color type ${colorType}.`);
  const chunks: Buffer[] = []; let offset = 8;
  while (offset + 12 <= bytes.length) { const length = bytes.readUInt32BE(offset); const type = bytes.subarray(offset + 4, offset + 8).toString("ascii"); const data = bytes.subarray(offset + 8, offset + 8 + length); if (type === "IDAT") chunks.push(data); offset += length + 12; if (type === "IEND") break; }
  const source = inflateSync(Buffer.concat(chunks)); const stride = width * 4; const pixels = Buffer.alloc(stride * height); let read = 0;
  for (let row = 0; row < height; row += 1) { const filter = source[read++] ?? 0; const rowStart = row * stride; for (let column = 0; column < stride; column += 1) { const raw = source[read++] ?? 0; const left = column >= 4 ? pixels[rowStart + column - 4] ?? 0 : 0; const above = row > 0 ? pixels[rowStart - stride + column] ?? 0 : 0; const upperLeft = row > 0 && column >= 4 ? pixels[rowStart - stride + column - 4] ?? 0 : 0; let value = raw; if (filter === 1) value = raw + left; else if (filter === 2) value = raw + above; else if (filter === 3) value = raw + Math.floor((left + above) / 2); else if (filter === 4) { const prediction = left + above - upperLeft; const leftDistance = Math.abs(prediction - left); const aboveDistance = Math.abs(prediction - above); const upperLeftDistance = Math.abs(prediction - upperLeft); value = raw + (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance ? left : aboveDistance <= upperLeftDistance ? above : upperLeft); } else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}.`); pixels[rowStart + column] = value & 255; } }
  return { width, height, pixels };
}
