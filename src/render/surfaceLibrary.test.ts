import { Texture } from "three";
import { describe, expect, it, vi } from "vitest";
import type { Logger } from "../core/logger";
import { createSurfaceLibrary, type TextureSource } from "./surfaceLibrary";

function fakeLogger(): { logger: Logger; warn: ReturnType<typeof vi.fn<Logger["warn"]>> } {
  const warn = vi.fn<Logger["warn"]>();
  return { logger: { info: vi.fn(), warn, error: vi.fn() }, warn };
}

const loadAll: TextureSource = () => Promise.resolve(new Texture());
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("surface library", () => {
  it("marks a material ready once its textures have loaded", async () => {
    const library = createSurfaceLibrary(loadAll, fakeLogger().logger);

    const surface = library.get("fine-sand");
    await flush();

    expect(surface.ready.value).toBe(1);
  });

  it("loads each material's textures only once", () => {
    const load = vi.fn(loadAll);
    const library = createSurfaceLibrary(load, fakeLogger().logger);

    library.get("reef-rock");
    library.get("reef-rock");

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("warns and keeps the plain look when textures are missing", async () => {
    const { logger, warn } = fakeLogger();
    const library = createSurfaceLibrary(() => Promise.reject(new Error("404")), logger);

    const surface = library.get("missing");
    await flush();

    expect(surface.ready.value).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      "Material textures could not be loaded; plain color used",
      expect.objectContaining({ material: "missing" }),
    );
  });

  it("requests the normal and surface maps from the material folder", () => {
    const load = vi.fn(loadAll);
    const library = createSurfaceLibrary(load, fakeLogger().logger);

    library.get("fine-sand");

    expect(load.mock.calls.map(([url]) => url)).toEqual([
      "assets/materials/fine-sand/normal.ktx2",
      "assets/materials/fine-sand/surface.ktx2",
    ]);
  });
});

describe("surface library readiness", () => {
  it("settles once every requested material has loaded or failed", async () => {
    let fail: (error: Error) => void = () => undefined;
    const pending = new Promise<Texture>((_, reject) => {
      fail = reject;
    });
    const library = createSurfaceLibrary(
      (url) => (url.includes("missing") ? pending : Promise.resolve(new Texture())),
      fakeLogger().logger,
    );
    library.get("fine-sand");
    library.get("missing");
    let settled = false;

    const done = library.settled().then(() => {
      settled = true;
    });
    await flush();
    const before = settled;
    fail(new Error("404"));
    await done;

    expect([before, settled]).toEqual([false, true]);
  });
});
