import { expect, test, type Page } from "@playwright/test";

// The other specs block service workers so cached files never hide what they test.
test.use({ serviceWorkers: "allow" });

async function waitForState(page: Page): Promise<string | undefined> {
  await page.waitForFunction(() => document.body.dataset.state !== undefined);
  return page.evaluate(() => document.body.dataset.state);
}

async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}

test("offers a web app manifest so the aquarium can be installed", async ({ page, request }) => {
  await page.goto("/?frozen=1");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");

  const manifest: unknown = await (await request.get(href ?? "missing")).json();

  expect(manifest).toMatchObject({ name: "Aquaria", display: "fullscreen" });
});

test("keeps working offline after the first visit", async ({ page, context }) => {
  await page.goto("/?frozen=1");
  await waitForState(page);
  await waitForServiceWorker(page);
  // The first visit loads before the worker controls the page: reload once so it caches the assets.
  await page.reload();
  await waitForState(page);

  await context.setOffline(true);
  await page.reload();

  expect(await waitForState(page)).toBe("ready");
});

test("shows textures and fish models offline once they have been seen", async ({
  page,
  context,
}) => {
  await page.goto("/?frozen=1");
  await waitForState(page);
  await waitForServiceWorker(page);
  await page.reload();
  await waitForState(page);
  const missing: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("could not be loaded")) missing.push(message.text());
  });

  await context.setOffline(true);
  await page.reload();
  await waitForState(page);

  expect(missing).toEqual([]);
});
