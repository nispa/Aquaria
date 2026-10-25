import type { Color, Texture } from "three";
import { MAX_COLORINGS } from "../../scene/schema";
import type { ShaderPatch } from "./patch";

export interface FishColoringOptions {
  /**
   * The textures of the colorings the species wears, one layer each in its
   * order (sampler2DArray, sRGB base color laid on the model's UVs).
   * `images[layer]` is 1 when that coloring has a texture, 0 when it keeps
   * the model's own.
   */
  readonly map?: { readonly texture: Texture; readonly images: readonly number[] };
  /**
   * This material's base color in each coloring the species wears, linear
   * RGB; its texture and vertex colors still shade it.
   */
  readonly tints?: readonly Color[];
}

/** A uniform array is always declared MAX_COLORINGS long: the rest repeats the last. */
const padded = <T>(values: readonly T[]): T[] =>
  Array.from(
    { length: MAX_COLORINGS },
    (_, index) => values[Math.min(index, values.length - 1)] as T,
  );

/**
 * Dresses each fish in its own coloring: the base color of a material comes
 * from the coloring the fish wears (`tints`), and a material with a texture
 * (`map`) reads it from that coloring's layer of a texture array, so a
 * school of several strains is still one draw call. A coloring without a
 * texture keeps the model's own.
 *
 * Instance attribute (fishInstancePatch): aColoring, the layer (0, 1, 2…).
 */
export function fishColoringPatch({ map, tints }: FishColoringOptions): ShaderPatch {
  const layers = String(MAX_COLORINGS);
  const tinted =
    tints === undefined
      ? ""
      : /* glsl */ `
        diffuseColor.rgb = uColoringTint[coloringLayer];
        `;
  const textured =
    map === undefined
      ? "#include <map_fragment>"
      : /* glsl */ `
        #ifdef USE_MAP
          if (uColoringImage[coloringLayer] > 0.5) {
            diffuseColor *= texture(uColoringMap, vec3(vMapUv, float(coloringLayer)));
          } else {
            diffuseColor *= texture2D(map, vMapUv);
          }
        #endif
        `;
  return {
    name: `fish-coloring${map === undefined ? "" : "-map"}${tints === undefined ? "" : "-tint"}`,
    uniforms: {
      ...(map === undefined
        ? {}
        : {
            uColoringMap: { value: map.texture },
            uColoringImage: { value: padded(map.images) },
          }),
      ...(tints === undefined ? {} : { uColoringTint: { value: padded(tints) } }),
    },
    vertexHead: /* glsl */ `
      varying float vColoring;
    `,
    vertex: [
      [
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>
        vColoring = aColoring;
        `,
      ],
    ],
    fragmentHead: /* glsl */ `
      varying float vColoring;
      ${map === undefined ? "" : `uniform highp sampler2DArray uColoringMap;\n      uniform float uColoringImage[${layers}];`}
      ${tints === undefined ? "" : `uniform vec3 uColoringTint[${layers}];`}
    `,
    fragment: [
      [
        "#include <map_fragment>",
        /* glsl */ `
        int coloringLayer = int(floor(vColoring + 0.5));
        ${tinted}
        ${textured}
        `,
      ],
    ],
  };
}
