// Water shimmer: the picture wavers a little, as if seen through moving water.
//
// Given by Aquaria: tDiffuse (the frame), uTime (s), uResolution (px),
// uFrame (count), vUv (0..1 across the frame).
// Parameters (effect.json): amount (shift, share of the frame, 0..0.01),
// speed (pace, 0..3), scale (ripples across the frame, 1..60).

vec2 ripple(vec2 uv, float time) {
  vec2 p = uv * scale;
  return 0.5 * vec2(
    sin(p.y + time * 1.3) + sin(p.y * 1.7 - time),
    cos(p.x * 1.1 + time) + sin(p.x * 0.6 - time * 1.6)
  );
}

void main() {
  vec2 shift = ripple(vUv, uTime * speed) * amount;
  gl_FragColor = texture2D(tDiffuse, vUv + shift);
}
