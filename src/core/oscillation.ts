/**
 * A smooth swing from 0 up to 1 and back to 0 every `periodSeconds`, at
 * `seconds` (a cosine, so it eases at both ends). Drives the debug sliders
 * that play by themselves.
 */
export function pingPong(seconds: number, periodSeconds: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * seconds) / periodSeconds);
}
