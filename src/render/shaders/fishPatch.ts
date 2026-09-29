import type { IUniform } from "three";
import type { ShaderPatch } from "./patch";

/** Pattern ids shared with the fish geometry code. Order matters (GLSL int). */
export const PATTERN_IDS = { belly: 0, tail: 1, bands: 2, split: 3 } as const;

// A type alias (not an interface) so it is assignable to Record<string, IUniform>.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type FishUniforms = {
  /** Species colors, linear RGB. */
  readonly uBaseColor: IUniform;
  readonly uAccentColor: IUniform;
  /** One of PATTERN_IDS. */
  readonly uPattern: IUniform<number>;
  /** Half the body height in body lengths (0.1..0.4), used to normalise patterns. */
  readonly uHalfHeight: IUniform<number>;
  /** Tail sweep in body lengths (0..0.2). */
  readonly uSwimAmplitude: IUniform<number>;
};

/**
 * Procedural fish: bends the body with a travelling wave driven by each
 * instance's swim phase, paints the species pattern, adds eyes and fades
 * individual fish in and out.
 *
 * Instance attributes: aSwimPhase (radians), aOpacity (0..1).
 * The geometry is one body length long along +x, nose at +0.5.
 */
export function fishPatch(uniforms: FishUniforms): ShaderPatch {
  return {
    name: "fish",
    uniforms,
    vertexHead: /* glsl */ `
      attribute float aSwimPhase;
      attribute float aOpacity;
      uniform float uSwimAmplitude;
      varying vec3 vBodyPosition;
      varying float vOpacity;
    `,
    vertex: [
      [
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>
        vBodyPosition = position;
        vOpacity = aOpacity;
        {
          // Only the rear two thirds bend; the head stays steady like a real fish.
          float rear = smoothstep(0.25, -0.5, position.x);
          float wave = sin(aSwimPhase - position.x * 6.0);
          transformed.z += wave * uSwimAmplitude * rear;
          transformed.x -= abs(wave) * uSwimAmplitude * 0.15 * rear;
        }
        `,
      ],
    ],
    fragmentHead: /* glsl */ `
      uniform vec3 uBaseColor;
      uniform vec3 uAccentColor;
      uniform int uPattern;
      uniform float uHalfHeight;
      varying vec3 vBodyPosition;
      varying float vOpacity;

      float band(float x, float centre, float halfWidth) {
        return 1.0 - smoothstep(halfWidth * 0.7, halfWidth, abs(x - centre));
      }

      float patternMask(vec3 p) {
        float y = p.y / uHalfHeight;
        if (uPattern == 0) return smoothstep(0.05, -0.55, y);
        if (uPattern == 1) return smoothstep(-0.28, -0.36, p.x);
        if (uPattern == 2) {
          return max(max(band(p.x, 0.26, 0.05), band(p.x, -0.04, 0.06)), band(p.x, -0.36, 0.05));
        }
        return smoothstep(0.02, -0.06, p.x);
      }

      float eyeMask(vec3 p) {
        vec2 eye = vec2(0.34, uHalfHeight * 0.28);
        return 1.0 - smoothstep(0.022, 0.03, length(p.xy - eye));
      }
    `,
    fragment: [
      [
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        /* glsl */ `
        vec3 bodyColor = mix(uBaseColor, uAccentColor, patternMask(vBodyPosition));
        bodyColor = mix(bodyColor, vec3(0.01), eyeMask(vBodyPosition));
        vec4 diffuseColor = vec4(bodyColor, opacity * vOpacity);
        `,
      ],
    ],
  };
}
