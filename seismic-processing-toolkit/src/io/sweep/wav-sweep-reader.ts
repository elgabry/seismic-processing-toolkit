import { SweepFormatError } from "../../core/errors/errors";
import type { SweepSignal } from "../../sweep/sweep-signal";
import type { SweepFileReader } from "./sweep-file-reader";

/** Minimal uncompressed PCM/IEEE WAV reader; multi-channel files become one candidate per channel. */
export class WavSweepReader implements SweepFileReader {
  public readonly id = "wav";
  public canRead(file: File): boolean { return /\.wav$/i.test(file.name) || file.type === "audio/wav" || file.type === "audio/x-wav"; }
  public async read(file: File, signal?: AbortSignal): Promise<readonly SweepSignal[]> {
    const bytes = await file.arrayBuffer(); if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    const view = new DataView(bytes);
    if (view.byteLength < 44 || this.tag(view, 0) !== "RIFF" || this.tag(view, 8) !== "WAVE") throw this.error(file, "Not a RIFF/WAVE file.");
    let cursor = 12; let format = 0; let channels = 0; let rate = 0; let bits = 0; let dataOffset = 0; let dataLength = 0;
    while (cursor + 8 <= view.byteLength) {
      const id = this.tag(view, cursor); const length = view.getUint32(cursor + 4, true); const payload = cursor + 8;
      if (payload + length > view.byteLength) throw this.error(file, "WAV chunk extends past the file end.");
      if (id === "fmt ") { format = view.getUint16(payload, true); channels = view.getUint16(payload + 2, true); rate = view.getUint32(payload + 4, true); bits = view.getUint16(payload + 14, true); }
      if (id === "data") { dataOffset = payload; dataLength = length; break; }
      cursor = payload + length + (length % 2);
    }
    if (!dataOffset || !channels || !rate || !bits || (format !== 1 && format !== 3)) throw this.error(file, "Only PCM and IEEE-float WAV files with fmt/data chunks are supported.");
    const bytesPerSample = bits / 8; if (!Number.isInteger(bytesPerSample) || ![1, 2, 3, 4, 8].includes(bytesPerSample)) throw this.error(file, `Unsupported WAV bit depth ${bits}.`);
    const frames = Math.floor(dataLength / (channels * bytesPerSample)); const output: SweepSignal[] = [];
    for (let channel = 0; channel < channels; channel += 1) {
      const samples = new Float32Array(frames);
      for (let frame = 0; frame < frames; frame += 1) {
        const offset = dataOffset + (frame * channels + channel) * bytesPerSample;
        samples[frame] = format === 3 ? (bits === 32 ? view.getFloat32(offset, true) : view.getFloat64(offset, true)) : this.pcm(view, offset, bits);
      }
      output.push({ id: crypto.randomUUID(), name: `${file.name} channel ${channel + 1}`, samples, sampleIntervalSeconds: 1 / rate, startTimeSeconds: 0, units: "volts", source: "external-file", metadata: { reader: this.id, channel: channel + 1, channels, sampleRateHz: rate } });
    }
    return output;
  }
  private tag(view: DataView, offset: number): string { return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3)); }
  private pcm(view: DataView, offset: number, bits: number): number { if (bits === 8) return (view.getUint8(offset) - 128) / 128; if (bits === 16) return view.getInt16(offset, true) / 32768; if (bits === 24) { const value = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16); return ((value & 0x800000) === 0 ? value : value - 0x1000000) / 0x800000; } return view.getInt32(offset, true) / 0x80000000; }
  private error(file: File, message: string): SweepFormatError { return new SweepFormatError(message, { severity: "error", code: "INVALID_WAV", message, fileName: file.name, recoverable: false }); }
}
