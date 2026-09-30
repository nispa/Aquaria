/**
 * Rough kind of GPU from the WebGL renderer string, to warn when a laptop's
 * browser runs on its integrated GPU instead of the dedicated one.
 */
export type GpuKind = "dedicated" | "integrated" | "software" | "unknown";

const SOFTWARE = /swiftshader|llvmpipe|software|microsoft basic render/i;
/** Intel graphics and AMD's APU "Radeon(TM) Graphics" are integrated. */
const INTEGRATED = /intel|radeon\(tm\) graphics|radeon graphics/i;
const DEDICATED = /nvidia|geforce|quadro|rtx|radeon rx|radeon pro/i;

export function classifyGpu(renderer: string): GpuKind {
  if (SOFTWARE.test(renderer)) return "software";
  if (INTEGRATED.test(renderer)) return "integrated";
  if (DEDICATED.test(renderer)) return "dedicated";
  return "unknown";
}

/** "ANGLE (Vendor, Device (0x…) Direct3D11 …, D3D11)" becomes "Device". */
export function shortGpuName(renderer: string): string {
  const angle = /^ANGLE \([^,]+, ([^,]+?)(?: \(0x[0-9a-f]+\))?(?: Direct3D.*)?,/i.exec(renderer);
  return angle?.[1]?.trim() ?? renderer;
}
