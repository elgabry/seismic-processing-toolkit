import { expect, test } from "@playwright/test";
import { monitorBrowserErrors } from "./fixtures/browser-errors";
import { moderateSmartSoloUpload } from "./fixtures/seismic-fixtures";

test("cancels SmartSolo indexing without opening a stale dataset", async ({ page }) => {
  const assertBrowserErrors = monitorBrowserErrors(page); let downloadSeen = false; page.on("download", () => { downloadSeen = true; }); await page.goto("/");
  await page.getByTestId("smartsolo-file-input").setInputFiles(moderateSmartSoloUpload); const dialog = page.getByRole("dialog"); await dialog.getByRole("button", { name: "Cancel" }).click(); await expect(dialog.locator("#smartsolo-status")).toContainText("Cancelled"); await expect(page.getByTestId("dataset-name")).toHaveText("No local data loaded"); expect(downloadSeen).toBe(false); assertBrowserErrors();
});
