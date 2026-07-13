import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { unzipSync, strFromU8 } from "fflate";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: npm run import:takeout -- /path/to/takeout.zip");
  process.exit(1);
}

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const PRIVATE_DIR = path.join(ROOT, "data", "private");
await fs.mkdir(PRIVATE_DIR, { recursive: true });

const inputBytes = await fs.readFile(path.resolve(inputPath));
const checksum = crypto.createHash("sha256").update(inputBytes).digest("hex");
const files = unzipSync(new Uint8Array(inputBytes));

function findFile(suffix) {
  const entry = Object.entries(files).find(([name]) => name.endsWith(suffix));
  if (!entry) throw new Error(`Takeout archive does not contain ${suffix}`);
  return { name: entry[0], text: strFromU8(entry[1]) };
}

function normalizeText(value) {
  return value.replaceAll("\u00a0", " ").replaceAll("\u202f", " ").replace(/\s+/g, " ").trim();
}

function videoIdFromUrl(value) {
  try {
    return new URL(value).searchParams.get("v");
  } catch {
    return null;
  }
}

function parseTimestamp(value) {
  const normalized = normalizeText(value).replace(/^(.*?)([A-Z][a-z]{2} \d{1,2}, \d{4},)/, "$2");
  const match = normalized.match(/[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}:\d{2} [AP]M GMT[+-]\d{2}:\d{2}/);
  if (!match) return null;
  const timestamp = Date.parse(match[0]);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function parseHistory(html, kind) {
  const $ = cheerio.load(html);
  const entries = [];
  $(".outer-cell").each((_, element) => {
    const card = $(element);
    const source = normalizeText(card.find(".header-cell").first().text());
    const content = card.find(".content-cell.mdl-cell--6-col").first();
    const anchors = content.find("a");
    const primary = anchors.first();
    const secondary = anchors.eq(1);
    const url = primary.attr("href") || null;
    const text = normalizeText(content.text());
    const timestamp = parseTimestamp(text);

    if (kind === "watch") {
      const action = text.startsWith("Watched") ? "watched" : text.startsWith("Viewed") ? "viewed" : "other";
      entries.push({
        action,
        source,
        timestamp,
        videoId: url ? videoIdFromUrl(url) : null,
        title: normalizeText(primary.text()),
        url,
        channel: normalizeText(secondary.text()) || null,
        channelUrl: secondary.attr("href") || null,
        isMusic: source === "YouTube Music" || Boolean(url?.startsWith("https://music.youtube.com/")),
      });
    } else {
      entries.push({
        source,
        timestamp,
        query: normalizeText(primary.text()),
        url,
      });
    }
  });
  return entries.filter((entry) => entry.timestamp);
}

const watchFile = findFile("/history/watch-history.html");
const searchFile = findFile("/history/search-history.html");
const watch = parseHistory(watchFile.text, "watch");
const search = parseHistory(searchFile.text, "search");

const musicWatch = watch.filter((entry) => entry.isMusic && entry.videoId);
const output = {
  importedAt: new Date().toISOString(),
  source: {
    archive: path.basename(inputPath),
    sha256: checksum,
    watchFile: watchFile.name,
    searchFile: searchFile.name,
  },
  counts: {
    watch: watch.length,
    musicWatch: musicWatch.length,
    search: search.length,
  },
  watch,
  search,
};

await fs.writeFile(path.join(PRIVATE_DIR, "takeout-history.json"), JSON.stringify(output));
await fs.writeFile(path.join(PRIVATE_DIR, "music-watch-history.json"), JSON.stringify({
  importedAt: output.importedAt,
  source: output.source,
  count: musicWatch.length,
  watch: musicWatch,
}));
await fs.writeFile(path.join(PRIVATE_DIR, "provenance.json"), JSON.stringify({
  importedAt: output.importedAt,
  source: output.source,
  counts: output.counts,
}, null, 2));

console.log(`Imported ${watch.length.toLocaleString()} watches (${musicWatch.length.toLocaleString()} music) and ${search.length.toLocaleString()} searches.`);
