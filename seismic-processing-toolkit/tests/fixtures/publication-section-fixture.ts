import type { PublicationSectionModel } from "../../src/visualization/section";
import { referenceStylePublicationSectionOptions } from "../../src/visualization/section";

/** Deterministic, synthetic 10-second gather for publication renderer tests. It contains no field data. */
export function publicationSectionFixture(): PublicationSectionModel {
  const traceCount = 100; const sampleIntervalSeconds = 0.01; const sampleCount = 1001;
  const traces = Array.from({ length: traceCount }, (_, traceId) => {
    const samples = new Float32Array(sampleCount); const receiver = traceId + 1;
    for (let sample = 0; sample < sampleCount; sample += 1) { const time = sample * sampleIntervalSeconds; const dip = 1.2 + traceId * 0.018; const hyperbola = 3 + Math.sqrt(0.35 ** 2 + ((traceId - 50) * 0.018) ** 2); const quiet = time > 4.4 && time < 5.3 ? 0.25 : 1; const wavelet = (centre: number, amplitude: number, width: number) => { const point = (time - centre) / width; return amplitude * (1 - 2 * point ** 2) * Math.exp(-(point ** 2)); }; samples[sample] = quiet * (wavelet(dip, 0.75, 0.045) + wavelet(hyperbola, -1, 0.06) + wavelet(7.1 - traceId * 0.01, 0.45, 0.08)); }
    return { traceId, samples, receiverNumber: receiver, receiverStation: 1_000 + receiver * 5 };
  });
  return { traces, sampleIntervalSeconds, options: { ...referenceStylePublicationSectionOptions(), titleLine1: "4: 50–160 Hz", titleLine2: "10 s", timeEndSeconds: 10 }, processingFlowLabel: "Synthetic display fixture" };
}
