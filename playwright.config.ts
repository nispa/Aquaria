import { defineConfig, devices } from "@playwright/test";

/**
 * WebGL runs on SwiftShader (software rendering) so the tests work on CI
 * machines without a GPU. On a Windows PC the e2e tests use its real GPU
 * instead, about six times faster, and run in parallel; the visual and
 * gallery projects stay on SwiftShader so their pictures match the
 * baselines. PW_CHROMIUM_PATH lets sandboxes use a preinstalled Chromium
 * instead of downloading one.
 */
const chromiumPath = process.env.PW_CHROMIUM_PATH;
const PORT = 4173;
const onCi = process.env.CI !== undefined;
const localGpu = !onCi && process.platform === "win32";
/** Tests at once on a PC: more would fight over the one GPU. */
const LOCAL_WORKERS = 4;

const SOFTWARE_WEBGL = [
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
];
const GPU_WEBGL = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"];

const browserWith = (args: readonly string[]) => ({
  launchOptions: {
    args: [...args],
    ...(chromiumPath === undefined ? {} : { executablePath: chromiumPath }),
  },
});

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 60_000 },
  fullyParallel: !onCi,
  ...(onCi ? {} : { workers: LOCAL_WORKERS }),
  retries: onCi ? 1 : 0,
  reporter: onCi ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 720 },
    // A cached app would hide changes and break request mocking; pwa.spec.ts allows it.
    serviceWorkers: "block",
    ...browserWith(SOFTWARE_WEBGL),
  },
  projects: [
    {
      name: "e2e",
      testIgnore: /(visual|gallery|swimming|readme|thumbnails)\.spec\.ts/,
      use: browserWith(localGpu ? GPU_WEBGL : SOFTWARE_WEBGL),
    },
    // One at a time: pictures taken side by side would slow each other down.
    { name: "visual", testMatch: /visual\.spec\.ts/, fullyParallel: false },
    {
      name: "gallery",
      testMatch: /(gallery|swimming|readme|thumbnails)\.spec\.ts/,
      fullyParallel: false,
    },
  ],
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !onCi,
    timeout: 120_000,
  },
});
