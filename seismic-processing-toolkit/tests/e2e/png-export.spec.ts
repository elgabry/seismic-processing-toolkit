import { expect, test, type Page } from "@playwright/test";
import { monitorBrowserErrors } from "./fixtures/browser-errors";
import { expectPng } from "./fixtures/downloads";
import { segyUpload } from "./fixtures/seismic-fixtures";

async function exportPng(page: Page, width: number, height: number): Promise<void> {
  const download = page.waitForEvent("download"); await page.getByRole("dialog").getByRole("button", { name: "Export PNG" }).click(); await expectPng(await download, width, height);
}

test("exports density and offline map PNGs at requested dimensions without changing the live viewport", async ({ page }) => {
  const assertBrowserErrors = monitorBrowserErrors(page); await page.goto("/"); await page.getByTestId("segy-file-input").setInputFiles(segyUpload); await expect(page.getByTestId("dataset-name")).toContainText("3 traces"); const beforeMode = await page.getByTestId("seismic-plot").getAttribute("data-mode");
  await page.getByTestId("plot-png").click(); const density = page.getByRole("dialog"); await density.locator("#png-target").selectOption("density"); await density.locator("#png-preset").selectOption("custom"); await density.locator("#png-width").fill("800"); await density.locator("#png-height").fill("500"); await density.locator("#png-background").selectOption("transparent"); await exportPng(page, 800, 500); await density.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("seismic-plot")).toHaveAttribute("data-mode", beforeMode ?? "wiggle");
  await page.getByTestId("plot-png").click(); const map = page.getByRole("dialog"); await map.locator("#png-target").selectOption("map"); await map.locator("#png-preset").selectOption("custom"); await map.locator("#png-width").fill("640"); await map.locator("#png-height").fill("360"); await map.locator("#png-background").selectOption("#ffffff"); await exportPng(page, 640, 360); assertBrowserErrors();
});
