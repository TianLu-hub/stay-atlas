import type { Hotel } from "./model";

type LoadResult =
  | { status: "loaded"; hotels: Hotel[] }
  | { status: "failed" }
  | { status: "cancelled" };

/** One collection request at a time; cancelled requests cannot publish stale results. */
export function createHotelLoader(request: typeof fetch = fetch) {
  let active: AbortController | null = null;
  return {
    load(): Promise<LoadResult> | null {
      if (active) return null;
      const controller = new AbortController();
      active = controller;
      return (async (): Promise<LoadResult> => {
        try {
          const response = await request("/data/hotels.json", { signal: controller.signal });
          if (!response.ok) throw new Error("Collection request failed");
          const hotels: unknown = await response.json();
          if (!Array.isArray(hotels)) throw new Error("Invalid collection response");
          return active === controller
            ? { status: "loaded", hotels: hotels as Hotel[] }
            : { status: "cancelled" };
        } catch {
          return { status: active === controller ? "failed" : "cancelled" };
        } finally {
          if (active === controller) active = null;
        }
      })();
    },
    cancel() {
      const controller = active;
      active = null;
      controller?.abort();
    },
  };
}
