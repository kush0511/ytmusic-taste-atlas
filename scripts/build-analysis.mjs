import fs from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const playlist = JSON.parse(await fs.readFile(new URL("data/liked-music.json", ROOT), "utf8"));
let enrichment = {};
try {
  enrichment = JSON.parse(await fs.readFile(new URL("data/artist-enrichment.json", ROOT), "utf8"));
} catch {
  // The analysis remains usable while enrichment is still running.
}

const GENRES = [
  "South Asian",
  "Hip-hop & R&B",
  "Rock & Alternative",
  "Classic Pop & Rock",
  "Japanese & City Pop",
  "Scores & Classical",
  "Electronic & Dance",
  "Jazz, Soul & Funk",
  "Latin & Global",
  "Pop & Indie",
  "Other",
];

const alias = new Map([
  ["a. r. rahman", "A.R. Rahman"],
  ["jay-z", "JAY-Z"],
  ["jaÿ-z", "JAY-Z"],
  ["linkin park", "Linkin Park"],
  ["s.p.balasubramanyam", "S. P. Balasubrahmanyam"],
]);
const canonical = (name) => alias.get(name.toLowerCase()) || name;

const sets = (items) => new Set(items.map((item) => item.toLowerCase()));
const SOUTH_ASIAN = sets([
  "A.R. Rahman", "Sid Sriram", "Shankar Mahadevan", "Chinmayi", "Harris Jayaraj",
  "Vijay Prakash", "Karthik", "Anurag Kulkarni", "S.P.Balasubramanyam", "Anirudh Ravichander",
  "Kaala Bhairava", "K.K", "Varijashree Venugopal", "CHOWRAASTA", "S. Janaki", "Sooraj Santhosh",
  "Chitra", "K.S. Chithra", "Rahul Nambiar", "Javed Ali", "Hariharan", "M.M. Keeravani",
  "Mickey J. Meyer", "Ilaiyaraaja", "Yuvan Shankar Raja", "Devi Sri Prasad", "Thaman S",
  "S. P. Balasubrahmanyam", "M. M. Keeravaani", "Govind Vasantha", "Vivek Sagar", "Haricharan Seshadri",
  "Raqueeb Alam", "Harini", "Yazin Nizar", "Hesham Abdul Wahab", "Dhee", "Naveen", "Shaan",
  "Raman Mahadevan", "Bombay Jayashree", "Dhibu Ninan Thomas", "Vishal-Shekhar", "Pradeep Kumar",
  "Naresh Iyer", "Sri Ram Parthasarathi", "Chinmayi Sripada", "Tippu", "Murali", "Iravu",
  "Pranav Chaganty", "Jammers", "Adarsh Rao", "Sumedh K", "Alluri",
]);
const SCORES = sets([
  "Joe Hisaishi", "Samuel Kim", "Yugo Kanno", "Shiro SAGISU", "Ramin Djawadi", "Ennio Morricone",
  "Hans Zimmer", "John Williams", "London Symphony Orchestra", "London Philharmonic Orchestra",
  "Georges Bizet", "Johann Sebastian Bach", "Rush Garcia", "kensuke ushio", "Ludwig Göransson",
  "Howard Shore", "Hiroyuki Sawano", "Koji Kondo", "Alexandre Desplat", "Michel Plasson",
  "Rousseau", "TheDigimonEmperor - RETIRED", "London Music Works", "Royal Philharmonic Orchestra",
]);
const JAPANESE = sets([
  "Yumi Matsutoya", "Yumi Arai", "Mariya Takeuchi", "Hikaru Utada", "Eiichi Ohtaki", "Kenshi Yonezu",
  "Taeko Onuki", "Anri", "Masayoshi Yamazaki", "Nujabes", "YUKI", "ASIAN KUNG-FU GENERATION",
  "Mai Yamane", "DAOKO", "RADWIMPS", "Masayuki Suzuki", "Tomoko Aran", "Fujii Kaze",
  "Junko Ohashi", "Saito Yuki", "Yellow Magic Orchestra", "Miki Matsubara", "Takako Mamiya",
  "Masayoshi Takanaka", "Megumi Hayashibara", "Tatsuro Yamashita", "Sukima Switch", "chelmico",
]);
const CLASSIC = sets([
  "The Beatles", "Pink Floyd", "Queen", "Frank Sinatra", "Billy Joel", "The Beach Boys", "Michael Jackson",
  "Fleetwood Mac", "John Lennon", "The Kinks", "Simon & Garfunkel", "Creedence Clearwater Revival",
  "David Bowie", "AC/DC", "ABBA", "Bee Gees", "Steely Dan", "Stevie Wonder", "Don McLean", "Carpenters",
  "Electric Light Orchestra", "Elvis Presley", "Boney M.", "Olivia Newton-John", "The Doors", "Led Zeppelin",
  "The Turtles", "Bob Marley & The Wailers", "Madonna", "Prince", "The Rolling Stones",
  "Jackson 5", "The Mamas & The Papas", "Elton John", "Eagles", "The Police", "Deep Purple",
  "Lynyrd Skynyrd", "Jim Croce", "John Denver", "Smokie", "Leo Sayer", "Paul Anka", "Vera Lynn",
]);
const HIPHOP = sets([
  "Kanye West", "Kendrick Lamar", "Eminem", "Tyler, The Creator", "Childish Gambino", "Frank Ocean",
  "A$AP Rocky", "Drake", "Metro Boomin", "JAY-Z", "Kid Cudi", "Freddie Gibbs", "Parimal Shais",
  "Sexyy Red", "Lupe Fiasco", "Pusha T", "Dr. Dre", "Mac Miller", "Lil Wayne", "Outkast", "J. Cole",
  "SZA", "The Weeknd", "2Pac", "KIDS SEE GHOSTS", "Blackway", "DJ Khalil", "Jamie Foxx",
]);
const ROCK = sets([
  "Radiohead", "Muse", "Linkin Park", "Avenged Sevenfold", "The Strokes", "Red Hot Chili Peppers",
  "Tame Impala", "Nirvana", "King Crimson", "Geese", "Arctic Monkeys", "Foo Fighters", "Cage The Elephant",
  "Guns N' Roses", "Queens of the Stone Age", "System Of A Down", "Green Day", "The Black Keys", "The Voidz",
  "The 1975", "Oasis", "My Chemical Romance", "The Smile", "Two Door Cinema Club", "Crumb",
  "The Neighbourhood", "Cocteau Twins", "Sea Power", "The Killers", "Temples", "The Raincoats",
  "my bloody valentine", "Twenty One Pilots", "Turnover", "Måneskin", "Franz Ferdinand",
]);
const ELECTRONIC = sets([
  "Daft Punk", "Kavinsky", "ALTÉGO", "Ben Böhmer", "DJ Shadow", "Moby", "Parcels", "Yellow Magic Orchestra",
]);
const SOUL_JAZZ = sets([
  "Laufey", "Sade", "Nicole Wray", "The Temptations", "Yebba", "Stevie Wonder", "Gnarls Barkley",
  "Angel Meléndez", "DON WEST", "The Cat Empire", "Frank Sinatra", "Platina Jazz",
]);
const POP_INDIE = sets([
  "RAYE", "Gracie Abrams", "Peter Cat Recording Co.", "Robbie Williams", "Maroon 5", "Mac DeMarco",
  "The Cardigans", "Mild High Club", "Men I Trust", "Miynt", "The Marías", "Dua Lipa", "Lady Gaga",
  "fun.", "ROSÉ", "Cigarettes After Sex", "Lola Marsh", "Mitski", "Harry Styles", "AJR",
]);
const LATIN_GLOBAL = sets([
  "Bad Bunny", "Eslabon Armado", "MoBlack", "Salif Keïta", "Shakira", "Angel Meléndez", "Redbone",
]);

function categoryFor(track) {
  const primary = canonical(track.artists[0] || "Unknown");
  const key = primary.toLowerCase();
  const info = enrichment[track.artists[0]] || enrichment[primary] || {};
  const tags = (info.tags || []).map((tag) => tag.name.toLowerCase());
  const tagText = tags.join(" ");
  const titleText = `${track.title} ${track.album || ""}`.toLowerCase();

  if (SOUTH_ASIAN.has(key) || /bollywood|tollywood|kollywood|filmi|indian classical|carnatic/.test(tagText)) return "South Asian";
  if (SCORES.has(key) || /soundtrack|film score|video game music|classical|orchestra|composer/.test(tagText)) return "Scores & Classical";
  if (JAPANESE.has(key) || /city pop|j-pop|j-rock|anime|japanese/.test(tagText) || info.country === "JP") return "Japanese & City Pop";
  if (CLASSIC.has(key)) return "Classic Pop & Rock";
  if (HIPHOP.has(key) || /hip hop|hip-hop|rap|trap|r&b|rhythm and blues|neo-soul/.test(tagText)) return "Hip-hop & R&B";
  if (LATIN_GLOBAL.has(key) || /latin|reggaeton|salsa|bossa nova|afrobeat|world music|flamenco/.test(tagText) || ["PR", "MX", "BR", "CU", "CO", "ES", "ML"].includes(info.country)) return "Latin & Global";
  if (SOUL_JAZZ.has(key) || /jazz|soul|funk|disco|swing|motown/.test(tagText)) return "Jazz, Soul & Funk";
  if (ELECTRONIC.has(key) || /electronic|house|techno|dance|synthwave|electronica|trance|ambient/.test(tagText)) return "Electronic & Dance";
  if (ROCK.has(key) || /rock|metal|punk|grunge|alternative|progressive|post-rock|shoegaze/.test(tagText)) return "Rock & Alternative";
  if (POP_INDIE.has(key) || /pop|indie|folk|singer-songwriter|chanson/.test(tagText)) return "Pop & Indie";
  if (/original motion picture soundtrack|telugu|tamil|malayalam|hindi|saahasam|ghajini|darling|mahanati|ee nagaraniki|premalu/.test(titleText)) return "South Asian";
  if (/orchestration|symphony|orchestra|sonata|concerto|op\. \d+|soundtrack|theme from/.test(titleText)) return "Scores & Classical";
  return "Other";
}

const tracks = playlist.tracks.map((track) => ({
  ...track,
  primaryArtist: canonical(track.artists[0] || "Unknown"),
  genre: categoryFor(track),
  country: enrichment[track.artists[0]]?.country || null,
  tags: (enrichment[track.artists[0]]?.tags || []).slice(0, 5).map((tag) => tag.name),
}));

const chronological = [...tracks].reverse();
const seenArtists = new Set();
for (const track of chronological) {
  track.newArtist = !seenArtists.has(track.primaryArtist);
  seenArtists.add(track.primaryArtist);
}

const CHAPTER_SIZE = 100;
const chunks = [];
for (let start = 0; start < tracks.length; start += CHAPTER_SIZE) chunks.push(tracks.slice(start, start + CHAPTER_SIZE));

function entropy(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  const total = values.length;
  const raw = -[...counts.values()].reduce((sum, count) => {
    const p = count / total;
    return sum + p * Math.log(p);
  }, 0);
  return raw / Math.log(Math.max(2, counts.size));
}

const chapters = chunks.map((chunk, index) => {
  const genreCounts = Object.fromEntries(GENRES.map((genre) => [genre, 0]));
  const artistCounts = new Map();
  chunk.forEach((track) => {
    genreCounts[track.genre] += 1;
    artistCounts.set(track.primaryArtist, (artistCounts.get(track.primaryArtist) || 0) + 1);
  });
  const topArtists = [...artistCounts].filter(([name]) => name !== "Unknown").sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
  const representative = chunk
    .map((track) => ({ track, score: artistCounts.get(track.primaryArtist) || 0 }))
    .sort((a, b) => b.score - a.score || a.track.rank - b.track.rank)
    .filter((item, position, all) => item.track.primaryArtist !== "Unknown" && all.findIndex((other) => other.track.primaryArtist === item.track.primaryArtist) === position)
    .slice(0, 4)
    .map((item) => item.track.videoId);
  const dominant = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([genre]) => genre);
  return {
    id: index + 1,
    label: `Chapter ${index + 1}`,
    range: `${chunk[0].rank}-${chunk.at(-1).rank}`,
    direction: index === 0 ? "Newest likes" : index === chunks.length - 1 ? "Oldest likes" : null,
    count: chunk.length,
    genreCounts,
    dominant,
    topArtists,
    representative,
    novelty: Math.round((chunk.filter((track) => track.newArtist).length / chunk.length) * 100),
    eclecticism: Math.round(entropy(chunk.map((track) => track.genre)) * 100),
    explicit: Math.round((chunk.filter((track) => track.explicit).length / chunk.length) * 100),
  };
});

function jsDistance(a, b) {
  const totalA = Object.values(a).reduce((sum, value) => sum + value, 0);
  const totalB = Object.values(b).reduce((sum, value) => sum + value, 0);
  const pa = GENRES.map((genre) => a[genre] / totalA);
  const pb = GENRES.map((genre) => b[genre] / totalB);
  const m = pa.map((value, index) => (value + pb[index]) / 2);
  const kl = (p, q) => p.reduce((sum, value, index) => sum + (value ? value * Math.log2(value / q[index]) : 0), 0);
  return Math.sqrt((kl(pa, m) + kl(pb, m)) / 2);
}

const transitions = chapters.slice(0, -1).map((chapter, index) => ({
  from: chapter.id,
  to: chapters[index + 1].id,
  distance: Number(jsDistance(chapter.genreCounts, chapters[index + 1].genreCounts).toFixed(3)),
})).sort((a, b) => b.distance - a.distance);

const artistCounts = new Map();
tracks.forEach((track) => artistCounts.set(track.primaryArtist, (artistCounts.get(track.primaryArtist) || 0) + 1));
const topArtists = [...artistCounts]
  .filter(([name]) => name !== "Unknown")
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .slice(0, 24)
  .map(([name, count]) => ({
    name,
    count,
    chapters: chapters.map((_, index) => tracks.slice(index * CHAPTER_SIZE, (index + 1) * CHAPTER_SIZE).filter((track) => track.primaryArtist === name).length),
    genre: tracks.find((track) => track.primaryArtist === name)?.genre || "Other",
  }));

const genreTotals = Object.fromEntries(GENRES.map((genre) => [genre, tracks.filter((track) => track.genre === genre).length]));
const overallEntropy = Math.round(entropy(tracks.map((track) => track.genre)) * 100);
const recent = chapters[0];
const oldest = chapters.at(-1);
const biggestShift = transitions[0];

const output = {
  generatedAt: new Date().toISOString(),
  source: {
    reportedCount: playlist.playlistReportedCount,
    visibleCount: tracks.length,
    hiddenCount: playlist.playlistReportedCount - tracks.length,
    order: playlist.order,
    datedTracks: 0,
  },
  genres: GENRES,
  genreTotals,
  chapters,
  transitions,
  topArtists,
  tracks,
  summary: {
    uniqueArtists: artistCounts.size,
    uniqueAlbums: new Set(tracks.map((track) => track.album).filter(Boolean)).size,
    eclecticism: overallEntropy,
    recentDominant: recent.dominant,
    oldestDominant: oldest.dominant,
    biggestShift,
    newestTrack: tracks[0],
    oldestTrack: tracks.at(-1),
  },
};

await fs.writeFile(new URL("data/analysis.json", ROOT), JSON.stringify(output, null, 2));
console.log(`Analyzed ${tracks.length} tracks across ${chapters.length} chapters.`);
