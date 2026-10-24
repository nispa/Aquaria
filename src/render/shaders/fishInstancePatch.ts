import type { ShaderPatch } from "./patch";

/**
 * What every fish of a species brings to its shaders, one instance
 * attribute per group so a model with tangents, vertex colors and eye bones
 * stays within WebGL's sixteen vertex attributes:
 *
 * - aMotion: x swim phase (radians), y bend (curvature times body length,
 *   positive into a left turn, -2.5..2.5), z effort (tail sweep relative
 *   to cruising, 0.5..2.2), w opacity (0..1);
 * - aLook: x gaze (-1 right .. 1 left; -z is the fish's left), y mouth
 *   (0 shut .. 1 wide open), z and w the left and right pectoral fins'
 *   spread (-1 folded .. 1 spread wide);
 * - aFinStroke: x and y the left and right pectoral fins' place in their
 *   beat (radians), z the beat (0..1), w the coloring the fish wears (0, 1,
 *   2…, a layer of shaders/fishColoringPatch's texture array).
 *
 * The other fish patches read them by their own names (aSwimPhase, aGaze,
 * aFinPose…), defined here; apply this patch first.
 */
export function fishInstancePatch(): ShaderPatch {
  return {
    name: "fish-instance",
    vertexHead: /* glsl */ `
      attribute vec4 aMotion;
      attribute vec4 aLook;
      attribute vec4 aFinStroke;
      #define aSwimPhase aMotion.x
      #define aBend aMotion.y
      #define aEffort aMotion.z
      #define aOpacity aMotion.w
      #define aGaze aLook.x
      #define aMouth aLook.y
      #define aFinPhase aFinStroke.xy
      #define aFinPose vec3(aFinStroke.z, aLook.zw)
      #define aColoring aFinStroke.w
    `,
  };
}
