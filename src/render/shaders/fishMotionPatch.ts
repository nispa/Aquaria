import type { IUniform } from "three";
import type { ShaderPatch } from "./patch";

/** Where the body starts bending into a turn, in body lengths from the centre (the head stays rigid). */
const BEND_PIVOT = 0.2;
/** Below this curvature the body is treated as straight, avoiding a division by zero. */
const MIN_CURVATURE = 1e-4;
/** The tail wave: radians per body length, and how far behind the centre it starts. */
const WAVE_NUMBER = 6;
const WAVE_START = 0.25;
/** The sweeping tail pulls the body slightly shorter, as a share of the sweep. */
const SWEEP_SHORTENING = 0.15;

// A type alias (not an interface) so it is assignable to Record<string, IUniform>.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type FishMotionUniforms = {
  /** Tail sweep while cruising, in body lengths (0..0.2). */
  readonly uSwimAmplitude: IUniform<number>;
};

/**
 * How every fish moves, whatever its body: procedural or a glTF model.
 * The rear of the body swims with a travelling wave driven by each instance's
 * swim phase, sweeping harder with effort, and curves into turns along a
 * circular arc, like a spine. Individual fish fade in and out.
 *
 * Runs after the morph targets, so an opening mouth swims with the head.
 *
 * Instance attributes (fishInstancePatch): aSwimPhase (radians), aOpacity (0..1),
 * aBend (curvature times body length, positive into a left turn, -2.5..2.5),
 * aEffort (tail sweep relative to cruising, 0.5..2.2).
 * The geometry is one body length long along +x, snout at +0.5, dorsal fin up.
 */
export function fishMotionPatch(uniforms: FishMotionUniforms): ShaderPatch {
  return {
    name: "fish-motion",
    uniforms,
    vertexHead: /* glsl */ `
      uniform float uSwimAmplitude;
      varying float vFishOpacity;

      // The body behind the pivot follows a circular arc of curvature aBend
      // (in body lengths). Returns the arc angle at this point; -z is the
      // fish's left, so a left turn curls the tail towards -z.
      float bendAngle(float x) {
        return aBend * max(${BEND_PIVOT.toFixed(2)} - x, 0.0);
      }
      vec2 rotateBend(vec2 xz, float angle) {
        float c = cos(angle);
        float s = sin(angle);
        return vec2(xz.x * c - xz.y * s, xz.x * s + xz.y * c);
      }
    `,
    vertex: [
      [
        "#include <beginnormal_vertex>",
        /* glsl */ `
        #include <beginnormal_vertex>
        objectNormal.xz = rotateBend(objectNormal.xz, bendAngle(position.x));
        `,
      ],
      [
        "#include <skinning_vertex>",
        /* glsl */ `
        vFishOpacity = aOpacity;
        {
          // Only the rear two thirds bend; the head stays steady like a real fish.
          float rear = smoothstep(${WAVE_START.toFixed(2)}, -0.5, position.x);
          float wave = sin(aSwimPhase - position.x * ${WAVE_NUMBER.toFixed(1)});
          float sweep = uSwimAmplitude * aEffort;
          transformed.z += wave * sweep * rear;
          transformed.x -= abs(wave) * sweep * ${SWEEP_SHORTENING.toFixed(2)} * rear;
        }
        {
          // Lay the point along the arc: the spine point at arc length d behind
          // the pivot, plus the sideways offset rotated with the spine.
          float d = max(${BEND_PIVOT.toFixed(2)} - transformed.x, 0.0);
          float curvature = abs(aBend) < ${MIN_CURVATURE} ? ${MIN_CURVATURE} : aBend;
          float angle = curvature * d;
          // Points ahead of the pivot (the head) keep their x.
          float ahead = max(transformed.x - ${BEND_PIVOT.toFixed(2)}, 0.0);
          vec2 spine = vec2(
            ${BEND_PIVOT.toFixed(2)} + ahead - sin(angle) / curvature,
            -(1.0 - cos(angle)) / curvature
          );
          vec2 side = rotateBend(vec2(0.0, transformed.z), angle);
          transformed.xz = spine + side;
        }
        #include <skinning_vertex>
        `,
      ],
    ],
    fragmentHead: /* glsl */ `
      varying float vFishOpacity;
    `,
    fragment: [
      [
        "#include <alphatest_fragment>",
        /* glsl */ `
        diffuseColor.a *= vFishOpacity;
        #include <alphatest_fragment>
        `,
      ],
    ],
  };
}
