import { expect, test, type Page } from "@playwright/test";

/**
 * Live (animated) pages run on software WebGL in CI: keep them light with
 * every effect off and a small drawing buffer so every frame stays fast.
 */
async function openLive(page: Page, query = "?effects=none"): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("aquaria.settings", JSON.stringify({ renderHeight: 540 }));
  });
  await page.goto(`/${query}`);
}

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
  await openLive(page);
  await waitForState(page);

  await page.keyboard.press("h");

  await expect(page.getByRole("complementary", { name: "Aquarium controls" })).toBeVisible();
  await expect(page.getByText("Blue tang")).toBeVisible();
});

test("changes the resolution from the panel", async ({ page }) => {
  await openLive(page);
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
  await openLive(page);
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

test("switches effects on and off from the panel", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openLive(page);
  await waitForState(page);
  await page.keyboard.press("h");

  await page.getByRole("checkbox", { name: "Ambient occlusion" }).check();
  await page.getByRole("checkbox", { name: "Shadows" }).check();
  await page.getByRole("checkbox", { name: "Shadows" }).uncheck();

  await expect(page.getByRole("checkbox", { name: "Ambient occlusion" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Shadows" })).not.toBeChecked();
  expect(errors).toEqual([]);
});

test("remembers effect choices after a reload", async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("aquaria.settings") === null) {
      localStorage.setItem("aquaria.settings", JSON.stringify({ renderHeight: 540 }));
    }
  });
  await page.goto("/");
  await waitForState(page);
  await page.keyboard.press("h");
  await page.getByRole("checkbox", { name: "Depth of field" }).check();

  await page.reload();
  await waitForState(page);
  await page.keyboard.press("h");

  await expect(page.getByRole("checkbox", { name: "Depth of field" })).toBeChecked();
});

test("changes the scenery from the panel", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openLive(page);
  await waitForState(page);
  await page.keyboard.press("h");

  await page.locator('input[data-scenery="brain-coral"]').fill("12");

  await expect(page.locator("label", { hasText: "Brain corals" }).locator("output")).toHaveText(
    "12",
  );
  expect(errors).toEqual([]);
});

test("customizes the LED lights and cycle from the panel", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openLive(page);
  await waitForState(page);
  await page.keyboard.press("h");

  await page.locator('select[name="light-mode"]').selectOption("accelerated");
  await page.locator('input[name="light-accent-level"]').fill("60");

  await expect(page.locator('select[name="light-setup"]')).toHaveValue("custom");
  await expect(page.locator('[data-channel="accent"] output')).toHaveText("60%");
  expect(errors).toEqual([]);
});

test("goes back to the recommended lights", async ({ page }) => {
  await openLive(page);
  await waitForState(page);
  await page.keyboard.press("h");
  await page.locator('input[name="light-accent-level"]').fill("60");

  await page.locator('select[name="light-setup"]').selectOption("recommended");

  await expect(page.locator('[data-channel="accent"] output')).toHaveText("0%");
});

test("switches scene from the panel and remembers it", async ({ page }) => {
  // Seed light settings once; a reload must keep the scene saved by the panel.
  await page.addInitScript(() => {
    if (localStorage.getItem("aquaria.settings") === null) {
      localStorage.setItem("aquaria.settings", JSON.stringify({ renderHeight: 540 }));
    }
  });
  await page.goto("/?effects=none");
  await waitForState(page);
  await page.keyboard.press("h");

  await Promise.all([
    page.waitForEvent("load"),
    page.locator('select[name="scene"]').selectOption("home-reef"),
  ]);
  await waitForState(page);
  await page.keyboard.press("h");

  await expect(page.getByRole("heading", { name: "Home reef" })).toBeVisible();
  await expect(page.locator('select[name="scene"]')).toHaveValue("home-reef");
});
