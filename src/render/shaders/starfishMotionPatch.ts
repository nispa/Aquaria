import type { ShaderPatch } from "./patch";

/** Arms of a starfish, and the angle between two. */
const ARMS = 5;
const ARM_ANGLE = (2 * Math.PI) / ARMS;
/** How far an arm swings sideways, opening and closing on its neighbours, radians at its tip. */
const SPREAD = 0.22;
/** How much an arm reaches out and draws back, as a share of its length. */
const STRETCH = 0.08;
/** How high a tip lifts as the arm reaches forward, body lengths. */
const LIFT = 0.035;

/**
 * How a starfish creeps: its arms take turns, each swinging a little to one
 * side and back, reaching out and drawing in, its tip lifting as it
 * reaches, the turn going round the disc from arm to arm. The swim phase
 * advances only as it moves, so a starfish at rest lies still. The arms
 * bend more towards their tips (aFin, 0 in the middle to 1).
 *
 * Instance attributes (fishInstancePatch): aSwimPhase (radians). Vertex
 * attribute: aFin. The geometry lies flat, one body length across, centred
 * on the origin (render/crustaceanGeometry's starfish).
 */
export function starfishMotionPatch(): ShaderPatch {
  return {
    name: "starfish-motion",
    vertexHead: /* glsl */ `
      attribute float aFin;
    `,
    vertex: [
      [
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>
        {
          float reach = length(transformed.xz);
          if (reach > 0.0001) {
            float angle = atan(transformed.z, transformed.x);
            float arm = floor(angle / ${ARM_ANGLE.toFixed(5)} + 0.5);
            float phase = aSwimPhase + arm * ${ARM_ANGLE.toFixed(5)};
            float swing = ${SPREAD.toFixed(3)} * sin(phase) * aFin;
            float stretch = 1.0 + ${STRETCH.toFixed(3)} * cos(phase) * aFin;
            float c = cos(swing);
            float s = sin(swing);
            transformed.xz = vec2(
              transformed.x * c - transformed.z * s,
              transformed.x * s + transformed.z * c
            ) * stretch;
            transformed.y += ${LIFT.toFixed(3)} * max(cos(phase), 0.0) * aFin;
          }
        }
        `,
      ],
    ],
  };
}
