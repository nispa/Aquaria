import type { Object3D, WebGLRenderer } from "three";
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
  /** Stops the transcoder workers. */
  dispose(): void;
}

/** Loaders for one renderer: compressed texture formats depend on its GPU support. */
export function createAssetLoaders(renderer: WebGLRenderer): AssetLoaders {
  const textures = new KTX2Loader().setTranscoderPath(BASIS_TRANSCODER_PATH);
  textures.detectSupport(renderer);
  const models = new GLTFLoader().setKTX2Loader(textures).setMeshoptDecoder(MeshoptDecoder);
  return {
    textures,
    loadModel: (url) => models.loadAsync(url).then((gltf) => gltf.scene),
    dispose() {
      textures.dispose();
    },
  };
}
