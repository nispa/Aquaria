import type { IUniform } from "three";
import type { ShaderPatch } from "./patch";

/**
 * A fin is not a rigid paddle: its upper, leading edge leads the beat and
 * the wave runs down and out to the tip. Radians of lag across the base,
 * top to bottom, and along the fin, base to tip.
 */
const WAVE_ACROSS = 1.1;
const WAVE_ALONG = 0.9;
/**
 * Fins are soft: the base is held by the shoulder girdle and the rays bend,
 * so the tip swings further than the base, by this share more at the tip
 * (it curls rather than turning like a plastic paddle on a hinge).
 */
const CURL = 0.8;
/** A beat swings the fin out more than in, as far as a share of the sweep: it rows from near the body. */
const STROKE_OUTWARD = 0.4;
/** How far a fully spread fin stands out beyond its modelled pose, radians (to brake, to pivot). */
const FLARE = 0.9;
/** Below this the base is treated as a point, avoiding a division by zero. */
const MIN_SPAN = 1e-3;

// A type alias (not an interface) so it is assignable to Record<string, IUniform>.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type FishPectoralUniforms = {
  /** The top and bottom ends of the fin's base, fish-frame x, y (body lengths). */
  readonly uPectoralRootTop: IUniform;
  readonly uPectoralRootBottom: IUniform;
  /** How far out from the middle of the body the base lies, fish-frame |z| (body lengths, 0..0.4). */
  readonly uPectoralSide: IUniform<number>;
  /** How long the fin is, base to tip along x (body lengths, > 0). */
  readonly uPectoralLength: IUniform<number>;
  /** How far the fin as modelled stands out from the body, radians (0..π/2). */
  readonly uPectoralRest: IUniform<number>;
  /** How far a full beat swings it, radians (0..π/2). */
  readonly uPectoralSweep: IUniform<number>;
};

/**
 * The pectoral fins beat, fold and spread: each swings about its base, out
 * from the body and back, by the stroke the simulation gives the fish
 * (sim/pectoralFins). The same patch moves every fish: a model's fins are
 * found from its manifest, a procedural body marks its own.
 *
 * Instance attributes (fishInstancePatch): aFinPhase (x left, y right fin's place in its beat,
 * radians), aFinPose (x beat 0..1, y left and z right spread, -1 folded ..
 * 1 spread wide). Vertex attribute: aPectoral (0 body .. 1 fin).
 * The geometry is in the fish frame: snout at +0.5, dorsal fin up, its
 * left side at -z. Apply after fishMotionPatch: its normals are turned
 * before the body bends.
 */
export function fishPectoralPatch(uniforms: FishPectoralUniforms): ShaderPatch {
  return {
    name: "fish-pectoral",
    uniforms,
    vertexHead: /* glsl */ `
      attribute float aPectoral;
      uniform vec2 uPectoralRootTop;
      uniform vec2 uPectoralRootBottom;
      uniform float uPectoralSide;
      uniform float uPectoralLength;
      uniform float uPectoralRest;
      uniform float uPectoralSweep;

      // How far the fin at this point has swung out from its modelled pose,
      // radians; on the left side (-z) the swing is mirrored.
      float pectoralAngle(vec3 point) {
        float right = step(0.0, point.z);
        float phase = mix(aFinPhase.x, aFinPhase.y, right);
        float spread = mix(aFinPose.y, aFinPose.z, right);
        float span = max(uPectoralRootTop.y - uPectoralRootBottom.y, ${MIN_SPAN.toFixed(4)});
        float across = clamp((uPectoralRootTop.y - point.y) / span, 0.0, 1.5);
        float along = clamp((uPectoralRootTop.x - point.x) / uPectoralLength, 0.0, 1.5);
        float lag = ${WAVE_ACROSS.toFixed(2)} * across + ${WAVE_ALONG.toFixed(2)} * along;
        float flex = 1.0 + ${CURL.toFixed(2)} * along * along;
        float pose = spread < 0.0 ? spread * uPectoralRest : spread * ${FLARE.toFixed(2)} * flex;
        float stroke = aFinPose.x * uPectoralSweep * flex * (sin(phase - lag) + ${STROKE_OUTWARD.toFixed(2)});
        // Never through the body.
        float angle = max(pose + stroke, -uPectoralRest);
        return right > 0.5 ? angle : -angle;
      }

      // The fin's base, the line it swings about.
      vec3 pectoralAxis() {
        return normalize(vec3(uPectoralRootTop - uPectoralRootBottom, 0.0) + vec3(0.0, ${MIN_SPAN.toFixed(4)}, 0.0));
      }

      // Rodrigues' rotation of a vector about a unit axis.
      vec3 swingAbout(vec3 v, vec3 axis, float angle) {
        float c = cos(angle);
        float s = sin(angle);
        return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
      }
    `,
    vertex: [
      [
        "#include <beginnormal_vertex>",
        /* glsl */ `
        #include <beginnormal_vertex>
        if (aPectoral > 0.0) {
          vec3 swung = swingAbout(objectNormal, pectoralAxis(), pectoralAngle(position));
          objectNormal = normalize(mix(objectNormal, swung, aPectoral));
        }
        `,
      ],
      [
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>
        if (aPectoral > 0.0) {
          vec3 hinge = vec3(uPectoralRootTop, sign(position.z) * uPectoralSide);
          vec3 swung = hinge + swingAbout(transformed - hinge, pectoralAxis(), pectoralAngle(position));
          transformed = mix(transformed, swung, aPectoral);
        }
        `,
      ],
    ],
  };
}
