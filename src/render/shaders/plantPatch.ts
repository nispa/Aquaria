import type { WaterUniforms } from "../uniforms";
import type { ShaderPatch } from "./patch";

/**
 * Sways plants with the water current plus a slow oscillation. The bend grows
 * with the square of the height along the blade, so the base stays planted.
 *
 * Instance attributes: aSwayPhase (radians), aHeight (m).
 * Uniforms: uTime, uCurrent (from WaterUniforms); uSwayAmount (m, 0..0.5).
 * The blade geometry spans y = 0..1 before instance scaling.
 */
export function plantPatch(water: WaterUniforms, uSwayAmount: { value: number }): ShaderPatch {
  return {
    name: "plant",
    uniforms: { ...water, uSwayAmount },
    vertexHead: /* glsl */ `
      attribute float aSwayPhase;
      attribute float aHeight;
      uniform float uTime;
      uniform vec3 uCurrent;
      uniform float uSwayAmount;
      varying float vAlongBlade;
    `,
    vertex: [
      [
        "#include <project_vertex>",
        /* glsl */ `
        vAlongBlade = position.y;
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
      varying float vAlongBlade;
    `,
    fragment: [
      [
        "#include <color_fragment>",
        /* glsl */ `
        #include <color_fragment>
        diffuseColor.rgb *= mix(0.35, 1.15, vAlongBlade);
        `,
      ],
    ],
  };
}
