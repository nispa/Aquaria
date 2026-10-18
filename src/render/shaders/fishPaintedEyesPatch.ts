import type { Color, IUniform, Vector2 } from "three";
import type { ShaderPatch } from "./patch";

/** How far the pupil slides at full gaze, as a share of the eye's radius. */
const PUPIL_TRAVEL = 0.3;
/** Soft edges of the iris and the pupil, as a share of the eye's radius. */
const EDGE = 0.12;
/** The catchlight: its offset towards the top front and its size, shares of the radius. */
const GLINT_OFFSET = 0.3;
const GLINT_SIZE = 0.16;
/**
 * Only points this far out to the side, as a share of the eye's radius, are
 * painted: the eyes are on the flanks, not on fins that pass in front.
 */
const SIDE_DEPTH = 0.5;

// A type alias (not an interface) so it is assignable to Record<string, IUniform>.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type FishPaintedEyesUniforms = {
  /** The eye's centre, fish-frame x and y (body lengths); mirrored on both sides. */
  readonly uEyeCenter: IUniform<Vector2>;
  /** The eye's radius, body lengths. */
  readonly uEyeRadius: IUniform<number>;
  /** The pupil's share of the radius (0.2..0.9). */
  readonly uPupilShare: IUniform<number>;
  /** The iris, linear RGB. */
  readonly uIrisColor: IUniform<Color>;
};

/**
 * Eyes for a 3D model whose eyes are only painted on its texture: an iris
 * and a pupil are painted over them, and the pupil slides the way the fish
 * is about to turn, as the procedural fish's do (on the side it turns
 * towards it looks forward, on the other side backward).
 *
 * Instance attribute (fishInstancePatch): aGaze (-1 right .. 1 left; -z is the fish's left).
 * The geometry is in the fish frame: one body length along +x, snout at +0.5.
 */
export function fishPaintedEyesPatch(uniforms: FishPaintedEyesUniforms): ShaderPatch {
  return {
    name: "fish-painted-eyes",
    uniforms,
    vertexHead: /* glsl */ `
      varying vec3 vFishPoint;
      varying float vFishGaze;
    `,
    vertex: [
      [
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>
        vFishPoint = position;
        vFishGaze = aGaze;
        `,
      ],
    ],
    fragmentHead: /* glsl */ `
      uniform vec2 uEyeCenter;
      uniform float uEyeRadius;
      uniform float uPupilShare;
      uniform vec3 uIrisColor;
      varying vec3 vFishPoint;
      varying float vFishGaze;
    `,
    fragment: [
      [
        "#include <map_fragment>",
        /* glsl */ `
        #include <map_fragment>
        if (abs(vFishPoint.z) > uEyeRadius * ${SIDE_DEPTH.toFixed(2)}) {
          float edge = uEyeRadius * ${EDGE.toFixed(2)};
          float side = vFishPoint.z < 0.0 ? 1.0 : -1.0;
          vec2 look = uEyeCenter + vec2(vFishGaze * side * uEyeRadius * ${PUPIL_TRAVEL.toFixed(2)}, 0.0);
          float iris = 1.0 - smoothstep(uEyeRadius - edge, uEyeRadius, length(vFishPoint.xy - uEyeCenter));
          float pupilRadius = uEyeRadius * uPupilShare;
          float pupil = 1.0 - smoothstep(pupilRadius - edge, pupilRadius, length(vFishPoint.xy - look));
          vec2 glintAt = look + vec2(1.0, 1.0) * uEyeRadius * ${GLINT_OFFSET.toFixed(2)};
          float glintRadius = uEyeRadius * ${GLINT_SIZE.toFixed(2)};
          float glint = 1.0 - smoothstep(glintRadius * 0.5, glintRadius, length(vFishPoint.xy - glintAt));
          diffuseColor.rgb = mix(diffuseColor.rgb, uIrisColor, iris);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.005), pupil * iris);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), glint * iris * 0.85);
        }
        `,
      ],
    ],
  };
}
