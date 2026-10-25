import {
  DataArrayTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  type AnimationClip,
  type Object3D,
  type Texture,
  type WebGLRenderer,
} from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

/** Where the build serves Three.js' Basis transcoder (see vite.config.ts). */
const BASIS_TRANSCODER_PATH = "basis/";

export interface AssetLoaders {
  /**
   * KTX2 textures, kept compressed on the GPU (about a quarter of the memory
   * of PNG or WebP), which matters at 4K.
   */
  readonly textures: KTX2Loader;
  /** glTF scenes with meshopt-compressed geometry and KTX2 textures. */
  readonly loadModel: (url: string) => Promise<Object3D>;
  /** The same, with the model's animation clips. */
  readonly loadAnimated: (
    url: string,
  ) => Promise<{ readonly root: Object3D; readonly clips: readonly AnimationClip[] }>;
  /**
   * Coloring textures (PNG, WebP, JPEG of one size) stacked into one
   * texture array, the first image the first layer; a layer without a URL
   * is left empty (a coloring of plain colors only).
   */
  readonly loadColorings: (urls: readonly (string | undefined)[]) => Promise<Texture>;
  /** Stops the transcoder workers. */
  dispose(): void;
}

/** Bytes per texel of an RGBA image. */
const RGBA = 4;

/**
 * An image's texels, top row first, as glTF UVs read them; one wider or
 * taller than `limit` is scaled down to fit it.
 */
async function imagePixels(url: string, limit: number | undefined): Promise<ImageData> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${String(response.status)}`);
  const blob = await response.blob();
  const options: ImageBitmapOptions = { premultiplyAlpha: "none", colorSpaceConversion: "none" };
  const full = await createImageBitmap(blob, options);
  const scale = limit === undefined ? 1 : Math.min(limit / Math.max(full.width, full.height), 1);
  const bitmap =
    scale === 1
      ? full
      : await createImageBitmap(blob, {
          ...options,
          resizeWidth: Math.round(full.width * scale),
          resizeHeight: Math.round(full.height * scale),
          resizeQuality: "high",
        });
  if (bitmap !== full) full.close();
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("No 2D canvas to read the coloring from.");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

async function loadTextureArray(
  urls: readonly (string | undefined)[],
  limit: number | undefined,
): Promise<Texture> {
  const images = await Promise.all(
    urls.map((url) => (url === undefined ? Promise.resolve(undefined) : imagePixels(url, limit))),
  );
  const first = images.find((image) => image !== undefined);
  if (first === undefined) throw new Error("A coloring needs at least one texture.");
  const { width, height } = first;
  const layer = width * height * RGBA;
  const data = new Uint8Array(layer * images.length);
  for (const [index, image] of images.entries()) {
    if (image === undefined) continue;
    if (image.width !== width || image.height !== height) {
      throw new Error(
        `${urls[index] ?? ""} is not ${String(width)}×${String(height)} like the first coloring.`,
      );
    }
    data.set(image.data, index * layer);
  }
  const texture = new DataArrayTexture(data, width, height, images.length);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Loaders for one renderer: compressed texture formats depend on its GPU
 * support. `coloringLimit` is the most texels across a coloring may keep
 * (see fishTextureLimit); larger ones are scaled down as they load.
 */
export function createAssetLoaders(renderer: WebGLRenderer, coloringLimit?: number): AssetLoaders {
  const textures = new KTX2Loader().setTranscoderPath(BASIS_TRANSCODER_PATH);
  textures.detectSupport(renderer);
  const models = new GLTFLoader().setKTX2Loader(textures).setMeshoptDecoder(MeshoptDecoder);
  return {
    textures,
    loadModel: (url) => models.loadAsync(url).then((gltf) => gltf.scene),
    loadAnimated: (url) =>
      models.loadAsync(url).then((gltf) => ({ root: gltf.scene, clips: gltf.animations })),
    loadColorings: (urls) => loadTextureArray(urls, coloringLimit),
    dispose() {
      textures.dispose();
    },
  };
}
