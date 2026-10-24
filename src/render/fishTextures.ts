/**
 * How big the textures of fish need to be: a fish fills more pixels on a
 * taller render, and below that its texture's fine detail is lost in the
 * mipmaps anyway, while it still takes its full size in video memory
 * (4 bytes a texel, plus a third for the mipmaps). The textures are made
 * at 1024 texels and brought down when they load.
 */

/** Render heights (pixels) from which fish textures load whole, and the size below each. */
const FISH_TEXTURE_STEPS: readonly { readonly fromHeight: number; readonly size?: number }[] = [
  { fromHeight: 2160 },
  { fromHeight: 1440, size: 512 },
  { fromHeight: 0, size: 256 },
];

/**
 * Most texels across a fish texture may have at this render height;
 * undefined when it loads whole.
 */
export function fishTextureLimit(renderHeight: number): number | undefined {
  return FISH_TEXTURE_STEPS.find(({ fromHeight }) => renderHeight >= fromHeight)?.size;
}
