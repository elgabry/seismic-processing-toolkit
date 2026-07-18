import { expect, test } from "@playwright/test";
import { monitorBrowserErrors } from "./fixtures/browser-errors";
import { smartSoloUpload, unsupportedUpload } from "./fixtures/seismic-fixtures";

test("converts the supported SmartSolo fixture in a worker and reopens the local SEG-Y", async ({ page }) => {
  const assertBrowserErrors = monitorBrowserErrors(page); await page.goto("/"); await page.getByTestId("smartsolo-file-input").setInputFiles(smartSoloUpload);
  const dialog = page.getByRole("dialog"); await expect(dialog.locator("#smartsolo-summary")).toContainText("Supported SmartSolo 8058 revision 1.0"); const download = page.waitForEvent("download"); await dialog.getByRole("button", { name: "Convert and download SEG-Y" }).click(); await download; await expect(page.getByTestId("dataset-name")).toContainText("browser-smartsolo.sgy · 3 traces"); assertBrowserErrors();
});

test("reports an unsupported SmartSolo file without replacing the current dataset", async ({ page }) => {
  const assertBrowserErrors = monitorBrowserErrors(page); await page.goto("/"); await page.getByTestId("smartsolo-file-input").setInputFiles(unsupportedUpload); await expect(page.getByRole("dialog").locator("#smartsolo-status")).toContainText(/not a supported SmartSolo|unsupported/i); await expect(page.getByTestId("dataset-name")).toHaveText("No local data loaded"); assertBrowserErrors();
});
