import { PublicationSectionRenderer, type PublicationSectionModel } from "../../visualization/section";
import { PngExportService } from "./png-export-service";

/** A PNG export of the seismic render model, never a capture of the browser interface. */
export class PublicationSectionExport {
  public static async export(model: PublicationSectionModel): Promise<Blob> {
    return PngExportService.render((context) => { PublicationSectionRenderer.draw(context, model); }, { width: model.options.width, height: model.options.height, background: model.options.background === "white" ? "#ffffff" : "transparent" });
  }
}
