import { Color } from "three";
import type { Growth } from "../../scene/schema";
import type { ShaderPatch } from "./patch";

/**
 * Life on the rock (a scene's `growth`), painted over its color in world
 * space, so it needs no UVs: algae on the faces turned up to the light,
 * thinning out on steep walls; crusts of coralline algae in patches; and
 * crevices under overhangs darker, where little light reaches. Patches come
 * from value noise at two scales, so they have soft, irregular edges.
 *
 * Uniforms:
 * - uGrowthAlgae (0..1): share of the upward faces covered by algae.
 * - uGrowthAlgaeColor (linear RGB): their color.
 * - uGrowthCoralline (0..1): share of the rock crusted with coralline algae.
 * - uGrowthCorallineColor (linear RGB): their color.
 * - uGrowthScale (1/m): patches per meter, the inverse of the patch size.
 */

/** Darkest a downward-facing crevice gets, as a share of its color. */
const CREVICE_SHADE = 0.6;

export function growthPatch(growth: Growth): ShaderPatch {
  return {
    name: "growth",
    uniforms: {
      uGrowthAlgae: { value: growth.algae },
      uGrowthAlgaeColor: { value: new Color(growth.algaeColor) },
      uGrowthCoralline: { value: growth.coralline },
      uGrowthCorallineColor: { value: new Color(growth.corallineColor) },
      uGrowthScale: { value: 1 / growth.patch },
    },
    vertexHead: /* glsl */ `
      varying vec3 vGrowthPosition;
      varying vec3 vGrowthNormal;
    `,
    vertex: [
      [
        "#include <project_vertex>",
        /* glsl */ `
        #include <project_vertex>
        vGrowthPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vGrowthNormal = normalize(mat3(modelMatrix) * objectNormal);
        `,
      ],
    ],
    fragmentHead: /* glsl */ `
      uniform float uGrowthAlgae;
      uniform vec3 uGrowthAlgaeColor;
      uniform float uGrowthCoralline;
      uniform vec3 uGrowthCorallineColor;
      uniform float uGrowthScale;
      varying vec3 vGrowthPosition;
      varying vec3 vGrowthNormal;

      float growthHash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      }

      // Value noise in 0..1, smooth between lattice points.
      float growthNoise(vec3 p) {
        vec3 cell = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = mix(growthHash(cell), growthHash(cell + vec3(1, 0, 0)), f.x);
        float b = mix(growthHash(cell + vec3(0, 1, 0)), growthHash(cell + vec3(1, 1, 0)), f.x);
        float c = mix(growthHash(cell + vec3(0, 0, 1)), growthHash(cell + vec3(1, 0, 1)), f.x);
        float d = mix(growthHash(cell + vec3(0, 1, 1)), growthHash(cell + vec3(1, 1, 1)), f.x);
        return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
      }
    `,
    fragment: [
      [
        "#include <color_fragment>",
        /* glsl */ `
        #include <color_fragment>
        {
          vec3 p = vGrowthPosition * uGrowthScale;
          float broad = growthNoise(p);
          float fine = growthNoise(p * 3.7 + 11.3);
          float up = normalize(vGrowthNormal).y;
          // Algae take the faces turned to the light, in ragged patches.
          float algae = smoothstep(0.2, 0.75, up + (broad - 0.5) * 0.9) * uGrowthAlgae;
          algae *= smoothstep(1.0 - uGrowthAlgae, 1.0, broad * 0.5 + fine * 0.5 + 0.35);
          // Coralline crusts in patches anywhere the algae leave room.
          float crust = smoothstep(
            1.0 - uGrowthCoralline,
            1.0 - uGrowthCoralline + 0.12,
            broad * 0.65 + fine * 0.35
          ) * (1.0 - algae);
          diffuseColor.rgb = mix(diffuseColor.rgb, uGrowthAlgaeColor * (0.7 + 0.6 * fine), algae);
          diffuseColor.rgb = mix(diffuseColor.rgb, uGrowthCorallineColor * (0.8 + 0.4 * fine), crust * 0.85);
          // Crevices under overhangs get little light.
          diffuseColor.rgb *= mix(1.0, ${CREVICE_SHADE.toFixed(2)}, smoothstep(0.0, -0.8, up));
        }
        `,
      ],
    ],
  };
}
