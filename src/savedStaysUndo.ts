import type { Saved, Status } from "./model";

export type RemovedStay = {
  token: number;
  hotelId: string;
  hotelName: string;
  status: Status;
};

export type SavedState = {
  saved: Saved;
  undo: RemovedStay | null;
  revision: number;
};

function isStatus(value: unknown): value is Status {
  return value === "want" || value === "stayed";
}

export function changeSaved(
  state: SavedState,
  hotel: { id: string; name: string },
  status: Status | null,
): SavedState {
  const previous = Object.hasOwn(state.saved, hotel.id)
    ? state.saved[hotel.id]
    : undefined;

  if (status === null) {
    // An absent or invalid entry is not a removed stay and must not replace Undo.
    if (!isStatus(previous)) return state;
    const saved = { ...state.saved };
    delete saved[hotel.id];
    const revision = state.revision + 1;
    return {
      saved,
      revision,
      undo: {
        token: revision,
        hotelId: hotel.id,
        hotelName: hotel.name,
        status: previous,
      },
    };
  }

  if (!isStatus(status) || previous === status) return state;
  return {
    saved: { ...state.saved, [hotel.id]: status },
    revision: state.revision + 1,
    // A new choice for this hotel supersedes its removal, even if it is later
    // removed again. Changes to other hotels retain the latest removal.
    undo: state.undo?.hotelId === hotel.id ? null : state.undo,
  };
}

export function restoreSaved(state: SavedState, token: number): SavedState {
  const removed = state.undo;
  if (!removed || removed.token !== token || Object.hasOwn(state.saved, removed.hotelId)) {
    return state;
  }
  return {
    saved: { ...state.saved, [removed.hotelId]: removed.status },
    undo: null,
    revision: state.revision + 1,
  };
}

export function expireSavedUndo(state: SavedState, token: number): SavedState {
  if (!state.undo || state.undo.token !== token) return state;
  return { ...state, undo: null, revision: state.revision + 1 };
}

export function persistSaved(saved: Saved, write: (serialized: string) => void): boolean {
  try {
    write(JSON.stringify(saved));
    return true;
  } catch {
    return false;
  }
}
