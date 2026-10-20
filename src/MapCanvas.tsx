import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import maplibregl, {
  type StyleSpecification,
  type GeoJSONSource,
} from "maplibre-gl";
import { Plus, Minus, Globe2, LocateFixed } from "lucide-react";
import type { Hotel, Saved } from "./model";
import "maplibre-gl/dist/maplibre-gl.css";
export type MapHandle = { flyTo: (h: Hotel) => void; reset: () => void };
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const worldZoom = () =>
  Math.log2(Math.min(innerWidth * 0.92, (innerHeight - 170) * 1.95) / 512);
export const MapCanvas = forwardRef<
  MapHandle,
  {
    hotels: Hotel[];
    saved: Saved;
    selected: string | null;
    hovered: string | null;
    onSelect: (h: Hotel) => void;
  }
>(function MapCanvas({ hotels, saved, selected, hovered, onSelect }, ref) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<maplibregl.Map | null>(null),
    markers = useRef(new Map<string, maplibregl.Marker>()),
    hotelsRef = useRef(hotels),
    callback = useRef(onSelect),
    savedRef = useRef(saved),
    selection = useRef(selected),
    hoverRef = useRef(hovered);
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [lowDetail, setLowDetail] = useState(false),
    [world, setWorld] = useState(true);
  const refreshRef = useRef(() => {});
  hotelsRef.current = hotels;
  callback.current = onSelect;
  savedRef.current = saved;
  selection.current = selected;
  hoverRef.current = hovered;
  const fly = (h: Hotel) => {
    const m = map.current;
    if (!m) return;
    const mobile = innerWidth < 760;
    m.flyTo({
      center: [h.lng, h.lat],
      zoom: Math.max(h.tags.includes("city") ? 12 : 10, m.getZoom()),
      duration: reduced() ? 0 : 2200,
      padding: mobile
        ? { left: 20, right: 20, top: 30, bottom: innerHeight * 0.43 }
        : { left: 50, right: 430, top: 90, bottom: 90 },
      essential: false,
    });
  };
  const reset = () =>
    map.current?.flyTo({
      center: [8, 18],
      zoom: worldZoom(),
      bearing: 0,
      pitch: 0,
      padding:
        innerWidth < 760
          ? { left: 0, right: 0, top: 10, bottom: 45 }
          : { left: 0, right: 0, top: 20, bottom: 60 },
      duration: reduced() ? 0 : 1800,
    });
  useImperativeHandle(ref, () => ({ flyTo: fly, reset }));
  useEffect(() => {
    let dead = false;
    let timer: ReturnType<typeof setTimeout>;
    let m: maplibregl.Map;
    const start = async () => {
      try {
        const style = (await fetch("/data/map-style.json").then((r) =>
          r.json(),
        )) as StyleSpecification;
        if (dead) return;
        m = new maplibregl.Map({
          container: host.current!,
          style,
          center: [8, 18],
          zoom: worldZoom(),
          minZoom: -1.5,
          maxZoom: 17,
          attributionControl: false,
          renderWorldCopies: false,
          // Keep the entire atlas visible even in a tall, narrow viewport.
          transformConstrain: (center, zoom) => ({
            center: new maplibregl.LngLat(
              Math.max(-180, Math.min(180, center.lng)),
              Math.max(-82, Math.min(82, center.lat)),
            ),
            zoom: Math.max(worldZoom() - 0.25, Math.min(17, zoom)),
          }),
        });
        map.current = m;
        m.on("zoom", () => setWorld(m.getZoom() < 3));
        m.addControl(
          new maplibregl.AttributionControl({
            compact: false,
          }),
          "bottom-right",
        );
        m.dragRotate.disable();
        m.touchZoomRotate.disableRotation();
        m.on("error", (e) => {
          if (String(e.error?.message).includes("tiles.openfreemap")) {
            setLowDetail(true);
            if (m.getLayer("detailed-land-background"))
              m.setLayoutProperty(
                "detailed-land-background",
                "visibility",
                "none",
              );
          }
        });
        const setup = () => {
          if (dead) return;
          m.setProjection({ type: "mercator" });
          if (!m.getSource("hotels")) {
            m.addSource("hotels", {
              type: "geojson",
              data: collection(hotelsRef.current),
              cluster: true,
              clusterMaxZoom: 8,
              clusterRadius: 24,
            });
            m.addLayer({
              id: "hotel-index",
              type: "circle",
              source: "hotels",
              paint: { "circle-radius": 1, "circle-opacity": 0 },
            });
          }
          if (host.current) host.current.dataset.mapReady = "true";
          const refresh = () => {
            if (!m.getSource("hotels") || !m.isSourceLoaded("hotels")) return;
            const seen = new Set<string>();
            const fs = m.querySourceFeatures("hotels");
            for (const feature of fs) {
              if (feature.geometry.type !== "Point") continue;
              const p = feature.properties!;
              const cluster = !!p.cluster;
              const id = cluster ? "cluster-" + p.cluster_id : String(p.id);
              if (seen.has(id)) continue;
              seen.add(id);
              let marker = markers.current.get(id);
              const h = hotelsRef.current.find((x) => x.id === id);
              if (!cluster && !h) continue;
              if (!marker) {
                const b = document.createElement("button");
                b.type = "button";
                b.className = cluster
                  ? "atlas-pin cluster"
                  : "atlas-pin " + h!.group.toLowerCase();
                b.textContent = cluster
                  ? String(p.point_count)
                  : h!.group === "Hilton"
                    ? "H"
                    : "M";
                b.title = cluster
                  ? `${p.point_count} stays · click to explore`
                  : `${h!.name} · ${h!.group}`;
                b.setAttribute(
                  "aria-label",
                  cluster
                    ? `Zoom into ${p.point_count} hotels`
                    : `View ${h!.name}, ${h!.city}`,
                );
                b.addEventListener("click", async (e) => {
                  e.stopPropagation();
                  if (cluster) {
                    const z = await (
                      m.getSource("hotels") as GeoJSONSource
                    ).getClusterExpansionZoom(p.cluster_id);
                    m.easeTo({
                      center: (feature.geometry as { coordinates: number[] })
                        .coordinates as [number, number],
                      zoom: z + 0.3,
                      duration: reduced() ? 0 : 650,
                    });
                  } else callback.current(h!);
                });
                marker = new maplibregl.Marker({
                  element: b,
                  opacityWhenCovered: 0,
                })
                  .setLngLat(feature.geometry.coordinates as [number, number])
                  .addTo(m);
                markers.current.set(id, marker);
              }
              marker
                .getElement()
                .classList.toggle("selected", selection.current === id);
              marker
                .getElement()
                .classList.toggle("hovered", hoverRef.current === id);
              marker
                .getElement()
                .classList.toggle("saved", !!savedRef.current[id]);
            }
            for (const [id, marker] of markers.current)
              if (!seen.has(id)) {
                marker.remove();
                markers.current.delete(id);
              }
          };
          refreshRef.current = refresh;
          m.on("sourcedata", refresh);
          m.on("moveend", refresh);
          setReady(true);
          const currentHotel = hotelsRef.current.find(
            (h) => h.id === selection.current,
          );
          if (currentHotel) fly(currentHotel);
          else reset();
          refresh();
        };
        m.on("load", setup);
        timer = setTimeout(() => {
          if (!m.getSource("hotels")) {
            setLowDetail(true);
            const fallback: StyleSpecification = {
              version: 8,
              sources: {
                world: {
                  type: "geojson",
                  data: "/data/world.geojson",
                  attribution: "Natural Earth",
                },
              },
              layers: [
                {
                  id: "background",
                  type: "background",
                  paint: { "background-color": "#0c202e" },
                },
                {
                  id: "land",
                  type: "fill",
                  source: "world",
                  paint: {
                    "fill-color": "#203c49",
                    "fill-outline-color": "#38515c",
                  },
                },
              ],
            };
            m.setStyle(fallback);
            m.once("style.load", setup);
          }
        }, 7000);
      } catch {
        setFailed(true);
      }
    };
    start();
    return () => {
      dead = true;
      clearTimeout(timer);
      for (const x of markers.current.values()) x.remove();
      markers.current.clear();
      m?.remove();
    };
  }, []);
  useEffect(() => {
    if (ready)
      (map.current?.getSource("hotels") as GeoJSONSource)?.setData(
        collection(hotels),
      );
  }, [hotels, ready]);
  useEffect(() => {
    refreshRef.current();
  }, [selected, hovered, saved]);
  useEffect(() => {
    if (!ready || !hovered || markers.current.has(hovered) || !map.current)
      return;
    const h = hotels.find((x) => x.id === hovered);
    if (!h) return;
    const el = document.createElement("div");
    el.className = "atlas-pin hovered " + h.group.toLowerCase();
    el.textContent = h.group === "Hilton" ? "H" : "M";
    el.style.pointerEvents = "none";
    const marker = new maplibregl.Marker({ element: el, opacityWhenCovered: 0 })
      .setLngLat([h.lng, h.lat])
      .addTo(map.current);
    return () => {
      marker.remove();
    };
  }, [hovered, ready, hotels]);
  return (
    <>
      <div
        className={"map-canvas " + (world ? "world-view" : "close-view")}
        ref={host}
        aria-label="Interactive hotel world map"
      />
      {!ready && !failed && (
        <div className="map-loading">Opening your atlas…</div>
      )}
      {failed && (
        <div className="map-error">
          <Globe2 size={40} />
          <h2>The world is still yours.</h2>
          <p>
            Your browser could not initialize the interactive map. Explore every
            hotel in the discovery list.
          </p>
        </div>
      )}
      <div className="map-tools">
        <button
          title="Zoom in"
          aria-label="Zoom in"
          onClick={() => map.current?.zoomIn({ duration: reduced() ? 0 : 300 })}
        >
          <Plus size={18} />
        </button>
        <button
          title="Zoom out"
          aria-label="Zoom out"
          onClick={() =>
            map.current?.zoomOut({ duration: reduced() ? 0 : 300 })
          }
        >
          <Minus size={18} />
        </button>
        <span />
        <button
          title="Reset world view"
          aria-label="Reset world view"
          onClick={reset}
        >
          <LocateFixed size={18} />
        </button>
      </div>
      {lowDetail && (
        <div className="map-notice">
          Detailed tiles unavailable · world overview active
        </div>
      )}
    </>
  );
});
function collection(hotels: Hotel[]) {
  return {
    type: "FeatureCollection" as const,
    features: hotels.map((h) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [h.lng, h.lat] },
      properties: { id: h.id, group: h.group },
    })),
  };
}
