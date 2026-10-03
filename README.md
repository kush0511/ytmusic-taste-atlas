# YouTube Music Taste Atlas

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

## Interface

The Next.js static site opens as a personal mixtape sleeve and adapts to phone, tablet, and desktop widths. Its mobile navigation links to the map, evolution, listening rhythm, and replays.

- The complete song map spans the phone width. Drag a finger or pointer to continuously select the nearest visible song; the page does not scroll while scrubbing the plot. Expand the map to fill the available viewport, with a persistent song dock and compact controls. Region selection zooms to that region, search selects a song, and left/right arrow keys browse songs when the map is focused. The expanded view supports Escape, focus trapping, and restores page scrolling when closed.
- Evolution compares the oldest 200 and newest 200 playlist positions using labeled paired bars.
- The weekday / four-hour heatmap uses Singapore time and only exact or watch-anchored like dates. The exact-only filter excludes estimated dates; interpolated dates never enter the heatmap.
- Session browsing exposes the 60 exported high-energy sessions, while the evidence section reports the full 1,457-session dataset.
- Artwork and song links come from YouTube. Watch events are not guaranteed complete listens, and alternate video uploads can appear outside the current liked snapshot.

## Validation and deployment

Run `npm run lint` and `npm run build` before publishing. The Pages workflow runs both checks and deploys the static `out/` artifact on pushes to `main`. Private raw data remains excluded by `.gitignore`.

For UI verification, check widths 320, 360, 390, 430, 768, 1024, and 1440 pixels, including map selection, region reset, empty search, both date-confidence filters, session boundaries, replay tabs, and source disclosures. The heatmap should sum to 245 likes in the combined view and 88 in the exact-only view for the current snapshot.
