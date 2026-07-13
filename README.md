# YouTube Music Taste Cosmos

An interactive, local analysis of an ordered YouTube Music Liked playlist and Google Takeout watch history. The current snapshot contains 1,111 visible likes and 14,185 music watch events.

## Rebuild

The generated analysis is deterministic once the playlist snapshot and Takeout archive are fixed.

```bash
npm install
npm run refresh -- /absolute/path/to/takeout-archive.zip
npm run dev
```

Open `http://127.0.0.1:3000`. If the private Takeout data has already been imported, `npm run refresh` reuses it.

Before a future refresh, replace `data/liked-music.json` with a new newest-first capture of the signed-in Liked Music playlist. YouTube virtualizes this private page, so playlist capture remains a browser-authenticated input; every downstream step is scripted.

## Pipeline

- `scripts/import-takeout.mjs` parses structured history HTML and records the archive SHA-256.
- `scripts/enrich-artists.mjs` updates MusicBrainz tags and country metadata.
- `scripts/build-analysis.mjs` builds the ordered playlist summary.
- `scripts/build-taste-model.mjs` reconciles exact likes, watch anchors, sessions, and replay behavior.
- `scripts/build-cosmos.mjs` creates a seeded 223-feature UMAP projection and ten-cluster model.

Raw Takeout contents and parsed private watch history live under `data/raw/` and `data/private/`; both directories are gitignored. The public visualization data contains track metadata and aggregate behavior, but no Google account credentials.
