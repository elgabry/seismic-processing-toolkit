import { expect, test } from "@playwright/test";
import { monitorBrowserErrors } from "./fixtures/browser-errors";
import { segyUpload } from "./fixtures/seismic-fixtures";

test("geometry map pans without drag-release selection and accepts a deliberate click", async ({ page }) => {
  const assertBrowserErrors = monitorBrowserErrors(page); await page.goto("/"); await page.getByTestId("segy-file-input").setInputFiles(segyUpload); await expect(page.getByTestId("dataset-name")).toContainText("3 traces");
  await page.getByTestId("geometry-map").click(); const dialog = page.getByRole("dialog"); await expect(dialog.getByTestId("geometry-map")).toBeVisible(); await expect(dialog.locator("#geometry-note")).toContainText("source positions");
  const map = dialog.getByTestId("geometry-map"); const box = await map.boundingBox(); if (!box) throw new Error("Geometry canvas has no layout box.");
  await page.mouse.move(box.x + 590, box.y + 270); await page.mouse.down(); await page.mouse.move(box.x + 520, box.y + 270); await page.mouse.up(); await expect(page.getByTestId("seismic-plot")).toHaveAttribute("data-selected-trace", "0");
  await map.click({ position: { x: 590, y: 270 } }); await expect(page.getByTestId("seismic-plot")).toHaveAttribute("data-selected-trace", "1");
  await dialog.getByRole("button", { name: "Fit" }).click(); await dialog.locator("#map-gesture").selectOption("box-select"); await dialog.locator("#map-colour").selectOption("offset"); await dialog.locator("#map-qc").selectOption("warning");
  assertBrowserErrors();
});
