import type { WaterUniforms } from "../uniforms";
import type { ShaderPatch } from "./patch";

export interface LeafStyle {
  /** Parallel veins across a blade; 0 for round shapes such as tentacles. */
  readonly veins: number;
  /** How dark the veins are, 0..1. */
  readonly veinStrength: number;
}

/**
 * Sways plants with the water current plus a slow oscillation. The bend grows
 * with the square of the height along the blade, so the base stays planted.
 * Leaves get procedural detail: a midrib and parallel veins, a slightly
 * different tone per blade, and thin-tissue translucency at grazing angles.
 *
 * Instance attributes: aSwayPhase (radians), aHeight (m).
 * Vertex attribute: aAcross (0..1 across a blade, 0.5 on the midrib).
 * Uniforms: uTime, uCurrent, uLightColor (from WaterUniforms);
 * uSwayAmount (m, 0..0.5); uVeins (count, 0..12); uVeinStrength (0..1).
 * The blade geometry spans y = 0..1 before instance scaling.
 */
export function plantPatch(
  water: WaterUniforms,
  uSwayAmount: { value: number },
  leaf: LeafStyle,
): ShaderPatch {
  return {
    name: "plant",
    uniforms: {
      ...water,
      uSwayAmount,
      uVeins: { value: leaf.veins },
      uVeinStrength: { value: leaf.veinStrength },
    },
    vertexHead: /* glsl */ `
      attribute float aSwayPhase;
      attribute float aHeight;
      attribute float aAcross;
      uniform float uTime;
      uniform vec3 uCurrent;
      uniform float uSwayAmount;
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
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        {
          float bend = position.y * position.y * aHeight;
          vec2 oscillation = vec2(
            sin(uTime * 0.7 + aSwayPhase + position.y * 1.5),
            cos(uTime * 0.53 + aSwayPhase * 1.7)
          );
          mvPosition.xz += (uCurrent.xz * 4.0 + oscillation * uSwayAmount) * bend;
          mvPosition.y -= length(uCurrent.xz) * 1.5 * bend * position.y;
        }
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
        `,
      ],
    ],
    fragmentHead: /* glsl */ `
      uniform float uVeins;
      uniform float uVeinStrength;
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
          float translucency = pow(1.0 - facing, 2.0) * 0.35 * (0.3 + 0.7 * vAlongBlade);
          totalEmissiveRadiance += diffuseColor.rgb * uLightColor * translucency;
        }
        `,
      ],
    ],
  };
}
