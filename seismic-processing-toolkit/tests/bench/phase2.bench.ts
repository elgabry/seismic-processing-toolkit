import { bench, describe } from "vitest";
import { CsvEncoder } from "../../src/export/csv";
import { decodeSmartSolo8058Samples, SmartSolo8058Reader } from "../../src/io/segd/smartsolo8058";
import { BlobOutputSink } from "../../src/io/sink/output-sink";
import { MemorySource } from "../fixtures/segy-fixture";
import { makeSmartSolo8058 } from "../fixtures/smartsolo8058-fixture";

const smartSolo = makeSmartSolo8058({ traces: Array.from({ length: 64 }, (_, traceId) => ({ samples: Array.from({ length: 256 }, (_, sample) => Math.sin(traceId + sample * 0.05)) })) });
const sampleBytes = new ArrayBuffer(4096 * 4); const sampleView = new DataView(sampleBytes); for (let index = 0; index < 4096; index += 1) sampleView.setFloat32(index * 4, Math.sin(index * 0.1), false);

describe("phase 2 throughput", () => {
  bench("SmartSolo 8058 trace index", async () => { await SmartSolo8058Reader.open(new MemorySource(smartSolo.slice(0), "benchmark.segd")); });
  bench("SmartSolo IEEE Float32 decode", () => { decodeSmartSolo8058Samples(new DataView(sampleBytes), 4096, new Float32Array(4096)); });
  bench("streaming CSV row encoding", async () => { const sink = new BlobOutputSink(); const encoder = new CsvEncoder(sink); for (let index = 0; index < 256; index += 1) await encoder.writeRow([index, Math.sin(index), "deterministic"]); await encoder.close(); });
});
