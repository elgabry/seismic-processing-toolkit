import { Buffer } from "node:buffer";
import { makeSegy } from "../../fixtures/segy-fixture";
import { makeSmartSolo8058 } from "../../fixtures/smartsolo8058-fixture";

export const segyUpload = {
  name: "browser-fixture.segy", mimeType: "application/octet-stream",
  buffer: Buffer.from(makeSegy({ sampleIntervalMicroseconds: 1000, traces: [
    { samples: [0, 1, 0, -1, 0], sourceX: 100_000, receiverX: 100_100, coordinateScalar: -100, fieldRecordNumber: 10 },
    { samples: [0, .5, 0, -.5, 0], sourceX: 100_000, receiverX: 100_200, coordinateScalar: -100, fieldRecordNumber: 10 },
    { samples: [0, .25, 0, -.25, 0], sourceX: 100_000, receiverX: 100_300, coordinateScalar: -100, fieldRecordNumber: 11 }
  ] }))
};

export const noGeometrySegyUpload = {
  name: "missing-geometry.segy", mimeType: "application/octet-stream",
  buffer: Buffer.from(makeSegy({ traces: [{ samples: [0, 1, 0] }, { samples: [0, -1, 0] }] }))
};

export const smartSoloUpload = {
  name: "browser-smartsolo.segd", mimeType: "application/octet-stream",
  buffer: Buffer.from(makeSmartSolo8058({ sampleIntervalMicroseconds: 2000, traces: [
    { samples: [0, 1.25, -2.5], receiverEastingCentimetres: 100_100 },
    { samples: [0, 3.5, -1], receiverEastingCentimetres: 100_200 },
    { samples: [0, .75, -.75], receiverEastingCentimetres: 100_300 }
  ] }))
};

/** Several bounded batches, but still deliberately small enough for reliable CI cancellation tests. */
export const moderateSmartSoloUpload = {
  name: "moderate-smartsolo.segd", mimeType: "application/octet-stream",
  buffer: Buffer.from(makeSmartSolo8058({ sampleIntervalMicroseconds: 1000, traces: Array.from({ length: 20 }, (_, traceId) => ({ samples: Array<number>(60_000).fill(traceId % 2 === 0 ? 0.25 : -0.25), receiverEastingCentimetres: 100_000 + traceId * 100 })) }))
};

export const unsupportedUpload = { name: "unsupported.segd", mimeType: "application/octet-stream", buffer: Buffer.from(new Uint8Array(300).fill(7)) };
