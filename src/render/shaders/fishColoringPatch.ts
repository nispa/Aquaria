import type { IUniform } from "three";
import type { ShaderPatch } from "./patch";

// A type alias (not an interface) so it is assignable to Record<string, IUniform>.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type FishColoringUniforms = {
  /**
   * The colorings the species wears, one layer each in its order
   * (sampler2DArray, sRGB base color laid on the model's UVs).
   */
  readonly uColoringMap: IUniform;
};

/**
 * Dresses each fish in its own coloring: the model's base-color texture is
 * read from the layer of the texture array the fish wears, so a school of
 * several strains is still one draw call. Only materials with a texture
 * (`map`) use it.
 *
 * Instance attribute (fishInstancePatch): aColoring, the layer (0, 1, 2…).
 */
export function fishColoringPatch(uniforms: FishColoringUniforms): ShaderPatch {
  return {
    name: "fish-coloring",
    uniforms,
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
      uniform highp sampler2DArray uColoringMap;
      varying float vColoring;
    `,
    fragment: [
      [
        "#include <map_fragment>",
        /* glsl */ `
        #ifdef USE_MAP
          diffuseColor *= texture(uColoringMap, vec3(vMapUv, floor(vColoring + 0.5)));
        #endif
        `,
      ],
    ],
  };
}
