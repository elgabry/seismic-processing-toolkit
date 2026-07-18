import { describe, expect, it } from "vitest";
import { amplitudeToGray, automaticTickInterval, displayClipAmplitude, publicationSectionLayout, referenceStylePublicationSectionOptions, sectionAmplitudeStatistics, sectionCoordinateToPixel, sectionPixelToTime, sectionTimeToPixel, sectionTraceCoordinate, traceRms } from "../../src/visualization/section";
import { publicationSectionFixture } from "../fixtures/publication-section-fixture";

describe("publication grayscale section model", () => {
  it("maps positive-black polarity symmetrically around the configured neutral gray", () => {
    const options = { polarity: "positive-black" as const, gamma: 1, zeroAmplitudeGray: 128 };
    expect(amplitudeToGray(1, 1, options)).toBe(0);
    expect(amplitudeToGray(0, 1, options)).toBe(128);
    expect(amplitudeToGray(-1, 1, options)).toBe(255);
    expect(amplitudeToGray(1, 1, { ...options, polarity: "positive-white" })).toBe(255);
  });

  it("applies gamma, clipping, and non-finite neutral mapping without asymmetric gain", () => {
    const options = { polarity: "positive-black" as const, gamma: 0.5, zeroAmplitudeGray: 120 };
    expect(amplitudeToGray(.25, 1, options)).toBeLessThan(amplitudeToGray(.25, 1, { ...options, gamma: 1 }));
    expect(amplitudeToGray(99, 1, options)).toBe(amplitudeToGray(1, 1, options));
    expect(amplitudeToGray(Number.NaN, 1, options)).toBe(120);
  });

  it("estimates global percentile through a bounded typed histogram and supplies RMS clip values", () => {
    const model = publicationSectionFixture(); const statistics = sectionAmplitudeStatistics(model.traces, 99);
    expect(statistics.sampleCount).toBe(100_100); expect(statistics.percentile).toBeGreaterThan(0); expect(statistics.percentile).toBeLessThanOrEqual(1.01); expect(displayClipAmplitude("global-percentile", "percentile", 99, statistics)).toBe(statistics.percentile); expect(displayClipAmplitude("global-rms", "rms-multiple", 2, statistics)).toBeCloseTo(statistics.rms * 2);
  });

  it("stabilizes empty trace RMS and preserves variable-length-trace coordinates", () => {
    expect(traceRms(new Float32Array(10))).toBe(0); const model = publicationSectionFixture(); expect(sectionTraceCoordinate(model.traces[4]!, 4, model.options)).toBe(5); expect(sectionTraceCoordinate({ traceId: 1, samples: new Float32Array([1]), receiverNumber: 10, receiverStation: 1200 }, 1, { ...model.options, xCoordinate: "receiver-station" })).toBe(1200);
  });

  it("lays out a tall page with time increasing downward and readable 1/2/5 ticks", () => {
    const options = referenceStylePublicationSectionOptions(); const layout = publicationSectionLayout(options); expect(layout.plot.y).toBeGreaterThan(options.height * .06); expect(sectionTimeToPixel(0, options, layout)).toBeLessThan(sectionTimeToPixel(10, options, layout)); expect(sectionPixelToTime(sectionTimeToPixel(5, options, layout), options, layout)).toBeCloseTo(5); expect(sectionCoordinateToPixel(20, 20, 100, layout)).toBeCloseTo(layout.plot.x); expect(sectionCoordinateToPixel(100, 20, 100, layout)).toBeCloseTo(layout.plot.x + layout.plot.width); expect(automaticTickInterval(10)).toBe(2); expect(automaticTickInterval(0.7)).toBeCloseTo(.2);
  });
});
