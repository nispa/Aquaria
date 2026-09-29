/**
 * Procedural caustics: the moving web of light that sunlight focused by
 * surface waves draws on everything underwater. Written for this project
 * (two domain-warped sine lattices), no third-party shader code.
 *
 * Uniforms used by callers:
 * - uTime (seconds, 0..inf): animation time.
 * - uCausticsScale (1/m, 0.2..4): pattern frequency; higher = smaller cells.
 */
export const CAUSTICS_GLSL = /* glsl */ `
float causticLayer(vec2 p, float t) {
  vec2 q = p + 0.55 * vec2(sin(p.y * 1.7 + t * 0.9), cos(p.x * 1.3 - t * 0.7));
  vec2 r = q + 0.3 * vec2(sin(q.y * 2.3 - t * 1.1), cos(q.x * 2.1 + t * 0.8));
  float lattice = sin(r.x * 3.0) * sin(r.y * 3.0);
  return pow(1.0 - abs(lattice), 7.0);
}

float caustics(vec2 p, float t) {
  float a = causticLayer(p, t);
  float b = causticLayer(p * 1.63 + vec2(3.1, 7.7), t * 1.27);
  return a * 0.62 + b * 0.38;
}
`;
