import type { IUniform, Texture } from "three";
import type { ShaderPatch } from "./patch";

/**
 * Contact shadows on the sand (render/contactShade): the floor's colour is
 * multiplied by the share of light a grid over the tank's floor leaves
 * there, darker round the foot of rock and corals. Outside the grid the
 * sand is untouched.
 *
 * Uniforms:
 * - uContactShade (texture, red channel 0..1): light left on the sand;
 * - uContactArea (vec4, m): the grid's left x, back z, width and depth.
 */
export interface ContactShadeUniforms extends Record<string, IUniform> {
  readonly uContactShade: { value: Texture | null };
  readonly uContactArea: { value: [number, number, number, number] };
}

export function contactShadePatch(uniforms: ContactShadeUniforms): ShaderPatch {
  return {
    name: "contact-shade",
    uniforms,
    vertexHead: /* glsl */ `
      varying vec2 vContactPlace;
    `,
    vertex: [
      [
        "#include <fog_vertex>",
        /* glsl */ `
        #include <fog_vertex>
        vContactPlace = (modelMatrix * vec4(transformed, 1.0)).xz;
        `,
      ],
    ],
    fragmentHead: /* glsl */ `
      uniform sampler2D uContactShade;
      uniform vec4 uContactArea;
      varying vec2 vContactPlace;
    `,
    fragment: [
      [
        "#include <color_fragment>",
        /* glsl */ `
        #include <color_fragment>
        {
          vec2 contactUv = (vContactPlace - uContactArea.xy) / uContactArea.zw;
          if (all(greaterThanEqual(contactUv, vec2(0.0))) && all(lessThanEqual(contactUv, vec2(1.0)))) {
            diffuseColor.rgb *= texture2D(uContactShade, contactUv).r;
          }
        }
        `,
      ],
    ],
  };
}
