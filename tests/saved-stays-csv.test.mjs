import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { savedStayHotels, savedStaysCsv } from "../src/savedStaysCsv.ts";

const hotels = JSON.parse(
  readFileSync(new URL("../public/data/hotels.json", import.meta.url)),
);
const header = ["Hotel", "City", "Country", "Brand", "Status", "Official website"];

// Parse quoted fields independently so embedded commas/newlines are checked as
// field contents, rather than relying on split() or the serializer itself.
function parseCsv(csv) {
  assert.equal(csv[0], "\uFEFF", "UTF-8 BOM supports spreadsheet Unicode detection");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 1; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && char === ",") {
      row.push(field);
      field = "";
    } else if (!quoted && char === "\r") {
      assert.equal(csv[++i], "\n", "record separators must be CRLF");
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      assert.ok(quoted || char !== "\n", "bare newlines must stay within quoted fields");
      field += char;
    }
  }
  assert.equal(quoted, false);
  assert.equal(field, "");
  assert.deepEqual(row, []);
  return rows;
}

test("exports all valid known saved hotels in collection order with exact columns and statuses", () => {
  const saved = Object.freeze({
    [hotels[9].id]: "stayed",
    unknown: "want",
    [hotels[0].id]: "want",
    [hotels[2].id]: "invalid",
  });
  const selection = savedStayHotels(hotels, saved);
  assert.deepEqual(selection, [hotels[0], hotels[9]]);
  assert.strictEqual(selection[0], hotels[0]);
  const rows = parseCsv(savedStaysCsv(hotels, saved));
  assert.deepEqual(rows, [
    header,
    [hotels[0].name, hotels[0].city, hotels[0].country, hotels[0].brand, "Want to visit", hotels[0].url],
    [hotels[9].name, hotels[9].city, hotels[9].country, hotels[9].brand, "Stayed", hotels[9].url],
  ]);
});

test("no file is produced for empty, unknown, invalid, or inherited saved entries", () => {
  for (const saved of [
    {},
    { unknown: "want" },
    { [hotels[0].id]: null, [hotels[1].id]: "Want", [hotels[2].id]: true },
    Object.create({ [hotels[0].id]: "want" }),
  ]) {
    assert.deepEqual(savedStayHotels(hotels, saved), []);
    assert.equal(savedStaysCsv(hotels, saved), null);
  }
  const saved = Object.assign(Object.create({ [hotels[0].id]: "want" }), {
    [hotels[1].id]: "stayed",
  });
  assert.deepEqual(savedStayHotels(hotels, saved), [hotels[1]]);
  assert.equal(savedStaysCsv([], saved), null);
});

test("Chinese, commas, double quotes, and multiline fields roundtrip without column or row loss", () => {
  const hotel = {
    ...hotels[0],
    name: '京都, "花园" 酒店',
    city: "京都\n东山",
    country: "日本\r\n亚洲",
    brand: '品牌 "精选", Collection',
    url: "https://example.com/stays?city=京都&area=east,west",
  };
  const csv = savedStaysCsv([hotel], { [hotel.id]: "want" });
  assert.ok(csv.includes('"京都, ""花园"" 酒店"'));
  assert.deepEqual(parseCsv(csv), [
    header,
    [hotel.name, hotel.city, hotel.country, hotel.brand, "Want to visit", hotel.url],
  ]);
});

test("spreadsheet formula prefixes are made text in every exported data column", () => {
  const formulas = [
    '=HYPERLINK("https://example.com")', "+1+1", "-1+1", "@SUM(1,2)",
    "  =1+1", "\t+1+1", "\r\n-1+1", "\u0000@SUM(1,2)",
    "\u0085=1+1", "\u200B=1+1", "\uFEFF=1+1",
    "＝1+1", "＋1+1", "－1+1", "＠SUM(1,2)", "\u3000＝1+1",
    "\tHotel", "\rHotel", "\nHotel",
  ];
  for (const value of formulas) {
    const hotel = { ...hotels[0], name: value, city: value, country: value, brand: value, url: value };
    const row = parseCsv(savedStaysCsv([hotel], { [hotel.id]: "stayed" }))[1];
    assert.deepEqual(row, [`'${value}`, `'${value}`, `'${value}`, `'${value}`, "Stayed", `'${value}`]);
  }
});

test("ordinary text and punctuation remain unchanged", () => {
  for (const value of ["A + B", "A-B", "100%", "Hotel @ Kyoto", "'Hotel", "  京都", ""]) {
    const hotel = { ...hotels[0], name: value };
    const row = parseCsv(savedStaysCsv([hotel], { [hotel.id]: "want" }))[1];
    assert.equal(row[0], value);
  }
});
