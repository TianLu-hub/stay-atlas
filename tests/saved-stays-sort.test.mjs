import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sortSavedStays } from "../src/savedStaysSort.ts";
import { filterHotels, initialFilters } from "../src/model.ts";
import { savedStayHotels, savedStaysCsv } from "../src/savedStaysCsv.ts";

const hotels = JSON.parse(
  readFileSync(new URL("../public/data/hotels.json", import.meta.url)),
);

function stay(id, country, city, name) {
  return Object.freeze({ ...hotels[0], id, country, city, name });
}

test("country sorting groups countries, then cities, then hotel names", () => {
  const input = [
    stay("tokyo", "Japan", "Tokyo", "Alpha"),
    stay("vienna-z", "Austria", "Vienna", "Zeta"),
    stay("kyoto", "Japan", "Kyoto", "Zeta"),
    stay("salzburg", "Austria", "Salzburg", "Zeta"),
    stay("vienna-a", "Austria", "Vienna", "Alpha"),
  ];
  assert.deepEqual(sortSavedStays(input, "country").map(h => h.id), [
    "salzburg", "vienna-a", "vienna-z", "kyoto", "tokyo",
  ]);
});

test("sorting a frozen input preserves hotel identity and the order of exact ties", () => {
  const first = stay("first", "Japan", "Kyoto", "The same hotel");
  const second = stay("second", "Japan", "Kyoto", "The same hotel");
  const earlier = stay("earlier", "Austria", "Vienna", "Example");
  const input = Object.freeze([first, second, earlier]);
  const output = sortSavedStays(input, "country");
  assert.notStrictEqual(output, input);
  assert.deepEqual(input, [first, second, earlier]);
  assert.strictEqual(output[0], earlier);
  assert.strictEqual(output[1], first);
  assert.strictEqual(output[2], second);
});

test("collection mode returns the original sequence even after country sorting", () => {
  const input = Object.freeze([
    stay("japan", "Japan", "Kyoto", "Example"),
    stay("austria", "Austria", "Vienna", "Example"),
  ]);
  assert.deepEqual(sortSavedStays(input, "country").map(h => h.id), ["austria", "japan"]);
  assert.strictEqual(sortSavedStays(input, "collection"), input);
  assert.deepEqual(sortSavedStays(input, "collection").map(h => h.id), ["japan", "austria"]);
  assert.deepEqual(sortSavedStays(Object.freeze([]), "country"), []);
  assert.deepEqual(sortSavedStays(Object.freeze([input[0]]), "country"), [input[0]]);
});

test("English collation keeps accented place names with their alphabetic neighbors", () => {
  const input = [
    stay("zurich", "Switzerland", "Zurich", "Example"),
    stay("evian", "Switzerland", "Évian", "Example"),
    stay("bern", "Switzerland", "Bern", "Example"),
  ];
  assert.deepEqual(sortSavedStays(input, "country").map(h => h.id), ["bern", "evian", "zurich"]);
});

test("sorting only a filtered saved subset leaves map membership and full CSV unchanged", () => {
  const input = Object.freeze([
    stay("japan-want", "Japan", "Kyoto", "Example"),
    stay("austria-want", "Austria", "Vienna", "Example"),
    stay("france-stayed", "France", "Paris", "Example"),
    stay("italy-unsaved", "Italy", "Rome", "Example"),
  ]);
  const saved = Object.freeze({
    "japan-want": "want", "austria-want": "want", "france-stayed": "stayed",
  });
  const filtered = Object.freeze(filterHotels(input, {
    ...initialFilters, wishlist: true, status: "want",
  }, saved));
  const csvBefore = savedStaysCsv(input, saved);
  const sorted = sortSavedStays(filtered, "country");
  assert.deepEqual(sorted.map(h => h.id), ["austria-want", "japan-want"]);
  assert.deepEqual(filtered.map(h => h.id), ["japan-want", "austria-want"]);
  assert.deepEqual(new Set(sorted), new Set(filtered));
  assert.deepEqual(savedStayHotels(input, saved).map(h => h.id), [
    "japan-want", "austria-want", "france-stayed",
  ]);
  assert.equal(savedStaysCsv(input, saved), csvBefore);
});
