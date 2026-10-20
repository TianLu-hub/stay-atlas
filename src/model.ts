export type Hotel = {
  id: string;
  name: string;
  group: "Hilton" | "Marriott";
  brand: string;
  city: string;
  country: string;
  region: string;
  lat: number;
  lng: number;
  url: string;
  description: string;
  why: string;
  tags: string[];
  sources: string[];
  verifiedAt: string;
  coordinateSource: string;
  coordinatePrecision: string;
  verificationNotes?: string;
};
export type Status = "want" | "stayed";
export type Saved = Record<string, Status>;
export type Filters = {
  query: string;
  group: string;
  brand: string;
  tag: string;
  journey: string;
  wishlist: boolean;
  status: string;
};
export const initialFilters: Filters = {
  query: "",
  group: "All",
  brand: "All",
  tag: "All",
  journey: "",
  wishlist: false,
  status: "All",
};
export const journeys = [
  {
    id: "islands",
    name: "Island escapes",
    subtitle: "A little further from everything",
    image: "maldives",
    tag: "island",
  },
  {
    id: "cities",
    name: "Grand city stays",
    subtitle: "The city, from a different perspective",
    image: "venice",
    tag: "city",
  },
  {
    id: "design",
    name: "Architecture & design",
    subtitle: "Places with a point of view",
    image: "kyoto",
    tag: "design",
  },
  {
    id: "retreats",
    name: "Quiet retreats",
    subtitle: "Find your own kind of elsewhere",
    image: "alps",
    tag: "nature",
  },
];
export function filterHotels(hotels: Hotel[], f: Filters, saved: Saved) {
  const q = f.query.trim().toLocaleLowerCase();
  const journey = journeys.find((j) => j.id === f.journey);
  return hotels.filter(
    (h) =>
      (f.group === "All" || h.group === f.group) &&
      (f.brand === "All" || h.brand === f.brand) &&
      (f.tag === "All" || h.tags.includes(f.tag)) &&
      (!journey || h.tags.includes(journey.tag)) &&
      (!f.wishlist || !!saved[h.id]) &&
      (f.status === "All" || saved[h.id] === f.status) &&
      (!q ||
        [h.name, h.brand, h.group, h.city, h.country]
          .join(" ")
          .toLocaleLowerCase()
          .includes(q)),
  );
}
export function readSaved(): Saved {
  try {
    const data = JSON.parse(localStorage.getItem("stay-atlas:v1") || "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return Object.fromEntries(
      Object.entries(data).filter(([, v]) => v === "want" || v === "stayed"),
    ) as Saved;
  } catch {
    return {};
  }
}
export function photoFor(h: Hotel) {
  if (h.country === "United Arab Emirates")
    return { file: "desert", label: "UAE desert · destination photograph" };
  if (h.country === "Maldives")
    return { file: "maldives", label: "Maldives · destination photograph" };
  if (h.city.toLowerCase().includes("venice"))
    return { file: "venice", label: "Venice · destination photograph" };
  if (h.city.toLowerCase().includes("kyoto"))
    return { file: "kyoto", label: "Kyoto · destination photograph" };
  if (
    h.city.toLowerCase().includes("bali") ||
    h.city.toLowerCase().includes("ubud") ||
    h.city.toLowerCase().includes("nusa dua")
  )
    return { file: "bali", label: "Bali · destination photograph" };
  return null;
}
