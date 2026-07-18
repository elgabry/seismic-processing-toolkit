/** Deterministic CP037 subset used by SEG-Y textual headers; unassigned controls render as spaces. */
const EBCDIC_TO_ASCII = new Uint8Array([
  32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,
  32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,
  32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,46,60,40,43,124,38,32,32,32,32,32,32,32,32,32,33,36,
  42,41,59,32,45,47,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,44,37,95,62,63,32,32,32,32,32,32,
  32,32,32,32,32,96,58,35,64,39,61,34,32,97,98,99,100,101,102,103,104,105,32,32,32,32,32,32,32,106,
  107,108,109,110,111,112,113,114,32,32,32,32,32,32,32,126,115,116,117,118,119,120,121,122,32,32,32,32,
  32,32,94,32,32,32,32,32,32,32,32,32,91,93,32,32,32,32,123,65,66,67,68,69,70,71,72,73,32,32,32,32,
  32,32,125,74,75,76,77,78,79,80,81,82,32,32,32,32,32,32,92,32,83,84,85,86,87,88,89,90,32,32,32,32,
  32,32,48,49,50,51,52,53,54,55,56,57,32,32,32,32,32,32
]);

export type TextualEncoding = "ascii" | "ebcdic";

function printableScore(text: string): number {
  let score = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 32 && code <= 126) score += 1;
  }
  if (/^C\s{0,2}\d{1,2}|^C\d{2}/m.test(text)) score += 150;
  if (/SEG[ -]?Y|CLIENT|LINE|JOB|END TEXTUAL HEADER/i.test(text)) score += 80;
  return score;
}

function decode(bytes: Uint8Array, encoding: TextualEncoding): string {
  let result = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const raw = bytes[index] ?? 0;
    const code = encoding === "ebcdic" ? (EBCDIC_TO_ASCII[raw] ?? 32) : raw;
    result += String.fromCharCode(code >= 32 && code <= 126 ? code : 32);
  }
  return result;
}

/** A lossless textual header: raw bytes remain authoritative until explicitly edited. */
export class TextualHeader {
  public readonly rawBytes: Uint8Array;
  public readonly text: string;
  public readonly encoding: TextualEncoding;

  public constructor(raw: ArrayBuffer | Uint8Array, encoding: TextualEncoding) {
    this.rawBytes = raw instanceof Uint8Array ? raw.slice() : new Uint8Array(raw.slice(0));
    this.encoding = encoding;
    this.text = decode(this.rawBytes, encoding);
  }

  public static detect(raw: ArrayBuffer | Uint8Array): { readonly header: TextualHeader; readonly scores: Readonly<Record<TextualEncoding, number>> } {
    const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    const ascii = decode(bytes, "ascii");
    const ebcdic = decode(bytes, "ebcdic");
    const scores = { ascii: printableScore(ascii), ebcdic: printableScore(ebcdic) };
    return { header: new TextualHeader(bytes, scores.ebcdic > scores.ascii ? "ebcdic" : "ascii"), scores };
  }

  /** Standard textual headers contain forty 80-character cards. */
  public cards(): readonly string[] {
    const cards: string[] = [];
    for (let offset = 0; offset < this.text.length; offset += 80) cards.push(this.text.slice(offset, offset + 80));
    return cards;
  }

  /** Returns a new header; unknown original bytes are retained when no edit is requested. */
  public withCards(cards: readonly string[], encoding = this.encoding): TextualHeader {
    const padded = cards.slice(0, 40).map((card) => card.slice(0, 80).padEnd(80, " "));
    while (padded.length < 40) padded.push(" ".repeat(80));
    const bytes = new Uint8Array(3200);
    for (let index = 0; index < bytes.length; index += 1) {
      const char = padded[Math.floor(index / 80)]?.charCodeAt(index % 80) ?? 32;
      bytes[index] = encoding === "ascii" ? char : asciiToEbcdic(char);
    }
    return new TextualHeader(bytes, encoding);
  }
}

function asciiToEbcdic(code: number): number {
  for (let index = 0; index < EBCDIC_TO_ASCII.length; index += 1) if (EBCDIC_TO_ASCII[index] === code) return index;
  return 0x40;
}

export function encodeTextualHeader(header: TextualHeader): Uint8Array { return header.rawBytes.slice(); }
