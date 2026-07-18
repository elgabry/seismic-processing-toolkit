export type HeaderNumericType = "int16" | "uint16" | "int32" | "uint32";

export interface TraceHeaderFieldDescriptor {
  readonly id: string;
  readonly displayName: string;
  /** Zero-based byte offset within the 240-byte standard trace header. */
  readonly offset: number;
  readonly type: HeaderNumericType;
  readonly rawUnit: string;
  readonly scalarField?: "coordinateScalar" | "elevationScalar";
  readonly description: string;
  readonly editable: boolean;
  readonly enumValues?: Readonly<Record<number, string>>;
}

const field = (id: string, displayName: string, offset: number, type: HeaderNumericType, rawUnit: string, description: string, editable = true, scalarField?: "coordinateScalar" | "elevationScalar"): TraceHeaderFieldDescriptor =>
  ({ id, displayName, offset, type, rawUnit, description, editable, ...(scalarField ? { scalarField } : {}) });

/** Descriptor-driven schema keeps SEG-Y byte locations out of application and DSP code. */
export const TraceHeaderSchema: readonly TraceHeaderFieldDescriptor[] = [
  field("traceSequenceLine", "Trace sequence number within line", 0, "int32", "count", "Trace sequence number within the line."),
  field("traceSequenceFile", "Trace sequence number within file", 4, "int32", "count", "Trace sequence number within the file."),
  field("fieldRecordNumber", "Original field record number", 8, "int32", "count", "Field record / FFID."),
  field("traceNumberWithinFieldRecord", "Trace number within field record", 12, "int32", "count", "Channel number within the field record."),
  field("energySourcePoint", "Energy source point", 16, "int32", "count", "Source-point identifier."),
  field("cdp", "CDP ensemble number", 20, "int32", "count", "CDP/CMP identifier."),
  field("traceNumberWithinEnsemble", "Trace number within ensemble", 24, "int32", "count", "Trace number in ensemble."),
  field("traceIdentificationCode", "Trace identification code", 28, "int16", "code", "SEG-Y trace identification code."),
  field("offset", "Source-receiver offset", 36, "int32", "header coordinate unit", "Signed header offset."),
  field("receiverElevation", "Receiver group elevation", 40, "int32", "raw", "Receiver elevation.", true, "elevationScalar"),
  field("sourceElevation", "Surface elevation at source", 44, "int32", "raw", "Source elevation.", true, "elevationScalar"),
  field("sourceDepth", "Source depth below surface", 48, "int32", "raw", "Source depth.", true, "elevationScalar"),
  field("elevationScalar", "Elevation/depth scalar", 68, "int16", "scalar", "Positive multiplies; negative divides."),
  field("coordinateScalar", "Coordinate scalar", 70, "int16", "scalar", "Positive multiplies; negative divides."),
  field("sourceX", "Source X", 72, "int32", "raw", "Source horizontal X coordinate.", true, "coordinateScalar"),
  field("sourceY", "Source Y", 76, "int32", "raw", "Source horizontal Y coordinate.", true, "coordinateScalar"),
  field("receiverX", "Receiver X", 80, "int32", "raw", "Receiver horizontal X coordinate.", true, "coordinateScalar"),
  field("receiverY", "Receiver Y", 84, "int32", "raw", "Receiver horizontal Y coordinate.", true, "coordinateScalar"),
  field("coordinateUnits", "Coordinate units", 88, "int16", "code", "0 unknown; 1 length; 2 arc seconds; 3 decimal degrees; 4 DMS."),
  field("delayRecordingTimeMilliseconds", "Delay recording time", 108, "int16", "ms", "Time origin delay in milliseconds."),
  field("sampleCount", "Samples in trace", 114, "uint16", "samples", "Per-trace sample count override."),
  field("sampleIntervalMicroseconds", "Sample interval", 116, "uint16", "microseconds", "Per-trace sample interval override."),
  field("correlated", "Correlated data traces", 124, "int16", "code", "Whether data were correlated."),
  field("sweepStartFrequency", "Sweep start frequency", 126, "int16", "Hz", "Vibroseis sweep start frequency."),
  field("sweepEndFrequency", "Sweep end frequency", 128, "int16", "Hz", "Vibroseis sweep end frequency."),
  field("sweepLengthMilliseconds", "Sweep length", 130, "int16", "ms", "Vibroseis sweep length."),
  field("inline", "Inline number", 188, "int32", "count", "Revision 1 inline number."),
  field("crossline", "Crossline number", 192, "int32", "count", "Revision 1 crossline number.")
];

export const TraceHeaderFieldsById = new Map(TraceHeaderSchema.map((descriptor) => [descriptor.id, descriptor]));
