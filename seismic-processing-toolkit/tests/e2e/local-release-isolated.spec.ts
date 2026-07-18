import { expect, test } from "@playwright/test";
import { monitorBrowserErrors } from "./fixtures/browser-errors";
import { expectPng } from "./fixtures/downloads";
import { segyUpload, smartSoloUpload } from "./fixtures/seismic-fixtures";

test("cross-origin-isolated local release keeps workers and local exports functional", async ({ page }) => {
  const assertBrowserErrors = monitorBrowserErrors(page); await page.goto("/"); expect(await page.evaluate(() => globalThis.crossOriginIsolated)).toBe(true);
  await page.getByTestId("segy-file-input").setInputFiles(segyUpload); await expect(page.getByTestId("dataset-name")).toContainText("3 traces");
  const csv = page.waitForEvent("download"); await page.getByTestId("header-csv").click(); const csvDialog = page.getByRole("dialog"); await csvDialog.getByRole("button", { name: "Export CSV" }).click(); await csv; await csvDialog.getByRole("button", { name: "Close" }).click();
  const png = page.waitForEvent("download"); await page.getByTestId("plot-png").click(); const pngDialog = page.getByRole("dialog"); await pngDialog.getByRole("button", { name: "Export PNG" }).click(); await expectPng(await png, 1600, 1000); await pngDialog.getByRole("button", { name: "Close" }).click();
  await page.getByTestId("smartsolo-file-input").setInputFiles(smartSoloUpload); await expect(page.getByRole("dialog").locator("#smartsolo-summary")).toContainText("Supported SmartSolo 8058 revision 1.0"); assertBrowserErrors();
});
