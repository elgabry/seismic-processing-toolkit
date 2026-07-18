/** SmartSolo SEG-D 8058 conversion remains operational in the preserved v2.2 browser adapter. */
export const legacySegdViewerPath = "./legacy/segy-wiggle-viewer-v2.2.html";
export function openLegacySegdViewer(): Window | null { return window.open(legacySegdViewerPath, "_blank", "noopener"); }
