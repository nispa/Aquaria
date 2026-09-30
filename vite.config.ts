import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

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

export default defineConfig({
  base: "./",
  plugins: [basisTranscoder()],
  build: {
    target: "es2022",
    sourcemap: true,
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
