import type { WaterUniforms } from "../uniforms";
import { CAUSTICS_GLSL } from "./caustics";
import type { ShaderPatch } from "./patch";

/**
 * Adds caustic light to any lit material, projected straight down from the
 * surface, stronger on upward-facing surfaces and closer to the surface, and
 * suppressed in shadow when shadows are enabled.
 *
 * Uniforms: see WaterUniforms (uTime, uCausticsIntensity, uCausticsScale,
 * uSurfaceY, uLightColor).
 */
export function causticsPatch(water: WaterUniforms): ShaderPatch {
  return {
    name: "caustics",
    uniforms: water,
    vertexHead: /* glsl */ `
      varying vec3 vCausticPosition;
      varying float vCausticFacing;
    `,
    vertex: [
      [
        "#include <fog_vertex>",
        /* glsl */ `
        #include <fog_vertex>
        {
          mat4 causticModel = modelMatrix;
          #ifdef USE_INSTANCING
            causticModel = modelMatrix * instanceMatrix;
          #endif
          vCausticPosition = (causticModel * vec4(transformed, 1.0)).xyz;
          vCausticFacing = normalize(mat3(causticModel) * objectNormal).y;
        }
        `,
      ],
    ],
    fragmentHead: /* glsl */ `
      uniform float uTime;
      uniform float uCausticsIntensity;
      uniform float uCausticsScale;
      uniform float uSurfaceY;
      uniform vec3 uLightColor;
      varying vec3 vCausticPosition;
      varying float vCausticFacing;
      ${CAUSTICS_GLSL}
      #include <shadowmask_pars_fragment>
    `,
    fragment: [
      [
        "#include <fog_fragment>",
        /* glsl */ `
        {
          float light = caustics(vCausticPosition.xz * uCausticsScale, uTime * 0.6);
          float depthBelowSurface = max(uSurfaceY - vCausticPosition.y, 0.0);
          float attenuation = exp(-depthBelowSurface * 0.18);
          float facing = clamp(vCausticFacing * 0.75 + 0.25, 0.0, 1.0);
          // Caustics are focused sunlight: they must vanish inside shadows.
          float sunlit = 1.0;
          #ifdef USE_SHADOWMAP
            sunlit = mix(0.12, 1.0, getShadowMask());
          #endif
          gl_FragColor.rgb += light * uCausticsIntensity * attenuation * facing * sunlit
            * uLightColor * diffuseColor.rgb * 1.6;
        }
        #include <fog_fragment>
        `,
      ],
    ],
  };
}
