import { describe, expect, it } from "vitest";
import { GeometryBuilder, GeometryQcAnalyzer } from "../../src/geometry";
import { BlobOutputSink } from "../../src/io/sink/output-sink";
import { SegyReader } from "../../src/io/segy/segy-reader";
import { CsvEncoder } from "../../src/export/csv";
import { fitViewport, screenToWorld, worldToScreen, zoomViewportAt } from "../../src/visualization/map";
import { validatePngDimensions } from "../../src/export/png";
import { MemorySource, makeSegy } from "../fixtures/segy-fixture";

describe("geometry, map transforms, and export primitives", () => {
  it("retains raw coordinates and applies positive, negative, and zero SEG-Y scalars", async () => {
    const bytes = makeSegy({ traces: [{ samples: [1], sourceX: 100_000, receiverX: 100_200, coordinateScalar: -100 }] }); const view = new DataView(bytes); view.setInt32(3600 + 76, 200_000, false); view.setInt32(3600 + 84, 200_000, false); view.setInt16(3600 + 88, 1, false);
    const dataset = await SegyReader.open(new MemorySource(bytes)); const table = await GeometryBuilder.fromSegy(dataset); expect(table.rawSourceX[0]).toBe(100_000); expect(table.sourceX[0]).toBe(1000); expect(table.receiverX[0]).toBe(1002); expect(table.point(0, "cmp").x).toBe(1001);
  });

  it("flags coordinate uncertainty, duplicate positions, and offset disagreement", async () => {
    const bytes = makeSegy({ traces: [{ samples: [1], sourceX: 100, receiverX: 100, coordinateScalar: 1 }, { samples: [1], sourceX: 100, receiverX: 300, coordinateScalar: 1 }] }); const view = new DataView(bytes); for (const offset of [3600, 3844]) { view.setInt32(offset + 76, 100, false); view.setInt32(offset + 84, 100, false); view.setInt16(offset + 88, 0, false); }
    const result = GeometryQcAnalyzer.analyze(await GeometryBuilder.fromSegy(await SegyReader.open(new MemorySource(bytes)))); expect(result.findings.some((item) => item.code === "GEOMETRY_UNIT_UNKNOWN")).toBe(true); expect(result.findings.some((item) => item.code === "GEOMETRY_DUPLICATE_SOURCE_POSITION")).toBe(true);
  });

  it("fits, transforms, and cursor-zooms map coordinates without moving the cursor world point", () => {
    const viewport = fitViewport({ minimumX: -10, maximumX: 10, minimumY: -5, maximumY: 5 }, 400, 200); const screen = worldToScreen({ x: 3, y: -1 }, viewport, 400, 200); const roundTrip = screenToWorld(screen, viewport, 400, 200); expect(roundTrip.x).toBeCloseTo(3, 12); expect(roundTrip.y).toBeCloseTo(-1, 12); const zoomed = zoomViewportAt(viewport, screen, 2, 400, 200); const zoomRoundTrip = screenToWorld(screen, zoomed, 400, 200); expect(zoomRoundTrip.x).toBeCloseTo(3, 12); expect(zoomRoundTrip.y).toBeCloseTo(-1, 12);
  });

  it("escapes RFC-4180 CSV values and keeps empty/non-finite cells explicit", async () => {
    const sink = new BlobOutputSink(); const encoder = new CsvEncoder(sink, { lineEnding: "\n" }); await encoder.writeRow(["a,b", 'say "hi"', "line1\nline2", "", Number.NaN]); await encoder.close(); expect(await sink.toBlob().text()).toBe('"a,b","say ""hi""","line1\nline2",,\n');
  });

  it("rejects oversized PNG requests before allocating a canvas", () => {
    expect(() => validatePngDimensions({ width: 10_000, height: 10_000, maximumPixels: 1_000_000 })).toThrow(/safe canvas limit/i);
  });
});
