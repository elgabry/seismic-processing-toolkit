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

/** Synthetic reference-style section: 100 receivers, 10 seconds, dipping and hyperbolic black/white events. */
export const publicationSegyUpload = {
  name: "publication-section-reference-test.segy", mimeType: "application/octet-stream",
  buffer: Buffer.from(makeSegy({ sampleIntervalMicroseconds: 10_000, traces: Array.from({ length: 100 }, (_, traceId) => ({ fieldRecordNumber: 4, sourceX: 100_000, receiverX: 100_000 + (traceId + 1) * 500, coordinateScalar: -100, samples: Array.from({ length: 1001 }, (_, sample) => { const time = sample * .01; const wavelet = (centre: number, amplitude: number, width: number) => { const point = (time - centre) / width; return amplitude * (1 - 2 * point ** 2) * Math.exp(-(point ** 2)); }; const dip = 1.2 + traceId * .018; const hyperbola = 3 + Math.sqrt(.35 ** 2 + ((traceId - 50) * .018) ** 2); const quiet = time > 4.4 && time < 5.3 ? .25 : 1; return quiet * (wavelet(dip, .75, .045) + wavelet(hyperbola, -1, .06) + wavelet(7.1 - traceId * .01, .45, .08)); }) })) }))
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
