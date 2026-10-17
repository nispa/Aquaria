import { CAUSTICS_GLSL } from "./caustics";

/**
 * The water surface seen from below, moved by waves: where the waves tilt
 * towards the eye the bright sky shows through (Snell's window), elsewhere
 * the surface mirrors the water (total internal reflection), and the sun
 * glares through the middle. Written for this project.
 *
 * Uniforms (besides the water's uTime, uLightColor, uWaterColor, uDaylight,
 * uCausticsScale):
 * - uWaveHeight (m, 0..0.5): height of the tallest waves, crest to trough.
 * - uWaveLength (m, 0.1..10): length of the longest waves.
 * - uWaveSpeed (0..4): pace of the waves, 1 = a calm sea.
 * - uGlare (0..3): strength of the sun's glare.
 * - uGlareCenter (world x, z): where the glare is brightest.
 * - uGlareRadius (m): how far the glare spreads.
 * - uWindow (0..1): how readily the sky shows through; 0 = true to physics.
 * - uSurfaceOpacity (0..1): how visible the surface is (the scene's `surface`).
 */
export const WAVES_GLSL = /* glsl */ `
uniform float uWaveHeight;
uniform float uWaveLength;
uniform float uWaveSpeed;

// Height of the surface above its rest level (x) and its slope along x and z
// (y, z): five travelling waves, each shorter and lower than the one before,
// moving at the speed of deep-water waves of their length.
vec3 waves(vec2 p, float t) {
  vec3 sum = vec3(0.0);
  float wavelength = uWaveLength;
  float amplitude = uWaveHeight * 0.5;
  for (int index = 0; index < 5; index++) {
    float i = float(index);
    float angle = 0.3 + i * 2.39996;
    vec2 direction = vec2(cos(angle), sin(angle));
    float k = 6.2831853 / wavelength;
    float speed = sqrt(9.81 / k) * uWaveSpeed;
    float phase = k * (dot(direction, p) - speed * t) + i * 1.7;
    sum.x += amplitude * sin(phase);
    sum.yz += amplitude * k * cos(phase) * direction;
    wavelength *= 0.62;
    amplitude *= 0.58;
  }
  return sum;
}
`;

export const WAVE_SURFACE_VERTEX = /* glsl */ `
uniform float uTime;
${WAVES_GLSL}
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  world.y += waves(world.xz, uTime).x;
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const WAVE_SURFACE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uCausticsScale;
uniform vec3 uLightColor;
uniform vec3 uWaterColor;
uniform float uDaylight;
uniform float uGlare;
uniform vec2 uGlareCenter;
uniform float uGlareRadius;
uniform float uWindow;
uniform float uSurfaceOpacity;
${WAVES_GLSL}
${CAUSTICS_GLSL}
varying vec3 vWorld;

// Cosine of the critical angle from water (n = 1.33) into air.
const float CRITICAL_COS = 0.6615;

void main() {
  vec3 shape = waves(vWorld.xz, uTime);
  vec3 up = normalize(vec3(-shape.y, 1.0, -shape.z));
  vec3 view = normalize(vWorld - cameraPosition);
  float facing = dot(view, up);

  // Inside Snell's window the sky shows through; outside, the surface mirrors the water.
  float threshold = CRITICAL_COS * (1.0 - uWindow);
  float open = smoothstep(threshold - 0.08, threshold + 0.08, facing);
  vec3 sky = uLightColor * uDaylight * 1.3;
  vec3 mirror = uWaterColor * 1.25;
  vec3 color = mix(mirror, sky, open);

  // Small ripples on the waves catch the light.
  float ripple = caustics(vWorld.xz * uCausticsScale * 0.4, uTime * 0.2 * max(uWaveSpeed, 0.2));
  color += uLightColor * uDaylight * ripple * (0.12 + 0.3 * open);

  // The sun glares through the middle, sparkling on the ripples.
  float spread = length(vWorld.xz - uGlareCenter) / uGlareRadius;
  float glare = uGlare * uDaylight * exp(-spread * spread);
  color += uLightColor * glare * (0.6 + 0.8 * ripple + 0.6 * open);

  float distance = length(vWorld.xz - cameraPosition.xz);
  float fade = exp(-distance * 0.06);
  float alpha = clamp(0.5 + 0.4 * open + 0.2 * ripple + glare, 0.0, 1.0);
  gl_FragColor = vec4(color, alpha * fade * uSurfaceOpacity);
  #include <colorspace_fragment>
}
`;
