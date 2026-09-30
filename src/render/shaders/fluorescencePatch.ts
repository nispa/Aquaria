import type { WaterUniforms } from "../uniforms";
import type { ShaderPatch } from "./patch";

/**
 * Coral fluorescence: under actinic blue and violet light, pigments glow in
 * their own color. The glow is emitted light, so it shows even at dusk when
 * little else is lit.
 *
 * Uniforms: uFluorescence (0..1, from WaterUniforms): current excitation.
 */

/** Glow at full excitation, as a share of the surface color. */
const STRENGTH = 0.6;

export function fluorescencePatch(water: WaterUniforms): ShaderPatch {
  return {
    name: "fluorescence",
    uniforms: { uFluorescence: water.uFluorescence },
    fragmentHead: /* glsl */ `
      uniform float uFluorescence;
    `,
    fragment: [
      [
        "#include <emissivemap_fragment>",
        /* glsl */ `
        #include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * uFluorescence * ${STRENGTH.toFixed(2)};
        `,
      ],
    ],
  };
}
