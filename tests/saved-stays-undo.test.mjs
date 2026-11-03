import test from "node:test";
import assert from "node:assert/strict";
import {
  changeSaved,
  restoreSaved,
  expireSavedUndo,
  persistSaved,
} from "../src/savedStaysUndo.ts";

const kyoto = { id: "marriott-kyoto", name: "The Ritz-Carlton, Kyoto" };
const yala = { id: "hilton-yala", name: "Hilton Yala Resort" };
const other = { id: "another-hotel", name: "Another hotel" };
const initial = (saved = {}) => ({ saved, undo: null, revision: 0 });

test("Undo restores the exact removed status without mutating the original collection", () => {
  for (const status of ["want", "stayed"]) {
    const saved = Object.freeze({ [kyoto.id]: status, [yala.id]: "stayed" });
    const original = Object.freeze(initial(saved));
    const removed = changeSaved(original, kyoto, null);
    assert.deepEqual(removed.saved, { [yala.id]: "stayed" });
    assert.deepEqual(removed.undo, {
      token: 1,
      hotelId: kyoto.id,
      hotelName: kyoto.name,
      status,
    });
    assert.equal(removed.revision, 1);
    const restored = restoreSaved(removed, removed.undo.token);
    assert.deepEqual(restored.saved, saved);
    assert.notStrictEqual(restored.saved, saved);
    assert.equal(restored.undo, null);
    assert.equal(restored.revision, 2);
    assert.deepEqual(original, initial(saved));
    assert.deepEqual(removed.saved, { [yala.id]: "stayed" });
    assert.strictEqual(restoreSaved(restored, removed.undo.token), restored);
  }
});

test("consecutive removals replace Undo so only the most recent stay returns", () => {
  const first = changeSaved(initial({ [kyoto.id]: "want", [yala.id]: "stayed" }), kyoto, null);
  const second = changeSaved(first, yala, null);
  assert.notEqual(first.undo.token, second.undo.token);
  assert.strictEqual(restoreSaved(second, first.undo.token), second);
  const restored = restoreSaved(second, second.undo.token);
  assert.deepEqual(restored.saved, { [yala.id]: "stayed" });
  assert.equal(restored.undo, null);
});

test("re-saving a removed hotel invalidates Undo and preserves the new status", () => {
  const removed = changeSaved(initial({ [kyoto.id]: "want" }), kyoto, null);
  const chosen = changeSaved(removed, kyoto, "stayed");
  assert.equal(chosen.undo, null);
  assert.deepEqual(chosen.saved, { [kyoto.id]: "stayed" });
  assert.strictEqual(restoreSaved(chosen, removed.undo.token), chosen);

  const changed = changeSaved(chosen, kyoto, "want");
  assert.equal(changed.undo, null);
  assert.strictEqual(restoreSaved(changed, removed.undo.token), changed);
  assert.deepEqual(changed.saved, { [kyoto.id]: "want" });
});

test("remove, re-save, remove again rejects the first Undo and restores the latest choice", () => {
  const first = changeSaved(initial({ [kyoto.id]: "want" }), kyoto, null);
  const chosen = changeSaved(first, kyoto, "stayed");
  const second = changeSaved(chosen, kyoto, null);
  assert.ok(second.undo.token > first.undo.token);
  assert.strictEqual(restoreSaved(second, first.undo.token), second);
  assert.strictEqual(expireSavedUndo(second, first.undo.token), second);
  assert.deepEqual(restoreSaved(second, second.undo.token).saved, { [kyoto.id]: "stayed" });
});

test("Undo merges with later changes to other hotels rather than restoring an old snapshot", () => {
  const removed = changeSaved(initial({ [kyoto.id]: "want", [yala.id]: "want" }), kyoto, null);
  const changed = changeSaved(removed, yala, "stayed");
  const added = changeSaved(changed, other, "want");
  assert.strictEqual(added.undo, removed.undo);
  assert.deepEqual(restoreSaved(added, removed.undo.token).saved, {
    [kyoto.id]: "want",
    [yala.id]: "stayed",
    [other.id]: "want",
  });
});

test("missing, invalid, or inherited entries cannot replace a pending valid removal", () => {
  const removed = changeSaved(initial({ [kyoto.id]: "want" }), kyoto, null);
  for (const saved of [
    {},
    { [yala.id]: "invalid" },
    Object.create({ [yala.id]: "stayed" }),
  ]) {
    const state = { ...removed, saved };
    assert.strictEqual(changeSaved(state, yala, null), state);
  }
  assert.strictEqual(changeSaved(removed, yala, "invalid"), removed);
  const added = changeSaved(initial(), yala, "want");
  assert.equal(added.undo, null);
  assert.strictEqual(changeSaved(added, yala, "want"), added);
});

test("Undo cannot overwrite an existing own entry even when given a matching token", () => {
  const removed = changeSaved(initial({ [kyoto.id]: "want" }), kyoto, null);
  const newerChoice = { ...removed, saved: { [kyoto.id]: "stayed" } };
  assert.strictEqual(restoreSaved(newerChoice, removed.undo.token), newerChoice);
});

test("expiry only consumes its matching Undo and never restores or removes saved hotels", () => {
  const first = changeSaved(initial({ [kyoto.id]: "want", [yala.id]: "stayed" }), kyoto, null);
  const second = changeSaved(first, yala, null);
  assert.strictEqual(expireSavedUndo(second, first.undo.token), second);
  const expired = expireSavedUndo(second, second.undo.token);
  assert.equal(expired.undo, null);
  assert.strictEqual(expired.saved, second.saved);
  assert.equal(expired.revision, second.revision + 1);
  assert.strictEqual(restoreSaved(expired, second.undo.token), expired);
  assert.strictEqual(expireSavedUndo(expired, second.undo.token), expired);
});

test("persistence reports success and catches both serialization and storage failures", () => {
  const saved = Object.freeze({ [kyoto.id]: "want", [yala.id]: "stayed" });
  let serialized;
  assert.equal(persistSaved(saved, value => { serialized = value; }), true);
  assert.deepEqual(JSON.parse(serialized), saved);
  assert.equal(persistSaved(saved, () => { throw new Error("Storage unavailable"); }), false);
  const circular = {};
  circular.self = circular;
  let called = false;
  assert.equal(persistSaved(circular, () => { called = true; }), false);
  assert.equal(called, false);
});

test("storage failures do not prevent session-only removal and exact Undo restoration", () => {
  const original = initial({ [kyoto.id]: "stayed", [yala.id]: "want" });
  const fail = () => { throw new Error("Quota exceeded"); };
  const removed = changeSaved(original, kyoto, null);
  assert.equal(persistSaved(removed.saved, fail), false);
  assert.deepEqual(removed.saved, { [yala.id]: "want" });
  const restored = restoreSaved(removed, removed.undo.token);
  assert.equal(persistSaved(restored.saved, fail), false);
  assert.deepEqual(restored.saved, original.saved);
  assert.equal(restored.undo, null);
});
