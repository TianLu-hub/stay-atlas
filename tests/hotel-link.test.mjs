import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hotelShareUrl, sharedHotelId } from "../src/hotelLink.ts";

const hotels = JSON.parse(
  readFileSync(new URL("../public/data/hotels.json", import.meta.url)),
);

test("every hotel share link resolves to the same collection entry", () => {
  for (const hotel of hotels) {
    const link = hotelShareUrl(hotel.id, "https://atlas.example/");
    const id = sharedHotelId(new URL(link).search);
    assert.equal(id, hotel.id);
    assert.strictEqual(hotels.find((candidate) => candidate.id === id), hotel);
  }
});

test("sharing preserves the current site path and excludes unrelated state", () => {
  const link = new URL(hotelShareUrl(
    "ritz-kyoto",
    "https://atlas.example:8443/stay-atlas/index.html?hotel=old&query=Tokyo&wishlist=true#saved",
  ));
  assert.equal(link.origin, "https://atlas.example:8443");
  assert.equal(link.pathname, "/stay-atlas/index.html");
  assert.deepEqual([...link.searchParams], [["hotel", "ritz-kyoto"]]);
  assert.equal(link.hash, "");
});

test("URI characters roundtrip as one hotel ID without adding URL parameters", () => {
  const id = "Hôtel 京都 + / & ?hotel=other #sea %25";
  const link = new URL(hotelShareUrl(id, "https://atlas.example/"));
  assert.equal(sharedHotelId(link.search), id);
  assert.deepEqual([...link.searchParams.keys()], ["hotel"]);
  assert.equal(link.pathname, "/");
  assert.equal(link.hash, "");
});

test("missing, empty, or whitespace hotel parameters do not request a hotel", () => {
  for (const search of ["", "?query=Kyoto", "?hotel", "?hotel=", "?hotel=+%20%09"]) {
    assert.equal(sharedHotelId(search), null);
  }
});

test("unknown or malformed IDs remain inert data and cannot resolve to a hotel", () => {
  for (const search of [
    "?hotel=not-in-the-collection",
    "?hotel=%E0%A4%A",
    "?hotel=%",
    "?hotel=javascript%3Aalert(1)",
    "?hotel=%3Cscript%3Ealert(1)%3C%2Fscript%3E",
    "?hotel=__proto__",
  ]) {
    let id;
    assert.doesNotThrow(() => { id = sharedHotelId(search); });
    assert.equal(typeof id, "string");
    assert.equal(hotels.find((hotel) => hotel.id === id), undefined);
    assert.equal(new URL(hotelShareUrl(id, "https://atlas.example/")).origin, "https://atlas.example");
  }
  assert.equal(sharedHotelId("?hotel=first&hotel=second"), "first");
});
