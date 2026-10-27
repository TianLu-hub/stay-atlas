import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterHotels, initialFilters, journeys } from "../src/model.ts";
const hotels = JSON.parse(
  readFileSync(new URL("../public/data/hotels.json", import.meta.url)),
);
test("collection has 88 unique properties, balanced groups, sourced geographic coordinates", () => {
  assert.equal(hotels.length, 88);
  assert.equal(new Set(hotels.map((h) => h.id)).size, 88);
  assert.equal(new Set(hotels.map((h) => h.country)).size, 44);
  for (const group of ["Hilton", "Marriott"])
    assert.equal(hotels.filter((h) => h.group === group).length, 44);
  // A new batch must not imply that the original collection was reverified.
  assert.equal(hotels.filter((h) => h.verifiedAt === "2026-10-19").length, 80);
  assert.equal(hotels.filter((h) => h.verifiedAt === "2026-10-27").length, 8);
  for (const region of [
    "Americas",
    "Europe",
    "Africa",
    "Middle East",
    "Asia-Pacific",
  ])
    assert.ok(hotels.some((h) => h.region === region));
  for (const h of hotels) {
    assert.ok(h.lat >= -90 && h.lat <= 90);
    assert.ok(h.lng >= -180 && h.lng <= 180);
    assert.ok(h.lat !== 0 && h.lng !== 0);
    assert.ok(h.sources.includes(h.url));
    assert.equal(new URL(h.url).protocol, "https:");
    assert.equal(new URL(h.coordinateSource).protocol, "https:");
    assert.ok(h.coordinatePrecision);
    assert.match(h.verifiedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(h.brand !== h.group || h.brand === "Hilton");
  }
});
test("search combines with group, brand and experience", () => {
  assert.equal(
    filterHotels(
      hotels,
      {
        ...initialFilters,
        group: "Hilton",
        query: "  MALDIVES ",
        tag: "beach",
      },
      {},
    ).length,
    1,
  );
  assert.equal(
    filterHotels(
      hotels,
      {
        ...initialFilters,
        group: "Marriott",
        brand: "The Ritz-Carlton",
        query: "Kyoto",
      },
      {},
    ).length,
    1,
  );
  assert.equal(
    filterHotels(
      hotels,
      { ...initialFilters, group: "Hilton", brand: "The Ritz-Carlton" },
      {},
    ).length,
    0,
  );
});
test("wishlist restricts to saved IDs and chosen status", () => {
  const saved = { [hotels[0].id]: "want", [hotels[1].id]: "stayed" };
  assert.equal(
    filterHotels(hotels, { ...initialFilters, wishlist: true }, saved).length,
    2,
  );
  assert.equal(
    filterHotels(
      hotels,
      { ...initialFilters, wishlist: true, status: "stayed" },
      saved,
    )[0].id,
    hotels[1].id,
  );
  assert.deepEqual(
    filterHotels(hotels, { ...initialFilters, wishlist: true }, {}),
    [],
  );
});
test("journeys only contain hotels with the supporting source-backed tag", () => {
  for (const journey of journeys) {
    const result = filterHotels(
      hotels,
      { ...initialFilters, journey: journey.id },
      {},
    );
    assert.ok(result.length);
    assert.ok(result.every((h) => h.tags.includes(journey.tag)));
  }
});
