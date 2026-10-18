/**
 * Final full-screen pass, applied after tone mapping (in display space):
 * - a soft vignette, like looking through thick glass;
 * - ordered-noise dithering of ±0.5/255, which removes the banding that deep
 *   blue gradients show on LED walls at low brightness.
 *
 * Uniforms:
 * - tDiffuse: input frame (set by ShaderPass).
 * - uVignette (0..1): vignette strength.
 * - uDither (0..2): dither amplitude in 1/255 steps.
 * - uFrame: frame counter, animates the noise so it never looks like a pattern.
 * - uContrast (0.5..2): spread of tones around middle grey; 1 leaves them.
 * - uSaturation (0..2): 0 grey, 1 unchanged.
 * - uTint (display RGB 0..1): multiplies the picture; white leaves it.
 */
export const FINISH_SHADER = {
  name: "FinishShader",
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.35 },
    uDither: { value: 1 },
    uFrame: { value: 0 },
    uContrast: { value: 1 },
    uSaturation: { value: 1 },
    uTint: { value: [1, 1, 1] },
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
    uniform float uVignette;
    uniform float uDither;
    uniform float uFrame;
    uniform float uContrast;
    uniform float uSaturation;
    uniform vec3 uTint;
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float grey = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
      color.rgb = mix(vec3(grey), color.rgb, uSaturation);
      color.rgb = clamp((color.rgb - 0.5) * uContrast + 0.5, 0.0, 1.0) * uTint;
      vec2 centred = vUv - 0.5;
      color.rgb *= 1.0 - uVignette * smoothstep(0.35, 0.85, length(centred * vec2(1.2, 1.0)));
      float noise = hash(gl_FragCoord.xy + mod(uFrame, 64.0) * 7.31) - 0.5;
      color.rgb += noise * uDither / 255.0;
      gl_FragColor = color;
    }
  `,
};
