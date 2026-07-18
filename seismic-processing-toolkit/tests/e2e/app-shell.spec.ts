import { expect, test, type Page } from "@playwright/test";
import { monitorBrowserErrors } from "./fixtures/browser-errors";
import { expectPng } from "./fixtures/downloads";
import { segyUpload, sweepCsvUpload } from "./fixtures/seismic-fixtures";

async function loadSegy(page: Page): Promise<void> {
  await page.goto("/"); await page.getByTestId("segy-file-input").setInputFiles(segyUpload); await expect(page.getByTestId("dataset-name")).toContainText("browser-fixture.segy · 3 traces"); await expect(page.getByTestId("seismic-plot")).toHaveAttribute("data-mode", "wiggle"); await expect(page.getByTestId("seismic-plot")).toHaveAttribute("data-time-direction", "zero-top");
}

test("@smoke opens the local shell, loads SEG-Y, and downloads CSV and PNG", async ({ page }) => {
  const assertBrowserErrors = monitorBrowserErrors(page); await page.goto("/");
  await expect(page.getByTestId("dataset-name")).toHaveText("No local data loaded"); await expect(page.getByTestId("open-segy")).toBeVisible();
  await page.getByTestId("segy-file-input").setInputFiles(segyUpload); await expect(page.getByTestId("dataset-name")).toContainText("browser-fixture.segy · 3 traces");
  await page.getByLabel("Mode").selectOption("variable-area"); await expect(page.getByTestId("seismic-plot")).toHaveAttribute("data-mode", "variable-area"); await page.getByLabel("Mode").selectOption("density"); await expect(page.getByTestId("seismic-plot")).toHaveAttribute("data-mode", "density"); await page.getByLabel("Gain").fill("1.5"); await page.getByLabel("Clip").fill("1.2");
  const csvDownload = page.waitForEvent("download"); await page.getByTestId("header-csv").click(); await page.getByRole("dialog").getByRole("button", { name: "Export CSV" }).click(); const csv = await csvDownload; expect(csv.suggestedFilename()).toContain("headers.csv"); await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  const pngDownload = page.waitForEvent("download"); await page.getByTestId("plot-png").click(); await page.getByRole("dialog").getByRole("button", { name: "Export PNG" }).click(); await expectPng(await pngDownload, 1600, 1000);
  assertBrowserErrors();
});

test("loads headers and handles all visual modes without blanking the canvas", async ({ page }) => {
  const assertBrowserErrors = monitorBrowserErrors(page); await loadSegy(page);
  for (const tab of ["text", "binary", "trace", "qc"]) { await page.getByRole("button", { name: tab, exact: true }).click(); await expect(page.locator("#tab-content")).not.toHaveText("Loading…"); }
  const canvas = page.getByTestId("seismic-plot"); const box = await canvas.boundingBox(); expect(box?.width).toBeGreaterThan(100); expect(box?.height).toBeGreaterThan(100); assertBrowserErrors();
});

test("loads a local sweep and runs FDSD on the opened SEG-Y", async ({ page }) => {
  const assertBrowserErrors = monitorBrowserErrors(page);
  await loadSegy(page);
  await page.getByTestId("sweep-correlation").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Frequency Domain Sweep Deconvolution" })).toBeVisible();
  await dialog.getByTestId("sweep-file-input").setInputFiles(sweepCsvUpload);
  await expect(dialog.locator("#sweep-summary")).toContainText("5 samples · 1,000 µs interval");
  const download = page.waitForEvent("download");
  await dialog.getByTestId("run-sweep-correlation").click();
  await download;
  await expect(page.getByTestId("dataset-name")).toContainText("browser-fixture_fdsd.sgy · 3 traces");
  assertBrowserErrors();
});
