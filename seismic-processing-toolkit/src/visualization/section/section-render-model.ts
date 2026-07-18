/** Immutable input for a publication section.  These values describe display only; samples stay untouched. */
export interface PublicationSectionTrace {
  readonly traceId: number;
  readonly samples: Float32Array;
  readonly receiverNumber?: number;
  readonly receiverStation?: number;
  readonly offset?: number;
  readonly headers?: Readonly<Record<string, number | undefined>>;
}

export type PublicationXAxis = "trace-index" | "receiver-number" | "receiver-station" | "offset" | "custom-header";
export type SectionNormalization = "none" | "global-rms" | "global-percentile" | "trace-rms" | "agc";
export type SectionClipMode = "absolute" | "rms-multiple" | "percentile";
export type SectionInterpolation = "nearest" | "linear";
export type SectionVerticalInterpolation = SectionInterpolation | "antialiased";

export interface PublicationSectionOptions {
  readonly width: number;
  readonly height: number;
  readonly titleLine1: string;
  readonly titleLine2: string;
  readonly xAxisLabel: string;
  readonly yAxisLabel?: string;
  readonly xCoordinate: PublicationXAxis;
  readonly customHeaderField?: string;
  readonly timeStartSeconds: number;
  readonly timeEndSeconds: number;
  readonly polarity: "positive-black" | "positive-white";
  readonly normalization: SectionNormalization;
  readonly clipMode: SectionClipMode;
  readonly clipValue: number;
  readonly gamma: number;
  readonly agcWindowSeconds?: number;
  readonly horizontalInterpolation: SectionInterpolation;
  readonly verticalInterpolation: SectionVerticalInterpolation;
  readonly showFrame: boolean;
  readonly showXAxis: boolean;
  readonly showYAxis: boolean;
  readonly showXGrid: boolean;
  readonly showYGrid: boolean;
  readonly xTickInterval?: number;
  readonly yTickIntervalSeconds?: number;
  readonly showTimeLabels: boolean;
  readonly background: "white" | "transparent";
  readonly zeroAmplitudeGray: number;
  readonly fontFamily: string;
  readonly titleFontSize: number;
  readonly axisFontSize: number;
  readonly tickFontSize: number;
  readonly reverseTraceOrder: boolean;
  readonly equallySpacedTraces: boolean;
  readonly wiggleOverlay: boolean;
  readonly wiggleOpacity: number;
}

export interface PublicationSectionModel {
  readonly traces: readonly PublicationSectionTrace[];
  readonly sampleIntervalSeconds: number;
  readonly options: PublicationSectionOptions;
  readonly processingFlowLabel?: string;
}

/** Reference-like portrait settings.  Display conditioning remains separate from the processing graph. */
export function referenceStylePublicationSectionOptions(): PublicationSectionOptions {
  return {
    width: 1200,
    height: 2400,
    titleLine1: "",
    titleLine2: "",
    xAxisLabel: "Receiver",
    yAxisLabel: "Time (s)",
    xCoordinate: "receiver-number",
    timeStartSeconds: 0,
    timeEndSeconds: 10,
    polarity: "positive-black",
    normalization: "global-percentile",
    clipMode: "percentile",
    clipValue: 99,
    gamma: 0.8,
    horizontalInterpolation: "linear",
    verticalInterpolation: "antialiased",
    showFrame: true,
    showXAxis: true,
    showYAxis: true,
    showXGrid: false,
    showYGrid: false,
    showTimeLabels: true,
    background: "white",
    zeroAmplitudeGray: 128,
    fontFamily: "Arial, Helvetica, sans-serif",
    titleFontSize: 28,
    axisFontSize: 22,
    tickFontSize: 18,
    reverseTraceOrder: false,
    equallySpacedTraces: false,
    wiggleOverlay: false,
    wiggleOpacity: 0.45
  };
}

export function sectionTraceCoordinate(trace: PublicationSectionTrace, index: number, options: PublicationSectionOptions): number {
  if (options.xCoordinate === "trace-index") return index + 1;
  if (options.xCoordinate === "receiver-number") return trace.receiverNumber ?? index + 1;
  if (options.xCoordinate === "receiver-station") return trace.receiverStation ?? index + 1;
  if (options.xCoordinate === "offset") return trace.offset ?? index + 1;
  return options.customHeaderField ? trace.headers?.[options.customHeaderField] ?? index + 1 : index + 1;
}
