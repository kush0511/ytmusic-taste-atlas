import fs from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const input = JSON.parse(await fs.readFile(new URL("data/liked-music.json", ROOT), "utf8"));
const outputUrl = new URL("data/artist-enrichment.json", ROOT);

let cache = {};
try {
  cache = JSON.parse(await fs.readFile(outputUrl, "utf8"));
} catch {
  // First run.
}

const counts = new Map();
for (const track of input.tracks) {
  for (const artist of track.artists) counts.set(artist, (counts.get(artist) || 0) + 1);
}

const artists = [...counts]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .slice(0, 240);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function lookup(name) {
  const query = encodeURIComponent(`artist:"${name.replaceAll('"', "")}"`);
  const url = `https://musicbrainz.org/ws/2/artist/?query=${query}&fmt=json&limit=5`;
  const response = await fetch(url, {
    headers: { "User-Agent": "YTMusicTasteAtlas/0.1 (personal local analysis)" },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const data = await response.json();
  const exact = data.artists?.find((artist) => normalize(artist.name) === normalize(name));
  const match = exact || data.artists?.[0];
  if (!match) return { matched: false, tags: [] };
  return {
    matched: true,
    name: match.name,
    score: match.score ?? null,
    mbid: match.id,
    type: match.type ?? null,
    country: match.country ?? match.area?.["iso-3166-1-codes"]?.[0] ?? null,
    area: match.area?.name ?? match["begin-area"]?.name ?? null,
    tags: (match.tags || [])
      .filter((tag) => tag.count >= 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 14),
  };
}

let completed = 0;
for (const [name, count] of artists) {
  if (cache[name]) continue;
  try {
    cache[name] = { count, ...(await lookup(name)) };
  } catch (error) {
    cache[name] = { count, matched: false, tags: [], error: String(error) };
  }
  completed += 1;
  await fs.writeFile(outputUrl, JSON.stringify(cache, null, 2));
  process.stdout.write(`\rEnriched ${completed} new artists (${Object.keys(cache).length}/${artists.length})`);
  await sleep(1100);
}

process.stdout.write(`\nSaved ${Object.keys(cache).length} artists to data/artist-enrichment.json\n`);
