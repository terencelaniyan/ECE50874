/**
 * Placeholder image URLs for ball display by brand.
 * Used when no per-ball image is available.
 */

export function getBallPlaceholderImage(brand: string): string {
  if (brand === "DV8") return "/ball_blue_gold.png";
  if (brand === "Motiv") return "/ball_black_orange.png";
  return "/ball_purple_pink.png";
}
