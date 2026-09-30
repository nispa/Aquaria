import { NoColorSpace, RepeatWrapping, Texture, type IUniform } from "three";
import type { Logger } from "../core/logger";

/** Loads one texture; injected so tests run without a browser. */
export type TextureSource = (url: string) => Promise<Texture>;

/** Textures of one surface material, shared by every mesh that uses it. */
export interface SurfaceTextures {
  readonly normal: IUniform<Texture>;
  /** R = displacement (0..1), G = roughness, B = brightness detail (0.5 = average). */
  readonly surface: IUniform<Texture>;
  /** 0 until both textures have loaded; shaders keep the plain look meanwhile. */
  readonly ready: IUniform<number>;
}

export interface SurfaceLibrary {
  get(id: string): SurfaceTextures;
  /** Resolves when every material requested so far has loaded or failed. */
  settled(): Promise<void>;
  /** Sets the anisotropic filtering used for textures loaded from now on and already loaded. */
  setAnisotropy(level: number): void;
  dispose(): void;
}

const MATERIALS_FOLDER = "assets/materials";

/**
 * Surface materials by id. Each is loaded once and reused; a missing file logs
 * a warning and leaves the material on its plain color instead of failing.
 */
export function createSurfaceLibrary(load: TextureSource, logger: Logger): SurfaceLibrary {
  const materials = new Map<string, SurfaceTextures>();
  const textures: Texture[] = [];
  const loading: Promise<void>[] = [];
  let anisotropy = 1;

  const prepare = (texture: Texture): Texture => {
    // Normals, roughness and relief are data, not colors.
    texture.colorSpace = NoColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    textures.push(texture);
    return texture;
  };

  const get = (id: string): SurfaceTextures => {
    const existing = materials.get(id);
    if (existing !== undefined) return existing;
    const entry: SurfaceTextures = {
      normal: { value: new Texture() },
      surface: { value: new Texture() },
      ready: { value: 0 },
    };
    materials.set(id, entry);
    const folder = `${MATERIALS_FOLDER}/${id}`;
    const done = Promise.all([load(`${folder}/normal.webp`), load(`${folder}/surface.webp`)])
      .then(([normal, surface]) => {
        entry.normal.value = prepare(normal);
        entry.surface.value = prepare(surface);
        entry.ready.value = 1;
      })
      .catch((error: unknown) => {
        logger.warn("Material textures could not be loaded; plain color used", {
          material: id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    loading.push(done);
    return entry;
  };

  return {
    get,
    settled: async () => {
      await Promise.all(loading);
    },
    setAnisotropy(level) {
      anisotropy = level;
      textures.forEach((texture) => {
        texture.anisotropy = level;
      });
    },
    dispose() {
      textures.forEach((texture) => {
        texture.dispose();
      });
      textures.length = 0;
      materials.clear();
    },
  };
}
