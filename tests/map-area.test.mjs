import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterByMapArea } from "../src/mapArea.ts";
import { filterHotels, initialFilters } from "../src/model.ts";

const hotels = JSON.parse(
  readFileSync(new URL("../public/data/hotels.json", import.meta.url)),
);

test("area includes each edge, excludes outside points, and preserves input order", () => {
  const points = [
    { id: "north", lng: 15, lat: 30 },
    { id: "outside-east", lng: 21, lat: 25 },
    { id: "west", lng: 10, lat: 25 },
    { id: "south", lng: 15, lat: 20 },
    { id: "outside-north", lng: 15, lat: 31 },
    { id: "east", lng: 20, lat: 25 },
    { id: "inside", lng: 15, lat: 25 },
  ];
  const actual = filterByMapArea(points, {
    west: 10,
    south: 20,
    east: 20,
    north: 30,
  });
  assert.deepEqual(actual.map((p) => p.id), [
    "north", "west", "south", "east", "inside",
  ]);
  assert.strictEqual(actual[0], points[0]);
  assert.equal(points.length, 7);
});

test("dateline-crossing and unwrapped bounds select the same hotels", () => {
  const points = [
    { id: "west-edge", lng: 170, lat: 0 },
    { id: "west-of-line", lng: 179, lat: 0 },
    { id: "east-of-line", lng: -179, lat: 0 },
    { id: "east-edge", lng: -170, lat: 0 },
    { id: "outside", lng: -169, lat: 0 },
    { id: "greenwich", lng: 0, lat: 0 },
    { id: "outside-latitude", lng: 175, lat: 11 },
  ];
  for (const [west, east] of [[170, -170], [170, 190], [-190, -170]]) {
    assert.deepEqual(
      filterByMapArea(points, { west, south: -10, east, north: 10 })
        .map((p) => p.id),
      ["west-edge", "west-of-line", "east-of-line", "east-edge"],
    );
  }
});

test("full-world longitude bounds still apply latitude and include both dateline representations", () => {
  const points = [
    { lng: -180, lat: 0 },
    { lng: 180, lat: 0 },
    { lng: 0, lat: 20 },
    { lng: 90, lat: 21 },
  ];
  for (const [west, east] of [[-180, 180], [-200, 200], [180, -180]]) {
    assert.deepEqual(
      filterByMapArea(points, { west, south: -20, east, north: 20 }),
      points.slice(0, 3),
    );
  }
  assert.deepEqual(
    filterByMapArea(points, { west: 180, south: -1, east: 180, north: 1 }),
    points.slice(0, 2),
  );
});

test("no area preserves the collection; empty and invalid areas return no hotels", () => {
  assert.strictEqual(filterByMapArea(hotels, null), hotels);
  assert.deepEqual(
    filterByMapArea(hotels, { west: 0, south: -1, east: 1, north: 1 }),
    [],
  );
  const valid = { west: -180, south: -90, east: 180, north: 90 };
  for (const area of [
    { ...valid, west: NaN },
    { ...valid, east: Infinity },
    { ...valid, south: 50, north: 40 },
    { ...valid, south: -91 },
    { ...valid, north: 91 },
  ]) {
    assert.deepEqual(filterByMapArea(hotels, area), []);
  }
  assert.deepEqual(
    filterByMapArea([{ lng: NaN, lat: 0 }, { lng: 0, lat: Infinity }], valid),
    [],
  );
});

test("area filtering composes with search, brand, group, and saved-status filters", () => {
  const kyoto = hotels.find((h) => h.name === "The Ritz-Carlton, Kyoto");
  assert.ok(kyoto);
  const saved = { [kyoto.id]: "want" };
  const filters = {
    ...initialFilters,
    group: "Marriott",
    brand: "The Ritz-Carlton",
    query: "Kyoto",
    wishlist: true,
    status: "want",
  };
  const japan = { west: 130, south: 30, east: 145, north: 45 };
  assert.deepEqual(
    filterByMapArea(filterHotels(hotels, filters, saved), japan),
    [kyoto],
  );
  assert.deepEqual(
    filterHotels(filterByMapArea(hotels, japan), filters, saved),
    [kyoto],
  );
  assert.deepEqual(
    filterByMapArea(filterHotels(hotels, filters, saved), {
      west: -10, south: 35, east: 30, north: 60,
    }),
    [],
  );
  assert.deepEqual(
    filterByMapArea(filterHotels(hotels, { ...filters, status: "stayed" }, saved), japan),
    [],
  );
});
