/**
 * Screen-space volumetric light ("god rays"): bright pixels are smeared along
 * lines towards the light's position on screen, so anything dark in between
 * (fish, kelp) casts visible shafts through the water. Radial light
 * scattering as described by Mitchell (GPU Gems 3, ch. 13), written here.
 *
 * Uniforms:
 * - tDiffuse: input HDR frame (set by ShaderPass).
 * - uLightUv (screen uv, may lie outside 0..1): where the light comes from.
 * - uDensity (0..1.5): length of the rays as a fraction of the distance to the light.
 * - uDecay (0.9..1): falloff per sample along a ray.
 * - uWeight (0..1): contribution of each sample.
 * - uExposure (0..2): overall strength of the rays.
 * - uThreshold (linear luminance, 0..4): only pixels brighter than this emit rays.
 * Define SAMPLES: samples per ray (16..96).
 * Each pixel starts its ray at a jittered offset (interleaved gradient noise,
 * Jimenez 2014): without it, small bright sources such as LED spots repeat as
 * a row of ghost copies, one per sample step.
 */
export const VOLUMETRIC_LIGHT_SHADER = {
  name: "VolumetricLightShader",
  defines: { SAMPLES: 48 },
  uniforms: {
    tDiffuse: { value: null },
    uLightUv: { value: [0.5, 1.4] },
    uDensity: { value: 0.9 },
    uDecay: { value: 0.965 },
    uWeight: { value: 0.35 },
    uExposure: { value: 0.35 },
    uThreshold: { value: 0.9 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uLightUv;
    uniform float uDensity;
    uniform float uDecay;
    uniform float uWeight;
    uniform float uExposure;
    uniform float uThreshold;
    varying vec2 vUv;

    vec3 emitted(vec2 uv) {
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
      vec3 color = texture2D(tDiffuse, uv).rgb;
      float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      return color * smoothstep(uThreshold, uThreshold * 1.8, luminance);
    }

    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      vec2 step = (vUv - uLightUv) * uDensity / float(SAMPLES);
      float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      vec2 uv = vUv + step * jitter;
      float illumination = 1.0;
      vec3 rays = vec3(0.0);
      for (int index = 0; index < SAMPLES; index++) {
        uv -= step;
        rays += emitted(uv) * illumination * uWeight;
        illumination *= uDecay;
      }
      gl_FragColor = vec4(base + rays * uExposure / float(SAMPLES) * 8.0, 1.0);
    }
  `,
};
