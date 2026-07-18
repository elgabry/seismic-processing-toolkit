/** Codec interface is deliberately destination-oriented to avoid sample-loop allocations. */
export interface SampleCodec {
  readonly formatCode: number;
  readonly bytesPerSample: number;
  readonly name: string;
  decode(source: DataView, sourceByteOffset: number, sampleCount: number, littleEndian: boolean, destination: Float32Array, destinationOffset?: number): void;
  encode?(source: Float32Array, sourceOffset: number, sampleCount: number, destination: DataView, destinationByteOffset: number, littleEndian: boolean): void;
}
