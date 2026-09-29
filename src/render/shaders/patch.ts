import type { IUniform, Material, WebGLProgramParametersWithUniforms } from "three";

/**
 * A small, composable change to one of Three.js' built-in materials.
 * Patches keep the standard PBR lighting and only add what the aquarium
 * needs (caustics, swimming, swaying), instead of rewriting whole shaders.
 */
export interface ShaderPatch {
  /** Unique name; also part of the program cache key. */
  readonly name: string;
  readonly uniforms?: Readonly<Record<string, IUniform>>;
  /** GLSL placed before main() in the vertex shader. */
  readonly vertexHead?: string;
  /** [chunk to find, replacement] pairs applied to the vertex shader. */
  readonly vertex?: readonly (readonly [string, string])[];
  readonly fragmentHead?: string;
  readonly fragment?: readonly (readonly [string, string])[];
}

function applyReplacements(
  source: string,
  replacements: readonly (readonly [string, string])[],
  patchName: string,
): string {
  return replacements.reduce((shader, [chunk, replacement]) => {
    if (!shader.includes(chunk)) {
      throw new Error(`Shader patch "${patchName}" could not find "${chunk}".`);
    }
    return shader.replace(chunk, replacement);
  }, source);
}

const MAIN = "void main() {";

/** Applies patches, in order, to a built-in material. Returns the material. */
export function patchMaterial<T extends Material>(material: T, patches: readonly ShaderPatch[]): T {
  const key = patches.map((patch) => patch.name).join("+");
  material.customProgramCacheKey = () => key;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    for (const patch of patches) {
      Object.assign(shader.uniforms, patch.uniforms ?? {});
      shader.vertexShader = shader.vertexShader.replace(MAIN, `${patch.vertexHead ?? ""}\n${MAIN}`);
      shader.fragmentShader = shader.fragmentShader.replace(
        MAIN,
        `${patch.fragmentHead ?? ""}\n${MAIN}`,
      );
      shader.vertexShader = applyReplacements(shader.vertexShader, patch.vertex ?? [], patch.name);
      shader.fragmentShader = applyReplacements(
        shader.fragmentShader,
        patch.fragment ?? [],
        patch.name,
      );
    }
  };
  return material;
}
