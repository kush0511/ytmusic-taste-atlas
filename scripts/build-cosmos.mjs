import fs from "node:fs/promises";
import { UMAP } from "umap-js";
import { kmeans } from "ml-kmeans";
import seedrandom from "seedrandom";

const ROOT = new URL("../", import.meta.url);
const model = JSON.parse(await fs.readFile(new URL("data/taste-model.json", ROOT), "utf8"));
const enrichment = JSON.parse(await fs.readFile(new URL("data/artist-enrichment.json", ROOT), "utf8"));
const tracks = model.tracks;

const clean = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const durationSeconds = (value) => value.split(":").reduce((total, part) => total * 60 + Number(part), 0);

function termsFor(track) {
  const terms = [];
  const info = enrichment[track.artists[0]] || enrichment[track.primaryArtist] || {};
  terms.push(`genre:${clean(track.genre)}`);
  (info.tags || []).slice(0, 12).forEach((tag) => {
    const repeats = Math.min(3, Math.max(1, Math.round(Math.log2((tag.count || 0) + 2))));
    for (let index = 0; index < repeats; index += 1) terms.push(`tag:${clean(tag.name)}`);
  });
  if (info.country) terms.push(`country:${info.country.toLowerCase()}`);
  if (track.primaryArtist !== "Unknown") terms.push(`artist:${clean(track.primaryArtist)}`);
  return terms;
}

const documents = tracks.map(termsFor);
const documentFrequency = new Map();
documents.forEach((terms) => new Set(terms).forEach((term) => documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1)));
const vocabulary = [...documentFrequency]
  .filter(([term, count]) => count >= 2 || term.startsWith("genre:"))
  .sort((a, b) => {
    const typeWeight = (term) => term.startsWith("genre:") ? 3 : term.startsWith("tag:") ? 2 : term.startsWith("country:") ? 1 : 0;
    return typeWeight(b[0]) - typeWeight(a[0]) || b[1] - a[1] || a[0].localeCompare(b[0]);
  })
  .slice(0, 220)
  .map(([term]) => term);
const termIndex = new Map(vocabulary.map((term, index) => [term, index]));

const vectors = documents.map((terms, trackIndex) => {
  const vector = new Array(vocabulary.length + 3).fill(0);
  const counts = new Map();
  terms.forEach((term) => counts.set(term, (counts.get(term) || 0) + 1));
  counts.forEach((count, term) => {
    const index = termIndex.get(term);
    if (index === undefined) return;
    const idf = Math.log((tracks.length + 1) / ((documentFrequency.get(term) || 0) + 1)) + 1;
    const weight = term.startsWith("genre:") ? 2.4 : term.startsWith("tag:") ? 1.45 : term.startsWith("country:") ? 0.8 : 0.65;
    vector[index] = (1 + Math.log(count)) * idf * weight;
  });
  vector[vocabulary.length] = Math.min(durationSeconds(tracks[trackIndex].duration), 900) / 900;
  vector[vocabulary.length + 1] = tracks[trackIndex].explicit ? 0.7 : 0;
  vector[vocabulary.length + 2] = Math.log1p(tracks[trackIndex].listenCount) / 5;
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
});

const cosineDistance = (left, right) => {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    aa += left[index] * left[index];
    bb += right[index] * right[index];
  }
  return 1 - dot / (Math.sqrt(aa * bb) || 1);
};

const random = seedrandom("kushal-taste-cosmos-v1");
const umap = new UMAP({ nComponents: 2, nNeighbors: 22, minDist: 0.11, spread: 1.25, nEpochs: 420, random, distanceFn: cosineDistance });
console.log(`Projecting ${tracks.length} tracks from ${vectors[0].length} features...`);
const embedding = umap.fit(vectors);
const result = kmeans(vectors, 10, { initialization: "mostDistant", seed: 42, maxIterations: 200 });

const bounds = embedding.reduce((acc, point) => ({
  minX: Math.min(acc.minX, point[0]), maxX: Math.max(acc.maxX, point[0]),
  minY: Math.min(acc.minY, point[1]), maxY: Math.max(acc.maxY, point[1]),
}), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
const normalizedEmbedding = embedding.map(([x, y]) => [
  (x - bounds.minX) / (bounds.maxX - bounds.minX),
  (y - bounds.minY) / (bounds.maxY - bounds.minY),
]);

function evocativeName(topArtists, genres, tags, used) {
  const artists = topArtists.map((item) => item.name.toLowerCase()).join(" ");
  const dominant = genres[0]?.name || "Other";
  const total = genres.reduce((sum, item) => sum + item.count, 0);
  const purity = (genres[0]?.count || 0) / Math.max(1, total);
  const candidates = [];
  if (dominant === "Scores & Classical" && purity > 0.75) candidates.push("World-Building Music");
  if (/beatles/.test(artists) && /daft punk|billy joel/.test(artists)) candidates.push("Melody Machines");
  if (/joe hisaishi|samuel kim|shiro sagisu|hans zimmer|john williams/.test(artists)) candidates.push("Orchestral Worlds");
  if (/yumi|mariya takeuchi|anri|taeko|matsubara/.test(artists)) candidates.push("Neon Nostalgia");
  if (/kanye|kendrick|eminem|jay-z|tyler/.test(artists)) candidates.push("Rap Architecture");
  if (/beatles|pink floyd|queen|billy joel|fleetwood/.test(artists)) candidates.push("The Canon Room");
  if (/linkin park|avenged|muse|system of a down|foo fighters/.test(artists)) candidates.push("Cathartic Volume");
  if (/a\.r\. rahman|sid sriram|shankar mahadevan|harris jayaraj/.test(artists)) candidates.push("Cinema in Full Color");
  if (/daft punk|parcels|kavinsky/.test(artists)) candidates.push("Machines with Soul");
  if (/sinatra|stevie wonder|michael jackson|bee gees/.test(artists)) candidates.push("Velvet Time Machine");
  const fallback = {
    "South Asian": "Story Songs",
    "Hip-hop & R&B": "Rhythm and Interior",
    "Rock & Alternative": "Guitars with Weather",
    "Classic Pop & Rock": "Melody Before Genre",
    "Japanese & City Pop": "Pacific Afterglow",
    "Scores & Classical": "World-Building Music",
    "Electronic & Dance": "Synthetic Heart",
    "Jazz, Soul & Funk": "Velvet and Brass",
    "Latin & Global": "Borderless Rhythm",
    "Pop & Indie": "Soft-Edge Pop",
    Other: "Internet Portals",
  }[dominant];
  candidates.push(fallback);
  const available = candidates.find((name) => !used.has(name)) || `${fallback} II`;
  used.add(available);
  return available;
}

const usedNames = new Set();
const clusters = Array.from({ length: 10 }, (_, cluster) => {
  const indexes = result.clusters.map((value, index) => value === cluster ? index : -1).filter((index) => index >= 0);
  const artistCounts = new Map();
  const genreCounts = new Map();
  const tagCounts = new Map();
  indexes.forEach((index) => {
    const track = tracks[index];
    artistCounts.set(track.primaryArtist, (artistCounts.get(track.primaryArtist) || 0) + 1);
    genreCounts.set(track.genre, (genreCounts.get(track.genre) || 0) + 1);
    termsFor(track).filter((term) => term.startsWith("tag:")).forEach((term) => tagCounts.set(term.slice(4), (tagCounts.get(term.slice(4)) || 0) + 1));
  });
  const top = (counts, limit, key = "name") => [...counts].filter(([name]) => name !== "Unknown").sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, count]) => ({ [key]: name, count }));
  const topArtists = top(artistCounts, 5);
  const genres = top(genreCounts, 4);
  const tags = top(tagCounts, 6, "tag");
  return {
    id: cluster,
    size: indexes.length,
    name: evocativeName(topArtists, genres, tags, usedNames),
    topArtists,
    genres,
    tags,
    centroid: indexes.reduce((point, index) => [point[0] + normalizedEmbedding[index][0] / indexes.length, point[1] + normalizedEmbedding[index][1] / indexes.length], [0, 0]),
  };
});

const points = tracks.map((track, index) => ({
  rank: track.rank,
  videoId: track.videoId,
  title: track.title,
  artist: track.primaryArtist,
  genre: track.genre,
  cluster: result.clusters[index],
  x: Number(normalizedEmbedding[index][0].toFixed(5)),
  y: Number(normalizedEmbedding[index][1].toFixed(5)),
  likeAt: track.likeAt,
  dateConfidence: track.dateConfidence,
  listens: track.listenCount,
}));

for (let index = 0; index < points.length; index += 1) {
  const neighbors = points
    .map((point, other) => other === index ? null : ({ other, distance: Math.hypot(point.x - points[index].x, point.y - points[index].y) }))
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 14);
  const foreign = neighbors.filter((neighbor) => points[neighbor.other].cluster !== points[index].cluster);
  const diversity = new Set(foreign.map((neighbor) => points[neighbor.other].cluster)).size;
  points[index].gatewayScore = Number((foreign.reduce((sum, neighbor) => sum + 1 / (neighbor.distance + 0.02), 0) * Math.max(1, diversity) * Math.log2(points[index].listens + 2)).toFixed(2));
  const centroid = clusters[points[index].cluster].centroid;
  points[index].outlierScore = Number(Math.hypot(points[index].x - centroid[0], points[index].y - centroid[1]).toFixed(4));
}

const gateways = [...points].sort((a, b) => b.gatewayScore - a.gatewayScore).slice(0, 24);
const outliers = [...points].sort((a, b) => b.outlierScore - a.outlierScore).slice(0, 24);
const datedYears = points
  .filter((point) => point.likeAt && point.dateConfidence !== "rank-only")
  .map((point) => new Date(point.likeAt).getUTCFullYear());
const yearTerritories = [...new Set(datedYears)].sort().map((year) => {
  const yearPoints = points.filter((point) => new Date(point.likeAt).getUTCFullYear() === year && point.dateConfidence !== "rank-interpolated");
  return {
    year,
    count: yearPoints.length,
    centroid: yearPoints.length ? yearPoints.reduce((sum, point) => [sum[0] + point.x / yearPoints.length, sum[1] + point.y / yearPoints.length], [0, 0]) : null,
    clusters: clusters.map((cluster) => ({ id: cluster.id, count: yearPoints.filter((point) => point.cluster === cluster.id).length })),
  };
});

const output = {
  generatedAt: new Date().toISOString(),
  method: { seed: "kushal-taste-cosmos-v1", features: vectors[0].length, umap: { neighbors: 22, minDist: 0.11, epochs: 420 }, clusters: 10 },
  clusters,
  points,
  gateways,
  outliers,
  yearTerritories,
};
await fs.writeFile(new URL("data/cosmos.json", ROOT), JSON.stringify(output, null, 2));
console.log(JSON.stringify({ clusters: clusters.map(({ id, name, size, topArtists, genres }) => ({ id, name, size, topArtists: topArtists.slice(0, 3), genres: genres.slice(0, 2) })), gateways: gateways.slice(0, 8).map(({ title, artist, gatewayScore }) => ({ title, artist, gatewayScore })) }, null, 2));
