"use client";

import { useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarClock, ChevronLeft, ChevronRight, Disc3, FileArchive, Info, Music2, Sparkles, Users } from "lucide-react";
import { unzipSync, strFromU8 } from "fflate";

type Track = {
  rank: number;
  videoId: string;
  title: string;
  artists: string[];
  primaryArtist: string;
  album: string | null;
  duration: string;
  explicit: boolean;
  genre: string;
  newArtist: boolean;
};

type Chapter = {
  id: number;
  label: string;
  range: string;
  direction: string | null;
  count: number;
  genreCounts: Record<string, number>;
  dominant: string[];
  topArtists: { name: string; count: number }[];
  representative: string[];
  novelty: number;
  eclecticism: number;
  explicit: number;
};

type Analysis = {
  source: { reportedCount: number; visibleCount: number; hiddenCount: number; order: string; datedTracks: number };
  genres: string[];
  genreTotals: Record<string, number>;
  chapters: Chapter[];
  transitions: { from: number; to: number; distance: number }[];
  topArtists: { name: string; count: number; chapters: number[]; genre: string }[];
  tracks: Track[];
  summary: {
    uniqueArtists: number;
    uniqueAlbums: number;
    eclecticism: number;
    recentDominant: string[];
    oldestDominant: string[];
    biggestShift: { from: number; to: number; distance: number };
    newestTrack: Track;
    oldestTrack: Track;
  };
};

type DateEvidence = { date: string; confidence: "exact" | "inferred" };

const palette: Record<string, string> = {
  "South Asian": "#ff745a",
  "Hip-hop & R&B": "#c9a7ff",
  "Rock & Alternative": "#67a8ff",
  "Classic Pop & Rock": "#f4c75b",
  "Japanese & City Pop": "#f397c4",
  "Scores & Classical": "#9ba6b5",
  "Electronic & Dance": "#34d6c7",
  "Jazz, Soul & Funk": "#d7e464",
  "Latin & Global": "#ff9d4a",
  "Pop & Indie": "#76d98c",
  Other: "#6e737c",
};

const percent = (value: number, total: number) => Math.round((value / Math.max(1, total)) * 100);
const videoIdFromUrl = (value: string) => {
  try {
    return new URL(value).searchParams.get("v");
  } catch {
    return value.match(/[?&]v=([\w-]{6,})/)?.[1] || null;
  }
};

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function evidenceFromFiles(files: { name: string; text: string }[]) {
  const exact = new Map<string, string>();
  const watches = new Map<string, string[]>();
  for (const file of files) {
    if (file.name.toLowerCase().endsWith(".json")) {
      try {
        const items = JSON.parse(file.text);
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          const id = videoIdFromUrl(item.titleUrl || "");
          if (!id || !item.time) continue;
          watches.set(id, [...(watches.get(id) || []), item.time]);
        }
      } catch { /* Ignore unrelated JSON files. */ }
    }
    if (file.name.toLowerCase().endsWith(".csv")) {
      const rows = parseCsv(file.text);
      const header = rows[0]?.map((value) => value.trim().toLowerCase()) || [];
      const idIndex = header.findIndex((value) => value === "video id");
      const timeIndex = header.findIndex((value) => value.includes("playlist video creation timestamp"));
      if (idIndex < 0 || timeIndex < 0) continue;
      rows.slice(1).forEach((row) => { if (row[idIndex] && row[timeIndex]) exact.set(row[idIndex], row[timeIndex]); });
    }
  }
  watches.forEach((dates) => dates.sort((a, b) => Date.parse(b) - Date.parse(a)));
  return { exact, watches };
}

function TrackArt({ track, eager = false }: { track: Track; eager?: boolean }) {
  return (
    <a className="track-art" href={`https://music.youtube.com/watch?v=${track.videoId}`} target="_blank" rel="noreferrer" aria-label={`${track.title} by ${track.primaryArtist}`}>
      {/* YouTube thumbnails are the most faithful artwork available for mixed music/video likes. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`} alt="" loading={eager ? "eager" : "lazy"} />
      <span><strong>{track.title}</strong><small>{track.primaryArtist}</small></span>
    </a>
  );
}

function TasteRiver({ data, selected, onSelect }: { data: Analysis; selected: number; onSelect: (value: number) => void }) {
  const riverData = useMemo(() => [...data.chapters].reverse().map((chapter) => ({
    chapter: chapter.id,
    label: chapter.id === data.chapters.length ? "Oldest" : chapter.id === 1 ? "Newest" : `${chapter.id}`,
    ...Object.fromEntries(data.genres.map((genre) => [genre, percent(chapter.genreCounts[genre], chapter.count)])),
  })), [data]);
  return (
    <div className="river-wrap" aria-label="Genre share across the liked playlist">
      <ResponsiveContainer width="100%" height={360}>
        <AreaChart data={riverData} margin={{ top: 12, right: 8, left: -28, bottom: 0 }} onClick={(state) => {
          const payload = (state as unknown as { activePayload?: { payload?: { chapter?: number } }[] })?.activePayload?.[0]?.payload;
          if (payload?.chapter) onSelect(payload.chapter - 1);
        }}>
          <CartesianGrid stroke="rgba(255,255,255,.09)" vertical={false} />
          <XAxis dataKey="label" stroke="#92969d" tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} stroke="#92969d" tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
          <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
            <div className="chart-tooltip"><strong>{label === "Oldest" || label === "Newest" ? label : `Chapter ${label}`}</strong>{[...payload].reverse().filter((item) => Number(item.value) >= 5).map((item) => <span key={String(item.name)}><i style={{ background: item.color }} />{item.name}: {item.value}%</span>)}</div>
          ) : null} />
          {data.genres.map((genre) => <Area key={genre} type="monotone" dataKey={genre} stackId="taste" stroke={palette[genre]} fill={palette[genre]} fillOpacity={genre === "Other" ? .45 : .8} strokeWidth={1} isAnimationActive={false} />)}
        </AreaChart>
      </ResponsiveContainer>
      <div className="river-marker" style={{ left: `${((data.chapters.length - 1 - selected) / (data.chapters.length - 1)) * 100}%` }} aria-hidden="true" />
    </div>
  );
}

export default function TasteAtlas({ initialData }: { initialData: Analysis }) {
  const [selected, setSelected] = useState(0);
  const [evidence, setEvidence] = useState<Map<string, DateEvidence>>(new Map());
  const [importNote, setImportNote] = useState("No calendar data loaded yet");
  const fileRef = useRef<HTMLInputElement>(null);
  const chapter = initialData.chapters[selected];
  const representative = chapter.representative.map((id) => initialData.tracks.find((track) => track.videoId === id)).filter(Boolean) as Track[];
  const datedCount = evidence.size;

  async function importFiles(list: FileList | File[]) {
    const unpacked: { name: string; text: string }[] = [];
    for (const file of Array.from(list)) {
      if (file.name.toLowerCase().endsWith(".zip")) {
        const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
        Object.entries(archive).forEach(([name, bytes]) => {
          if (/\.(json|csv)$/i.test(name)) unpacked.push({ name, text: strFromU8(bytes) });
        });
      } else unpacked.push({ name: file.name, text: await file.text() });
    }
    const parsed = evidenceFromFiles(unpacked);
    const next = new Map<string, DateEvidence>();
    let upperBound = Date.now();
    for (const track of initialData.tracks) {
      const exactDate = parsed.exact.get(track.videoId);
      if (exactDate) {
        next.set(track.videoId, { date: exactDate, confidence: "exact" });
        upperBound = Math.min(upperBound, Date.parse(exactDate));
        continue;
      }
      const candidate = parsed.watches.get(track.videoId)?.find((date) => Date.parse(date) <= upperBound);
      if (candidate) {
        next.set(track.videoId, { date: candidate, confidence: "inferred" });
        upperBound = Date.parse(candidate);
      }
    }
    setEvidence(next);
    const exactCount = [...next.values()].filter((item) => item.confidence === "exact").length;
    setImportNote(`${next.size.toLocaleString()} tracks dated: ${exactCount.toLocaleString()} exact, ${(next.size - exactCount).toLocaleString()} inferred`);
  }

  const biggest = initialData.summary.biggestShift;
  const oldestTop = initialData.chapters.at(-1)?.topArtists[0]?.name;
  const recentTop = initialData.chapters[0]?.topArtists[0]?.name;

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top"><Disc3 size={22} />KUSHAL / TASTE ATLAS</a>
        <nav><a href="#river">Taste river</a><a href="#artists">Artist eras</a><a href="#dates">Add dates</a></nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> 1,111 LIKES, READ BACKWARDS</p>
          <h1>Your taste didn’t settle.<br />It <em>accumulated worlds.</em></h1>
          <p className="lede">From orchestral anime and Japanese pop at the oldest edge, through rock canon and album-sized obsessions, into a recent mix where South Indian film music, hip-hop, prog, soul, and internet oddities comfortably share the queue.</p>
          <div className="hero-facts">
            <span><strong>{initialData.summary.uniqueArtists}</strong> artists</span>
            <span><strong>{initialData.summary.uniqueAlbums}</strong> albums</span>
            <span><strong>{initialData.summary.eclecticism}/100</strong> genre spread</span>
          </div>
        </div>
        <div className="hero-mosaic" aria-label="A selection from the liked playlist">
          {[0, 18, 44, 119, 226, 361, 508, 677, 824, 1002, 1108, 75].map((rank, index) => <TrackArt key={`${rank}-${index}`} track={initialData.tracks[rank]} eager={index < 4} />)}
        </div>
      </section>

      <div className="source-strip"><Info size={16} /><span><strong>{initialData.source.visibleCount.toLocaleString()}</strong> visible songs captured in exact playlist order</span><span><strong>{initialData.source.hiddenCount}</strong> unavailable songs are hidden by YouTube</span><span><strong>{datedCount}</strong> songs currently have date evidence</span></div>

      <section className="essay band" id="river">
        <div className="section-kicker"><Music2 size={18} /> THE LONG VIEW</div>
        <div className="section-heading"><h2>The taste river</h2><p>Each vertical slice is 100 likes. Read left to right from your oldest saved music to what you’re liking now.</p></div>
        <TasteRiver data={initialData} selected={selected} onSelect={setSelected} />
        <div className="legend">{initialData.genres.map((genre) => <button key={genre} type="button" onClick={() => setSelected(initialData.chapters.findIndex((item) => item.genreCounts[genre] === Math.max(...initialData.chapters.map((c) => c.genreCounts[genre]))))}><i style={{ background: palette[genre] }} />{genre}</button>)}</div>
      </section>

      <section className="chapter band">
        <div className="chapter-control">
          <button className="icon-button" type="button" title="Newer chapter" aria-label="Newer chapter" disabled={selected === 0} onClick={() => setSelected((value) => Math.max(0, value - 1))}><ChevronLeft /></button>
          <div><span>{chapter.direction || `Likes ${chapter.range}`}</span><strong>{chapter.label}</strong></div>
          <button className="icon-button" type="button" title="Older chapter" aria-label="Older chapter" disabled={selected === initialData.chapters.length - 1} onClick={() => setSelected((value) => Math.min(initialData.chapters.length - 1, value + 1))}><ChevronRight /></button>
        </div>
        <input className="chapter-slider" aria-label="Select a chapter of likes" type="range" min="0" max={initialData.chapters.length - 1} value={selected} onChange={(event) => setSelected(Number(event.target.value))} />
        <div className="chapter-body">
          <div className="chapter-stats">
            <div><strong>{chapter.novelty}%</strong><span>new-to-you artists</span></div>
            <div><strong>{chapter.eclecticism}</strong><span>eclecticism</span></div>
            <div><strong>{chapter.explicit}%</strong><span>explicit</span></div>
          </div>
          <div className="chapter-copy">
            <p className="eyebrow">DOMINANT CURRENT</p>
            <h3>{chapter.dominant.join(" + ")}</h3>
            <p>{chapter.topArtists.slice(0, 3).map((artist) => `${artist.name} (${artist.count})`).join(" · ")}</p>
          </div>
          <div className="chapter-art">{representative.map((track) => <TrackArt key={track.videoId} track={track} />)}</div>
        </div>
      </section>

      <section className="insights band">
        <div className="section-kicker"><Sparkles size={18} /> WHAT THE SHAPE SAYS</div>
        <div className="insight-grid">
          <article><span>01</span><h3>You collect in obsessions</h3><p>Your overall leaders are Kanye West, Kendrick Lamar, The Beatles, Yumi Matsutoya, and Joe Hisaishi. That is not passive genre sampling; it is deep catalog behavior across very different musical systems.</p></article>
          <article><span>02</span><h3>The oldest foundation is cinematic</h3><p>The far end begins with <strong>{oldestTop}</strong> and a dense soundtrack/Japanese cluster. Even as rap and rock arrive later, you keep returning to music that builds a world rather than merely filling three minutes.</p></article>
          <article><span>03</span><h3>Your sharpest turn is mid-story</h3><p>The largest genre-distribution jump lands between Chapters {biggest.from} and {biggest.to}. It reads less like abandoning a taste and more like opening another room in the same house.</p></article>
          <article><span>04</span><h3>The present is unusually porous</h3><p>Your newest 100 are led by <strong>{recentTop}</strong>, but the same chapter also holds film songs, prog epics, city pop, alternative R&amp;B, reggae, jazz-pop, and viral edits. Recent taste is broader, faster, and less loyal to format.</p></article>
        </div>
      </section>

      <section className="artists band" id="artists">
        <div className="section-kicker"><Users size={18} /> RECURRING CHARACTERS</div>
        <div className="section-heading"><h2>Artist eras</h2><p>Brightness shows where each artist concentrates. Newest chapters are on the left; the oldest are on the right.</p></div>
        <div className="heatmap" role="img" aria-label="Artist appearances across chapters">
          <div className="heatmap-axis"><span /><span>NEWEST</span><span>OLDEST</span></div>
          {initialData.topArtists.slice(0, 18).map((artist) => {
            const max = Math.max(...artist.chapters, 1);
            return <div className="heatmap-row" key={artist.name}><span><strong>{artist.name}</strong><small>{artist.count}</small></span>{artist.chapters.map((count, index) => <button type="button" key={index} aria-label={`${artist.name}, Chapter ${index + 1}: ${count} likes`} title={`${artist.name} · Chapter ${index + 1} · ${count}`} onClick={() => setSelected(index)} style={{ background: count ? palette[artist.genre] : undefined, opacity: count ? .25 + .75 * count / max : 1 }} />)}</div>;
          })}
        </div>
      </section>

      <section className="bookends band">
        <div className="bookend-copy"><span>THE PLAYLIST BOOKENDS</span><h2>From orchestral balance<br />to <em>Naan Un</em>.</h2><p>These endpoints are not a verdict, just the oldest and newest surviving markers in a playlist that still has 80 unavailable tracks hidden inside it.</p></div>
        <div className="bookend-tracks"><TrackArt track={initialData.summary.oldestTrack} /><div className="bookend-line"><i />1,109 tracks between<i /></div><TrackArt track={initialData.summary.newestTrack} /></div>
      </section>

      <section className="import band" id="dates" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void importFiles(event.dataTransfer.files); }}>
        <div className="import-icon"><FileArchive /></div>
        <div className="import-copy"><div className="section-kicker"><CalendarClock size={18} /> TURN ORDER INTO YEARS</div><h2>Drop in Google Takeout.</h2><p>Use the YouTube and YouTube Music export. Playlist timestamps become exact dates; watch-history matches become clearly labeled estimates. Everything stays in this browser.</p><span className="import-status">{importNote}</span></div>
        <input ref={fileRef} type="file" multiple accept=".zip,.json,.csv" onChange={(event) => event.target.files && void importFiles(event.target.files)} />
        <button className="file-button" type="button" onClick={() => fileRef.current?.click()}><FileArchive size={18} />Choose Takeout files</button>
      </section>

      <footer><Disc3 size={18} /><span>Built from your private Liked Music playlist. Analysis is local; playback links return to YouTube Music.</span><a href="#top">Back to top</a></footer>
    </main>
  );
}
