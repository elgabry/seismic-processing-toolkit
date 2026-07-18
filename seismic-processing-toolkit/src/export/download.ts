/** Triggers a local browser download without sending data to a remote service. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const anchor = document.createElement("a"); const url = URL.createObjectURL(blob);
  anchor.href = url; anchor.download = fileName; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
