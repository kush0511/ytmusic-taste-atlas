"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Disc3,
  Headphones,
  Info,
  Layers3,
  Map,
  Maximize2,
  Minimize2,
  Search,
  Sparkles,
  X,
} from "lucide-react";

type Cluster = {
  id: number;
  size: number;
  name: string;
  topArtists: { name: string; count: number }[];
  genres: { name: string; count: number }[];
  centroid: number[];
};

type Point = {
  rank: number;
  videoId: string;
  title: string;
  artist: string;
  genre: string;
  cluster: number;
  x: number;
  y: number;
  likeAt: string | null;
  dateConfidence: string;
  listens: number;
  gatewayScore: number;
  outlierScore: number;
};

type Cosmos = {
  method: {
    seed: string;
    features: number;
    umap: { neighbors: number; minDist: number; epochs: number };
    clusters: number;
  };
  clusters: Cluster[];
  points: Point[];
  gateways: Point[];
  outliers: Point[];
};

type SessionTrack = {
  videoId: string;
  title: string;
  channel: string | null;
  kept: boolean;
};
type Session = {
  id: number;
  start: string;
  end: string;
  durationMinutes: number;
  plays: number;
  uniqueTracks: number;
  keptTracks: number;
  keepRate: number;
  topArtist: { name: string; count: number } | null;
  topGenre: { name: string; count: number } | null;
  representative: SessionTrack[];
};
type NearMiss = {
  videoId: string;
  title: string;
  channel: string | null;
  plays: number;
  firstWatchAt: string;
  lastWatchAt: string;
};
type ModelTrack = {
  rank: number;
  videoId: string;
  title: string;
  primaryArtist: string;
  listenCount: number;
};
type TasteModel = {
  provenance: {
    archive: string;
    sha256: string;
    watchFile: string;
    searchFile: string;
  };
  coverage: {
    tracks: number;
    exactActivities: number;
    exactMatches: number;
    confidence: Record<string, number>;
    musicWatches: number;
    sessions: number;
  };
  calibration: {
    exactLikesWithWatchMatch: number;
    medianMinutesFromWatchToLike: number | null;
  };
  hourlyLikes: { hour: number; count: number }[];
  monthlyLikes: { month: string; count: number }[];
  tracks: ModelTrack[];
  sessions: Session[];
  nearMisses: NearMiss[];
};

type Mode = "regions" | "chronology" | "gravity";

const clusterColors = [
  "#c49c25",
  "#37998c",
  "#cb689b",
  "#688fe7",
  "#df8a53",
  "#92b458",
  "#9986c5",
  "#da6651",
  "#4ba7be",
  "#719096",
];
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
const timeLabel = (hour: number) =>
  `${hour % 12 || 12}${hour < 12 ? "am" : "pm"}`;
const confidenceLabel = (value: string) =>
  (
    ({
      exact: "Exact like date",
      "watch-anchored": "Watch-based estimate",
      "rank-interpolated": "Interpolated date",
      "rank-only": "Playlist order only",
    }) as Record<string, string>
  )[value] || "Playlist evidence";
const musicUrl = (id: string) => `https://music.youtube.com/watch?v=${id}`;

function Cover({ videoId }: { videoId: string }) {
  // These mixed music/video uploads have no consistent album-art source.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
      alt=""
      loading="lazy"
      onError={(event) => {
        event.currentTarget.style.visibility = "hidden";
      }}
    />
  );
}

function SectionHeading({
  number,
  label,
  title,
  children,
}: {
  number: string;
  label: string;
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">
          <span>{number}</span> {label}
        </p>
        <h2>{title}</h2>
      </div>
      {children && <p className="section-description">{children}</p>}
    </div>
  );
}

type MapBounds = { x: number; y: number; width: number; height: number };
const mapPosition = (point: Point, bounds: MapBounds, height = 600) => ({
  x: 24 + ((point.x - bounds.x) / bounds.width) * 552,
  y: 24 + (1 - (point.y - bounds.y) / bounds.height) * (height - 48),
});
const mapColor = (point: Point, mode: Mode, total: number) =>
  mode === "regions"
    ? clusterColors[point.cluster]
    : mode === "gravity"
      ? point.listens > 20
        ? "#ff825d"
        : point.listens > 8
          ? "#e8ce78"
          : "#87b6aa"
      : point.rank < total / 3
        ? "#ff825d"
        : point.rank < (total * 2) / 3
          ? "#e8ce78"
          : "#969bd2";

// Keep the 1,111 static dots out of the rendering work for every finger movement.
const MapDots = memo(function MapDots({
  layout,
  mode,
  total,
  maxListens,
}: {
  layout: { point: Point; x: number; y: number }[];
  mode: Mode;
  total: number;
  maxListens: number;
}) {
  return (
    <g>
      {layout.map(({ point, x, y }) => (
        <circle
          key={point.rank}
          cx={x}
          cy={y}
          r={
            mode === "gravity"
              ? 2.5 + 5 * Math.sqrt(point.listens / maxListens)
              : 2.5
          }
          fill={mapColor(point, mode, total)}
          opacity=".85"
        />
      ))}
    </g>
  );
});

function CosmosMap({ cosmos }: { cosmos: Cosmos }) {
  const [mode, setMode] = useState<Mode>("regions");
  const [expanded, setExpanded] = useState(false);
  const [plotHeight, setPlotHeight] = useState(600);
  const graph = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!graph.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0)
        setPlotHeight(
          (600 * entry.contentRect.height) / entry.contentRect.width,
        );
    });
    observer.observe(graph.current);
    return () => observer.disconnect();
  }, []);
  const [scrubbing, setScrubbing] = useState(false);
  const pointerId = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const workbench = useRef<HTMLDivElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    expandButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [
        ...(workbench.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), select, a[href], [tabindex="0"]',
        ) || []),
      ].filter((node) => node.getClientRects().length > 0);
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      previousFocus?.focus();
    };
  }, [expanded]);
  const [activeCluster, setActiveCluster] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(
    cosmos.gateways.find((point) => point.title === "Clocks") ||
      cosmos.points[0],
  );
  const maxListens = Math.max(
    1,
    ...cosmos.points.map((point) => point.listens),
  );
  const points = useMemo(
    () =>
      cosmos.points.filter(
        (p) => activeCluster === null || p.cluster === activeCluster,
      ),
    [cosmos.points, activeCluster],
  );
  const results = useMemo(
    () =>
      points
        .filter((p) =>
          `${p.title} ${p.artist}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        )
        .slice(0, 5),
    [points, query],
  );
  const bounds = useMemo(() => {
    if (activeCluster === null) return { x: 0, y: 0, width: 1, height: 1 };
    const minX = Math.min(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const size =
      Math.max(
        0.15,
        Math.max(...points.map((p) => p.x)) - minX,
        Math.max(...points.map((p) => p.y)) - minY,
      ) * 1.15;
    return {
      x: (minX + Math.max(...points.map((p) => p.x)) - size) / 2,
      y: (minY + Math.max(...points.map((p) => p.y)) - size) / 2,
      width: size,
      height: size,
    };
  }, [points, activeCluster]);
  const position = (p: Point) => mapPosition(p, bounds, plotHeight);
  const color = (p: Point) => mapColor(p, mode, cosmos.points.length);
  const layout = useMemo(
    () =>
      points.map((point) => ({
        point,
        ...mapPosition(point, bounds, plotHeight),
      })),
    [points, bounds, plotHeight],
  );
  const selectAt = (clientX: number, clientY: number, svg: SVGSVGElement) => {
    const box = svg.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(600, ((clientX - box.left) / box.width) * 600),
    );
    const y = Math.max(
      0,
      Math.min(plotHeight, ((clientY - box.top) / box.height) * plotHeight),
    );
    let nearest = layout[0];
    let distance = Infinity;
    for (const entry of layout) {
      const next =
        (((entry.x - x) * box.width) / 600) ** 2 +
        (((entry.y - y) * box.height) / plotHeight) ** 2;
      if (next < distance) {
        nearest = entry;
        distance = next;
      }
    }
    setSelected(nearest.point);
  };
  const stopScrubbing = () => {
    pointerId.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setScrubbing(false);
  };
  const chooseRegion = (value: string) => {
    stopScrubbing();
    const id = value === "all" ? null : Number(value);
    setActiveCluster(id);
    if (id !== null) setSelected(cosmos.points.find((p) => p.cluster === id)!);
  };
  const region = cosmos.clusters.find((c) => c.id === activeCluster);
  return (
    <section className="atlas-section section" id="atlas">
      <SectionHeading
        number="01"
        label="THE TASTE MAP"
        title={
          <>
            Different worlds.
            <br />
            <em>One playlist.</em>
          </>
        }
      >
        Drag across the dots to explore songs. Pick a region to zoom in; nearby
        dots have similar musical traits.
      </SectionHeading>
      <div
        className="atlas-workbench"
        ref={workbench}
        data-expanded={expanded}
        role={expanded ? "dialog" : undefined}
        aria-modal={expanded ? true : undefined}
        aria-label={expanded ? "Expanded song map" : undefined}
      >
        <div className="map-panel">
          <div className="map-toolbar">
            <span>
              <i className="status-dot" />{" "}
              {activeCluster === null
                ? "ALL 1,111 SONGS"
                : `${points.length} SONGS IN FOCUS`}
            </span>
            <div className="map-actions">
              <button
                type="button"
                disabled={activeCluster === null}
                aria-label="Full map"
                onClick={() => chooseRegion("all")}
              >
                <Map size={14} />
                <span>Full map</span>
              </button>
              <button
                ref={expandButton}
                type="button"
                aria-label={expanded ? "Close expanded map" : "Expand map"}
                aria-pressed={expanded}
                onClick={() => {
                  stopScrubbing();
                  setExpanded((value) => !value);
                }}
              >
                {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                <span>{expanded ? "Close" : "Expand"}</span>
              </button>
            </div>
          </div>
          <div className="map-region-control">
            <label className="field-label" htmlFor="region">
              Taste region
            </label>
            <div className="select-wrap">
              <select
                id="region"
                aria-label="Taste region"
                value={activeCluster ?? "all"}
                onChange={(e) => chooseRegion(e.target.value)}
              >
                <option value="all">All regions · 1,111 songs</option>
                {cosmos.clusters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.size}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} />
            </div>
          </div>
          <div className="segmented map-modes" aria-label="Map color">
            <button
              type="button"
              aria-pressed={mode === "regions"}
              onClick={() => setMode("regions")}
            >
              <Layers3 size={15} /> Regions
            </button>
            <button
              type="button"
              aria-pressed={mode === "chronology"}
              onClick={() => setMode("chronology")}
            >
              <Clock3 size={15} /> Age
            </button>
            <button
              type="button"
              aria-pressed={mode === "gravity"}
              onClick={() => setMode("gravity")}
            >
              <AudioLines size={15} /> Replays
            </button>
          </div>
          <svg
            className="taste-map"
            ref={graph}
            viewBox={`0 0 600 ${plotHeight}`}
            preserveAspectRatio="none"
            role="group"
            tabIndex={0}
            aria-label="Interactive song map. Drag your finger or pointer across the map to select nearby songs. Use left and right arrow keys to browse songs."
            data-scrubbing={scrubbing}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={(event) => {
              if (!event.isPrimary || event.button !== 0) return;
              if (frame.current !== null) cancelAnimationFrame(frame.current);
              frame.current = null;
              pointerId.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
              setScrubbing(true);
              selectAt(event.clientX, event.clientY, event.currentTarget);
            }}
            onPointerMove={(event) => {
              if (
                pointerId.current !== event.pointerId &&
                !(
                  pointerId.current === null &&
                  event.pointerType === "mouse" &&
                  event.buttons === 0
                )
              )
                return;
              const { clientX, clientY, currentTarget } = event;
              if (frame.current !== null) cancelAnimationFrame(frame.current);
              frame.current = requestAnimationFrame(() => {
                frame.current = null;
                selectAt(clientX, clientY, currentTarget);
              });
            }}
            onPointerUp={(event) => {
              if (pointerId.current !== event.pointerId) return;
              selectAt(event.clientX, event.clientY, event.currentTarget);
              stopScrubbing();
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={stopScrubbing}
            onLostPointerCapture={stopScrubbing}
            onKeyDown={(event) => {
              if (!["ArrowRight", "ArrowLeft"].includes(event.key)) return;
              event.preventDefault();
              const index = points.findIndex((p) => p.rank === selected.rank);
              setSelected(
                points[
                  (index +
                    (event.key === "ArrowRight" ? 1 : -1) +
                    points.length) %
                    points.length
                ],
              );
            }}
          >
            <defs>
              <radialGradient id="map-background">
                <stop stopColor="#2a3037" />
                <stop offset="1" stopColor="#181e25" />
              </radialGradient>
              <pattern
                id="map-grid"
                width="60"
                height="60"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 60 0 L 0 0 0 60"
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity=".055"
                />
              </pattern>
            </defs>
            <rect width="600" height={plotHeight} fill="url(#map-background)" />
            <rect width="600" height={plotHeight} fill="url(#map-grid)" />
            {activeCluster === null &&
              cosmos.clusters.map((c) => (
                <circle
                  key={c.id}
                  cx={24 + c.centroid[0] * 552}
                  cy={24 + (1 - c.centroid[1]) * (plotHeight - 48)}
                  r={24 + Math.sqrt(c.size) * 1.7}
                  fill={clusterColors[c.id]}
                  opacity=".07"
                />
              ))}
            <MapDots
              layout={layout}
              mode={mode}
              total={cosmos.points.length}
              maxListens={maxListens}
            />
            <circle
              cx={position(selected).x}
              cy={position(selected).y}
              r="10"
              fill="none"
              stroke="#faf6eb"
              strokeWidth="1.5"
            />
            <circle
              cx={position(selected).x}
              cy={position(selected).y}
              r="4"
              fill={color(selected)}
            />
          </svg>
          <div className="map-legend">
            {mode === "regions" ? (
              <>
                <span>
                  <i style={{ background: "#e8ce78" }} />
                  One dot = one liked song
                </span>
                <span>Drag to explore</span>
              </>
            ) : mode === "chronology" ? (
              <>
                <span>
                  <i style={{ background: "#ff825d" }} />
                  Newest likes
                </span>
                <span>
                  <i style={{ background: "#969bd2" }} />
                  Oldest likes
                </span>
              </>
            ) : (
              <>
                <span>
                  <i style={{ background: "#87b6aa" }} />
                  0–8 watches
                </span>
                <span>
                  <i style={{ background: "#e8ce78" }} />
                  9–20
                </span>
                <span>
                  <i style={{ background: "#ff825d" }} />
                  21+
                </span>
              </>
            )}
          </div>
          <a
            className="now-selected"
            data-scrubbing={scrubbing}
            href={musicUrl(selected.videoId)}
            target="_blank"
            rel="noreferrer"
          >
            <div className="art">
              {scrubbing ? (
                <Disc3 size={30} />
              ) : (
                <Cover videoId={selected.videoId} />
              )}
            </div>
            <div>
              <span
                className="micro"
                style={{ color: clusterColors[selected.cluster] }}
              >
                {cosmos.clusters.find((c) => c.id === selected.cluster)?.name}
              </span>
              <strong title={selected.title}>{selected.title}</strong>
              <p>
                {selected.artist} <span>· {selected.listens} watches</span>
              </p>
              <small>
                {confidenceLabel(selected.dateConfidence)}
                {selected.likeAt ? ` · ${formatDate(selected.likeAt)}` : ""}
              </small>
            </div>
            <ArrowUpRight size={20} />
          </a>
        </div>
        <aside className="explorer-panel">
          <div className="explorer-heading">
            <h3>Find your corner.</h3>
            <span>{cosmos.clusters.length} regions</span>
          </div>
          <div className="region-caption">
            {region ? (
              <>
                <i style={{ background: clusterColors[region.id] }} />
                <p>
                  {region.topArtists
                    .slice(0, 3)
                    .map((a) => a.name)
                    .join(" / ")}
                </p>
              </>
            ) : (
              <p>From A.R. Rahman to Radiohead. There’s room for all of it.</p>
            )}
          </div>
          <label className="field-label" htmlFor="song-search">
            Search songs & artists
          </label>
          <div className="search-field">
            <Search size={17} />
            <input
              id="song-search"
              type="search"
              placeholder="Try Kendrick, Clocks…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                <X size={16} />
              </button>
            )}
          </div>
          <p className="results-label" aria-live="polite">
            {query
              ? `${results.length === 5 ? "Top 5" : results.length} matches${activeCluster !== null ? " in this region" : ""}`
              : "START EXPLORING"}
          </p>
          <div className="song-results">
            {results.map((p) => (
              <button
                type="button"
                key={p.rank}
                aria-pressed={selected.rank === p.rank}
                onClick={() => setSelected(p)}
              >
                <i style={{ background: clusterColors[p.cluster] }} />
                <span>
                  <strong>{p.title}</strong>
                  <small>{p.artist}</small>
                </span>
                {selected.rank === p.rank ? (
                  <Check size={16} />
                ) : (
                  <ArrowUpRight size={16} />
                )}
              </button>
            ))}
            {!results.length && (
              <p className="empty-state">
                No songs found. Try another artist or choose all regions.
              </p>
            )}
          </div>
          <a
            className="explorer-open"
            href={musicUrl(selected.videoId)}
            target="_blank"
            rel="noreferrer"
          >
            <span>
              Open selected song<strong>{selected.title}</strong>
            </span>
            <ArrowUpRight size={18} />
          </a>
          <details className="map-method">
            <summary>
              <Info size={14} /> What does this map mean?
            </summary>
            <p>
              A seeded UMAP projection of {cosmos.method.features} traits,
              grouped into ten clusters. Position suggests similarity, not a
              musical quality score. Region names are interpretations of those
              groups.
            </p>
          </details>
        </aside>
      </div>
    </section>
  );
}

function Transformation({ cosmos }: { cosmos: Cosmos }) {
  const shifts = useMemo(
    () =>
      cosmos.clusters
        .map((c) => {
          const old = cosmos.points.filter(
            (p) => p.rank > cosmos.points.length - 200 && p.cluster === c.id,
          ).length;
          const recent = cosmos.points.filter(
            (p) => p.rank <= 200 && p.cluster === c.id,
          ).length;
          return { ...c, old, recent, delta: recent - old };
        })
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    [cosmos],
  );
  const max = Math.max(1, ...shifts.flatMap((c) => [c.old, c.recent]));
  const rising = [...shifts].sort((a, b) => b.delta - a.delta)[0];
  return (
    <section className="shift-section section" id="shift">
      <SectionHeading
        number="02"
        label="THE EVOLUTION"
        title={
          <>
            Your taste changed.
            <br />
            <em>The old worlds stayed.</em>
          </>
        }
      >
        The oldest 200 likes versus the newest 200. These are playlist
        positions, not calendar periods.
      </SectionHeading>
      <div className="shift-layout">
        <div className="shift-story">
          <span className="big-delta">
            +{rising.delta}
            <ArrowUpRight size={32} />
          </span>
          <h3>{rising.name}</h3>
          <p>
            The biggest arrival: from <strong>{rising.old}</strong> of your
            oldest likes to <strong>{rising.recent}</strong> of your newest.
          </p>
          <div className="story-rule" />
          <p className="story-note">
            Film music and rap have taken more space. The melodic thread runs
            through it all.
          </p>
          <span className="micro">SAME PLAYLIST. WIDER HORIZONS.</span>
        </div>
        <div className="shift-chart">
          <div className="chart-key">
            <span>
              <i className="old-swatch" />
              Oldest 200
            </span>
            <span>
              <i className="new-swatch" />
              Newest 200
            </span>
            <span>Number of likes</span>
          </div>
          {shifts.map((c) => (
            <div className="shift-item" key={c.id}>
              <div className="shift-label">
                <strong>{c.name}</strong>
                <span
                  className={
                    c.delta > 0 ? "positive" : c.delta < 0 ? "negative" : ""
                  }
                >
                  {c.delta > 0 ? "+" : ""}
                  {c.delta} likes
                </span>
              </div>
              <div
                className="paired-bar"
                aria-label={`${c.name}: ${c.old} oldest likes, ${c.recent} newest likes`}
              >
                <div>
                  <span
                    style={{ width: `${(c.old / max) * 100}%` }}
                    className="old-bar"
                  />
                  <b>{c.old}</b>
                </div>
                <div>
                  <span
                    style={{ width: `${(c.recent / max) * 100}%` }}
                    className="new-bar"
                  />
                  <b>{c.recent}</b>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ListeningRhythm({
  cosmos,
  model,
}: {
  cosmos: Cosmos;
  model: TasteModel;
}) {
  const [exactOnly, setExactOnly] = useState(false);
  const [cell, setCell] = useState({ day: 0, bin: 4 });
  const [sessionIndex, setSessionIndex] = useState(0);
  const sessions = model.sessions;
  const session = sessions[sessionIndex];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const heat = useMemo(() => {
    const cells = Array.from({ length: 7 }, () => Array(6).fill(0) as number[]);
    const tracks = cosmos.points.filter(
      (p) =>
        p.likeAt &&
        (p.dateConfidence === "exact" ||
          (!exactOnly && p.dateConfidence === "watch-anchored")),
    );
    for (const p of tracks) {
      const date = new Date(Date.parse(p.likeAt!) + 8 * 3600000);
      cells[(date.getUTCDay() + 6) % 7][Math.floor(date.getUTCHours() / 4)] +=
        1;
    }
    return { cells, total: tracks.length, max: Math.max(1, ...cells.flat()) };
  }, [cosmos.points, exactOnly]);
  const peakHour = [...model.hourlyLikes].sort((a, b) => b.count - a.count)[0];
  return (
    <section className="rhythm-section section" id="rhythm">
      <SectionHeading
        number="03"
        label="THE LISTENING RHYTHM"
        title={
          <>
            There’s a time
            <br />
            <em>for getting lost.</em>
          </>
        }
      >
        A heatmap of dated likes, in Singapore time. Each cell covers four
        hours. Darker means more likes. Tap a cell for its count.
      </SectionHeading>
      <div className="rhythm-layout">
        <div className="heat-card">
          <div className="card-heading">
            <h3>When songs stick.</h3>
            <span className="pill">UTC +8</span>
          </div>
          <div className="segmented evidence-toggle">
            <button
              type="button"
              aria-pressed={!exactOnly}
              onClick={() => setExactOnly(false)}
            >
              Exact + watch anchored
            </button>
            <button
              type="button"
              aria-pressed={exactOnly}
              onClick={() => setExactOnly(true)}
            >
              Exact only
            </button>
          </div>
          <div className="heatmap">
            <div className="heat-hours">
              <span />
              {["12am", "4am", "8am", "12pm", "4pm", "8pm"].map((h) => (
                <span key={h}>{h}</span>
              ))}
            </div>
            {days.map((day, d) => (
              <div className="heat-row" key={day}>
                <span>{day}</span>
                {heat.cells[d].map((count, b) => (
                  <button
                    type="button"
                    key={b}
                    aria-label={`${day}, ${timeLabel(b * 4)} to ${timeLabel((b * 4 + 4) % 24)}: ${count} dated likes`}
                    aria-pressed={cell.day === d && cell.bin === b}
                    className={
                      cell.day === d && cell.bin === b ? "selected" : ""
                    }
                    style={{
                      background: count
                        ? `color-mix(in srgb, #453cb0 ${20 + (count / heat.max) * 80}%, #eeecf8)`
                        : "#eeecf2",
                      color: count / heat.max > 0.4 ? "#fff" : "#4c4764",
                    }}
                    onClick={() => setCell({ day: d, bin: b })}
                  >
                    {count || <span className="zero-dot">·</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="heat-footer">
            <span>
              Less <i />
              <i />
              <i />
              <i /> More
            </span>
            <small>{heat.total} dated likes</small>
          </div>
          <div className="heat-detail" aria-live="polite">
            <strong>{heat.cells[cell.day][cell.bin]} likes</strong>
            <span>
              {days[cell.day]} · {timeLabel(cell.bin * 4)}–
              {timeLabel((cell.bin * 4 + 4) % 24)}
            </span>
          </div>
          <p className="chart-note">
            {exactOnly
              ? "Only confirmed timestamps from like activity."
              : "88 exact timestamps + 157 dates estimated from watch history."}{" "}
            Interpolated dates are excluded.
          </p>
        </div>
        <div className="rhythm-side">
          <article className="peak-card">
            <Clock3 size={22} />
            <span className="micro">YOUR PEAK HOUR</span>
            <strong>
              {timeLabel(peakHour.hour)}
              <span>–{timeLabel((peakHour.hour + 1) % 24)}</span>
            </strong>
            <p>
              {peakHour.count} exact or watch-anchored likes. An evening ritual,
              with another pulse around midnight.
            </p>
            <div
              className="hour-bars"
              role="img"
              aria-label={`Likes by hour. Peak: ${timeLabel(peakHour.hour)}, ${peakHour.count} likes.`}
            >
              {model.hourlyLikes.map((h) => (
                <i
                  key={h.hour}
                  style={{
                    height: `${Math.max(3, (h.count / peakHour.count) * 100)}%`,
                    background:
                      h.hour === peakHour.hour ? "#bace7a" : "#59626b",
                  }}
                />
              ))}
            </div>
            <div className="hour-axis">
              <span>12am</span>
              <span>12pm</span>
              <span>11pm</span>
            </div>
          </article>
          <article className="session-card">
            <div className="card-heading">
              <h3>A deep dive.</h3>
              <Headphones size={19} />
            </div>
            <label className="field-label" htmlFor="session">
              Explore 60 high-energy sessions
            </label>
            <div className="select-wrap">
              <select
                id="session"
                value={sessionIndex}
                onChange={(e) => setSessionIndex(Number(e.target.value))}
              >
                {sessions.map((s, i) => (
                  <option value={i} key={s.id}>
                    {formatDate(s.start)} · {s.uniqueTracks} tracks
                  </option>
                ))}
              </select>
              <ChevronDown size={16} />
            </div>
            <div className="session-stats">
              <div>
                <strong>{session.uniqueTracks}</strong>
                <small>songs explored</small>
              </div>
              <div>
                <strong>{session.keepRate}%</strong>
                <small>in current likes</small>
              </div>
              <div>
                <strong>{session.durationMinutes}m</strong>
                <small>session length</small>
              </div>
            </div>
            <p>
              <strong>{session.topGenre?.name || "A mixed session"}</strong>
              {session.topArtist ? `, led by ${session.topArtist.name}.` : "."}
            </p>
            <div className="session-bottom">
              <small>
                Session {sessionIndex + 1} / {sessions.length}
              </small>
              <div>
                <button
                  type="button"
                  aria-label="Previous session"
                  disabled={sessionIndex === 0}
                  onClick={() => setSessionIndex((v) => v - 1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  aria-label="Next session"
                  disabled={sessionIndex === sessions.length - 1}
                  onClick={() => setSessionIndex((v) => v + 1)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function GatewayRail({ cosmos }: { cosmos: Cosmos }) {
  return (
    <section className="gateway-section section" id="bridges">
      <SectionHeading
        number="04"
        label="THE CONNECTING THREADS"
        title={
          <>
            Some songs
            <br />
            <em>open doors.</em>
          </>
        }
      >
        These tracks sit near neighbors from different regions. Their bridge
        scores describe the map, not your personal favorites.
      </SectionHeading>
      <div className="gateway-grid">
        {cosmos.gateways.slice(0, 7).map((p, i) => (
          <a
            key={p.rank}
            className="gateway-card"
            href={musicUrl(p.videoId)}
            target="_blank"
            rel="noreferrer"
          >
            <div className="gateway-art">
              <Cover videoId={p.videoId} />
              <span>0{i + 1}</span>
              <ArrowUpRight size={20} />
            </div>
            <span className="micro" style={{ color: clusterColors[p.cluster] }}>
              {cosmos.clusters.find((c) => c.id === p.cluster)?.name}
            </span>
            <h3>{p.title}</h3>
            <p>{p.artist}</p>
          </a>
        ))}
      </div>
      <p className="bridge-note">
        <Sparkles size={18} />
        <span>
          Classic rock is a connecting thread:{" "}
          <strong>Stairway to Heaven, Patience, Clocks.</strong> Big emotions
          meet a melody you can carry.
        </span>
      </p>
    </section>
  );
}

function TasteBoundary({ model }: { model: TasteModel }) {
  const [tab, setTab] = useState("kept");
  const kept = useMemo(
    () =>
      [...model.tracks]
        .sort((a, b) => b.listenCount - a.listenCount)
        .slice(0, 6),
    [model.tracks],
  );
  const songs =
    tab === "kept"
      ? kept.map((s) => ({
          ...s,
          artist: s.primaryArtist,
          plays: s.listenCount,
        }))
      : model.nearMisses.slice(0, 6).map((s) => ({
          ...s,
          artist: (s.channel || "Unknown channel").replace(" - Topic", ""),
        }));
  return (
    <section className="replay-section section" id="replays">
      <SectionHeading
        number="05"
        label="THE REPEAT OFFENDERS"
        title={
          <>
            A like is a moment.
            <br />
            <em>A replay says more.</em>
          </>
        }
      >
        The songs you keep returning to, and the ones that never made this exact
        liked-playlist snapshot.
      </SectionHeading>
      <div className="replay-layout">
        <div>
          <div className="segmented replay-tabs">
            <button
              type="button"
              aria-pressed={tab === "kept"}
              onClick={() => setTab("kept")}
            >
              Liked & replayed
            </button>
            <button
              type="button"
              aria-pressed={tab === "missed"}
              onClick={() => setTab("missed")}
            >
              Outside current likes
            </button>
          </div>
          <div className="replay-list">
            {songs.map((s, i) => (
              <a
                key={s.videoId}
                href={musicUrl(s.videoId)}
                target="_blank"
                rel="noreferrer"
                className="replay-song"
              >
                <span className="song-rank">0{i + 1}</span>
                <div className="art">
                  <Cover videoId={s.videoId} />
                </div>
                <span className="song-copy">
                  <strong>{s.title}</strong>
                  <small>{s.artist}</small>
                </span>
                <span className="watch-count">
                  <strong>{s.plays}</strong>
                  <small>watches</small>
                </span>
                <ArrowUpRight size={17} />
              </a>
            ))}
          </div>
        </div>
        <aside className="replay-insight">
          <Disc3 size={46} strokeWidth={1} />
          <span className="micro">THE STRONGEST MAGNET</span>
          <h3>{kept[0].title}</h3>
          <p>{kept[0].primaryArtist}</p>
          <strong className="replay-number">
            {kept[0].listenCount}
            <span>watches</span>
          </strong>
          <p className="chart-note">
            Watch events can include partial plays. An absent video ID may be an
            alternate upload, not a rejected song.
          </p>
        </aside>
      </div>
    </section>
  );
}

function Evidence({ model, cosmos }: { model: TasteModel; cosmos: Cosmos }) {
  const pieces = [
    ["Exact like date", model.coverage.confidence.exact, "#453cb0"],
    [
      "Watch-based estimate",
      model.coverage.confidence["watch-anchored"],
      "#8a82c8",
    ],
    [
      "Interpolated date",
      model.coverage.confidence["rank-interpolated"],
      "#c3bbdf",
    ],
    ["Playlist order only", model.coverage.confidence["rank-only"], "#ded9e7"],
  ] as const;
  return (
    <section className="evidence-section section" id="evidence">
      <div className="evidence-intro">
        <p className="eyebrow">
          <span>06</span> BEHIND THE NUMBERS
        </p>
        <h2>
          Good taste.
          <br />
          <em>Honest evidence.</em>
        </h2>
        <p>
          A snapshot of your playlist, with watch history from June 2025 to July
          2026. The timeline has gaps. Here’s exactly where.
        </p>
      </div>
      <div className="evidence-body">
        <div
          className="confidence-bar"
          role="img"
          aria-label={pieces.map(([l, n]) => `${n} ${l}`).join(", ")}
        >
          {pieces.map(([l, n, c]) => (
            <i
              key={l}
              style={{
                width: `${(n / model.coverage.tracks) * 100}%`,
                background: c,
              }}
            />
          ))}
        </div>
        <div className="confidence-grid">
          {pieces.map(([l, n, c]) => (
            <div key={l}>
              <i style={{ background: c }} />
              <strong>{n}</strong>
              <span>{l}</span>
            </div>
          ))}
        </div>
        <details className="evidence-details">
          <summary>
            Sources & method <ChevronDown size={18} />
          </summary>
          <div>
            <p>
              The public site contains song metadata and aggregate behavior. Raw
              Takeout files remain private and are not published.
            </p>
            <p>
              Only exact and watch-anchored dates power the heatmap.
              Interpolated dates infer position between anchors; they are never
              presented as confirmed like times.
            </p>
            <dl>
              <div>
                <dt>Music watch events</dt>
                <dd>{model.coverage.musicWatches.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Listening sessions</dt>
                <dd>{model.coverage.sessions.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{cosmos.method.features} traits · seeded UMAP</dd>
              </div>
              <div>
                <dt>Seed</dt>
                <dd>{cosmos.method.seed}</dd>
              </div>
              <div>
                <dt>Archive fingerprint</dt>
                <dd>{model.provenance.sha256.slice(0, 12)}…</dd>
              </div>
            </dl>
          </div>
        </details>
      </div>
    </section>
  );
}

export default function TasteCosmos({
  cosmos,
  model,
}: {
  cosmos: Cosmos;
  model: TasteModel;
}) {
  return (
    <main id="top">
      <a className="skip-link" href="#atlas">
        Skip to the taste map
      </a>
      <header className="site-header">
        <a className="brand" href="#top">
          <Disc3 size={25} />
          <span>
            TASTE <b>ATLAS</b>
            <small>KUSHAL’S MUSIC JOURNAL</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#atlas">The map</a>
          <a href="#shift">Evolution</a>
          <a href="#rhythm">Rhythm</a>
          <a href="#replays">On repeat</a>
        </nav>
        <span className="header-edition">
          VOL. 01 <i /> PERSONAL ARCHIVE
        </span>
      </header>
      <section className="hero">
        <div className="hero-topline">
          <span className="eyebrow">
            <i className="status-dot" /> YOUR PLAYLIST, BETWEEN THE LINES
          </span>
          <span className="micro">JUN ’25 — JUL ’26 HISTORY</span>
        </div>
        <div className="hero-layout">
          <div className="hero-copy">
            <h1>
              ALL OVER
              <br />
              <em>THE MAP.</em>
            </h1>
            <p>
              Film scores. Rap rabbit holes. City-pop nights. An atlas of
              everything that stayed with you.
            </p>
            <a className="primary-link" href="#atlas">
              Explore your taste <ArrowDown size={18} />
            </a>
          </div>
          <div
            className="hero-record"
            aria-label="Your music spans ten taste regions"
          >
            <div className="cover-sticker sticker-cinema">
              <Cover videoId={cosmos.points[0].videoId} />
              <span>CINEMA / SIDE A</span>
            </div>
            <div className="cover-sticker sticker-rap">
              <Cover
                videoId={
                  cosmos.points.find((p) => p.title === "King Kunta")
                    ?.videoId || cosmos.points[0].videoId
                }
              />
              <span>ON REPEAT / SIDE B</span>
            </div>
            <div className="record-orbit orbit-one" />
            <div className="record-orbit orbit-two" />
            <div className="record-disc">
              <div className="record-label">
                <AudioLines size={30} />
                <strong>1,111</strong>
                <span>SONGS IN YOUR ORBIT</span>
              </div>
            </div>
            <span className="record-caption caption-one">CINEMA & FEELING</span>
            <span className="record-caption caption-two">RAP & CATHARSIS</span>
            <span className="record-caption caption-three">MELODY, ALWAYS</span>
            <i className="record-star star-one">✳</i>
            <i className="record-star star-two">+</i>
          </div>
        </div>
        <div className="mixtape-strip" aria-hidden="true">
          <span>FILM SCORES ↗</span>
          <span>DEEP RAP CUTS ↗</span>
          <span>CITY-POP NIGHTS ↗</span>
          <span>INTERNET ODDITIES ↗</span>
        </div>
        <div className="hero-stats">
          <div>
            <strong>{model.coverage.tracks.toLocaleString()}</strong>
            <span>liked songs</span>
          </div>
          <div>
            <strong>{model.coverage.musicWatches.toLocaleString()}</strong>
            <span>music watches</span>
          </div>
          <div>
            <strong>{cosmos.clusters.length}</strong>
            <span>taste regions</span>
          </div>
          <div>
            <strong>{model.coverage.sessions.toLocaleString()}</strong>
            <span>listening sessions</span>
          </div>
        </div>
      </section>
      <CosmosMap cosmos={cosmos} />
      <Transformation cosmos={cosmos} />
      <ListeningRhythm cosmos={cosmos} model={model} />
      <GatewayRail cosmos={cosmos} />
      <TasteBoundary model={model} />
      <Evidence cosmos={cosmos} model={model} />
      <footer>
        <a className="brand" href="#top">
          <Disc3 size={24} />
          TASTE ATLAS
        </a>
        <p>Made from the music you came back to.</p>
        <a href="#top">Back to top ↑</a>
      </footer>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <a href="#atlas">
          <Map size={19} />
          Map
        </a>
        <a href="#shift">
          <Layers3 size={19} />
          Evolution
        </a>
        <a href="#rhythm">
          <Clock3 size={19} />
          Rhythm
        </a>
        <a href="#replays">
          <Headphones size={19} />
          Replays
        </a>
      </nav>
    </main>
  );
}
