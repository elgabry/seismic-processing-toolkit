import { describe, expect, it } from "vitest";
import { GeometryBuilder } from "../../src/geometry";
import { SegyReader } from "../../src/io/segy/segy-reader";
import { MapSpatialIndex, fitViewport, screenRectToWorld, viewportForScreenRect } from "../../src/visualization/map";
import { isSmartSoloWorkerRequest, smartSoloTransferables } from "../../src/workers/smartsolo-protocol";
import { MemorySource, makeSegy } from "../fixtures/segy-fixture";

describe("Phase 3 worker protocol and map interaction primitives", () => {
  it("accepts only explicit SmartSolo worker messages and transfers only published batch buffers", () => {
    expect(isSmartSoloWorkerRequest({ type: "request-batch", jobId: "job-1", traceStart: 0, maximumBatchBytes: 4096 })).toBe(true);
    expect(isSmartSoloWorkerRequest({ type: "request-batch", traceStart: 0 })).toBe(false);
    expect(isSmartSoloWorkerRequest({ type: "request-batch", jobId: "job-1", traceStart: -1, maximumBatchBytes: 0 })).toBe(false);
    const headers = new Uint8Array(240); const samples = new Float32Array([1, -1]); const offsets = new Uint32Array([0, 2]);
    const transferables = smartSoloTransferables({ type: "batch", jobId: "job-1", batch: { traceStart: 0, traceEndExclusive: 1, headers, samples, sampleOffsets: offsets, diagnostics: [] } });
    expect(transferables).toEqual([headers.buffer, samples.buffer, offsets.buffer]);
  });

  it("uses a grid query for box selection and preserves a non-degenerate fitted viewport", async () => {
    const bytes = makeSegy({ traces: [{ samples: [1], sourceX: 0, receiverX: 10, coordinateScalar: 1 }, { samples: [1], sourceX: 100, receiverX: 110, coordinateScalar: 1 }] });
    const view = new DataView(bytes); view.setInt32(3600 + 76, 0, false); view.setInt32(3600 + 84, 0, false); view.setInt32(3844 + 76, 0, false); view.setInt32(3844 + 84, 0, false);
    const table = await GeometryBuilder.fromSegy(await SegyReader.open(new MemorySource(bytes))); const bounds = table.bounds(); if (!bounds) throw new Error("Expected fixture geometry bounds.");
    const viewport = fitViewport(bounds, 600, 300); const index = new MapSpatialIndex(table); expect(Array.from(index.tracesInBox({ minimumX: -1, maximumX: 20, minimumY: -1, maximumY: 1 }))).toEqual([0]);
    const boxed = viewportForScreenRect({ start: { x: 100, y: 60 }, end: { x: 500, y: 240 } }, viewport, 600, 300); expect(boxed.pixelsPerWorldUnit).toBeGreaterThan(viewport.pixelsPerWorldUnit); const world = screenRectToWorld({ start: { x: 100, y: 60 }, end: { x: 500, y: 240 } }, viewport, 600, 300); expect(world.minimumX).toBeLessThan(world.maximumX);
  });
});
