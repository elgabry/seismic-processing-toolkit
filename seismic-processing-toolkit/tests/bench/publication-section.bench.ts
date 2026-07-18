import { bench, describe } from "vitest";
import { sectionAmplitudeStatistics, traceRms } from "../../src/visualization/section";
import { publicationSectionFixture } from "../fixtures/publication-section-fixture";

const model = publicationSectionFixture();

describe("publication section render preparation", () => {
  bench("bounded global percentile estimation (100 × 1001)", () => { sectionAmplitudeStatistics(model.traces, 99); });
  bench("trace RMS preparation (100 × 1001)", () => { for (const trace of model.traces) traceRms(trace.samples); });
});
