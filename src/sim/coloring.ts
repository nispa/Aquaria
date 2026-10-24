/**
 * Which of its species' colorings a fish wears, its index in the
 * species' `coloring` list (0 when the species names none, the model's
 * own colors), from `share` in 0..1: the weights are laid end to end and
 * the share picks one of them.
 */
export function coloringIndex(
  colorings: readonly { readonly weight: number }[] | undefined,
  share: number,
): number {
  if (colorings === undefined) return 0;
  const total = colorings.reduce((sum, { weight }) => sum + weight, 0);
  let reach = share * total;
  for (const [index, { weight }] of colorings.entries()) {
    if (reach < weight) return index;
    reach -= weight;
  }
  return colorings.length - 1;
}
