import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  Compass,
  Download,
  ExternalLink,
  Globe2,
  Heart,
  MapPin,
  Search,
  Share2,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { MapCanvas, type MapHandle } from "./MapCanvas";
import {
  filterHotels,
  initialFilters,
  journeys,
  photoFor,
  readSaved,
  type Hotel,
  type Filters,
  type Saved,
  type Status,
} from "./model";
import { filterByMapArea, type MapArea } from "./mapArea";
import { hotelShareUrl, sharedHotelId } from "./hotelLink";
import { savedStayHotels, savedStaysCsv } from "./savedStaysCsv";
import "./style.css";
function App() {
  const [hotels, setHotels] = useState<Hotel[]>([]),
    [error, setError] = useState(false),
    [filters, setFilters] = useState<Filters>(initialFilters),
    [saved, setSaved] = useState<Saved>(readSaved),
    [selected, setSelected] = useState<Hotel | null>(null),
    [viewport, setViewport] = useState<MapArea | null>(null),
    [area, setArea] = useState<MapArea | null>(null),
    [hovered, setHovered] = useState<string | null>(null),
    [drawer, setDrawer] = useState(false),
    [more, setMore] = useState(false),
    [expanded, setExpanded] = useState(false),
    [dialog, setDialog] = useState<"detail" | "journeys" | "about" | null>(
      null,
    ),
    [toast, setToast] = useState(""),
    [sharedLinkReady, setSharedLinkReady] = useState(false),
    [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "manual">("idle");
  const map = useRef<MapHandle>(null),
    requestedHotelId = useRef(sharedHotelId(location.search)),
    sharedLinkHandled = useRef(false),
    selectedId = useRef(selected?.id),
    manualLink = useRef<HTMLInputElement>(null),
    dragY = useRef(0),
    modal = useRef<HTMLDialogElement>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  selectedId.current = selected?.id;
  useEffect(() => {
    fetch("/data/hotels.json")
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setHotels)
      .catch(() => setError(true));
  }, []);
  useEffect(() => {
    if (!hotels.length || sharedLinkHandled.current) return;
    sharedLinkHandled.current = true;
    const id = requestedHotelId.current;
    if (id) {
      const hotel = hotels.find(h => h.id === id);
      if (hotel) select(hotel);
      else notify("This shared stay is no longer in the collection. Explore another place.");
    }
    setSharedLinkReady(true);
  }, [hotels]);
  useEffect(() => {
    // Keep a received hotel's link accurate as its preview changes or closes.
    if (!sharedLinkReady) return;
    const url = new URL(location.href);
    if (!url.searchParams.has("hotel")) return;
    if (selected) url.searchParams.set("hotel", selected.id);
    else url.searchParams.delete("hotel");
    history.replaceState(history.state, "", url);
  }, [selected?.id, sharedLinkReady]);
  useEffect(() => { setCopyState("idle"); }, [selected?.id]);
  useEffect(() => {
    if (copyState === "manual") {
      manualLink.current?.focus();
      manualLink.current?.select();
    }
  }, [copyState]);
  useEffect(() => {
    const d = modal.current;
    if (!d) return;
    if (dialog && !d.open) d.showModal();
    else if (!dialog && d.open) d.close();
  }, [dialog]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setDrawer((v) => !v);
        setExpanded(true);
      }
      if (e.key === "Escape" && !dialog) {
        setDrawer(false);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dialog]);
  useEffect(() => {
    if (drawer)
      requestAnimationFrame(() =>
        document.querySelector<HTMLInputElement>(".search-wrap input")?.focus(),
      );
  }, [drawer]);
  const matchingHotels = useMemo(
    () => filterHotels(hotels, filters, saved),
    [hotels, filters, saved],
  );
  const results = useMemo(() => filterByMapArea(matchingHotels, area), [matchingHotels, area]);
  const exportCount = useMemo(() => savedStayHotels(hotels, saved).length, [hotels, saved]);
  const visibleCount = useMemo(() => filterByMapArea(matchingHotels, viewport).length, [matchingHotels, viewport]);
  const areaChanged = viewport && (!area ||
    (Object.keys(viewport) as (keyof MapArea)[]).some(key => Math.abs(viewport[key] - area[key]) > 0.00001));
  function clearArea() {
    setArea(null);
    setSelected(null);
  }
  function searchArea() {
    if (!viewport) return;
    setArea(viewport);
    setSelected(null);
    setHovered(null);
  }
  const brands = useMemo(
    () =>
      [
        ...new Set(
          hotels
            .filter((h) => filters.group === "All" || h.group === filters.group)
            .map((h) => h.brand),
        ),
      ].sort(),
    [hotels, filters.group],
  );
  function notify(s: string) {
    setToast(s);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2800);
  }
  function save(h: Hotel, status: Status | null) {
    const next = { ...saved };
    if (status) next[h.id] = status;
    else delete next[h.id];
    setSaved(next);
    try {
      localStorage.setItem("stay-atlas:v1", JSON.stringify(next));
      notify(
        status === "want"
          ? "A little dream, saved."
          : status === "stayed"
            ? "Another place in your story."
            : "Removed from your stays.",
      );
    } catch {
      notify("Saved for this visit. Browser storage is unavailable.");
    }
  }
  function exportSavedStays() {
    const csv = savedStaysCsv(hotels, saved);
    if (!csv) {
      notify("Save a stay before exporting your list.");
      return;
    }
    const link = document.createElement("a");
    let objectUrl: string | undefined;
    try {
      objectUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      link.href = objectUrl;
      link.download = `stay-atlas-saved-stays-${new Date().toISOString().slice(0, 10)}.csv`;
      link.hidden = true;
      document.body.appendChild(link);
      link.click();
      notify(`CSV download started for ${exportCount} saved ${exportCount === 1 ? "stay" : "stays"}.`);
    } catch {
      notify("We couldn’t start the download. Please try again.");
    } finally {
      link.remove();
      // Allow the browser to consume the file before releasing its temporary URL.
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 30_000);
    }
  }
  async function shareHotel(hotel: Hotel) {
    const url = hotelShareUrl(hotel.id, location.href);
    setCopyState("copying");
    try {
      await navigator.clipboard.writeText(url);
      if (selectedId.current !== hotel.id) return;
      setCopyState("copied");
      notify("Hotel link copied. Ready to share.");
    } catch {
      if (selectedId.current !== hotel.id) return;
      setCopyState("manual");
      notify("Select and copy the link below.");
    }
  }
  function select(h: Hotel) {
    setSelected(h);
    setDrawer(false);
    setExpanded(false);
    map.current?.flyTo(h);
  }
  function update(p: Partial<Filters>) {
    setFilters((f) => ({ ...f, ...p }));
    setSelected(null);
  }
  function clear() {
    clearArea();
    update({ ...initialFilters, wishlist: filters.wishlist });
  }
  function surprise() {
    if (!results.length) {
      notify("Try widening your search first.");
      return;
    }
    select(results[Math.floor(Math.random() * results.length)]);
  }
  function chooseJourney(id: string) {
    update({ journey: filters.journey === id ? "" : id });
    setDialog(null);
    map.current?.reset();
  }
  const currentJourney = journeys.find((j) => j.id === filters.journey);
  const activeFilters =
    filters.group !== "All" ||
    filters.brand !== "All" ||
    filters.tag !== "All" ||
    !!filters.query ||
    !!filters.journey;
  return (
    <div
      className={
        "app orbital-app flat-atlas " +
        (drawer ? "drawer-open " : "") +
        (selected ? "has-selection" : "")
      }
    >
      <header className="header">
        <a
          className="wordmark"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            update({ ...initialFilters });
            setDrawer(false);
            map.current?.reset();
          }}
          aria-label="Stay Atlas home"
        >
          <span className="brand-icon">
            <Compass strokeWidth={1.2} size={30} />
          </span>
          Stay Atlas
          <span className="wordmark-dot" aria-hidden="true">
            ✦
          </span>
        </a>
        <button
          className="orbital-search"
          aria-label="Search and filter hotels"
          aria-expanded={drawer}
          onClick={() => {
            setDrawer(!drawer);
            setExpanded(true);
          }}
        >
          <Search size={18} />
          <span>Find a place</span>
          <kbd>⌘ K</kbd>
        </button>
        <button
          className={"wishlist-nav " + (filters.wishlist ? "active" : "")}
          onClick={() => {
            update({ wishlist: !filters.wishlist, status: "All" });
            setExpanded(true);
            setDrawer(true);
          }}
        >
          <Bookmark size={17} />
          <span>My stays</span>
          <span className="saved-count">
            {Object.keys(saved).length.toString().padStart(2, "0")}
          </span>
        </button>
      </header>
      <main>
        <MapCanvas
          ref={map}
          hotels={results}
          saved={saved}
          selected={selected?.id || null}
          hovered={hovered}
          onSelect={select}
          onViewportChange={setViewport}
          onReset={clearArea}
        />
        {!drawer && !selected && (viewport || area) && (
          <div className={"area-control " + (area ? "is-active" : "") } aria-label="Map area search">
            <button className="area-action" onClick={areaChanged ? searchArea : () => { setDrawer(true); setExpanded(true); }}>
              {areaChanged ? <Search size={15} /> : <MapPin size={15} />}
              <span>{areaChanged ? "Search this area" : "Stays in this area"}</span>
              <span className="area-count">{areaChanged ? visibleCount : results.length}</span>
            </button>
            {area && <button className="area-clear" aria-label="Clear map area filter" title="Show all areas" onClick={clearArea}><X size={15} /></button>}
          </div>
        )}
        <span className="sr-only" role="status">{area ? `${results.length} stays in the selected map area. Other filters still apply.` : "Exploring all areas."}</span>
        {drawer && (
          <section
            className={"discovery " + (expanded ? "expanded" : "")}
            aria-label="Discover hotels"
          >
            <button
              className="sheet-handle"
              onPointerDown={(e) => {
                dragY.current = e.clientY;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerUp={(e) => {
                if (Math.abs(e.clientY - dragY.current) > 15) {
                  setExpanded(e.clientY < dragY.current);
                  e.preventDefault();
                }
              }}
              aria-label={
                expanded ? "Collapse hotel list" : "Expand hotel list"
              }
              onClick={(e) => {
                if (Math.abs(e.clientY - dragY.current) <= 15 || e.detail === 0)
                  setExpanded(!expanded);
              }}
            >
              <span />
            </button>
            <button
              className="drawer-close"
              aria-label="Close discovery"
              onClick={() => {
                setDrawer(false);
                document
                  .querySelector<HTMLButtonElement>(".orbital-search")
                  ?.focus();
              }}
            >
              <X size={18} />
            </button>
            <div className="discovery-heading">
              <div className="eyebrow">
                <span /> THE CONSIDERED COLLECTION
              </div>
              <h1>
                {filters.wishlist ? "Places to keep." : "Where will you stay?"}
              </h1>
              <p>
                {filters.wishlist
                  ? "Your future escapes. Your favourite memories."
                  : "Extraordinary places. A world of possibility."}
              </p>
            </div>
            <div className="search-wrap">
              <Search size={18} />
              <input
                aria-label="Search hotels, cities or countries"
                placeholder="A hotel, a city, a somewhere…"
                onFocus={() => {
                  if (innerWidth < 760) setExpanded(true);
                }}
                value={filters.query}
                onChange={(e) => update({ query: e.target.value })}
              />
              {filters.query && (
                <button
                  aria-label="Clear search"
                  onClick={() => update({ query: "" })}
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <div className="group-toggle" aria-label="Hotel group">
              {["All", "Hilton", "Marriott"].map((g) => (
                <button
                  key={g}
                  aria-pressed={filters.group === g}
                  className={filters.group === g ? "chosen" : ""}
                  onClick={() => update({ group: g, brand: "All" })}
                >
                  {g !== "All" && (
                    <span className={"group-dot " + g.toLowerCase()} />
                  )}{" "}
                  {g === "All" ? "All stays" : g}
                </button>
              ))}
            </div>
            <div className="filter-line">
              <button
                className={"filter-button " + (more ? "chosen" : "")}
                onClick={() => {
                  setMore(!more);
                  if (innerWidth < 760) setExpanded(true);
                }}
                aria-expanded={more}
              >
                <SlidersHorizontal size={14} /> Refine your stay{" "}
                <ChevronDown size={13} />
              </button>
              {(activeFilters || area) && (
                <button className="text-button" onClick={clear}>
                  Clear all
                </button>
              )}
              <span className="whole-world">
                <Globe2 size={12} /> {area ? "Map area" : "Worldwide"}
              </span>
            </div>
            {area && (
              <div className="area-selection">
                <MapPin size={13} /><span>Within your selected map area</span>
                <button aria-label="Clear map area filter" title="Show all areas" onClick={clearArea}><X size={14} /></button>
              </div>
            )}
            {more && (
              <div className="extra-filters">
                <label>
                  Brand
                  <select
                    aria-label="Hotel brand"
                    value={filters.brand}
                    onChange={(e) => update({ brand: e.target.value })}
                  >
                    <option value="All">All brands</option>
                    {brands.map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </select>
                </label>
                <div className="tag-filters" aria-label="Experience">
                  {[
                    "All",
                    "beach",
                    "city",
                    "design",
                    "historic",
                    "nature",
                    "mountain",
                  ].map((tag) => (
                    <button
                      className={filters.tag === tag ? "chosen" : ""}
                      aria-pressed={filters.tag === tag}
                      key={tag}
                      onClick={() => update({ tag })}
                    >
                      {tag === "All" ? "Any experience" : tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {currentJourney && (
              <div className="journey-active">
                <Sparkles size={13} />
                {currentJourney.name}
                <button
                  aria-label="Clear journey"
                  onClick={() => update({ journey: "" })}
                >
                  <X size={13} />
                </button>
              </div>
            )}
            {filters.wishlist && (
              <div className="status-tabs">
                {[
                  ["All", "All saved"],
                  ["want", "Want to visit"],
                  ["stayed", "Stayed"],
                ].map(([v, l]) => (
                  <button
                    className={filters.status === v ? "chosen" : ""}
                    key={v}
                    onClick={() => update({ status: v })}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
            {filters.wishlist ? (
              <div className="saved-export">
                <p id="saved-export-scope">
                  {exportCount
                    ? `All ${exportCount} saved ${exportCount === 1 ? "stay" : "stays"} in this browser, including those hidden by filters.`
                    : "Save a stay to export your list."}
                </p>
                <button
                  type="button"
                  className="export-csv"
                  onClick={exportSavedStays}
                  disabled={!exportCount}
                  aria-label={`Export all ${exportCount} saved ${exportCount === 1 ? "stay" : "stays"} as CSV`}
                  aria-describedby="saved-export-scope"
                >
                  <Download size={14} aria-hidden="true" /> Export CSV
                </button>
              </div>
            ) : <div className="collection-explainer">
              {hotels.length} curated properties ·{" "}
              {hotels.filter((h) => h.group === "Hilton").length} Hilton +{" "}
              {hotels.filter((h) => h.group === "Marriott").length} Marriott.
              <br />
              Not a full directory. Numbered dots group nearby stays.
            </div>}
            <div className="result-heading" aria-live="polite">
              <span>
                {results.length.toString().padStart(2, "0")}{" "}
                {filters.wishlist ? "saved" : "remarkable"} stays
              </span>
              <span>
                {activeFilters
                  ? "Your selection"
                  : "Handpicked, not exhaustive"}
              </span>
            </div>
            <button
              className="mobile-explore"
              onClick={() => setExpanded(true)}
            >
              Explore {results.length} stays <ArrowDown size={13} />
            </button>
            <div className="hotel-list">
              {!hotels.length && !error && (
                <p className="loading">Unfolding the collection…</p>
              )}
              {error && (
                <div className="empty">
                  <h2>Our collection took a detour.</h2>
                  <p>Reload to try again.</p>
                  <button onClick={() => location.reload()}>Reload</button>
                </div>
              )}
              {!!hotels.length && !results.length && (
                <div className="empty">
                  <Compass size={34} />
                  <h2>
                    {area ? "A little further afield?" : filters.wishlist
                      ? "Your atlas begins here."
                      : "A little further afield?"}
                  </h2>
                  <p>
                    {area ? "No stays match this area and your filters. Try another part of the map or show all areas." : filters.wishlist
                      ? "Save a hotel that speaks to you. You’ll find it here, ready for someday."
                      : "No stays match this combination. Clear a filter and let the world open up."}
                  </p>
                  <button
                    onClick={() =>
                      area ? clearArea() : filters.wishlist ? update({ ...initialFilters }) : clear()
                    }
                  >
                    {area ? "Show all areas" : filters.wishlist
                      ? "Explore the collection"
                      : "Reset filters"}{" "}
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
              {results.map((h, i) => (
                <article
                  className={
                    "hotel-card " + (selected?.id === h.id ? "selected" : "")
                  }
                  key={h.id}
                  onMouseEnter={() => setHovered(h.id)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(h.id)}
                  onBlur={() => setHovered(null)}
                >
                  <button
                    className="card-main"
                    onClick={() => select(h)}
                    aria-label={`Discover ${h.name}`}
                  >
                    <HotelImage h={h} compact index={i} />
                    <div className="card-copy">
                      <div className="hotel-meta">
                        <span
                          className={"group-dot " + h.group.toLowerCase()}
                        />
                        {h.brand}
                      </div>
                      <h2>{h.name}</h2>
                      <div className="card-location">
                        <MapPin size={12} />
                        {h.city}, {h.country}
                      </div>
                      <div className="card-footer">
                        <span>{h.tags.slice(0, 2).join(" · ")}</span>
                        <ArrowRight size={16} />
                      </div>
                    </div>
                  </button>
                  <button
                    className={"save-circle " + (saved[h.id] ? "is-saved" : "")}
                    aria-label={
                      saved[h.id]
                        ? `Remove ${h.name} from saved stays`
                        : `Save ${h.name}`
                    }
                    aria-pressed={!!saved[h.id]}
                    onClick={() => save(h, saved[h.id] ? null : "want")}
                  >
                    {saved[h.id] === "stayed" ? (
                      <Check size={16} />
                    ) : (
                      <Bookmark
                        size={16}
                        fill={saved[h.id] ? "currentColor" : "none"}
                      />
                    )}
                  </button>
                </article>
              ))}
            </div>
            <div className="panel-footer">
              <Compass size={13} />
              <span>A collection for the curious.</span>
              <button
                aria-label="About Stay Atlas and credits"
                onClick={() => setDialog("about")}
              >
                About & credits ↗
              </button>
            </div>
          </section>
        )}
        <div className="orbital-bottom">
          <div className="orbital-coordinate">
            <span className="orbital-signal" />
            <button
              className="collection-open"
              aria-label={`View all ${hotels.length} curated hotels`}
              title={`${hotels.length} curated hotels. Numbered dots group nearby hotels; zoom in to discover each stay.`}
              onClick={() => {
                clearArea();
                update({ ...initialFilters });
                setDrawer(true);
                setExpanded(true);
              }}
            >
              {hotels.length} CURATED STAYS <ArrowRight size={12} />
            </button>
            <button
              aria-label="About Stay Atlas and credits"
              onClick={() => setDialog("about")}
            >
              ⓘ
            </button>
          </div>
          {!selected && (
            <div className="explore-dock">
              <button
                className="surprise"
                aria-label="Surprise me"
                disabled={!results.length}
                onClick={surprise}
              >
                <span className="explore-orbit">
                  <Sparkles size={17} />
                </span>
                <span>Find my next escape</span>
                <ArrowRight size={16} />
              </button>
              <button
                className="journey-launch"
                aria-label="Curated journeys"
                title="Curated journeys"
                onClick={() => setDialog("journeys")}
              >
                <Compass size={20} />
              </button>
            </div>
          )}
          <div className="orbital-hint">
            DRAG TO EXPLORE <span>·</span> SCROLL TO DISCOVER
          </div>
        </div>
        {activeFilters && !drawer && (
          <button
            className="active-filter-pill"
            onClick={() => {
              setDrawer(true);
              setExpanded(true);
            }}
          >
            <SlidersHorizontal size={13} />
            {results.length} matching stays
            <X size={12} />
          </button>
        )}
        {selected && (
          <section
            className="hotel-preview"
            aria-label={"Preview of " + selected.name}
          >
            <div className="preview-image">
              <HotelImage h={selected} />
              <button
                className="preview-close"
                onClick={() => setSelected(null)}
                aria-label="Close hotel preview"
              >
                <X size={18} />
              </button>
              <span className="preview-kicker">A PLACE TO REMEMBER</span>
            </div>
            <div className="preview-copy">
              <div className="hotel-meta">
                <span className={"group-dot " + selected.group.toLowerCase()} />
                {selected.group} <span> / </span>
                {selected.brand}
              </div>
              <h2>{selected.name}</h2>
              <p className="preview-location">
                <MapPin size={14} />
                {selected.city}, {selected.country}
              </p>
              <p className="preview-description">{selected.description}</p>
              <div className="preview-actions">
                <button className="primary" onClick={() => setDialog("detail")}>
                  Explore hotel <ArrowRight size={16} />
                </button>
                <button
                  className={
                    "secondary " + (saved[selected.id] ? "is-saved" : "")
                  }
                  aria-label={
                    saved[selected.id] ? "Remove saved hotel" : "Save hotel"
                  }
                  onClick={() =>
                    save(selected, saved[selected.id] ? null : "want")
                  }
                >
                  <Bookmark
                    size={17}
                    fill={saved[selected.id] ? "currentColor" : "none"}
                  />
                </button>
                <button
                  className={"secondary share-hotel " + (copyState === "copied" ? "is-copied" : "")}
                  aria-label={copyState === "copied" ? "Hotel link copied" : "Copy hotel link"}
                  title={copyState === "copied" ? "Link copied" : "Copy hotel link"}
                  disabled={copyState === "copying"}
                  onClick={() => void shareHotel(selected)}
                >
                  {copyState === "copied" ? <Check size={17} /> : <Share2 size={17} />}
                </button>
              </div>
              {copyState === "manual" && (
                <label className="manual-share">
                  Copy this hotel link
                  <input ref={manualLink} type="text" readOnly aria-label="Hotel link to copy"
                    value={hotelShareUrl(selected.id, location.href)}
                    onFocus={e => e.currentTarget.select()} onClick={e => e.currentTarget.select()} />
                </label>
              )}
              <div className="preview-pagination">
                <button
                  aria-label="Previous hotel"
                  disabled={results.length < 2}
                  onClick={() =>
                    select(
                      results[
                        (results.findIndex((h) => h.id === selected.id) -
                          1 +
                          results.length) %
                          results.length
                      ],
                    )
                  }
                >
                  <ArrowLeft size={14} />
                </button>
                <span>
                  {Math.max(
                    1,
                    results.findIndex((h) => h.id === selected.id) + 1,
                  )}{" "}
                  OF {results.length} IN YOUR EXPLORATION
                </span>
                <button
                  aria-label="Next hotel"
                  disabled={results.length < 2}
                  onClick={() =>
                    select(
                      results[
                        (results.findIndex((h) => h.id === selected.id) + 1) %
                          results.length
                      ],
                    )
                  }
                >
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
      <dialog
        aria-label={
          dialog === "detail" && selected
            ? selected.name
            : dialog === "journeys"
              ? "Curated journeys"
              : "About Stay Atlas"
        }
        ref={modal}
        onCancel={() => setDialog(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setDialog(null);
        }}
        className={"modal " + (dialog === "detail" ? "detail-modal" : "")}
      >
        <button
          className="modal-close"
          aria-label="Close dialog"
          onClick={() => setDialog(null)}
        >
          <X size={20} />
        </button>
        {dialog === "detail" && selected && (
          <div className="detail">
            <div className="detail-photo">
              <HotelImage h={selected} />
            </div>
            <div className="detail-body">
              <div className="eyebrow">
                {selected.group} COLLECTION / {selected.brand}
              </div>
              <h2>{selected.name}</h2>
              <p className="preview-location">
                <MapPin size={15} />
                {selected.city}, {selected.country}
              </p>
              <p className="detail-intro">{selected.description}</p>
              <div className="detail-tags">
                {selected.tags.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
              <div className="detail-section">
                <h3>Why stay here</h3>
                <p>{selected.why}</p>
              </div>
              <div className="detail-section">
                <h3>Make it part of your story.</h3>
                <div className="save-options">
                  <button
                    className={saved[selected.id] === "want" ? "chosen" : ""}
                    aria-pressed={saved[selected.id] === "want"}
                    onClick={() =>
                      save(
                        selected,
                        saved[selected.id] === "want" ? null : "want",
                      )
                    }
                  >
                    <Bookmark size={16} /> Want to visit
                  </button>
                  <button
                    className={saved[selected.id] === "stayed" ? "chosen" : ""}
                    aria-pressed={saved[selected.id] === "stayed"}
                    onClick={() =>
                      save(
                        selected,
                        saved[selected.id] === "stayed" ? null : "stayed",
                      )
                    }
                  >
                    <Check size={16} /> I’ve stayed
                  </button>
                  {saved[selected.id] && (
                    <button
                      className="remove-save"
                      onClick={() => save(selected, null)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <a
                className="primary official-link"
                href={selected.url}
                target="_blank"
                rel="noreferrer"
              >
                Visit official hotel website <ExternalLink size={15} />
              </a>
              <div className="source-note">
                <p>
                  Property information checked {selected.verifiedAt}. An
                  independent selection, not a complete directory.
                </p>
                <details>
                  <summary>Location & sources</summary>
                  <p>
                    {selected.lat.toFixed(5)}°, {selected.lng.toFixed(5)}° ·{" "}
                    {selected.coordinatePrecision}
                  </p>
                  {selected.verificationNotes && (
                    <p>{selected.verificationNotes}</p>
                  )}
                  {selected.sources.map((s, i) => (
                    <a key={s} href={s} target="_blank" rel="noreferrer">
                      Source {i + 1}: {new URL(s).hostname} ↗
                    </a>
                  ))}
                  <a
                    href={selected.coordinateSource}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Map coordinate source ↗
                  </a>
                </details>
              </div>
            </div>
          </div>
        )}
        {dialog === "journeys" && (
          <div className="journey-modal">
            <div className="eyebrow">THE ART OF GETTING LOST</div>
            <h2>Follow a feeling.</h2>
            <p>Four ways into the world. Where will yours lead?</p>
            <div className="journey-grid">
              {journeys.map((j, i) => (
                <button key={j.id} onClick={() => chooseJourney(j.id)}>
                  <img src={"/images/" + j.image + "-960.webp"} alt="" />
                  <span className="journey-shade" />
                  <span className="journey-number">
                    0{i + 1} /{" "}
                    {hotels.filter((h) => h.tags.includes(j.tag)).length} STAYS
                  </span>
                  <div>
                    <h3>{j.name}</h3>
                    <p>{j.subtitle}</p>
                    <span>
                      Explore journey <ArrowRight size={16} />
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <p className="small-note">
              Journey imagery evokes destinations; it does not depict the
              featured hotels.
            </p>
          </div>
        )}
        {dialog === "about" && (
          <div className="about">
            <Compass size={38} />
            <div className="eyebrow">THE CONSIDERED COLLECTION</div>
            <h2>Stay curious.</h2>
            <p>
              Stay Atlas is an independent, handpicked collection of{" "}
              {hotels.length}
              remarkable Hilton and Marriott hotels. Explore by place, brand, or
              the feeling you’re looking for.
            </p>
            <p>
              Your stays live in this browser. No account, no booking engine,
              just a little space for your next adventure.
            </p>
            <h3>A world at a glance.</h3>
            <p>
              A flat world map brings every region into view. Zoom into a
              numbered dot to discover nearby stays, or search the full
              collection by city, brand and experience. Country outlines use
              Natural Earth; detailed maps use OpenFreeMap and OpenStreetMap.
            </p>
            <h3>Thoughtfully sourced.</h3>
            <p>
              Hotel names, brands and descriptions link to official sources in
              each profile. Pins use published property coordinates where
              available; individual coordinate sources and precision are
              disclosed.
            </p>
            <p>
              Licensed destination photographs are labeled as such. Where a
              suitable image is unavailable, an illustrated location card takes
              its place.
            </p>
            <a href="/data/image-credits.json" target="_blank">
              Photography credits & licenses ↗
            </a>
            <a href="https://openfreemap.org" target="_blank" rel="noreferrer">
              Maps by OpenFreeMap / OpenMapTiles / OpenStreetMap ↗
            </a>
            <a
              href="https://www.naturalearthdata.com/about/terms-of-use/"
              target="_blank"
              rel="noreferrer"
            >
              Bundled world outline: Natural Earth (public domain) ↗
            </a>
            <p className="small-note">
              Not affiliated with or endorsed by Hilton or Marriott. No rates or
              availability are shown.
            </p>
          </div>
        )}
      </dialog>
      <div className={"toast " + (toast ? "visible" : "")} role="status">
        <Check size={16} />
        {toast}
      </div>
    </div>
  );
}
function HotelImage({
  h,
  compact = false,
  index = 0,
}: {
  h: Hotel;
  compact?: boolean;
  index?: number;
}) {
  const [failed, setFailed] = useState(false);
  const photo = photoFor(h);
  useEffect(() => setFailed(false), [h.id]);
  return (
    <div
      className={
        "hotel-image " +
        (photo && !failed ? "has-photo" : "illustration") +
        " " +
        h.group.toLowerCase()
      }
    >
      {photo && !failed ? (
        <img
          src={"/images/" + photo.file + "-960.webp"}
          srcSet={[480, 960, 1600]
            .map((w) => "/images/" + photo.file + "-" + w + ".webp " + w + "w")
            .join(", ")}
          sizes={
            compact
              ? "(max-width: 759px) 90vw, 330px"
              : "(max-width: 759px) 90vw, 800px"
          }
          alt={photo.label + "; not a photograph of the hotel"}
          loading={compact && index > 2 ? "lazy" : "eager"}
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <div className="postcard-grid" />
          <Compass
            className="postcard-compass"
            size={compact ? 58 : 88}
            strokeWidth={0.5}
          />
          <span className="postcard-city">{h.city}</span>
          <span className="postcard-coordinates">
            {Math.abs(h.lat).toFixed(2)}° {h.lat >= 0 ? "N" : "S"} &nbsp;{" "}
            {Math.abs(h.lng).toFixed(2)}° {h.lng >= 0 ? "E" : "W"}
          </span>
        </>
      )}
      <span className="image-caption">
        {photo && !failed
          ? photo.label
          : "Location illustration · not a property photograph"}
      </span>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
