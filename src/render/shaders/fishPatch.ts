import type { IUniform } from "three";
import type { ShaderPatch } from "./patch";

/** Scales along one body length, and rows over the body height. */
const SCALES_ALONG = 52;
const SCALE_ROWS = 11;
/** Scale relief depth as a share of the scale size. */
const SCALE_DEPTH = 0.05;
/** Fins are thin: see-through and paler than the body. */
const FIN_OPACITY = 0.62;
const FIN_PALENESS = 0.22;

/** Pattern ids shared with the fish geometry code. Order matters (GLSL int). */
export const PATTERN_IDS = {
  belly: 0,
  tail: 1,
  bands: 2,
  split: 3,
  "eye-bar": 4,
  stripes: 5,
  bars: 6,
  idol: 7,
} as const;

// A type alias (not an interface) so it is assignable to Record<string, IUniform>.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type FishUniforms = {
  /** Species colors, linear RGB. */
  readonly uBaseColor: IUniform;
  readonly uAccentColor: IUniform;
  /** Third pattern color (face mask, yellow patches), linear RGB. */
  readonly uDetailColor: IUniform;
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
 * individual fish in and out. The skin gets overlapping scales with real
 * relief (derivative bump mapping), fins are paler, translucent and ribbed.
 *
 * Instance attributes: aSwimPhase (radians), aOpacity (0..1).
 * Vertex attribute: aFin (0 body, 1 fin).
 * The geometry is one body length long along +x, nose at +0.5.
 */
export function fishPatch(uniforms: FishUniforms): ShaderPatch {
  return {
    name: "fish",
    uniforms,
    vertexHead: /* glsl */ `
      attribute float aSwimPhase;
      attribute float aOpacity;
      attribute float aFin;
      uniform float uSwimAmplitude;
      varying vec3 vBodyPosition;
      varying float vOpacity;
      varying float vFin;
      varying float vBodyLength;
    `,
    vertex: [
      [
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>
        vBodyPosition = position;
        vOpacity = aOpacity;
        vFin = aFin;
        #ifdef USE_INSTANCING
          // The instance scale is the fish's length in meters.
          vBodyLength = length(instanceMatrix[0].xyz);
        #else
          vBodyLength = 1.0;
        #endif
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
      uniform vec3 uDetailColor;
      uniform int uPattern;
      uniform float uHalfHeight;
      varying vec3 vBodyPosition;
      varying float vOpacity;
      varying float vFin;
      varying float vBodyLength;

      // Scales: rows along the body, each row offset by half a scale, each
      // scale a dome whose centre is shifted forward so they overlap towards
      // the tail like tiles.
      const float SCALES_ALONG = ${SCALES_ALONG.toFixed(1)};
      const float SCALE_ROWS = ${SCALE_ROWS.toFixed(1)};
      float scaleDome(vec3 p) {
        vec2 uv = vec2(p.x * SCALES_ALONG, (p.y / uHalfHeight) * SCALE_ROWS);
        float row = floor(uv.y);
        uv.x += 0.5 * mod(row, 2.0);
        vec2 cell = fract(uv) - 0.5;
        float d = length(cell * vec2(1.0, 1.25) + vec2(0.18, 0.0));
        return 1.0 - smoothstep(0.15, 0.62, d);
      }

      // Scales fade out where they would shimmer (a fish only a few pixels
      // tall), on the head and on the fins.
      float scaleVisibility(vec3 p) {
        float pixelsPerScale = 1.0 / max(fwidth(p.x * SCALES_ALONG), 1e-4);
        return smoothstep(3.0, 6.0, pixelsPerScale) * smoothstep(0.3, 0.2, p.x) * (1.0 - vFin);
      }

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

      // Reef patterns (4..7) use three colors. The tail fin starts at x = -0.42;
      // fins stick out beyond the body's half height.
      vec3 reefColor(vec3 p) {
        float y = p.y / uHalfHeight;
        float tail = smoothstep(-0.42, -0.46, p.x);
        vec3 color = uBaseColor;
        if (uPattern == 4) {
          // Butterflyfish: a dark bar through the eye and a false eye near the tail.
          float bar = band(p.x, 0.34, 0.05) * smoothstep(-0.9, -0.6, y);
          float spot = 1.0 - smoothstep(0.035, 0.045, length(p.xy - vec2(-0.22, uHalfHeight * 0.45)));
          color = mix(color, uAccentColor, max(bar, spot));
          color = mix(color, uDetailColor, tail * 0.8);
        } else if (uPattern == 5) {
          // Angelfish: thin lengthwise stripes, a dark face mask and a bright tail.
          float stripes = smoothstep(0.55, 0.8, sin(y * 14.0 + p.x * 6.0));
          color = mix(color, uAccentColor, stripes);
          color = mix(color, uDetailColor, band(p.x, 0.33, 0.045));
          color = mix(color, uAccentColor, tail);
        } else if (uPattern == 6) {
          // Three-bar damsel: broad dark bars across a pale body.
          float bars = max(max(band(p.x, 0.32, 0.07), band(p.x, 0.02, 0.08)), band(p.x, -0.3, 0.07));
          color = mix(color, uAccentColor, max(bars, tail));
        } else {
          // Moorish idol: two black bands, a yellow rear flank, a black tail.
          float bands = max(band(p.x, 0.2, 0.1), band(p.x, -0.29, 0.07));
          float flank = smoothstep(0.08, 0.02, p.x) * smoothstep(-0.22, -0.16, p.x) * smoothstep(-0.2, 0.3, y);
          float banner = smoothstep(1.05, 1.25, y);
          color = mix(color, uDetailColor, flank);
          color = mix(color, uAccentColor, max(bands, tail));
          color = mix(color, uBaseColor, banner);
          color = mix(color, uDetailColor, smoothstep(0.42, 0.46, p.x));
        }
        return color;
      }

      // Eye: dark pupil, golden iris ring and a small catchlight.
      vec3 paintEye(vec3 color, vec3 p) {
        vec2 eye = vec2(0.34, uHalfHeight * 0.28);
        float r = length(p.xy - eye);
        float iris = 1.0 - smoothstep(0.026, 0.031, r);
        float pupil = 1.0 - smoothstep(0.013, 0.017, r);
        float glint = 1.0 - smoothstep(0.003, 0.006, length(p.xy - eye - vec2(0.007, 0.007)));
        color = mix(color, vec3(0.55, 0.42, 0.12), iris * (1.0 - vFin));
        color = mix(color, vec3(0.01), pupil * (1.0 - vFin));
        return mix(color, vec3(1.0), glint * (1.0 - vFin));
      }

      // Fin rays: radiating from the tail stem on the tail, parallel elsewhere.
      float finRays(vec3 p) {
        float angle = atan(p.y, p.x + 0.42);
        float rays = p.x < -0.42 ? sin(angle * 38.0) : sin(p.x * 150.0);
        return smoothstep(0.55, 1.0, rays);
      }
    `,
    fragment: [
      [
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        /* glsl */ `
        vec3 bodyColor = uPattern >= 4
          ? reefColor(vBodyPosition)
          : mix(uBaseColor, uAccentColor, patternMask(vBodyPosition));
        float scales = scaleVisibility(vBodyPosition);
        // Scale edges catch less light than their domed centres.
        bodyColor *= mix(1.0, 0.94 + 0.08 * scaleDome(vBodyPosition), scales);
        bodyColor = mix(bodyColor, bodyColor * 0.7, finRays(vBodyPosition) * vFin * 0.6);
        bodyColor = mix(bodyColor, mix(bodyColor, vec3(1.0), ${FIN_PALENESS.toFixed(2)}), vFin);
        bodyColor = paintEye(bodyColor, vBodyPosition);
        float finAlpha = mix(1.0, ${FIN_OPACITY.toFixed(2)}, vFin);
        vec4 diffuseColor = vec4(bodyColor, opacity * vOpacity * finAlpha);
        `,
      ],
      [
        "#include <normal_fragment_maps>",
        /* glsl */ `
        #include <normal_fragment_maps>
        {
          // Bump the scales (Mikkelsen's derivative method, as Three.js' bump
          // map): the relief is in meters, from the scale size on this fish.
          float scaleSize = vBodyLength / SCALES_ALONG;
          float relief = scaleDome(vBodyPosition) * scaleSize * ${SCALE_DEPTH.toFixed(2)}
            * scaleVisibility(vBodyPosition);
          vec2 dHdxy = vec2(dFdx(relief), dFdy(relief));
          vec3 sigmaX = dFdx(-vViewPosition);
          vec3 sigmaY = dFdy(-vViewPosition);
          vec3 r1 = cross(sigmaY, normal);
          vec3 r2 = cross(normal, sigmaX);
          float det = dot(sigmaX, r1) * faceDirection;
          vec3 gradient = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
          normal = normalize(abs(det) * normal - gradient);
        }
        `,
      ],
    ],
  };
}
