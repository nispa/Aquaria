import { spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { format } from "prettier";
import type { Plugin } from "vite";
import { builtManifest, parseBuiltValues } from "../src/scene/builtManifest";
import { parseFishRecipe } from "../src/scene/fishRecipe";

/**
 * The fish maker's side of the dev server (`pnpm dev` only): it lists the
 * recipes, saves one the designer page sends, and builds it, running
 * Blender with scripts/blender/fishbuild.py, compressing the model and
 * laying the measured values over the species' model.json. See
 * docs/FISH_MODELS.md.
 */

const SPECIES = "public/assets/species";
const RECIPE = "fish.json";
const SPECIES_ID = /^[a-z0-9-]+$/;
/** The same compressor as the guides', pinned. */
const GLTF_TRANSFORM = "@gltf-transform/cli@4.5.1";
const BLENDER_FOLDERS = ["C:/Program Files/Blender Foundation", "/Applications"];

/** Blender: $BLENDER, else the newest one installed where installers put it, else `blender` on the PATH. */
function findBlender(): string {
  const chosen = process.env.BLENDER;
  if (chosen !== undefined && chosen !== "") return chosen;
  for (const folder of BLENDER_FOLDERS.filter((path) => existsSync(path))) {
    const installs = readdirSync(folder)
      .filter((name) => name.startsWith("Blender"))
      .sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
    for (const install of installs) {
      for (const program of ["blender.exe", "Contents/MacOS/Blender"]) {
        const path = join(folder, install, program);
        if (existsSync(path)) return path;
      }
    }
  }
  return "blender";
}

/** Runs a program, collecting what it prints; rejects with the output when it fails. */
function run(program: string, args: readonly string[], shell = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const quoted = shell ? args.map((arg) => `"${arg}"`) : args;
    const child = spawn(program, quoted, { shell });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("error", (error) => {
      reject(new Error(`${program}: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${program} exited with ${String(code)}\n${output}`));
    });
  });
}

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk: Buffer) => (body += chunk.toString()));
    request.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    request.on("error", reject);
  });
}

function reply(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  writeFileSync(
    path,
    await format(JSON.stringify(value, null, 2), { parser: "json", filepath: path }),
  );
}

/** Checks a recipe and writes it into its species folder. */
async function save(id: string, input: unknown): Promise<string> {
  parseFishRecipe(input, id);
  const folder = join(SPECIES, id);
  mkdirSync(folder, { recursive: true });
  const path = join(folder, RECIPE);
  await writeJson(path, input);
  return path;
}

/** Builds a saved recipe into the species folder; returns what the tools printed. */
async function build(id: string, recipePath: string, name: string): Promise<string> {
  const out = mkdtempSync(join(tmpdir(), "aquaria-fish-"));
  try {
    const folder = join(SPECIES, id);
    let log = await run(findBlender(), [
      "--background",
      "--factory-startup",
      "--python",
      "scripts/blender/fishbuild.py",
      "--",
      recipePath,
      out,
    ]);
    log += await run(
      "npx",
      [
        "-y",
        GLTF_TRANSFORM,
        "optimize",
        join(out, "model.glb"),
        join(folder, "model.glb"),
        "--compress",
        "meshopt",
        "--simplify",
        "false",
        "--texture-compress",
        "false",
      ],
      true,
    );
    mkdirSync(join(folder, "colorings"), { recursive: true });
    for (const file of readdirSync(join(out, "colorings"))) {
      copyFileSync(join(out, "colorings", file), join(folder, "colorings", file));
    }
    const values = parseBuiltValues(
      JSON.parse(readFileSync(join(out, "model-values.json"), "utf8")),
    );
    const manifestPath = join(folder, "model.json");
    const existing: unknown = existsSync(manifestPath)
      ? JSON.parse(readFileSync(manifestPath, "utf8"))
      : undefined;
    await writeJson(manifestPath, builtManifest(existing, id, name, values));
    return log;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

/** The recipes there are: species folders with a fish.json. */
function recipes(): { readonly id: string; readonly name: string }[] {
  return readdirSync(SPECIES)
    .filter((id) => existsSync(join(SPECIES, id, RECIPE)))
    .map((id) => {
      const recipe = JSON.parse(readFileSync(join(SPECIES, id, RECIPE), "utf8")) as {
        name?: unknown;
      };
      return { id, name: typeof recipe.name === "string" ? recipe.name : id };
    });
}

export function fishMakerServer(): Plugin {
  let building = false;
  return {
    name: "fish-maker",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const match = /^\/__fish\/(recipes|save|build)(?:\/([^/?]+))?/.exec(request.url ?? "");
        if (match === null) {
          next();
          return;
        }
        const [, action, id] = match;
        if (action === "recipes") {
          reply(response, 200, recipes());
          return;
        }
        if (request.method !== "POST" || id === undefined || !SPECIES_ID.test(id)) {
          reply(response, 400, {
            ok: false,
            error: "POST a recipe to /__fish/save/<id> or /__fish/build/<id>.",
          });
          return;
        }
        if (action === "build" && building) {
          reply(response, 409, { ok: false, error: "A build is already running." });
          return;
        }
        void (async () => {
          try {
            const input = await readBody(request);
            const path = await save(id, input);
            if (action === "save") {
              reply(response, 200, { ok: true });
              return;
            }
            building = true;
            const name = parseFishRecipe(input, id).name;
            const log = await build(id, path, name);
            reply(response, 200, { ok: true, log });
          } catch (error) {
            reply(response, 422, {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
          } finally {
            if (action === "build") building = false;
          }
        })();
      });
    },
  };
}
