/**
 * Light in deep water, on the linear HDR frame. Water swallows red first,
 * then green: what lies far away keeps less of its own color and more of the
 * light the water scatters towards the eye. That light depends on where one
 * looks: bright towards the surface and the sun, dark towards the deep. Far
 * walls and the backdrop dissolve into it, as in open water.
 *
 *   color = surface * T + inscatter(direction) * (1 - T),  T = exp(-absorption * distance)
 *
 * Uniforms:
 * - tDiffuse: input HDR frame (set by ShaderPass).
 * - tDepth: depth of the scene pass (0..1, perspective).
 * - uProjectionInverse, uCameraWorld: turn a pixel and its depth into a ray.
 * - uAbsorption (1/m per channel, 0..2): how fast red, green and blue fade.
 * - uFarDistance (m): water crossed by rays that meet no geometry (depth 1).
 * Only the water behind the front glass (z = 0) counts: the camera stands in air.
 * - uDeep, uHorizon, uSurface (linear radiance): scattered light looking
 *   down, level and up.
 * - uSunDirection (unit vector, world): where the sun shines from.
 * - uSunColor (linear radiance): its halo; uSunFocus (1..2000): how tight it is.
 * - uShafts (0..3): strength of the sunbeams; uShaftCount (4..200): how many
 *   around the sun. Sunbeams are parallel in the water, so in perspective
 *   they fan out from the sun: a pattern of the angle around its direction,
 *   drifting slowly as the waves above move.
 * - uTime (s): drives the drift (shared water uniform).
 * - uDaylight (0..1): dims the scattered light at night (shared water uniform).
 * - uStrength (0..1): blends the effect in; 0 leaves the frame untouched.
 */
export const UNDERWATER_SHADER = {
  name: "UnderwaterShader",
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform mat4 uProjectionInverse;
    uniform mat4 uCameraWorld;
    uniform vec3 uAbsorption;
    uniform float uFarDistance;
    uniform vec3 uDeep;
    uniform vec3 uHorizon;
    uniform vec3 uSurface;
    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform float uSunFocus;
    uniform float uShafts;
    uniform float uShaftCount;
    uniform float uTime;
    uniform float uDaylight;
    uniform float uStrength;
    varying vec2 vUv;

    float hash(float n) {
      return fract(sin(n) * 43758.5453);
    }

    // Smooth noise along a circle: period cells, so the pattern closes on itself.
    float circleNoise(float x, float period) {
      float cell = floor(x);
      float t = fract(x);
      t = t * t * (3.0 - 2.0 * t);
      return mix(hash(mod(cell, period)), hash(mod(cell + 1.0, period)), t);
    }

    float sunbeams(vec3 direction) {
      vec3 side = normalize(cross(uSunDirection, vec3(0.0, 0.0, 1.0)));
      vec3 lift = cross(side, uSunDirection);
      float turn = atan(dot(direction, lift), dot(direction, side)) / 6.2831853 + 0.5;
      float x = turn * uShaftCount;
      float beams = circleNoise(x + uTime * 0.11, uShaftCount) * 0.6
        + circleNoise(x * 2.0 - uTime * 0.17, uShaftCount * 2.0) * 0.4;
      beams = smoothstep(0.45, 0.95, beams);
      // Beams show near the sun and fade out towards the deep.
      float near = smoothstep(-0.2, 0.9, dot(direction, uSunDirection));
      return beams * near;
    }

    vec3 scattered(vec3 direction) {
      float up = direction.y;
      vec3 ambient = up > 0.0
        ? mix(uHorizon, uSurface, pow(up, 0.7))
        : mix(uHorizon, uDeep, pow(-up, 0.6));
      float sun = pow(max(dot(direction, uSunDirection), 0.0), uSunFocus);
      // A wide skirt around the tight halo, in the water's own color: the
      // sunlit water above glows, it does not turn white.
      float skirt = pow(max(dot(direction, uSunDirection), 0.0), uSunFocus * 0.06);
      vec3 beams = uSurface * uShafts * sunbeams(direction);
      return (ambient + uSunColor * sun + uSurface * 1.5 * skirt + beams) * uDaylight;
    }

    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      float depth = texture2D(tDepth, vUv).x;
      vec4 view = uProjectionInverse * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      view /= view.w;
      vec3 direction = normalize((uCameraWorld * vec4(view.xyz, 0.0)).xyz);
      vec3 eye = uCameraWorld[3].xyz;
      // Where the ray enters the water through the glass.
      float toGlass = direction.z < 0.0 ? max(eye.z, 0.0) / -direction.z : 0.0;
      float distance = depth >= 1.0 ? uFarDistance : max(length(view.xyz) - toGlass, 0.0);
      vec3 transmitted = exp(-uAbsorption * distance);
      vec3 water = color * transmitted + scattered(direction) * (1.0 - transmitted);
      gl_FragColor = vec4(mix(color, water, uStrength), 1.0);
    }
  `,
};
