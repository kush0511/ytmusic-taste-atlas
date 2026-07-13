import fs from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const playlist = JSON.parse(await fs.readFile(new URL("data/liked-music.json", ROOT), "utf8"));
const analysis = JSON.parse(await fs.readFile(new URL("data/analysis.json", ROOT), "utf8"));
const history = JSON.parse(await fs.readFile(new URL("data/private/music-watch-history.json", ROOT), "utf8"));
const likeSample = JSON.parse(await fs.readFile(new URL("data/like-activity-sample.json", ROOT), "utf8"));

const tracks = analysis.tracks;
const trackById = new Map();
const tracksById = new Map();
for (const track of tracks) {
  if (!trackById.has(track.videoId)) trackById.set(track.videoId, track);
  if (!tracksById.has(track.videoId)) tracksById.set(track.videoId, []);
  tracksById.get(track.videoId).push(track);
}
const capturedYear = new Date(likeSample.capturedAt).getFullYear();

const normalize = (value) => value
  .toLowerCase()
  .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\b(official|audio|video|lyrics|remaster|remastered|topic)\b/g, " ")
  .replace(/\s+/g, " ")
  .trim();

function titleSimilarity(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 0.5 + Math.min(a.length, b.length) / Math.max(a.length, b.length);
  const aa = new Set(a.split(" "));
  const bb = new Set(b.split(" "));
  let intersection = 0;
  aa.forEach((token) => { if (bb.has(token)) intersection += 1; });
  return intersection / Math.max(aa.size, bb.size);
}

function exactTimestamp(activity) {
  const year = /\d{4}/.test(activity.dateLabel) ? "" : `, ${capturedYear}`;
  const time = activity.time.replace(/[\u00a0\u202f]/g, " ");
  const value = Date.parse(`${activity.dateLabel}${year} ${time} GMT+08:00`);
  return Number.isNaN(value) ? null : new Date(value).toISOString();
}

const exactLikesByRank = new Map();
const likedActivities = likeSample.activities.filter((activity) => activity.action === "liked");
const exactIdMatches = new Set();
for (let activityIndex = 0; activityIndex < likedActivities.length; activityIndex += 1) {
  const activity = likedActivities[activityIndex];
  const expectedRank = activityIndex + 1;
  const track = (tracksById.get(activity.videoId) || []).sort((a, b) => Math.abs(a.rank - expectedRank) - Math.abs(b.rank - expectedRank))[0];
  const timestamp = exactTimestamp(activity);
  if (track && timestamp && Math.abs(track.rank - expectedRank) <= 30) {
    exactLikesByRank.set(track.rank, { timestamp, match: "video-id", activityTitle: activity.title });
    exactIdMatches.add(track.rank);
  }
}

for (let activityIndex = 0; activityIndex < likedActivities.length; activityIndex += 1) {
  const activity = likedActivities[activityIndex];
  if (trackById.has(activity.videoId)) continue;
  const expectedRank = activityIndex + 1;
  const candidates = tracks
    .filter((track) => !exactIdMatches.has(track.rank) && Math.abs(track.rank - expectedRank) <= 28)
    .map((track) => ({ track, score: titleSimilarity(activity.title, track.title) }))
    .sort((a, b) => b.score - a.score || Math.abs(a.track.rank - expectedRank) - Math.abs(b.track.rank - expectedRank));
  if (candidates[0]?.score >= 0.72) {
    const timestamp = exactTimestamp(activity);
    if (timestamp) exactLikesByRank.set(candidates[0].track.rank, { timestamp, match: "title-reconciled", activityTitle: activity.title });
  }
}

const watchesById = new Map();
for (const watch of history.watch) {
  if (!watch.videoId || !watch.timestamp) continue;
  if (!watchesById.has(watch.videoId)) watchesById.set(watch.videoId, []);
  watchesById.get(watch.videoId).push(watch);
}
watchesById.forEach((watches) => watches.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)));

const exactRanks = [...exactLikesByRank.keys()];
const maxExactRank = Math.max(...exactRanks);
const oldestExactTime = Math.min(...tracks
  .filter((track) => exactLikesByRank.has(track.rank) && track.rank <= maxExactRank)
  .map((track) => Date.parse(exactLikesByRank.get(track.rank).timestamp)));

// Find the longest globally consistent chain of watch events after the exact-like window.
// When events are ordered newest-to-oldest, playlist rank must strictly increase.
const candidatePoints = history.watch
  .map((watch) => ({ watch, track: trackById.get(watch.videoId), time: Date.parse(watch.timestamp) }))
  .filter((point) => point.track?.rank > maxExactRank && point.time <= oldestExactTime)
  .sort((a, b) => b.time - a.time || a.track.rank - b.track.rank);
const tails = [];
const tailIndexes = [];
const previous = new Array(candidatePoints.length).fill(-1);
for (let index = 0; index < candidatePoints.length; index += 1) {
  const rank = candidatePoints[index].track.rank;
  let low = 0;
  let high = tails.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (tails[middle] < rank) low = middle + 1;
    else high = middle;
  }
  if (low > 0) previous[index] = tailIndexes[low - 1];
  tails[low] = rank;
  tailIndexes[low] = index;
}
const watchAnchors = new Map();
let chainIndex = tailIndexes[tails.length - 1];
while (chainIndex >= 0) {
  const point = candidatePoints[chainIndex];
  watchAnchors.set(point.track.rank, point.watch);
  chainIndex = previous[chainIndex];
}

const dated = tracks.map((track) => {
  const exact = exactLikesByRank.get(track.rank);
  const watches = watchesById.get(track.videoId) || [];
  if (exact) return { ...track, likeAt: exact.timestamp, dateConfidence: "exact", dateMatch: exact.match, watches };
  const anchor = watchAnchors.get(track.rank);
  if (anchor) return { ...track, likeAt: anchor.timestamp, dateConfidence: "watch-anchored", dateMatch: "monotonic-video-id", watches };
  return { ...track, likeAt: null, dateConfidence: "rank-only", dateMatch: null, watches };
});

let cursor = 0;
while (cursor < dated.length) {
  if (dated[cursor].likeAt) { cursor += 1; continue; }
  const start = cursor;
  while (cursor < dated.length && !dated[cursor].likeAt) cursor += 1;
  const end = cursor - 1;
  // Interpolation is only defensible between two observed timestamps. The
  // playlist tail predates the Takeout window, so it remains rank-only.
  if (start === 0 || cursor >= dated.length) continue;
  const upper = start > 0 ? Date.parse(dated[start - 1].likeAt) : Date.parse(playlist.capturedAt);
  const lower = Date.parse(dated[cursor].likeAt);
  const step = (upper - lower) / (end - start + 2);
  for (let index = start; index <= end; index += 1) {
    dated[index].likeAt = new Date(upper - step * (index - start + 1)).toISOString();
    dated[index].dateConfidence = "rank-interpolated";
  }
}

for (const track of dated) {
  const watchTimes = track.watches.map((watch) => Date.parse(watch.timestamp));
  const likeTime = Date.parse(track.likeAt);
  track.listenCount = watchTimes.length;
  track.firstWatchAt = watchTimes.length ? new Date(Math.min(...watchTimes)).toISOString() : null;
  track.lastWatchAt = watchTimes.length ? new Date(Math.max(...watchTimes)).toISOString() : null;
  track.preLikeWatches = watchTimes.filter((value) => value <= likeTime).length;
  track.postLikeWatches = watchTimes.filter((value) => value > likeTime).length;
  delete track.watches;
}

const watchEvents = [...history.watch]
  .filter((watch) => watch.timestamp && watch.videoId)
  .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
const dedupedWatches = watchEvents.filter((watch, index, all) => {
  const previous = all[index - 1];
  return !previous || previous.videoId !== watch.videoId || Date.parse(watch.timestamp) - Date.parse(previous.timestamp) > 30000;
});

const sessions = [];
let session = [];
for (const watch of dedupedWatches) {
  const previous = session.at(-1);
  if (previous && Date.parse(watch.timestamp) - Date.parse(previous.timestamp) > 25 * 60 * 1000) {
    if (session.length >= 2) sessions.push(session);
    session = [];
  }
  session.push(watch);
}
if (session.length >= 2) sessions.push(session);

function summarizeSession(events, index) {
  const unique = [...new Map(events.map((event) => [event.videoId, event])).values()];
  const kept = unique.map((event) => trackById.get(event.videoId)).filter(Boolean);
  const artistCounts = new Map();
  const genreCounts = new Map();
  kept.forEach((track) => {
    if (track.primaryArtist !== "Unknown") artistCounts.set(track.primaryArtist, (artistCounts.get(track.primaryArtist) || 0) + 1);
    genreCounts.set(track.genre, (genreCounts.get(track.genre) || 0) + 1);
  });
  const topArtist = [...artistCounts].sort((a, b) => b[1] - a[1])[0] || null;
  const topGenre = [...genreCounts].sort((a, b) => b[1] - a[1])[0] || null;
  const start = events[0].timestamp;
  const end = events.at(-1).timestamp;
  return {
    id: index + 1,
    start,
    end,
    durationMinutes: Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 60000)),
    plays: events.length,
    uniqueTracks: unique.length,
    keptTracks: kept.length,
    keepRate: Math.round((kept.length / Math.max(1, unique.length)) * 100),
    topArtist: topArtist ? { name: topArtist[0], count: topArtist[1] } : null,
    topGenre: topGenre ? { name: topGenre[0], count: topGenre[1] } : null,
    representative: unique.slice(0, 12).map((event) => ({
      videoId: event.videoId,
      title: event.title,
      channel: event.channel,
      kept: trackById.has(event.videoId),
    })),
  };
}

const sessionSummaries = sessions.map(summarizeSession);
const interestingSessions = [...sessionSummaries]
  .filter((item) => item.uniqueTracks >= 4)
  .sort((a, b) => (b.keptTracks * 3 + b.uniqueTracks) - (a.keptTracks * 3 + a.uniqueTracks))
  .slice(0, 60);

const videoStats = new Map();
for (const watch of history.watch) {
  if (!watch.videoId) continue;
  const current = videoStats.get(watch.videoId) || { videoId: watch.videoId, title: watch.title, channel: watch.channel, plays: 0, timestamps: [] };
  current.plays += 1;
  current.timestamps.push(watch.timestamp);
  videoStats.set(watch.videoId, current);
}

const likedTitleKeys = new Set(tracks.map((track) => normalize(track.title)));
const nearMisses = [...videoStats.values()]
  .filter((item) => !trackById.has(item.videoId) && !likedTitleKeys.has(normalize(item.title)) && item.plays >= 3)
  .sort((a, b) => b.plays - a.plays)
  .slice(0, 40)
  .map((item) => ({ videoId: item.videoId, title: item.title, channel: item.channel, plays: item.plays, firstWatchAt: item.timestamps.at(-1), lastWatchAt: item.timestamps[0] }));

const exactCalibration = dated.filter((track) => track.dateConfidence === "exact" && track.firstWatchAt).map((track) => {
  const like = Date.parse(track.likeAt);
  const candidates = (watchesById.get(track.videoId) || []).map((watch) => Date.parse(watch.timestamp)).filter((value) => value <= like + 15 * 60000);
  const nearest = candidates.sort((a, b) => Math.abs(like - a) - Math.abs(like - b))[0];
  return nearest ? Math.round((like - nearest) / 60000) : null;
}).filter((value) => value !== null);

const hourlyLikes = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
const monthlyLikes = new Map();
dated.filter((track) => track.likeAt && ["exact", "watch-anchored"].includes(track.dateConfidence)).forEach((track) => {
  const date = new Date(track.likeAt);
  const localHour = (date.getUTCHours() + 8) % 24;
  hourlyLikes[localHour].count += 1;
  const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  monthlyLikes.set(month, (monthlyLikes.get(month) || 0) + 1);
});

const confidenceCounts = dated.reduce((result, track) => {
  result[track.dateConfidence] = (result[track.dateConfidence] || 0) + 1;
  return result;
}, {});

const output = {
  generatedAt: new Date().toISOString(),
  provenance: history.source,
  coverage: {
    tracks: dated.length,
    exactActivities: likedActivities.length,
    exactMatches: exactLikesByRank.size,
    confidence: confidenceCounts,
    musicWatches: history.count,
    sessions: sessionSummaries.length,
  },
  calibration: {
    exactLikesWithWatchMatch: exactCalibration.length,
    medianMinutesFromWatchToLike: exactCalibration.sort((a, b) => a - b)[Math.floor(exactCalibration.length / 2)] ?? null,
  },
  hourlyLikes,
  monthlyLikes: [...monthlyLikes].sort((a, b) => a[0].localeCompare(b[0])).map(([month, count]) => ({ month, count })),
  tracks: dated,
  sessions: interestingSessions,
  nearMisses,
};

await fs.writeFile(new URL("data/taste-model.json", ROOT), JSON.stringify(output, null, 2));
console.log(JSON.stringify({ coverage: output.coverage, calibration: output.calibration, topSession: interestingSessions[0], topNearMisses: nearMisses.slice(0, 5) }, null, 2));
