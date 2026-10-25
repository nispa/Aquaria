import { Color, type Vector4 } from "three";
import type { WaterUniforms } from "../uniforms";
import type { ShaderPatch } from "./patch";

export interface LeafStyle {
  /** Parallel veins across a blade; 0 for round shapes such as tentacles. */
  readonly veins: number;
  /** How dark the veins are, 0..1. */
  readonly veinStrength: number;
}

/** Most fish the tentacles of anemones part around at once. */
export const MAX_PARTING = 6;

/**
 * Uniforms of plants whose tentacles move one by one (models with
 * `_STRAND`): the fish among them, shared by every such plant.
 * uParting: (x, y, z, radius) in m, MAX_PARTING long; uPartingCount: how many are set.
 */
export interface StrandUniforms {
  readonly uParting: { readonly value: readonly Vector4[] };
  readonly uPartingCount: { value: number };
}

/** Leaves turn to the tip color over the top share of the plant. */
const TIP_START = 0.55;

/**
 * Sways plants with the water current plus a slow oscillation. The bend grows
 * with the square of the sway weight (`aSway`, 0 at the base to 1 at the tips,
 * from `_SWAY` or height), so the base stays planted.
 * With `strands` (anemones), each tentacle (`aStrand`, 0..1, one value per
 * tentacle) moves at its own phase and pace, in a wave running from the
 * root to the tip; the whole anemone slowly opens and closes; and the
 * tentacles part around the fish among them.
 * Leaves get procedural detail: a midrib and parallel veins, a slightly
 * different tone per blade, and thin-tissue translucency at grazing angles.
 *
 * Instance attributes: aSwayPhase (radians), aHeight (m).
 * Vertex attributes: aAcross (0..1 across a blade, 0.5 on the midrib),
 * aSway (0..1 per-vertex sway weight, from `_SWAY` or height).
 * Uniforms: uTime, uCurrent, uLightColor (from WaterUniforms);
 * uSwayAmount (m, 0..0.5); uSwaySpeed (pace multiplier, > 0, default 1);
 * uVeins (count, 0..12); uVeinStrength (0..1);
 * uTipColor (linear RGB) and uTipAmount (0..1): leaves turn to this color near the top.
 * The blade geometry spans y = 0..1 before instance scaling.
 */
export function plantPatch(
  water: WaterUniforms,
  uSwayAmount: { value: number },
  leaf: LeafStyle,
  tipColor?: Color,
  swaySpeed = 1,
  strands?: StrandUniforms,
): ShaderPatch {
  const oscillation =
    strands === undefined
      ? /* glsl */ `
          float phase = uTime * uSwaySpeed;
          vec2 oscillation = vec2(
            sin(phase * 0.7 + aSwayPhase + aSway * 1.5),
            cos(phase * 0.53 + aSwayPhase * 1.7)
          );`
      : /* glsl */ `
          float strand = aStrand * 6.2832;
          float phase = uTime * uSwaySpeed * (0.75 + 0.5 * fract(aStrand * 7.31));
          // Minus the weight: the wave runs from the root out to the tip.
          vec2 oscillation = vec2(
            sin(phase * 0.9 + strand + aSwayPhase - aSway * 2.4),
            cos(phase * 0.7 + strand * 1.3 + aSwayPhase * 1.7 - aSway * 2.0)
          );`;
  const breathing =
    strands === undefined
      ? ""
      : /* glsl */ `
        // The whole anemone opens and closes slowly.
        mvPosition.xyz *= 1.0 + 0.04 * sin(uTime * 0.3 + aSwayPhase) * aSway;`;
  // The flora group stands at the origin, so instance space is the tank's.
  const parting =
    strands === undefined
      ? ""
      : /* glsl */ `
        for (int i = 0; i < ${String(MAX_PARTING)}; i++) {
          if (i >= uPartingCount) break;
          vec4 fish = uParting[i];
          vec3 away = mvPosition.xyz - fish.xyz;
          float distance = length(away);
          if (distance < fish.w && distance > 0.0001) {
            float push = 1.0 - distance / fish.w;
            mvPosition.xyz += away / distance * push * push * fish.w * 0.7 * aSway;
          }
        }`;
  return {
    name: strands === undefined ? "plant" : "plant-strands",
    uniforms: {
      ...water,
      ...(strands ?? {}),
      uSwayAmount,
      uSwaySpeed: { value: swaySpeed },
      uVeins: { value: leaf.veins },
      uVeinStrength: { value: leaf.veinStrength },
      uTipColor: { value: tipColor ?? new Color() },
      uTipAmount: { value: tipColor === undefined ? 0 : 1 },
    },
    vertexHead: /* glsl */ `
      attribute float aSwayPhase;
      attribute float aHeight;
      attribute float aAcross;
      attribute float aSway;
      ${strands === undefined ? "" : "attribute float aStrand;"}
      ${strands === undefined ? "" : `uniform vec4 uParting[${String(MAX_PARTING)}];`}
      ${strands === undefined ? "" : "uniform int uPartingCount;"}
      uniform float uTime;
      uniform vec3 uCurrent;
      uniform float uSwayAmount;
      uniform float uSwaySpeed;
      varying float vAlongBlade;
      varying float vAcrossBlade;
      varying float vBladeTone;
    `,
    vertex: [
      [
        "#include <project_vertex>",
        /* glsl */ `
        vAlongBlade = position.y;
        vAcrossBlade = aAcross;
        // A stable pseudo-random tone per blade, from its sway phase.
        vBladeTone = fract(sin(aSwayPhase * 12.9898) * 43758.5453);
        vec4 mvPosition = vec4(transformed, 1.0);
        ${breathing}
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        {
          float bend = aSway * aSway * aHeight;
          ${oscillation}
          mvPosition.xz += (uCurrent.xz * 4.0 + oscillation * uSwayAmount) * bend;
          mvPosition.y -= length(uCurrent.xz) * 1.5 * bend * aSway;
        }
        ${parting}
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
        `,
      ],
    ],
    fragmentHead: /* glsl */ `
      uniform float uVeins;
      uniform float uVeinStrength;
      uniform vec3 uTipColor;
      uniform float uTipAmount;
      // uLightColor is declared by the caustics patch, which plants always use.
      varying float vAlongBlade;
      varying float vAcrossBlade;
      varying float vBladeTone;
    `,
    fragment: [
      [
        "#include <color_fragment>",
        /* glsl */ `
        #include <color_fragment>
        diffuseColor.rgb *= mix(0.35, 1.15, vAlongBlade);
        diffuseColor.rgb *= 0.85 + 0.3 * vBladeTone;
        diffuseColor.rgb = mix(
          diffuseColor.rgb,
          uTipColor * (0.85 + 0.3 * vBladeTone),
          uTipAmount * smoothstep(${TIP_START.toFixed(2)}, 1.0, vAlongBlade)
        );
        if (uVeins > 0.0) {
          float across = vAcrossBlade - 0.5;
          float midrib = 1.0 - smoothstep(0.0, 0.035, abs(across));
          float veins = pow(abs(sin(across * 3.14159 * uVeins)), 12.0);
          // Edges are thinner and paler; veins run darker along the blade.
          float edge = smoothstep(0.35, 0.5, abs(across));
          diffuseColor.rgb *= 1.0 - uVeinStrength * (0.6 * midrib + 0.35 * (1.0 - veins));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.25, edge);
        }
        `,
      ],
      [
        "#include <emissivemap_fragment>",
        /* glsl */ `
        #include <emissivemap_fragment>
        {
          // Thin tissue lets light through: seen edge-on or against the light,
          // blades glow softly, more towards the sunlit tips.
          float facing = abs(dot(normal, normalize(vViewPosition)));
          // Rounding can push facing just past 1; pow of a negative base is NaN on
          // Direct3D, and bloom would smear that NaN over the whole screen.
          float translucency = pow(max(1.0 - facing, 0.0), 2.0) * 0.35 * (0.3 + 0.7 * vAlongBlade);
          totalEmissiveRadiance += diffuseColor.rgb * uLightColor * translucency;
        }
        `,
      ],
    ],
  };
}
