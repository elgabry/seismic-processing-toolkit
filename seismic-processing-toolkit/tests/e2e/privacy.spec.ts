import { expect, test } from "@playwright/test";
import { monitorBrowserErrors } from "./fixtures/browser-errors";
import { segyUpload } from "./fixtures/seismic-fixtures";

test("local seismic selection does not upload file content", async ({ page }) => {
  const assertBrowserErrors = monitorBrowserErrors(page); const requests: { readonly method: string; readonly url: string }[] = [];
  page.on("request", (request) => requests.push({ method: request.method(), url: request.url() })); await page.goto("/"); await page.getByTestId("segy-file-input").setInputFiles(segyUpload); await expect(page.getByTestId("dataset-name")).toContainText("browser-fixture.segy");
  expect(requests.filter((request) => request.method !== "GET" || !request.url.startsWith("http://127.0.0.1:"))).toEqual([]); assertBrowserErrors();
});
