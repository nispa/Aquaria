import type { IUniform } from "three";
import type { ShaderPatch } from "./patch";

/** The upper lip lifts this share of the jaw's drop. */
const UPPER_LIP_LIFT = 0.3;

// A type alias (not an interface) so it is assignable to Record<string, IUniform>.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type FishJawUniforms = {
  /** Where the jaw starts, fish-frame x (body lengths, -0.5 tail .. 0.5 snout). */
  readonly uJawStart: IUniform<number>;
  /** The mouth's line, fish-frame y (body lengths): points below it are the jaw. */
  readonly uJawLine: IUniform<number>;
  /** How far the jaw drops at the tip of the snout when wide open, body lengths (0..0.1). */
  readonly uJawDrop: IUniform<number>;
};

/**
 * A mouth for a 3D model that has no mouth shape key: when the fish eats,
 * the points of the snout below the mouth's line drop and the ones above
 * lift a little, more towards the tip, as the procedural fish's jaw does.
 *
 * Instance attribute (fishInstancePatch): aMouth (0 shut .. 1 wide open).
 * The geometry is in the fish frame: one body length along +x, snout at +0.5.
 */
export function fishJawPatch(uniforms: FishJawUniforms): ShaderPatch {
  return {
    name: "fish-jaw",
    uniforms,
    vertexHead: /* glsl */ `
      uniform float uJawStart;
      uniform float uJawLine;
      uniform float uJawDrop;
    `,
    vertex: [
      [
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>
        {
          float jaw = aMouth * uJawDrop * smoothstep(uJawStart, 0.5, position.x);
          transformed.y += position.y < uJawLine ? -jaw : jaw * ${UPPER_LIP_LIFT.toFixed(2)};
        }
        `,
      ],
    ],
  };
}
