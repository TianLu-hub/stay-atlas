import type { Hotel, Saved } from "./model";

export function savedStayHotels(hotels: readonly Hotel[], saved: Saved): Hotel[] {
  return hotels.filter(
    (hotel) =>
      Object.hasOwn(saved, hotel.id) &&
      (saved[hotel.id] === "want" || saved[hotel.id] === "stayed"),
  );
}

function csvCell(value: string): string {
  // Quoting alone does not stop spreadsheet formulas, including prefixes hidden
  // behind whitespace/control characters or their fullwidth equivalents.
  const text = /^[\t\r\n]/.test(value) || /^[\s\p{Cc}\p{Cf}]*[=+\-@＝＋－＠]/u.test(value)
    ? `'${value}`
    : value;
  return `"${text.replaceAll('"', '""')}"`;
}

export function savedStaysCsv(hotels: readonly Hotel[], saved: Saved): string | null {
  const selected = savedStayHotels(hotels, saved);
  if (!selected.length) return null;

  const rows = [
    ["Hotel", "City", "Country", "Brand", "Status", "Official website"],
    ...selected.map((hotel) => [
      hotel.name,
      hotel.city,
      hotel.country,
      hotel.brand,
      saved[hotel.id] === "stayed" ? "Stayed" : "Want to visit",
      hotel.url,
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
