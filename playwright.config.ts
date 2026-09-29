import { defineConfig, devices } from "@playwright/test";

/**
 * WebGL runs on SwiftShader (software rendering) so the tests work on CI
 * machines without a GPU. PW_CHROMIUM_PATH lets sandboxes use a preinstalled
 * Chromium instead of downloading one.
 */
const chromiumPath = process.env.PW_CHROMIUM_PATH;
const PORT = 4173;

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  retries: process.env.CI === undefined ? 0 : 1,
  reporter: process.env.CI === undefined ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
      ...(chromiumPath === undefined ? {} : { executablePath: chromiumPath }),
    },
  },
  projects: [
    { name: "e2e", testIgnore: /visual\.spec\.ts/ },
    { name: "visual", testMatch: /visual\.spec\.ts/ },
  ],
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: process.env.CI === undefined,
    timeout: 120_000,
  },
});
