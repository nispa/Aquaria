/** Render heights for the two standard presets offered in the control panel. */
export const FULL_HD_HEIGHT = 1080;
export const UHD_HEIGHT = 2160;

/**
 * Device pixel ratio that makes the canvas render `targetHeight` pixels tall
 * regardless of the CSS size. This is how the resolution slider works: the
 * canvas always fills the screen, only the number of drawn pixels changes.
 */
export function pixelRatioForHeight(targetHeight: number, cssHeight: number): number {
  return cssHeight > 0 ? targetHeight / cssHeight : 1;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Pixel size of the drawing buffer for a CSS viewport at a target height. */
export function renderSize(cssWidth: number, cssHeight: number, targetHeight: number): Size {
  const ratio = pixelRatioForHeight(targetHeight, cssHeight);
  return { width: Math.round(cssWidth * ratio), height: Math.round(cssHeight * ratio) };
}

export function resolutionLabel(height: number): string {
  if (height === FULL_HD_HEIGHT) return "Full HD (1080p)";
  if (height === UHD_HEIGHT) return "4K (2160p)";
  return `${height}p`;
}
