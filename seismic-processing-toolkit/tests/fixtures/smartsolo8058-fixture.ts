export interface SmartSoloFixtureTrace { readonly samples: readonly number[]; readonly traceNumber?: number; readonly receiverEastingCentimetres?: number; readonly receiverNorthingCentimetres?: number; readonly receiverElevationCentimetres?: number; readonly sourceEastingCentimetres?: number; readonly sourceNorthingCentimetres?: number; readonly sourceElevationCentimetres?: number; readonly receiverSerial?: number; readonly channelNumber?: number; }
export interface SmartSoloFixtureOptions { readonly revision?: "1.0" | "2.1"; readonly gatherType?: number; readonly sampleIntervalMicroseconds?: number; readonly fieldRecordNumber?: number; readonly sourceLine?: number; readonly sourcePoint?: number; readonly traces: readonly SmartSoloFixtureTrace[]; }

function writeUint24(bytes: Uint8Array, offset: number, value: number): void { bytes[offset] = (value >>> 16) & 0xff; bytes[offset + 1] = (value >>> 8) & 0xff; bytes[offset + 2] = value & 0xff; }
function writeBcd(bytes: Uint8Array, offset: number, digits: number): void { const value = Math.max(0, Math.min(9999, digits)); bytes[offset] = (Math.floor(value / 1000) % 10 << 4) | (Math.floor(value / 100) % 10); bytes[offset + 1] = (Math.floor(value / 10) % 10 << 4) | value % 10; }

/** Minimal legal synthetic layout matching only the legacy-documented 8058 fields. */
export function makeSmartSolo8058(options: SmartSoloFixtureOptions): ArrayBuffer {
  const dataOffset = 2656; const traceBytes = options.traces.reduce((total, trace) => total + 244 + trace.samples.length * 4, 0); const buffer = new ArrayBuffer(dataOffset + traceBytes); const bytes = new Uint8Array(buffer); const view = new DataView(buffer);
  bytes[2] = 0x80; bytes[3] = 0x58; bytes[11] = 0x20; bytes[22] = 16; bytes[23] = options.gatherType ?? 0; bytes[28] = 0x16; bytes[29] = 0x00; bytes[30] = 0x32; bytes[31] = 0x32;
  const revision = options.revision ?? "1.0"; bytes[42] = Number(revision[0] ?? "1"); bytes[43] = Number(revision[2] ?? "0"); writeUint24(bytes, 67, options.sourceLine ?? 7); writeUint24(bytes, 72, options.sourcePoint ?? 42);
  const extended = 608; view.setUint32(extended + 4, options.sampleIntervalMicroseconds ?? 1000, false); view.setUint32(extended + 8, options.traces.length, false); view.setUint32(extended + 12, options.traces[0]?.samples.length ?? 0, false); view.setUint32(extended + 32, 1, false); view.setUint16(extended + 36, options.gatherType ?? 0, false);
  const external = 1632; view.setUint32(external, options.fieldRecordNumber ?? 12, false); view.setInt32(external + 8, 100_000, false); view.setInt32(external + 12, 200_000, false); view.setInt32(external + 16, 1_500, false);
  let offset = dataOffset;
  for (let index = 0; index < options.traces.length; index += 1) {
    const trace = options.traces[index] ?? { samples: [] }; writeBcd(bytes, offset + 4, trace.traceNumber ?? index + 1); writeUint24(bytes, offset + 27, trace.samples.length); view.setUint32(offset + 62, options.fieldRecordNumber ?? 12, false); view.setUint32(offset + 80, trace.traceNumber ?? index + 1, false);
    view.setInt32(offset + 84, trace.receiverEastingCentimetres ?? (100_000 + index * 100), false); view.setInt32(offset + 88, trace.receiverNorthingCentimetres ?? 200_000, false); view.setInt32(offset + 92, trace.receiverElevationCentimetres ?? 1_500, false);
    view.setInt32(offset + 96, trace.sourceEastingCentimetres ?? 100_000, false); view.setInt32(offset + 100, trace.sourceNorthingCentimetres ?? 200_000, false); view.setInt32(offset + 104, trace.sourceElevationCentimetres ?? 1_500, false);
    view.setUint32(offset + 181, trace.receiverSerial ?? index + 100, false); bytes[offset + 185] = trace.channelNumber ?? index + 1;
    for (let sample = 0; sample < trace.samples.length; sample += 1) view.setFloat32(offset + 244 + sample * 4, trace.samples[sample] ?? 0, false);
    offset += 244 + trace.samples.length * 4;
  }
  return buffer;
}
