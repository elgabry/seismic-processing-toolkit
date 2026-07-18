import { describe, expect, it } from "vitest";
import { BlobOutputSink } from "../../src/io/sink/output-sink";
import { SmartSolo8058Converter, SmartSolo8058Detector, SmartSolo8058Reader } from "../../src/io/segd/smartsolo8058";
import { SegyReader } from "../../src/io/segy/segy-reader";
import { MemorySource } from "../fixtures/segy-fixture";
import { makeSmartSolo8058 } from "../fixtures/smartsolo8058-fixture";

describe("SmartSolo SEG-D 8058", () => {
  it("detects the legacy verified 8058 signature and rejects unrelated SEG-D-like bytes", async () => {
    const source = new MemorySource(makeSmartSolo8058({ traces: [{ samples: [1] }] }), "accepted.segd"); const detected = await SmartSolo8058Detector.detect(source); expect(detected.supported).toBe(true); expect(detected.revision).toBe("1.0");
    const rejected = await SmartSolo8058Detector.detect(new MemorySource(new ArrayBuffer(300), "other.segd")); expect(rejected.supported).toBe(false);
  });

  it("indexes and decodes bounded IEEE traces without decoding samples during open", async () => {
    const source = new MemorySource(makeSmartSolo8058({ sampleIntervalMicroseconds: 2000, traces: [{ samples: [1.25, -2.5], receiverEastingCentimetres: 100_100 }, { samples: [3] }] }), "line.segd"); const reader = await SmartSolo8058Reader.open(source);
    expect(reader.traceCount).toBe(2); expect(reader.index.sampleIntervalsMicroseconds).toEqual(new Uint32Array([2000, 2000])); expect(await reader.traces.readTrace(0)).toMatchObject({ samples: new Float32Array([1.25, -2.5]) }); expect(reader.index.traceAt(0).receiverEastingCentimetres).toBe(100_100);
    expect(Math.max(...source.requests.map((request) => request.length))).toBeLessThanOrEqual(64 * 1024);
  });

  it("reports a truncated final trace rather than indexing partial samples", async () => {
    const complete = makeSmartSolo8058({ traces: [{ samples: [1, 2] }, { samples: [3, 4] }] }); const truncated = complete.slice(0, complete.byteLength - 2); const reader = await SmartSolo8058Reader.open(new MemorySource(truncated, "truncated.segd"));
    expect(reader.traceCount).toBe(1); expect(reader.diagnostics.some((diagnostic) => diagnostic.code === "SMARTSOLO_TRUNCATED_TRACE_DATA")).toBe(true);
  });

  it("streams deterministic SEG-Y conversion through SegyWriter and preserves mapped samples", async () => {
    const sourceBytes = makeSmartSolo8058({ fieldRecordNumber: 44, sourcePoint: 77, traces: [{ samples: [1.25, -2.5], receiverEastingCentimetres: 100_200 }, { samples: [3.5], receiverEastingCentimetres: 100_300 }] }); const reader = await SmartSolo8058Reader.open(new MemorySource(sourceBytes, "survey.segd"));
    const firstSink = new BlobOutputSink(); const secondSink = new BlobOutputSink(); await SmartSolo8058Converter.convert(reader, firstSink); await SmartSolo8058Converter.convert(reader, secondSink);
    const first = await firstSink.toBlob().arrayBuffer(); const second = await secondSink.toBlob().arrayBuffer(); expect(new Uint8Array(first)).toEqual(new Uint8Array(second));
    const converted = await SegyReader.open(new MemorySource(first, "survey.sgy")); expect(converted.traceCount).toBe(2); expect(converted.binaryHeader.values.sampleFormatCode).toBe(5); expect(await converted.traces.readTrace(0)).toEqual(new Float32Array([1.25, -2.5])); const header = await converted.traces.readHeader(0); expect(header.raw("fieldRecordNumber")).toBe(44); expect(header.scaled("receiverX")).toBe(1002); expect(converted.textualHeaders[0]?.text).toMatch(/SMARTSOLO SEG-D 8058/);
  });
});
