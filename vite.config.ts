import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";
import { assetCacheName } from "./src/core/assetCache";

/**
 * Serves (dev) and emits (build) Three.js' Basis transcoder under basis/, so
 * KTX2 textures can be decoded. Taken from the installed three package, it
 * always matches the KTX2Loader version.
 */
function basisTranscoder(): Plugin {
  const folder = join(
    dirname(createRequire(import.meta.url).resolve("three")),
    "../examples/jsm/libs/basis",
  );
  const files = ["basis_transcoder.js", "basis_transcoder.wasm"];
  const types: Record<string, string> = { js: "text/javascript", wasm: "application/wasm" };
  return {
    name: "basis-transcoder",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const file = files.find((name) => request.url?.endsWith(`/basis/${name}`));
        if (file === undefined) {
          next();
          return;
        }
        response.setHeader("Content-Type", types[file.split(".").pop() ?? ""] ?? "");
        response.end(readFileSync(join(folder, file)));
      });
    },
    generateBundle() {
      for (const file of files) {
        this.emitFile({
          type: "asset",
          fileName: `basis/${file}`,
          source: readFileSync(join(folder, file)),
        });
      }
    },
  };
}

/** The release from package.json, shown in the control panel. */
function appVersion(): string {
  const manifest: unknown = JSON.parse(readFileSync("package.json", "utf8"));
  const version =
    typeof manifest === "object" && manifest !== null && "version" in manifest
      ? manifest.version
      : undefined;
  if (typeof version !== "string") throw new Error("package.json has no version.");
  return version;
}

/** Short hash of the commit being built; empty outside a git checkout. */
function appCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

/** The build's name for caches: its commit, or its version outside git. */
const BUILD = appCommit() || appVersion();

/**
 * Installable web app that keeps working offline: the app itself is cached on
 * the first visit, textures and models once they have been shown, in a cache
 * of this build (see core/assetCache) so a new build never serves old models.
 */
function installableApp(): Plugin[] {
  return VitePWA({
    registerType: "autoUpdate",
    injectRegister: "script-defer",
    includeAssets: ["icons/icon.svg", "icons/apple-touch-icon.png"],
    manifest: {
      name: "Aquaria",
      short_name: "Aquaria",
      description: "A real-time 3D aquarium for large screens.",
      display: "fullscreen",
      orientation: "landscape",
      background_color: "#062a45",
      theme_color: "#0f5f8f",
      icons: [
        { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    workbox: {
      // The app shell, plus every scene, species and model manifest (all small JSON).
      globPatterns: ["**/*.{js,css,html,json,wasm,svg}"],
      // Textures and models (~50 MB) are cached on first use, not on install:
      // visitors download only what they see. The pattern must be inline: this
      // function is copied as text into the service worker.
      runtimeCaching: [
        {
          urlPattern: ({ url, sameOrigin }) =>
            sameOrigin && /\.(?:ktx2|glb|gltf|bin|png|jpe?g|webp)$/.test(url.pathname),
          handler: "CacheFirst",
          options: { cacheName: assetCacheName(BUILD) },
        },
      ],
    },
  });
}

export default defineConfig({
  base: "./",
  define: {
    "import.meta.env.APP_VERSION": JSON.stringify(appVersion()),
    "import.meta.env.APP_COMMIT": JSON.stringify(appCommit()),
    "import.meta.env.APP_ASSET_CACHE": JSON.stringify(assetCacheName(BUILD)),
  },
  plugins: [basisTranscoder(), installableApp()],
  build: {
    target: "es2022",
    sourcemap: true,
    // Three.js alone is ~850 kB minified and cannot be split usefully; warn only beyond it.
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        // Libraries change far less often than the app: separate chunks stay cached across releases.
        codeSplitting: {
          groups: [
            { name: "three", test: /node_modules[\\/](\.pnpm[\\/])?three/ },
            { name: "vendor", test: /node_modules/ },
          ],
        },
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/core/**", "src/scene/**", "src/sim/**"],
      exclude: ["**/*.test.ts", "**/index.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85,
      },
    },
  },
});
