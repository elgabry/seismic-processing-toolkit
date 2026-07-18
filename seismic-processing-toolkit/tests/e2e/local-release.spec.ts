import { expect, test } from "@playwright/test";
import { monitorBrowserErrors } from "./fixtures/browser-errors";
import { expectPng } from "./fixtures/downloads";
import { segyUpload, smartSoloUpload } from "./fixtures/seismic-fixtures";

test("runs the extracted local release with local files, worker conversion, downloads, and legacy compatibility", async ({ page }) => {
  const assertBrowserErrors = monitorBrowserErrors(page); const requests: { readonly method: string; readonly url: string }[] = []; page.on("request", (request) => requests.push({ method: request.method(), url: request.url() }));
  await page.goto("/"); await expect(page.getByTestId("local-runtime")).toContainText("packaged/local static server");
  await page.getByTestId("segy-file-input").setInputFiles(segyUpload); await expect(page.getByTestId("dataset-name")).toContainText("browser-fixture.segy · 3 traces"); await expect(page.getByTestId("seismic-plot")).toBeVisible();
  await page.getByTestId("geometry-map").click(); await expect(page.getByRole("dialog").getByTestId("geometry-map")).toBeVisible(); await page.keyboard.press("Escape");
  const csv = page.waitForEvent("download"); await page.getByTestId("header-csv").click(); await page.getByRole("dialog").getByRole("button", { name: "Export CSV" }).click(); expect((await csv).suggestedFilename()).toContain("headers.csv"); await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  const png = page.waitForEvent("download"); await page.getByTestId("plot-png").click(); const pngDialog = page.getByRole("dialog"); await pngDialog.getByRole("button", { name: "Export PNG" }).click(); await expectPng(await png, 1600, 1000); await pngDialog.getByRole("button", { name: "Close" }).click();
  await page.getByTestId("smartsolo-file-input").setInputFiles(smartSoloUpload); const conversion = page.getByRole("dialog"); await expect(conversion.locator("#smartsolo-summary")).toContainText("Supported SmartSolo 8058 revision 1.0"); const converted = page.waitForEvent("download"); await conversion.getByRole("button", { name: "Convert and download SEG-Y" }).click(); await converted; await expect(page.getByTestId("dataset-name")).toContainText("browser-smartsolo.sgy · 3 traces"); await conversion.getByRole("button", { name: "Close" }).click();
  const popup = page.waitForEvent("popup"); await page.getByRole("button", { name: "Legacy viewer" }).click(); const legacy = await popup; await legacy.waitForLoadState("domcontentloaded"); expect(legacy.url()).toContain("legacy/segy-wiggle-viewer-v2.2.html"); await legacy.close();
  expect(requests.filter((entry) => !["GET", "HEAD"].includes(entry.method) || !entry.url.startsWith("http://127.0.0.1:"))).toEqual([]); assertBrowserErrors();
});
