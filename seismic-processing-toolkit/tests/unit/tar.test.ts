import { describe, expect, it } from "vitest";
import { TarArchiveReader } from "../../src/io/sweep/tar-archive-reader";
import { MemorySource } from "../fixtures/segy-fixture";

function tar(): ArrayBuffer { const bytes = new Uint8Array(2048); const encoder = new TextEncoder(); bytes.set(encoder.encode("pilot.txt"), 0); bytes.set(encoder.encode("00000000004\0"), 124); bytes[156] = "0".charCodeAt(0); bytes.set(encoder.encode("ustar"), 257); bytes.set(encoder.encode("1,2\n"), 512); return bytes.buffer; }
describe("TarArchiveReader", () => { it("indexes entry slices without unpacking the archive", async () => { const source = new MemorySource(tar(), "pilot.tar"); const reader = new TarArchiveReader(source); const entries = await reader.entries(); expect(entries).toEqual([{ name: "pilot.txt", type: "file", byteOffset: 512, size: 4 }]); expect(new TextDecoder().decode(await reader.readEntry(entries[0]!))).toBe("1,2\n"); }); });
