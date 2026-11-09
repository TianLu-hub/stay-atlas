import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHotelLoader } from "../src/hotelLoader.ts";

const hotels = JSON.parse(
  readFileSync(new URL("../public/data/hotels.json", import.meta.url)),
).slice(0, 2);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function response(data = hotels) {
  return { ok: true, json: async () => data };
}

test("loads the hotel collection with a cancellable request", async () => {
  let signal;
  const loader = createHotelLoader(async (url, options) => {
    assert.equal(url, "/data/hotels.json");
    signal = options.signal;
    assert.ok(signal instanceof AbortSignal);
    assert.equal(signal.aborted, false);
    return response();
  });
  assert.deepEqual(await loader.load(), { status: "loaded", hotels });
  loader.cancel();
  assert.equal(signal.aborted, false, "completed requests are no longer active");
});

test("an HTTP failure does not try to read a success body", async () => {
  let readBody = false;
  const loader = createHotelLoader(async () => ({
    ok: false,
    json: async () => { readBody = true; return hotels; },
  }));
  assert.deepEqual(await loader.load(), { status: "failed" });
  assert.equal(readBody, false);
});

test("a rejected network request becomes a recoverable failure", async () => {
  const loader = createHotelLoader(async () => { throw new TypeError("Network unavailable"); });
  assert.deepEqual(await loader.load(), { status: "failed" });
});

test("invalid JSON becomes a recoverable failure", async () => {
  const loader = createHotelLoader(async () => ({
    ok: true,
    json: async () => { throw new SyntaxError("Unexpected token"); },
  }));
  assert.deepEqual(await loader.load(), { status: "failed" });
});

test("non-array JSON cannot be published as a hotel collection", async () => {
  for (const payload of [{ hotels }, null, "collection", 88, true]) {
    const loader = createHotelLoader(async () => response(payload));
    assert.deepEqual(await loader.load(), { status: "failed" });
  }
});

test("repeated activation shares the pending guard without starting another request", async () => {
  const network = deferred();
  let calls = 0;
  const loader = createHotelLoader(() => { calls += 1; return network.promise; });
  const first = loader.load();
  assert.equal(loader.load(), null);
  assert.equal(loader.load(), null);
  assert.equal(calls, 1);
  network.resolve(response());
  assert.deepEqual(await first, { status: "loaded", hotels });
});

test("duplicate requests remain blocked while the response body is pending", async () => {
  const body = deferred();
  const reading = deferred();
  let calls = 0;
  const loader = createHotelLoader(async () => {
    calls += 1;
    return { ok: true, json: () => { reading.resolve(); return body.promise; } };
  });
  const first = loader.load();
  await reading.promise;
  assert.equal(loader.load(), null);
  assert.equal(calls, 1);
  body.resolve(hotels);
  assert.deepEqual(await first, { status: "loaded", hotels });
});

test("a failed retry releases the guard for a later successful retry", async () => {
  let calls = 0;
  const loader = createHotelLoader(async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("Offline");
    if (calls === 2) return { ok: false };
    return response();
  });
  assert.deepEqual(await loader.load(), { status: "failed" });
  assert.deepEqual(await loader.load(), { status: "failed" });
  assert.deepEqual(await loader.load(), { status: "loaded", hotels });
  assert.equal(calls, 3);
});

for (const settlement of ["resolve", "reject"]) {
  test(`cancelled request ${settlement} cannot publish or release a newer active request`, async () => {
    const previous = deferred();
    const current = deferred();
    const signals = [];
    let calls = 0;
    const loader = createHotelLoader((url, { signal }) => {
      signals.push(signal);
      return ++calls === 1 ? previous.promise : current.promise;
    });
    const oldRequest = loader.load();
    loader.cancel();
    assert.equal(signals[0].aborted, true);
    const newRequest = loader.load();
    assert.ok(newRequest);
    assert.equal(signals[1].aborted, false);
    if (settlement === "resolve") previous.resolve(response(hotels.slice(0, 1)));
    else previous.reject(new Error("Late failure after cancellation"));
    assert.deepEqual(await oldRequest, { status: "cancelled" });
    assert.equal(loader.load(), null, "stale cleanup must not release the current request");
    assert.equal(calls, 2);
    current.resolve(response());
    assert.deepEqual(await newRequest, { status: "loaded", hotels });
  });
}

test("cancellation also ignores a stale body after effect cleanup and restart", async () => {
  const body = deferred();
  const reading = deferred();
  const next = deferred();
  let calls = 0;
  const loader = createHotelLoader(async () => {
    if (++calls === 1) {
      return { ok: true, json: () => { reading.resolve(); return body.promise; } };
    }
    return next.promise;
  });
  const oldRequest = loader.load();
  await reading.promise;
  loader.cancel();
  const newRequest = loader.load();
  body.resolve(hotels.slice(0, 1));
  assert.deepEqual(await oldRequest, { status: "cancelled" });
  assert.equal(loader.load(), null);
  assert.equal(calls, 2);
  next.resolve(response());
  assert.deepEqual(await newRequest, { status: "loaded", hotels });
});
