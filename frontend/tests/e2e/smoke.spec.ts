import { test, expect } from "@playwright/test";

test("smoke: all 5 pages load without console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  const pages = [
    { path: "/", name: "Dashboard" },
    { path: "/alerts", name: "Alertes" },
    { path: "/forecast", name: "Prévisions" },
    { path: "/savings", name: "Économies" },
    { path: "/settings", name: "Paramètres" },
  ];

  for (const { path, name } of pages) {
    await page.goto(path);
    await expect(page).toHaveTitle(/WATTWISE/);
    // Wait for page to hydrate
    await page.waitForTimeout(1000);
  }

  // Check no console errors after visiting all pages
  expect(consoleErrors).toEqual([]);
});

test("smoke: forecast page shows 503 message when model untrained", async ({ page }) => {
  await page.goto("/forecast");
  await page.waitForTimeout(1000);
  await expect(page.locator("text=Modèle non entraîné")).toBeVisible();
});

test("smoke: settings page persists localStorage", async ({ page }) => {
  await page.goto("/settings");
  await page.fill('input[placeholder*="URL"]', "http://custom-api:9000");
  await page.click('button:has-text("Enregistrer")');
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForTimeout(1000);
  const inputValue = await page.inputValue('input[placeholder*="URL"]');
  expect(inputValue).toBe("http://custom-api:9000");
});

test("smoke: mobile 390px no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForTimeout(1000);
  const body = page.locator("body");
  const overflow = await body.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflow).toBe(false);
});
