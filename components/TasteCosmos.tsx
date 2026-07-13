"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Clock3,
  Disc3,
  Fingerprint,
  Flame,
  GitBranch,
  Info,
  Layers3,
  Orbit,
  Radar,
  Sparkles,
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
  method: { seed: string; features: number; umap: { neighbors: number; minDist: number; epochs: number }; clusters: number };
  clusters: Cluster[];
  points: Point[];
  gateways: Point[];
  outliers: Point[];
};

type SessionTrack = { videoId: string; title: string; channel: string | null; kept: boolean };
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
type NearMiss = { videoId: string; title: string; channel: string | null; plays: number; firstWatchAt: string; lastWatchAt: string };
type ModelTrack = { rank: number; videoId: string; title: string; primaryArtist: string; listenCount: number };
type TasteModel = {
  provenance: { archive: string; sha256: string; watchFile: string; searchFile: string };
  coverage: {
    tracks: number;
    exactActivities: number;
    exactMatches: number;
    confidence: Record<string, number>;
    musicWatches: number;
    sessions: number;
  };
  calibration: { exactLikesWithWatchMatch: number; medianMinutesFromWatchToLike: number | null };
  hourlyLikes: { hour: number; count: number }[];
  monthlyLikes: { month: string; count: number }[];
  tracks: ModelTrack[];
  sessions: Session[];
  nearMisses: NearMiss[];
};

type Mode = "regions" | "chronology" | "gravity";

const clusterColors = [
  "#f0c84b", "#76d7c4", "#cf78b6", "#6f9fff", "#ff8e61",
  "#a3cf62", "#b7a2e8", "#ef6a52", "#65c7e8", "#4d778f",
];

const formatDate = (value: string | null, options?: Intl.DateTimeFormatOptions) => value
  ? new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", year: "numeric", ...options }).format(new Date(value))
  : "Older playlist order";

const timeLabel = (hour: number) => `${hour % 12 || 12}${hour < 12 ? "am" : "pm"}`;
const svgNumber = (value: number) => Number(value.toFixed(3));
const retentionColor = (rate: number) => rate >= 80 ? "#76d7c4" : rate >= 50 ? "#f0c84b" : "#ff6a4d";

function Cover({ videoId, title }: { videoId: string; title: string }) {
  return (
    // YouTube thumbnails are the only consistent artwork source across music videos and uploads.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt={`Artwork for ${title}`} loading="lazy" />
  );
}

function confidenceLabel(value: string) {
  return ({
    exact: "Exact like time",
    "watch-anchored": "Watch anchored",
    "rank-interpolated": "Between real anchors",
    "rank-only": "Playlist order only",
  } as Record<string, string>)[value] || "Playlist evidence";
}

function CosmosMap({ cosmos }: { cosmos: Cosmos }) {
  const [mode, setMode] = useState<Mode>("regions");
  const [activeCluster, setActiveCluster] = useState<number | null>(null);
  const [selected, setSelected] = useState<Point>(cosmos.gateways.find((point) => point.title === "Clocks") || cosmos.points[0]);
  const maxListens = Math.max(...cosmos.points.map((point) => point.listens));
  const clusterById = useMemo(() => new Map(cosmos.clusters.map((cluster) => [cluster.id, cluster])), [cosmos.clusters]);

  const pointColor = (point: Point) => {
    if (mode === "regions") return clusterColors[point.cluster];
    if (mode === "gravity") return point.listens > 20 ? "#ff6a4d" : point.listens > 8 ? "#f0c84b" : "#76d7c4";
    const age = (point.rank - 1) / Math.max(1, cosmos.points.length - 1);
    return age < .2 ? "#ff6a4d" : age < .4 ? "#f0c84b" : age < .6 ? "#76d7c4" : age < .8 ? "#6f9fff" : "#b7a2e8";
  };

  return (
    <section className="cosmos-section" id="cosmos">
      <div className="cosmos-intro">
        <div>
          <p className="kicker"><Orbit size={16} /> LATENT TASTE SPACE</p>
          <h1>Chronology removed.<br /><em>Your musical mind, mapped.</em></h1>
        </div>
        <p>Every dot is a liked song. Distance means similarity across genre, artist, country, tags, duration, and listening behavior. The algorithm found ten regions without being told what to call them.</p>
      </div>

      <div className="cosmos-workbench">
        <aside className="region-index" aria-label="Taste regions">
          <div className="region-index-head"><span>REGIONS</span><strong>{cosmos.clusters.length}</strong></div>
          {cosmos.clusters.map((cluster) => (
            <button
              key={cluster.id}
              className={activeCluster === cluster.id ? "active" : ""}
              type="button"
              onClick={() => setActiveCluster((current) => current === cluster.id ? null : cluster.id)}
            >
              <i style={{ background: clusterColors[cluster.id] }} />
              <span><strong>{cluster.name}</strong><small>{cluster.topArtists.slice(0, 2).map((artist) => artist.name).join(" · ")}</small></span>
              <b>{cluster.size}</b>
            </button>
          ))}
        </aside>

        <div className="cosmos-stage">
          <div className="mode-switch" aria-label="Map color mode">
            <button className={mode === "regions" ? "active" : ""} type="button" title="Color by taste region" onClick={() => setMode("regions")}><Layers3 size={16} /><span>Regions</span></button>
            <button className={mode === "chronology" ? "active" : ""} type="button" title="Color from newest to oldest" onClick={() => setMode("chronology")}><Clock3 size={16} /><span>Age</span></button>
            <button className={mode === "gravity" ? "active" : ""} type="button" title="Emphasize repeat listens" onClick={() => setMode("gravity")}><Activity size={16} /><span>Gravity</span></button>
          </div>

          <svg className="cosmos-svg" viewBox="0 0 1000 660" role="img" aria-label="Map of 1,111 liked songs grouped by musical similarity">
            <defs>
              <radialGradient id="field" cx="50%" cy="45%" r="70%"><stop offset="0" stopColor="#24272b" /><stop offset="1" stopColor="#111315" /></radialGradient>
              <filter id="dotGlow"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            <rect width="1000" height="660" fill="url(#field)" />
            <g className="field-grid">
              {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((x) => <line key={`x-${x}`} x1={x} y1="0" x2={x} y2="660" />)}
              {[110, 220, 330, 440, 550].map((y) => <line key={`y-${y}`} x1="0" y1={y} x2="1000" y2={y} />)}
            </g>
            {cosmos.clusters.map((cluster) => (
              <circle key={`halo-${cluster.id}`} cx={40 + cluster.centroid[0] * 920} cy={25 + (1 - cluster.centroid[1]) * 600} r={34 + Math.sqrt(cluster.size) * 2.4} fill={clusterColors[cluster.id]} opacity={activeCluster === null || activeCluster === cluster.id ? .035 : .01} />
            ))}
            <g>
              {cosmos.points.map((point) => {
                const isSelected = selected.videoId === point.videoId && selected.rank === point.rank;
                const dimmed = activeCluster !== null && activeCluster !== point.cluster;
                const radius = mode === "gravity" ? 2.1 + 6 * Math.sqrt(point.listens / maxListens) : point.gatewayScore > 2200 ? 4.2 : 2.35;
                return (
                  <circle
                    key={`${point.rank}-${point.videoId}`}
                    cx={40 + point.x * 920}
                    cy={25 + (1 - point.y) * 600}
                    r={isSelected ? radius + 4 : radius}
                    fill={pointColor(point)}
                    opacity={dimmed ? .05 : isSelected ? 1 : .68}
                    stroke={isSelected ? "#fff" : "none"}
                    strokeWidth={isSelected ? 2 : 0}
                    filter={isSelected ? "url(#dotGlow)" : undefined}
                    onPointerEnter={() => setSelected(point)}
                    onClick={() => setSelected(point)}
                  />
                );
              })}
            </g>
          </svg>

          <div className="map-key"><span><i />{mode === "gravity" ? "low replay" : mode === "chronology" ? "newest" : "individual song"}</span><span><i />{mode === "gravity" ? "high replay" : mode === "chronology" ? "oldest" : "gateway song"}</span></div>
          <a className="selected-track" href={`https://music.youtube.com/watch?v=${selected.videoId}`} target="_blank" rel="noreferrer">
            <Cover videoId={selected.videoId} title={selected.title} />
            <span className="selected-track-copy">
              <small style={{ color: clusterColors[selected.cluster] }}>{clusterById.get(selected.cluster)?.name}</small>
              <strong>{selected.title}</strong>
              <span>{selected.artist}</span>
              <em>{selected.listens} watches · {confidenceLabel(selected.dateConfidence)}{selected.likeAt ? ` · ${formatDate(selected.likeAt)}` : ""}</em>
            </span>
            <ArrowUpRight size={18} />
          </a>
        </div>
      </div>
    </section>
  );
}

function RadialClock({ hours }: { hours: TasteModel["hourlyLikes"] }) {
  const max = Math.max(...hours.map((hour) => hour.count));
  return (
    <svg className="radial-clock" viewBox="0 0 360 360" role="img" aria-label="Exact and watch-anchored likes by hour of day">
      <circle cx="180" cy="180" r="105" className="clock-orbit" />
      {hours.map(({ hour, count }) => {
        const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
        const inner = 112;
        const outer = inner + 54 * (count / max);
        return <line key={hour} aria-label={`${timeLabel(hour)}: ${count} dated likes`} x1={svgNumber(180 + Math.cos(angle) * inner)} y1={svgNumber(180 + Math.sin(angle) * inner)} x2={svgNumber(180 + Math.cos(angle) * outer)} y2={svgNumber(180 + Math.sin(angle) * outer)} stroke={hour === 18 || hour === 19 ? "#ff6a4d" : "#697078"} strokeWidth="10" strokeLinecap="square" />;
      })}
      {[0, 6, 12, 18].map((hour) => {
        const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
        return <text key={hour} x={svgNumber(180 + Math.cos(angle) * 153)} y={svgNumber(185 + Math.sin(angle) * 153)} textAnchor="middle">{timeLabel(hour)}</text>;
      })}
      <text x="180" y="166" textAnchor="middle" className="clock-big">6–8pm</text>
      <text x="180" y="190" textAnchor="middle" className="clock-small">LIKE PEAK</text>
      <text x="180" y="213" textAnchor="middle" className="clock-note">Singapore time</text>
    </svg>
  );
}

function SessionWeather({ model }: { model: TasteModel }) {
  const [selected, setSelected] = useState(model.sessions[0]);
  const sessions = model.sessions.slice(0, 48);
  const minTime = Math.min(...sessions.map((session) => Date.parse(session.start)));
  const maxTime = Math.max(...sessions.map((session) => Date.parse(session.start)));
  const xFor = (value: string) => 70 + ((Date.parse(value) - minTime) / Math.max(1, maxTime - minTime)) * 800;
  const hourFor = (value: string) => (new Date(value).getUTCHours() + 8) % 24;
  const yFor = (value: string) => 32 + (hourFor(value) / 24) * 286;

  return (
    <section className="weather-section" id="weather">
      <div className="section-title">
        <p className="kicker"><Radar size={16} /> OBSESSION WEATHER</p>
        <h2>You do not discover songs one at a time.<br /><em>You move through fronts.</em></h2>
        <p>Listening sessions behave like weather systems: some are narrow, some exploratory, and some leave half their tracks permanently embedded in the playlist.</p>
      </div>
      <div className="weather-layout">
        <div className="clock-panel">
          <RadialClock hours={model.hourlyLikes} />
          <div className="clock-key"><span><i />other hours</span><span><i />6–8pm peak</span></div>
          <p><strong>{model.hourlyLikes[18].count + model.hourlyLikes[19].count}</strong> precisely dated likes landed between 6 and 8pm. Midnight is a smaller second pulse, not an outlier.</p>
        </div>
        <div className="storm-panel">
          <div className="chart-decoder storm-decoder">
            <span><b>X</b> date</span><span><b>Y</b> time of day</span><span><b>SIZE</b> songs explored</span>
            <span className="keep-low"><i /> under 50% kept</span><span className="keep-mid"><i /> 50–79% kept</span><span className="keep-high"><i /> 80%+ kept</span>
          </div>
          <div className="storm-head"><span>48 HIGHEST-ENERGY SESSIONS</span><span>LATER IN THE DAY ↓</span></div>
          <svg viewBox="0 0 920 350" role="img" aria-label="High-energy listening sessions plotted by date and time of day">
            {[0, 6, 12, 18, 24].map((hour) => <g key={hour}><line x1="70" x2="870" y1={32 + hour / 24 * 286} y2={32 + hour / 24 * 286} /><text x="55" y={36 + hour / 24 * 286} textAnchor="end">{timeLabel(hour % 24)}</text></g>)}
            {sessions.map((session) => {
              const isSelected = selected.id === session.id;
              return <circle key={session.id} aria-label={`${formatDate(session.start)} · ${session.uniqueTracks} tracks · ${session.keepRate}% kept`} cx={svgNumber(xFor(session.start))} cy={svgNumber(yFor(session.start))} r={svgNumber(4 + Math.sqrt(session.uniqueTracks) * .9)} fill={retentionColor(session.keepRate)} opacity={isSelected ? 1 : .68} stroke={isSelected ? "#fff" : "none"} strokeWidth="2" onPointerEnter={() => setSelected(session)} onClick={() => setSelected(session)} />;
            })}
            <text x="70" y="342">{formatDate(new Date(minTime).toISOString(), { month: "short", year: "numeric" })}</text>
            <text x="870" y="342" textAnchor="end">{formatDate(new Date(maxTime).toISOString(), { month: "short", year: "numeric" })}</text>
          </svg>
          <div className="storm-detail">
            <span className="storm-date">{formatDate(selected.start)}</span>
            <div><strong>{selected.uniqueTracks}</strong><small>unique tracks</small></div>
            <div><strong>{selected.keepRate}%</strong><small>survive in likes</small></div>
            <div><strong>{selected.durationMinutes}m</strong><small>storm length</small></div>
            <p><b>{selected.topGenre?.name || "Mixed"}</b> led the front{selected.topArtist ? `, with ${selected.topArtist.name} at its center.` : "."}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function GatewayRail({ cosmos }: { cosmos: Cosmos }) {
  return (
    <section className="gateway-section" id="gateways">
      <div className="section-title dark-copy">
        <p className="kicker"><GitBranch size={16} /> GATEWAY SONGS</p>
        <h2>The tracks that connect<br /><em>otherwise distant selves.</em></h2>
        <p>These sit near borders in the learned map and have neighbors from multiple regions. They are not merely favorites; they are bridges that make the rest of your taste feel internally coherent.</p>
      </div>
      <div className="gateway-decoder"><span><b>LEFT → RIGHT</b> strongest bridge score</span><span><b>RING + LABEL</b> home taste region</span></div>
      <div className="gateway-line">
        {cosmos.gateways.slice(0, 7).map((point, index) => (
          <a href={`https://music.youtube.com/watch?v=${point.videoId}`} target="_blank" rel="noreferrer" key={`${point.rank}-${point.videoId}`} className="gateway-stop">
            <span className="gateway-number">0{index + 1}</span>
            <div className="gateway-node" style={{ borderColor: clusterColors[point.cluster] }}><Cover videoId={point.videoId} title={point.title} /></div>
            <strong>{point.title}</strong>
            <small>{point.artist}</small>
            <em>{cosmos.clusters[point.cluster].name}</em>
          </a>
        ))}
      </div>
      <p className="gateway-reading"><Sparkles size={16} /> The strongest bridges lean classic-rock: <strong>Stairway to Heaven</strong>, <strong>Patience</strong>, <strong>Come and Get Your Love</strong>, and <strong>Clocks</strong>. Your canon phase appears to have acted as a translation layer between cinematic scale, alternative catharsis, and melody-first pop.</p>
    </section>
  );
}

function TasteBoundary({ model }: { model: TasteModel }) {
  const kept = useMemo(() => [...model.tracks].sort((a, b) => b.listenCount - a.listenCount).slice(0, 6), [model.tracks]);
  const missed = model.nearMisses.slice(0, 6);
  return (
    <section className="boundary-section" id="boundary">
      <div className="section-title">
        <p className="kicker"><Fingerprint size={16} /> THE TASTE BOUNDARY</p>
        <h2>What repetition says<br /><em>that a like cannot.</em></h2>
        <p>Watch count separates gravitational favorites from songs orbiting the edge of the current playlist. “Not found” can include alternate uploads, so this is a boundary signal, not a rejection verdict.</p>
      </div>
      <div className="boundary-axis"><span>LIKED + REPLAYED</span><i /><span>REPLAYED, NOT FOUND IN CURRENT LIKES</span></div>
      <div className="boundary-grid">
        <div className="boundary-side kept-side">
          {kept.map((track, index) => <a key={`${track.rank}-${track.videoId}`} href={`https://music.youtube.com/watch?v=${track.videoId}`} target="_blank" rel="noreferrer" className="boundary-track"><span className="boundary-rank">{index + 1}</span><div><Cover videoId={track.videoId} title={track.title} /><b><strong>{track.listenCount}</strong><small>watches</small></b></div><span><strong>{track.title}</strong><small>{track.primaryArtist}</small></span></a>)}
        </div>
        <div className="boundary-side missed-side">
          {missed.map((track, index) => <a key={track.videoId} href={`https://music.youtube.com/watch?v=${track.videoId}`} target="_blank" rel="noreferrer" className="boundary-track"><span className="boundary-rank">{index + 1}</span><div><Cover videoId={track.videoId} title={track.title} /><b><strong>{track.plays}</strong><small>watches</small></b></div><span><strong>{track.title}</strong><small>{(track.channel || "Unknown channel").replace(" - Topic", "")}</small></span></a>)}
        </div>
      </div>
      <div className="boundary-verdict"><Flame size={20} /><p><strong>King Kunta</strong> is your strongest confirmed magnet at 56 watches. The strangest edge case is <strong>Runaway</strong>: 44 watches across thirteen months, yet this exact upload is absent from the current liked playlist.</p></div>
    </section>
  );
}

function Transformation({ cosmos }: { cosmos: Cosmos }) {
  const groups = useMemo(() => {
    const count = (points: Point[]) => cosmos.clusters.map((cluster) => ({ ...cluster, count: points.filter((point) => point.cluster === cluster.id).length }));
    return {
      old: count(cosmos.points.filter((point) => point.rank > cosmos.points.length - 200)),
      recent: count(cosmos.points.filter((point) => point.rank <= 200)),
    };
  }, [cosmos]);
  const shifts = useMemo(() => groups.old.map((old) => {
    const recent = groups.recent.find((item) => item.id === old.id) || { count: 0 };
    return { ...old, oldCount: old.count, recentCount: recent.count, delta: recent.count - old.count };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)), [groups]);
  const shiftMax = Math.max(...shifts.flatMap((item) => [item.oldCount, item.recentCount]));
  return (
    <section className="transform-section" id="transform">
      <div className="section-title dark-copy">
        <p className="kicker"><Activity size={16} /> THE TRANSFORMATION</p>
        <h2>Not a replacement.<br /><em>An expansion of emotional scale.</em></h2>
      </div>
      <div className="shift-table">
        <div className="shift-head"><span>REGION</span><span>OLDEST 200</span><span>OLD → NEW</span><span>NEWEST 200</span><span>CHANGE</span></div>
        {shifts.map((cluster) => {
          const oldPosition = cluster.oldCount / shiftMax * 100;
          const newPosition = cluster.recentCount / shiftMax * 100;
          return <div className="shift-row" key={cluster.id}>
            <span className="shift-name"><i style={{ background: clusterColors[cluster.id] }} /><strong>{cluster.name}</strong></span>
            <b>{cluster.oldCount}</b>
            <span className="shift-track"><i style={{ left: `${Math.min(oldPosition, newPosition)}%`, width: `${Math.abs(newPosition - oldPosition)}%`, background: clusterColors[cluster.id] }} /><b className="old-dot" style={{ left: `${oldPosition}%`, borderColor: clusterColors[cluster.id] }} /><b className="new-dot" style={{ left: `${newPosition}%`, background: clusterColors[cluster.id] }} /></span>
            <b>{cluster.recentCount}</b>
            <em className={cluster.delta > 0 ? "rise" : cluster.delta < 0 ? "fall" : "flat"}>{cluster.delta > 0 ? "+" : ""}{cluster.delta}</em>
          </div>;
        })}
      </div>
      <div className="transform-findings">
        <article><span>+40</span><h3>Cinema becomes personal</h3><p><strong>Cinema in Full Color</strong> rises from 7 of the oldest 200 to 47 of the newest. South Asian film music is no longer a side room; it is the largest current territory.</p></article>
        <article><span>0 → 37</span><h3>Rap arrives as architecture</h3><p>The old edge contains no tracks in the tight rap cluster. The newest edge contains 37, with deep catalog runs through Kendrick and Kanye rather than isolated hits.</p></article>
        <article><span>46 → 2</span><h3>World-building moves underground</h3><p>Scores fall sharply in new likes, but their preference for scale survives elsewhere: prog epics, album-sequenced rap, and dramatic film songs inherit the same appetite.</p></article>
        <article><span>28 → 36</span><h3>Melody is the invariant</h3><p>The mixed Beatles–Daft Punk–Billy Joel region barely changes. Across every transformation, memorable melodic construction remains the stable center of gravity.</p></article>
      </div>
    </section>
  );
}

function Evidence({ model, cosmos }: { model: TasteModel; cosmos: Cosmos }) {
  const confidence = model.coverage.confidence;
  const total = model.coverage.tracks;
  const pieces = [
    ["Exact", confidence.exact, "#ff6a4d"],
    ["Watch anchored", confidence["watch-anchored"], "#76d7c4"],
    ["Between anchors", confidence["rank-interpolated"], "#f0c84b"],
    ["Order only", confidence["rank-only"], "#6f9fff"],
  ] as const;
  return (
    <section className="evidence-section" id="evidence">
      <div className="evidence-copy"><p className="kicker"><Info size={16} /> EVIDENCE, NOT VIBES</p><h2>How much of the timeline is real?</h2><p>The Takeout history covers June 2025–July 2026. Google’s separate My Activity export failed, but the signed-in activity page supplied the newest exact likes. Older ranks are never shown as exact dates.</p></div>
      <div className="confidence-bar">{pieces.map(([label, value, color]) => <i key={label} style={{ width: `${value / total * 100}%`, background: color }} title={`${label}: ${value}`} />)}</div>
      <div className="confidence-legend">{pieces.map(([label, value, color]) => <span key={label}><i style={{ background: color }} /><b>{value}</b><small>{label}</small></span>)}</div>
      <div className="method-grid">
        <div><strong>{model.coverage.musicWatches.toLocaleString()}</strong><span>music watch events</span></div>
        <div><strong>{model.coverage.sessions.toLocaleString()}</strong><span>listening sessions</span></div>
        <div><strong>{model.calibration.medianMinutesFromWatchToLike} min</strong><span>median watch → like delay</span></div>
        <div><strong>{cosmos.method.features}</strong><span>features in the taste model</span></div>
      </div>
      <div className="repro-line"><Disc3 size={18} /><span>Deterministic model seed: <code>{cosmos.method.seed}</code></span><span>Archive fingerprint: <code>{model.provenance.sha256.slice(0, 12)}…</code></span></div>
    </section>
  );
}

export default function TasteCosmos({ cosmos, model }: { cosmos: Cosmos; model: TasteModel }) {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#cosmos"><Disc3 size={20} />KUSHAL / TASTE LAB</a>
        <nav><a href="#transform">Shift</a><a href="#weather">Weather</a><a href="#gateways">Gateways</a><a href="#boundary">Boundary</a><a href="#evidence">Evidence</a></nav>
        <span className="header-count">1,111 LIKES</span>
      </header>
      <CosmosMap cosmos={cosmos} />
      <Transformation cosmos={cosmos} />
      <SessionWeather model={model} />
      <GatewayRail cosmos={cosmos} />
      <TasteBoundary model={model} />
      <Evidence model={model} cosmos={cosmos} />
      <footer><Disc3 size={17} /><span>Built locally from your private YouTube Music and Google Takeout data.</span><a href="#cosmos">Back to cosmos</a></footer>
    </main>
  );
}
