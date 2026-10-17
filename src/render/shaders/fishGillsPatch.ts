import type { IUniform } from "three";
import type { ShaderPatch } from "./patch";

/** How far ahead of its rear edge the gill cover lifts, body lengths. */
const COVER_DEPTH = 0.07;
/** Behind the edge the lift fades out within this, body lengths: the skin stays whole. */
const EDGE_FADE = 0.012;
/** The cover's top and bottom round off over this, body lengths. */
const ROUNDING = 0.03;
/** The slit that shows behind the lifted edge: its width, body lengths, and how dark it gets. */
const SLIT_WIDTH = 0.01;
const SLIT_DARKNESS = 0.5;

// A type alias (not an interface) so it is assignable to Record<string, IUniform>.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type FishGillsUniforms = {
  /** Seconds (the water's clock). */
  readonly uTime: IUniform<number>;
  /** The gill cover's rear edge, fish-frame x (body lengths). */
  readonly uGillEdge: IUniform<number>;
  /** How far the cover reaches up and down, fish-frame y (body lengths). */
  readonly uGillTop: IUniform<number>;
  readonly uGillBottom: IUniform<number>;
  /** How far the cover's edge lifts from the body, body lengths (0..0.03). */
  readonly uGillOpen: IUniform<number>;
  /** Breaths a second (0..4). */
  readonly uGillRate: IUniform<number>;
  /** How the edge bends: x = edge + curve * (y - middle)^2 (1 / body lengths, 0..20). */
  readonly uGillCurve: IUniform<number>;
};

/**
 * Breathing: the gill covers of a 3D fish lift away from its sides and close
 * again, most at their rear edge, each fish at its own moment of the
 * breath (from its instance), so a school does not breathe in step. As the
 * cover lifts, a dark red slit shows behind its edge.
 *
 * The geometry is in the fish frame: one body length along +x, snout at
 * +0.5, dorsal fin up; its sides are at -z (left) and +z (right).
 */
export function fishGillsPatch(uniforms: FishGillsUniforms): ShaderPatch {
  return {
    name: "fish-gills",
    uniforms,
    vertexHead: /* glsl */ `
      uniform float uTime;
      uniform float uGillEdge;
      uniform float uGillTop;
      uniform float uGillBottom;
      uniform float uGillOpen;
      uniform float uGillRate;
      uniform float uGillCurve;
      varying vec3 vGillPoint;
      varying float vGillBreath;

      // Where the cover's rear edge is at this height: furthest back halfway up.
      float gillEdge(float y) {
        float middle = 0.5 * (uGillTop + uGillBottom);
        return uGillEdge + uGillCurve * (y - middle) * (y - middle);
      }
    `,
    vertex: [
      [
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>
        {
          float edge = gillEdge(position.y);
          float ahead = smoothstep(edge + ${COVER_DEPTH.toFixed(3)}, edge, position.x)
            * smoothstep(edge - ${EDGE_FADE.toFixed(3)}, edge, position.x);
          float span = smoothstep(uGillBottom, uGillBottom + ${ROUNDING.toFixed(3)}, position.y)
            * smoothstep(uGillTop, uGillTop - ${ROUNDING.toFixed(3)}, position.y);
          #ifdef USE_INSTANCING
            float moment = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);
          #else
            float moment = 0.0;
          #endif
          float breath = 0.5 - 0.5 * cos(6.2831853 * (uTime * uGillRate + moment));
          transformed.z += sign(position.z) * uGillOpen * ahead * span * breath;
          vGillPoint = position;
          vGillBreath = breath;
        }
        `,
      ],
    ],
    fragmentHead: /* glsl */ `
      uniform float uGillEdge;
      uniform float uGillTop;
      uniform float uGillBottom;
      uniform float uGillCurve;
      varying vec3 vGillPoint;
      varying float vGillBreath;

      float gillEdge(float y) {
        float middle = 0.5 * (uGillTop + uGillBottom);
        return uGillEdge + uGillCurve * (y - middle) * (y - middle);
      }
    `,
    fragment: [
      [
        "#include <map_fragment>",
        /* glsl */ `
        #include <map_fragment>
        {
          float behind = gillEdge(vGillPoint.y) - vGillPoint.x;
          float slit = step(0.0, behind) * (1.0 - smoothstep(0.0, ${SLIT_WIDTH.toFixed(3)}, behind));
          float span = smoothstep(uGillBottom, uGillBottom + ${ROUNDING.toFixed(3)}, vGillPoint.y)
            * smoothstep(uGillTop, uGillTop - ${ROUNDING.toFixed(3)}, vGillPoint.y);
          float shade = slit * span * vGillBreath * ${SLIT_DARKNESS.toFixed(2)};
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.45, 0.12, 0.12), shade);
        }
        `,
      ],
    ],
  };
}
