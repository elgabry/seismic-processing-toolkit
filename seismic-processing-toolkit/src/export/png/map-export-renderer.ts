import type { GeometryTable } from "../../geometry/geometry-table";
import { GeometryMapRenderer } from "../../visualization/map/geometry-map-renderer";
import { fitViewport } from "../../visualization/map/map-transforms";
import type { MapViewport } from "../../visualization/map/types";
import { PngExportService, type PngExportOptions } from "./png-export-service";

export interface MapPngOptions extends PngExportOptions { readonly viewport?: MapViewport; readonly selectedTraceIds?: ReadonlySet<number>; readonly findingTraceIds?: ReadonlySet<number>; readonly includeLegend?: boolean; }

export class MapExportRenderer {
  public static async export(table: GeometryTable, options: MapPngOptions): Promise<Blob> {
    const bounds = table.bounds(); if (!bounds) throw new RangeError("A geometry map PNG requires at least one finite point.");
    const viewport = options.viewport ?? fitViewport(bounds, options.width, options.height);
    return PngExportService.render((context, width, height) => {
      new GeometryMapRenderer().render(context, table, viewport, {
        width,
        height,
        ...(options.background === undefined ? {} : { background: options.background }),
        ...(options.selectedTraceIds === undefined ? {} : { selectedTraceIds: options.selectedTraceIds }),
        ...(options.findingTraceIds === undefined ? {} : { findingTraceIds: options.findingTraceIds })
      });
      if (options.includeLegend ?? true) { context.fillStyle = "#dbeef5"; context.font = "12px ui-monospace, monospace"; context.fillText("● source   ● receiver   ● selected/QC", 8, height - 10); }
    }, options);
  }
}
