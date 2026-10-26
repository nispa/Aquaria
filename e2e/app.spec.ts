import { readFileSync } from "node:fs";
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

/**
 * Opens a collapsible panel section, unless it is open already (e.g.
 * remembered), after the tab that holds it.
 */
async function openSection(page: Page, id: string): Promise<void> {
  const section = page.locator(`details[data-section="${id}"]`);
  const tab = await section.evaluate((node) => node.closest<HTMLElement>("[role=tabpanel]")?.id);
  if (tab !== undefined) await page.locator(`[role=tab][aria-controls="${tab}"]`).click();
  const open = await section.evaluate((node) => (node as HTMLDetailsElement).open);
  // Its own summary, not those of the groups inside it.
  if (!open) await section.locator(":scope > summary").click();
}

async function waitForState(page: Page): Promise<string | undefined> {
  await page.waitForFunction(() => document.body.dataset.state !== undefined);
  return page.evaluate(() => document.body.dataset.state);
}

test("boots the default scene and draws a frame", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Shader compile errors only reach the console, not pageerror.
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

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

test("shows the release, the author and a link to the code under the info button", async ({
  page,
}) => {
  await openLive(page);
  await waitForState(page);
  await page.keyboard.press("h");

  await page.getByRole("button", { name: "About Aquaria" }).click();

  await expect(page.locator(".panel__version")).toHaveText(/^Aquaria v\d+\.\d+\.\d+/);
  const link = page.locator(".panel__about a");
  await expect(link).toHaveAttribute("href", "https://github.com/nispa/Aquaria");
  await expect(link).toHaveAttribute("target", "_blank");
});

test("remembers the panel's tab and the sections the viewer closed", async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("aquaria.settings") === null) {
      localStorage.setItem("aquaria.settings", JSON.stringify({ renderHeight: 540 }));
    }
  });
  await page.goto("/?effects=none");
  await waitForState(page);
  await page.keyboard.press("h");
  await expect(page.getByRole("button", { name: "Full HD" })).toBeHidden();

  await page.getByRole("tab", { name: "System" }).click();
  await page.locator('details[data-section="sound"] > summary').click();
  // The toggle event, which saves the state, fires after the click returns.
  await page.waitForFunction(() =>
    localStorage.getItem("aquaria.settings")?.includes('"sound":false'),
  );
  await page.reload();
  await waitForState(page);
  await page.keyboard.press("h");

  await expect(page.getByRole("button", { name: "Full HD" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Volume" })).toBeHidden();
});

const bufferHeight = (page: Page) =>
  page.locator("#aquarium").evaluate((canvas) => (canvas as HTMLCanvasElement).height);

test("changes the resolution from the panel", async ({ page }) => {
  await openLive(page);
  await waitForState(page);
  await page.keyboard.press("h");
  await openSection(page, "quality");
  await page.getByLabel("Automatic resolution").uncheck();

  await page.getByRole("button", { name: "Full HD" }).click();

  await expect(page.locator("output").filter({ hasText: "1080p" })).toBeVisible();
  await expect.poll(() => bufferHeight(page)).toBe(1080);
});

test("draws no more pixels than the screen has with the automatic resolution", async ({ page }) => {
  await openLive(page);
  await waitForState(page);
  await page.keyboard.press("h");
  await openSection(page, "quality");

  await page.getByRole("button", { name: "Full HD" }).click();

  await expect(page.locator("output").filter({ hasText: "1080p" })).toBeVisible();
  // The test window is 720 pixels tall: Full HD is only the ceiling.
  await page.waitForTimeout(1000);
  expect(await bufferHeight(page)).toBeLessThanOrEqual(720);
});

test("offers a frame limit, 30 by default", async ({ page }) => {
  await openLive(page);
  await waitForState(page);
  await page.keyboard.press("h");
  await openSection(page, "quality");

  await expect(page.locator('select[name="frame-limit"]')).toHaveValue("30");
});

test("draws a picture of each fish on its card", async ({ page }) => {
  await openLive(page);
  await waitForState(page);

  await page.keyboard.press("h");

  // A drawn picture has opaque pixels; an empty canvas is fully transparent.
  await expect
    .poll(() =>
      page.locator('[data-species-card="clownfish"] canvas').evaluate((node) => {
        const canvas = node as HTMLCanvasElement;
        const pixels = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height);
        return pixels?.data.some((value, index) => index % 4 === 3 && value > 0) ?? false;
      }),
    )
    .toBe(true);
});

test("changes a population from the panel", async ({ page }) => {
  await openLive(page);
  await waitForState(page);
  await page.keyboard.press("h");

  await page.locator('input[data-species="clownfish"]').fill("12");

  await expect(page.locator('[data-species-card="clownfish"] output')).toHaveText("12");
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
  await openSection(page, "lighting");
  await openSection(page, "effect");

  await page.getByRole("checkbox", { name: "Ambient occlusion" }).check();
  await page.getByRole("checkbox", { name: "Shadows" }).check();
  await page.getByRole("checkbox", { name: "Shadows" }).uncheck();

  await expect(page.getByRole("checkbox", { name: "Ambient occlusion" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Shadows" })).not.toBeChecked();
  expect(errors).toEqual([]);
});

test("switches on an effect made of files, without shader errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await openLive(page);
  await waitForState(page);
  await page.keyboard.press("h");
  await openSection(page, "effect");

  await page.getByRole("checkbox", { name: "Water shimmer" }).check();
  await page.waitForTimeout(500);

  await expect(page.getByRole("checkbox", { name: "Water shimmer" })).toBeChecked();
  expect(errors).toEqual([]);
});

test("leaves out an effect whose shader does not compile", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (message) => warnings.push(message.text()));
  await page.route("**/effects/shimmer/effect.glsl", (route) =>
    route.fulfill({ contentType: "text/plain", body: "void main() { not glsl }" }),
  );
  await openLive(page);
  await waitForState(page);
  await page.keyboard.press("h");
  await openSection(page, "effect");

  await expect(page.getByRole("checkbox", { name: "Water shimmer" })).toHaveCount(0);
  expect(warnings.some((text) => text.includes("shader does not compile"))).toBe(true);
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
  await openSection(page, "effect");
  await page.getByRole("checkbox", { name: "Depth of field" }).check();

  await page.reload();
  await waitForState(page);
  await page.keyboard.press("h");
  await openSection(page, "effect");

  await expect(page.getByRole("checkbox", { name: "Depth of field" })).toBeChecked();
});

test("changes the scenery from the panel", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // A scene with living brain coral: the default one may change.
  await openLive(page, "?scene=aquaria&effects=none");
  await waitForState(page);
  await page.keyboard.press("h");
  await openSection(page, "scenery");

  await page.locator('input[data-scenery="platygyra"]').fill("12");

  await expect(page.locator('[data-scenery-card="platygyra"] output')).toHaveText("12");
  expect(errors).toEqual([]);
});

test("adds a plant the scene does not hold and takes it away again", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openLive(page, "?scene=aquaria&effects=none");
  await waitForState(page);
  await page.keyboard.press("h");
  await openSection(page, "scenery");

  await page.getByRole("button", { name: "Add to the tank" }).click();
  await page.getByRole("dialog").getByRole("searchbox").fill("java fern");
  await page.locator('[data-add-scenery="java-fern"]').click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator('[data-scenery-card="java-fern"] output')).toHaveText("8");
  await page.getByRole("button", { name: "Take away Java fern" }).click();
  await expect(page.locator('[data-scenery-card="java-fern"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("keeps an added plant after a reload", async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("aquaria.settings") === null) {
      localStorage.setItem("aquaria.settings", JSON.stringify({ renderHeight: 540 }));
    }
  });
  await page.goto("/?scene=aquaria&effects=none");
  await waitForState(page);
  await page.keyboard.press("h");
  await openSection(page, "scenery");
  await page.getByRole("button", { name: "Add to the tank" }).click();
  await page.locator('[data-add-scenery="java-fern"]').click();

  await page.reload();
  await waitForState(page);
  await page.keyboard.press("h");
  await openSection(page, "scenery");

  await expect(page.locator('[data-scenery-card="java-fern"] output')).toHaveText("8");
});

test("resizes the fish from the panel and remembers it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (localStorage.getItem("aquaria.settings") === null) {
      localStorage.setItem("aquaria.settings", JSON.stringify({ renderHeight: 540 }));
    }
  });
  await page.goto("/?effects=none");
  await waitForState(page);
  await page.keyboard.press("h");

  await page.locator('input[name="fish-size"]').fill("100");
  await page.reload();
  await waitForState(page);
  await page.keyboard.press("h");

  await expect(page.locator("label", { hasText: "Fish size" }).locator("output")).toHaveText(
    "Alike",
  );
  expect(errors).toEqual([]);
});

test("shows the corner buttons on a touch, and feeds the fish from one", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openLive(page);
  await waitForState(page);
  const feed = page.getByRole("button", { name: "Feed the fish" });
  await expect(feed).toBeHidden();

  await page.mouse.click(640, 360);
  await feed.click();

  await expect(page.getByRole("button", { name: "Open controls" })).toBeVisible();
  await expect(page.locator(".panel")).toBeHidden();
  expect(errors).toEqual([]);
});

test("switches the torch on and off with T and with its corner button", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openLive(page);
  await waitForState(page);
  await page.mouse.move(640, 360);
  const torch = page.getByRole("button", { name: "Torch" });

  await page.keyboard.press("t");
  await expect(torch).toHaveAttribute("aria-pressed", "true");
  await torch.click();

  await expect(torch).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("switches the magnifier on and off with Z and with its corner button", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openLive(page);
  await waitForState(page);
  await page.mouse.move(640, 360);
  const lens = page.getByRole("button", { name: "Magnifier" });

  await page.keyboard.press("z");
  await expect(lens).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(600, 340);
  await lens.click();

  await expect(lens).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("switches pointing on and off with P and with its corner button", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openLive(page);
  await waitForState(page);
  await page.mouse.move(640, 360);
  const point = page.getByRole("button", { name: "Point" });

  await page.keyboard.press("p");
  await expect(point).toHaveAttribute("aria-pressed", "true");
  await point.click();

  await expect(point).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("switches to realistic mode from the panel and remembers it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (localStorage.getItem("aquaria.settings") === null) {
      localStorage.setItem("aquaria.settings", JSON.stringify({ renderHeight: 540 }));
    }
  });
  await page.goto("/?effects=none");
  await waitForState(page);
  await page.keyboard.press("h");

  await page.getByLabel("Realistic").check();
  await page.reload();
  await waitForState(page);
  await page.keyboard.press("h");

  await expect(page.getByLabel("Realistic")).toBeChecked();
  expect(errors).toEqual([]);
});

test("switches a species to its procedural body and remembers it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (localStorage.getItem("aquaria.settings") === null) {
      localStorage.setItem("aquaria.settings", JSON.stringify({ renderHeight: 540 }));
    }
  });
  await page.goto("/?effects=none");
  await waitForState(page);
  await page.keyboard.press("h");

  await page.locator('button[data-model="clownfish"]').click();
  await page.reload();
  await waitForState(page);
  await page.keyboard.press("h");

  await expect(page.locator('button[data-model="clownfish"]')).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(errors).toEqual([]);
});

test("customizes the LED lights and cycle from the panel", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openLive(page);
  await waitForState(page);
  await page.keyboard.press("h");
  await openSection(page, "time");
  await openSection(page, "lights");

  await page.locator('select[name="light-mode"]').selectOption("accelerated");
  await page.locator('input[name="light-accent-level"]').fill("60");

  await expect(page.locator('select[name="light-setup"]')).toHaveValue("custom");
  await expect(page.locator('[data-channel="accent"] output')).toHaveText("60%");
  expect(errors).toEqual([]);
});

test("chooses the Hero look from the panel, tunes it and remembers both", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (localStorage.getItem("aquaria.settings") === null) {
      localStorage.setItem("aquaria.settings", JSON.stringify({ renderHeight: 540 }));
    }
  });
  await page.goto("/?effects=none");
  await waitForState(page);
  await page.keyboard.press("h");
  await openSection(page, "look");

  await page.locator('select[name="look-choice"]').selectOption("hero");
  await page.locator('input[name="look-exposure"]').fill("1.2");
  await page.reload();
  await waitForState(page);
  await page.keyboard.press("h");
  await openSection(page, "look");

  await expect(page.locator('select[name="look-choice"]')).toHaveValue("hero");
  await expect(page.locator('input[name="look-exposure"]')).toHaveValue("1.2");
  expect(errors).toEqual([]);
});

test("resets Aquaria from the About box, forgetting the settings", async ({ page }) => {
  await page.addInitScript(() => {
    if (
      localStorage.getItem("aquaria.settings") === null &&
      sessionStorage.getItem("seeded") === null
    ) {
      sessionStorage.setItem("seeded", "yes");
      localStorage.setItem(
        "aquaria.settings",
        JSON.stringify({ renderHeight: 540, showFps: true }),
      );
    }
  });
  await page.goto("/?effects=none");
  await waitForState(page);
  await page.keyboard.press("h");
  await page.locator(".panel__info").click();

  await page.locator('button[name="reset-everything"]').click();
  const reloaded = page.waitForEvent("load");
  await page.locator('button[name="reset-everything"]').click();
  await reloaded;
  await waitForState(page);

  const saved = await page.evaluate(() => localStorage.getItem("aquaria.settings") ?? "{}");
  expect(JSON.parse(saved)).toMatchObject({ showFps: false });
});

test("goes back to the recommended lights", async ({ page }) => {
  await openLive(page);
  await waitForState(page);
  await page.keyboard.press("h");
  await openSection(page, "lights");
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
    page.locator('.scene-card[data-scene="home-reef"]').click(),
  ]);
  await waitForState(page);
  await page.keyboard.press("h");

  await expect(page.getByRole("heading", { name: "Home reef" })).toBeVisible();
  await expect(page.locator('.scene-card[data-scene="home-reef"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("changes the anti-aliasing from the panel", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openLive(page);
  await waitForState(page);
  await page.keyboard.press("h");
  // MSAA is in the System tab, SMAA among the effects in the Picture tab.
  await openSection(page, "quality");
  await page.locator('select[name="msaa"]').selectOption("4");
  await openSection(page, "effect");
  await page.getByRole("checkbox", { name: "SMAA anti-aliasing" }).check();
  await openSection(page, "quality");

  await expect(page.locator('select[name="msaa"]')).toHaveValue("4");
  expect(errors).toEqual([]);
});

test("switches the light fixture to LED spots", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openLive(page);
  await waitForState(page);
  await page.keyboard.press("h");
  await openSection(page, "lights");

  await page.locator('select[name="light-fixture"]').selectOption("spots");
  await page.locator('input[name="light-spots"]').fill("9");

  await expect(page.locator('select[name="light-setup"]')).toHaveValue("custom");
  expect(errors).toEqual([]);
});

test.describe("scene editor's Scene tab", () => {
  async function openSceneTab(page: Page, scene = "reef"): Promise<void> {
    await page.goto(`/?scene=${scene}&effects=none`);
    await waitForState(page);
    await page.keyboard.press("e");
    await page.getByRole("tab", { name: "Scene" }).click();
  }

  const sceneTab = (page: Page) => page.getByRole("tabpanel", { name: "Scene" });
  const nameField = (page: Page) => page.getByRole("textbox", { name: "Scene name" });

  test("names a new scene, saves it and lists it under My scenes", async ({ page }) => {
    await openSceneTab(page);
    await nameField(page).fill("Night reef");

    await Promise.all([
      page.waitForEvent("load"),
      page.getByRole("button", { name: "Save as a new scene" }).click(),
    ]);
    await waitForState(page);

    await page.keyboard.press("h");
    await expect(page.locator('.scene-card[data-scene="my-night-reef"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator('.scene-card[data-group="My scenes"] .scene-card__name')).toHaveText(
      "Night reef",
    );
  });

  test("gives a saved scene a picture of its tank on its card", async ({ page }) => {
    await openSceneTab(page);
    await nameField(page).fill("Picture reef");
    await Promise.all([
      page.waitForEvent("load"),
      page.getByRole("button", { name: "Save as a new scene" }).click(),
    ]);
    await waitForState(page);

    await page.keyboard.press("h");
    const image = page.locator('.scene-card[data-scene="my-picture-reef"] img');

    await expect(image).toHaveAttribute("src", /^data:image\/jpeg;base64,/);
  });

  test("exports the scene as a JSON file ready for public/scenes", async ({ page }) => {
    await openSceneTab(page);

    const [file] = await Promise.all([
      page.waitForEvent("download"),
      sceneTab(page).getByRole("button", { name: "Export JSON" }).click(),
    ]);

    // A bundled scene edited is the viewer's own: "My Tropical reef".
    expect(file.suggestedFilename()).toBe("my-tropical-reef.json");
  });

  test("imports a scene file and opens it", async ({ page }) => {
    await openSceneTab(page);
    const [file] = await Promise.all([
      page.waitForEvent("download"),
      sceneTab(page).getByRole("button", { name: "Export JSON" }).click(),
    ]);
    const path = await file.path();

    await Promise.all([
      page.waitForEvent("load"),
      sceneTab(page).locator('input[type="file"]').setInputFiles(path),
    ]);
    await waitForState(page);

    await page.keyboard.press("h");
    await expect(page.locator('.scene-card[data-scene="my-reef"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("explains why an imported file is not a valid scene", async ({ page }) => {
    await openSceneTab(page);

    await sceneTab(page)
      .locator('input[type="file"]')
      .setInputFiles({
        name: "broken.json",
        mimeType: "application/json",
        buffer: Buffer.from('{"id":"x"}'),
      });

    await expect(
      page.getByRole("toolbar", { name: "Scene editor" }).getByRole("status"),
    ).toContainText("Invalid scene");
  });

  test("resizes the tank, keeping the work", async ({ page }) => {
    await openSceneTab(page);
    const width = sceneTab(page).locator("label", { hasText: "Width" }).locator("input");

    await width.fill("3");
    await sceneTab(page).getByRole("button", { name: "Resize the tank" }).click();

    await page.getByRole("tab", { name: "Scene" }).click();
    await expect(
      sceneTab(page).locator("label", { hasText: "Width" }).locator("output"),
    ).toHaveText("3");
  });

  test("takes the water and light of another biome", async ({ page }) => {
    const planted = JSON.parse(readFileSync("public/scenes/planted-tank.json", "utf8")) as {
      water: { color: string };
    };
    await openSceneTab(page);

    await sceneTab(page).getByRole("combobox", { name: "Biome" }).selectOption("planted-tank");
    await sceneTab(page).getByRole("button", { name: "Use this environment" }).click();

    await page.getByRole("tab", { name: "Scene" }).click();
    await expect(
      sceneTab(page)
        .locator("label", { hasText: /^Water$/ })
        .locator("input"),
    ).toHaveValue(planted.water.color);
  });

  test("builds rock of the material chosen in the Rocks tab", async ({ page }) => {
    await openSceneTab(page);
    const box = await page.locator("#aquarium").boundingBox();
    if (box === null) throw new Error("No canvas.");

    await page.getByRole("tab", { name: "Rocks" }).click();
    await page.getByRole("button", { name: "Basalt" }).click();
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.75);
    await page.getByRole("button", { name: "Save as a new scene" }).click();

    await waitForState(page);
    const stored = await page.evaluate(() => localStorage.getItem("aquaria.customScenes"));
    const scenes = Object.values(
      JSON.parse(stored ?? "{}") as Record<string, { blocks?: { material?: { id: string } } }>,
    );
    expect(scenes.map((scene) => scene.blocks?.material?.id)).toEqual(["basalt"]);
  });

  test("turns the reef ridge into blocks", async ({ page }) => {
    // The home reef is the bundled scene with a procedural ridge.
    await openSceneTab(page, "home-reef");

    await sceneTab(page).getByRole("button", { name: "Convert the ridge to blocks" }).click();
    await page.getByRole("button", { name: "Save as a new scene" }).click();

    await waitForState(page);
    const stored = await page.evaluate(() => localStorage.getItem("aquaria.customScenes"));
    const scenes = Object.values(JSON.parse(stored ?? "{}") as Record<string, object>);
    expect(scenes.map((scene) => ["blocks" in scene, "rockwork" in scene])).toEqual([
      [true, false],
    ]);
  });
});

test.describe("scene editor", () => {
  test("builds rock from blocks and saves it as a new scene", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/?scene=iwagumi&effects=none");
    await waitForState(page);

    await page.keyboard.press("e");
    const bar = page.getByRole("toolbar", { name: "Scene editor" });
    await expect(bar).toBeVisible();
    const canvas = page.locator("#aquarium");
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("No canvas.");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.7);
    await bar.getByRole("button", { name: "Save as a new scene" }).click();

    await expect(page).toHaveURL(/scene=my-iwagumi/);
    await waitForState(page);
    const stored = await page.evaluate(() => localStorage.getItem("aquaria.customScenes"));
    expect(stored).toContain('"blocks"');
    expect(errors).toEqual([]);
  });

  test("sets down an object from the palette, then deletes it", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/?scene=iwagumi&effects=none");
    await waitForState(page);
    await page.keyboard.press("e");
    const box = await page.locator("#aquarium").boundingBox();
    if (box === null) throw new Error("No canvas.");
    const floor = { x: box.x + box.width * 0.4, y: box.y + box.height * 0.75 };

    await page.getByRole("tab", { name: "Objects" }).click();
    await page
      .getByRole("complementary", { name: "Palette" })
      .getByRole("button", { name: "Rocks" })
      .click();
    await page.mouse.click(floor.x, floor.y);
    const remove = page.getByRole("button", { name: "Delete the selected item" });
    await expect(remove).toBeEnabled();
    await remove.click();

    await expect(remove).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test("saves an object set down from the palette at its spot", async ({ page }) => {
    await page.goto("/?scene=iwagumi&effects=none");
    await waitForState(page);
    await page.keyboard.press("e");
    const box = await page.locator("#aquarium").boundingBox();
    if (box === null) throw new Error("No canvas.");

    await page.getByRole("tab", { name: "Objects" }).click();
    await page
      .getByRole("complementary", { name: "Palette" })
      .getByRole("button", { name: "Shells" })
      .click();
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.75);
    await page.getByRole("button", { name: "Save as a new scene" }).click();

    await expect(page).toHaveURL(/scene=my-iwagumi/);
    await waitForState(page);
    const stored = await page.evaluate(() => localStorage.getItem("aquaria.customScenes"));
    const scenes = JSON.parse(stored ?? "{}") as Record<
      string,
      { props: { kind: string; at?: unknown[] }[] }
    >;
    const shells = Object.values(scenes)
      .flatMap((scene) => scene.props)
      .filter((entry) => entry.kind === "shell" && entry.at !== undefined);
    expect(shells.map((entry) => entry.at?.length)).toEqual([1]);
  });

  test("paints a carpet with the brush", async ({ page }) => {
    await page.goto("/?scene=iwagumi&effects=none");
    await waitForState(page);
    await page.keyboard.press("e");
    const box = await page.locator("#aquarium").boundingBox();
    if (box === null) throw new Error("No canvas.");
    await page.getByRole("button", { name: "Paint the palette's choice with the brush" }).click();
    await page
      .getByRole("complementary", { name: "Palette" })
      .getByRole("button", { name: "Dwarf hairgrass" })
      .click();

    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.75);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.78, { steps: 8 });
    await page.mouse.up();
    await page.getByRole("button", { name: "Save as a new scene" }).click();

    await waitForState(page);
    const stored = await page.evaluate(() => localStorage.getItem("aquaria.customScenes"));
    const scenes = JSON.parse(stored ?? "{}") as Record<
      string,
      { flora: { kind: string; at?: unknown[] }[] }
    >;
    const painted = Object.values(scenes)
      .flatMap((scene) => scene.flora)
      .filter((entry) => entry.kind === "hairgrass" && entry.at !== undefined);
    expect(painted.reduce((sum, entry) => sum + (entry.at?.length ?? 0), 0)).toBeGreaterThan(5);
  });

  test("undoes and redoes a change with Ctrl+Z and Ctrl+Y", async ({ page }) => {
    await page.goto("/?scene=iwagumi&effects=none");
    await waitForState(page);
    await page.keyboard.press("e");
    const box = await page.locator("#aquarium").boundingBox();
    if (box === null) throw new Error("No canvas.");
    const undo = page.getByRole("button", { name: "Undo (Ctrl+Z)" });
    const redo = page.getByRole("button", { name: "Redo (Ctrl+Y)" });
    await expect(undo).toBeDisabled();

    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.75);
    await expect(undo).toBeEnabled();
    await page.keyboard.press("Control+z");
    await expect(undo).toBeDisabled();
    await expect(redo).toBeEnabled();
    await page.keyboard.press("Control+y");

    await expect(undo).toBeEnabled();
    await expect(redo).toBeDisabled();
  });

  test("leaves without saving and brings the tank back", async ({ page }) => {
    await page.goto("/?scene=iwagumi&effects=none");
    await waitForState(page);

    await page.keyboard.press("e");
    await page.getByRole("button", { name: "Leave without saving" }).click();

    await expect(page.getByRole("toolbar", { name: "Scene editor" })).toHaveCount(0);
    const stored = await page.evaluate(() => localStorage.getItem("aquaria.customScenes"));
    expect(stored).toBeNull();
  });
});
