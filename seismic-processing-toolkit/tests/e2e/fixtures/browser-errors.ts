import { expect, type Page } from "@playwright/test";

/** Makes uncaught page errors and unexpected console errors test failures instead of silent browser-only regressions. */
export function monitorBrowserErrors(page: Page): () => void {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  return () => expect(errors, errors.join("\n")).toEqual([]);
}
