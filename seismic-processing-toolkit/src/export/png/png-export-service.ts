import { ExportSizeLimitError, PngExportError } from "../../core/errors/errors";

export interface PngExportOptions { readonly width: number; readonly height: number; readonly background?: string; readonly maximumPixels?: number; }
export type PngContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type PngDraw = (context: PngContext, width: number, height: number) => void | Promise<void>;

export function validatePngDimensions(options: PngExportOptions): void {
  const maximumPixels = options.maximumPixels ?? 64_000_000;
  if (!Number.isInteger(options.width) || !Number.isInteger(options.height) || options.width < 1 || options.height < 1) throw new PngExportError("PNG dimensions must be positive integers.", { severity: "error", code: "PNG_INVALID_DIMENSIONS", message: "Specify a positive pixel width and height.", recoverable: false });
  const pixels = options.width * options.height;
  if (!Number.isSafeInteger(pixels) || pixels > maximumPixels) { const requestedMiB = pixels * 4 / 1024 / 1024; const maximumMiB = maximumPixels * 4 / 1024 / 1024; throw new ExportSizeLimitError("Requested PNG dimensions exceed the safe canvas limit.", { severity: "error", code: "PNG_PIXEL_LIMIT", message: `Requested image requires approximately ${requestedMiB.toFixed(1)} MiB of RGBA pixel memory, exceeding the configured ${maximumMiB.toFixed(1)} MiB export limit.`, recoverable: false }); }
}

/** Renders a new requested-size canvas, so export never mutates an active viewport or relies on a screenshot. */
export class PngExportService {
  public static async render(draw: PngDraw, options: PngExportOptions): Promise<Blob> {
    validatePngDimensions(options);
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(options.width, options.height); const context = canvas.getContext("2d"); if (!context) throw new PngExportError("Unable to create a PNG canvas context.", { severity: "error", code: "PNG_CONTEXT_UNAVAILABLE", message: "The browser did not provide a 2D canvas context.", recoverable: false });
      this.prepare(context, options); await draw(context, options.width, options.height); return canvas.convertToBlob({ type: "image/png" });
    }
    if (typeof document === "undefined") throw new PngExportError("PNG export requires Canvas or OffscreenCanvas support.", { severity: "error", code: "PNG_CANVAS_UNAVAILABLE", message: "No browser canvas implementation is available.", recoverable: false });
    const canvas = document.createElement("canvas"); canvas.width = options.width; canvas.height = options.height; const context = canvas.getContext("2d"); if (!context) throw new PngExportError("Unable to create a PNG canvas context.", { severity: "error", code: "PNG_CONTEXT_UNAVAILABLE", message: "The browser did not provide a 2D canvas context.", recoverable: false });
    this.prepare(context, options); await draw(context, options.width, options.height);
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new PngExportError("Canvas failed to encode PNG output.", { severity: "error", code: "PNG_ENCODE_FAILED", message: "The browser returned no PNG blob.", recoverable: false })), "image/png"));
  }
  private static prepare(context: PngContext, options: PngExportOptions): void { context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, options.width, options.height); if (options.background !== undefined && options.background !== "transparent") { context.fillStyle = options.background; context.fillRect(0, 0, options.width, options.height); } }
}
