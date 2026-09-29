import { expect, test, type Page } from "@playwright/test";

async function waitForState(page: Page): Promise<string | undefined> {
  await page.waitForFunction(() => document.body.dataset.state !== undefined);
  return page.evaluate(() => document.body.dataset.state);
}

test("boots the default scene and draws a frame", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/?frozen=4");

  expect(await waitForState(page)).toBe("ready");
  expect(errors).toEqual([]);
});

test("renders a non-blank image", async ({ page }) => {
  await page.goto("/?frozen=4");
  await waitForState(page);

  const screenshot = await page.locator("#aquarium").screenshot();

  // A blank or failed WebGL canvas compresses to a tiny PNG; a real scene does not.
  expect(screenshot.byteLength).toBeGreaterThan(50_000);
});

test("opens the control panel with the H key", async ({ page }) => {
  await page.goto("/");
  await waitForState(page);

  await page.keyboard.press("h");

  await expect(page.getByRole("complementary", { name: "Aquarium controls" })).toBeVisible();
  await expect(page.getByText("Blue tang")).toBeVisible();
});

test("changes the resolution from the panel", async ({ page }) => {
  await page.goto("/");
  await waitForState(page);
  await page.keyboard.press("h");

  await page.getByRole("button", { name: "Full HD" }).click();

  await expect(page.locator("output").filter({ hasText: "1080p" })).toBeVisible();
  const bufferHeight = await page
    .locator("#aquarium")
    .evaluate((canvas) => (canvas as HTMLCanvasElement).height);
  expect(bufferHeight).toBe(1080);
});

test("changes a population from the panel", async ({ page }) => {
  await page.goto("/");
  await waitForState(page);
  await page.keyboard.press("h");

  await page.locator('input[data-species="clownfish"]').fill("12");

  await expect(page.locator("label", { hasText: "Clownfish" }).locator("output")).toHaveText("12");
});

test("shows a clear error for a missing scene", async ({ page }) => {
  await page.goto("/?scene=does-not-exist");

  expect(await waitForState(page)).toBe("error");
  await expect(page.getByText(/could not load scenes\/does-not-exist\.json/i)).toBeVisible();
});
