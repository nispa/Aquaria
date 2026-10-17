import type { IUniform } from "three";
import type { ShaderPatch } from "./patch";

// A type alias (not an interface) so it is assignable to Record<string, IUniform>.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type FishEyesUniforms = {
  /** How far the eyes turn at full gaze, radians (0..0.8). */
  readonly uEyeTurn: IUniform<number>;
};

/**
 * Eyes of a 3D fish model that glance the way the fish is about to turn, as
 * the procedural fish's pupils do: the eyeballs (the vertices weighted to the
 * model's eye bones) turn about their centres, around the fish's up axis.
 * Both eyes turn together, the way fish look.
 *
 * Vertex attributes: aEyeWeight (0..1, how much of the vertex is eye),
 * aEyeCenter (the point it turns about, in the fish frame).
 * Instance attribute: aGaze (-1 right .. 1 left; -z is the fish's left).
 * Runs before fishMotionPatch; the head does not bend, so the order of the
 * two only matters for the normals, and both turn about the same axis.
 */
export function fishEyesPatch(uniforms: FishEyesUniforms): ShaderPatch {
  return {
    name: "fish-eyes",
    uniforms,
    vertexHead: /* glsl */ `
      attribute float aEyeWeight;
      attribute vec3 aEyeCenter;
      attribute float aGaze;
      uniform float uEyeTurn;

      // Turns a vector about the up axis by this vertex's share of the gaze;
      // a positive angle swings the front (+x) towards the left (-z).
      vec3 turnEye(vec3 v) {
        float angle = aGaze * uEyeTurn * aEyeWeight;
        float c = cos(angle);
        float s = sin(angle);
        return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
      }
    `,
    vertex: [
      [
        "#include <beginnormal_vertex>",
        /* glsl */ `
        #include <beginnormal_vertex>
        objectNormal = turnEye(objectNormal);
        `,
      ],
      [
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>
        transformed = aEyeCenter + turnEye(transformed - aEyeCenter);
        `,
      ],
    ],
  };
}
