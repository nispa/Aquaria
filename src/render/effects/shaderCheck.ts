/**
 * What Three.js puts before a ShaderMaterial's fragment shader on WebGL2, as
 * far as an effect's shader can tell: GLSL ES 3.00 with the WebGL1 names
 * (`varying`, `texture2D`, `gl_FragColor`) mapped onto it.
 */
const FRAGMENT_PREFIX = [
  "#version 300 es",
  "precision highp float;",
  "precision highp int;",
  "#define varying in",
  "layout(location = 0) out highp vec4 pc_fragColor;",
  "#define gl_FragColor pc_fragColor",
  "#define texture2D texture",
].join("\n");

/**
 * Compiles a fragment shader in a small WebGL2 context of its own and
 * returns the compiler's message when it fails, so a broken effect can be
 * left out with a warning instead of turning the aquarium black. Undefined
 * when it compiles, or when there is no WebGL2 to tell (the renderer then
 * reports it).
 */
export function fragmentShaderError(source: string): string | undefined {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (gl === null) return undefined;
  const shader = gl.createShader(gl.FRAGMENT_SHADER);
  if (shader === null) return undefined;
  gl.shaderSource(shader, `${FRAGMENT_PREFIX}\n${source}`);
  gl.compileShader(shader);
  const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS) === true;
  const log = gl.getShaderInfoLog(shader) ?? "";
  gl.deleteShader(shader);
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return compiled ? undefined : log.trim() || "The shader does not compile.";
}
