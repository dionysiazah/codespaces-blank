# Orbit Earth Travel Discovery

This is a single-file Three.js globe app with browser-based OpenStreetMap discovery.

## Place discovery

Destination coordinates come from Nominatim. Place discovery uses one combined Overpass QL request against `overpass-api.de`, with a public mirror fallback. The query retrieves named restaurants, cafes, nightlife, museums, attractions, parks, historic places, markets, and local shops as nodes, ways, and relations.

The app starts with a 12 km search radius and retries once at 25 km when no valid places are found. If Overpass is unavailable, the actual API failure appears in the discovery panel with a retry action. The app never presents fake places as real results.

## Local development

Opening `index.html` through a static server still works. The browser calls the public Overpass endpoint directly, so no API key is required.

A static Python server can be started with:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173/`.
