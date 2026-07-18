import { expect, test, type Page } from "@playwright/test";
import { monitorBrowserErrors } from "./fixtures/browser-errors";
import { readDownloadText } from "./fixtures/downloads";
import { segyUpload } from "./fixtures/seismic-fixtures";

async function ready(page: Page): Promise<void> { await page.goto("/"); await page.getByTestId("segy-file-input").setInputFiles(segyUpload); await expect(page.getByTestId("dataset-name")).toContainText("3 traces"); }
async function exportCsv(page: Page): Promise<string> { const download = page.waitForEvent("download"); await page.getByRole("dialog").getByRole("button", { name: "Export CSV" }).click(); return readDownloadText(await download); }
async function close(page: Page): Promise<void> { await page.getByRole("dialog").getByRole("button", { name: "Close" }).click(); }

test("streams trace samples, geometry, and gather CSV with deterministic headers", async ({ page }) => {
  const assertBrowserErrors = monitorBrowserErrors(page); await ready(page);
  await page.getByTestId("trace-csv").click(); const samples = page.getByRole("dialog"); await samples.locator("#csv-kind").selectOption("samples"); await samples.locator("#csv-scope").selectOption("selected"); await samples.locator("#csv-layout").selectOption("long"); await samples.locator("#csv-ending").selectOption("lf"); const long = await exportCsv(page); expect(long.split("\n").filter(Boolean)).toHaveLength(6); expect(long.split("\n")[0]).toBe("traceId,sampleIndex,timeSeconds,amplitude"); expect(long).not.toContain("undefined"); expect(long).toContain("0.001000"); await close(page);
  await page.getByTestId("trace-csv").click(); const wideDialog = page.getByRole("dialog"); await wideDialog.locator("#csv-kind").selectOption("samples"); await wideDialog.locator("#csv-scope").selectOption("visible"); await wideDialog.locator("#csv-layout").selectOption("wide"); const wide = await exportCsv(page); expect(wide).toContain("timeSeconds,trace_0,trace_1,trace_2"); expect(wide.split("\r\n").filter(Boolean)).toHaveLength(6); await close(page);
  await page.getByTestId("header-csv").click(); const geometryDialog = page.getByRole("dialog"); await geometryDialog.locator("#csv-kind").selectOption("geometry"); const geometry = await exportCsv(page); expect(geometry.split("\r\n")[0]).toContain("rawX"); expect(geometry).toContain("length"); await close(page);
  await page.getByTestId("header-csv").click(); const gatherDialog = page.getByRole("dialog"); await gatherDialog.locator("#csv-kind").selectOption("gather"); const gather = await exportCsv(page); expect(gather.split("\r\n")[0]).toBe("gatherKey,traceOrder,traceId,gatherDiagnostics"); expect(gather).not.toContain("undefined"); assertBrowserErrors();
});
