import type { Hotel } from "./model";

export type SavedStaysSort = "collection" | "country";

const placeCollator = new Intl.Collator("en");

// Sort a display copy only. Filtering, map inputs, and CSV keep collection order.
export function sortSavedStays(
  hotels: readonly Hotel[],
  order: SavedStaysSort,
): readonly Hotel[] {
  if (order === "collection") return hotels;

  return [...hotels].sort((a, b) =>
    placeCollator.compare(a.country, b.country) ||
    placeCollator.compare(a.city, b.city) ||
    placeCollator.compare(a.name, b.name),
  );
}
