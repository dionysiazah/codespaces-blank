# Orbit Earth Travel Discovery

This is a Three.js globe app with worldwide live place discovery.

## Place discovery

Destination coordinates come from Nominatim. Place discovery uses OpenStreetMap through the server-side `/api/places` route and public Overpass mirrors. Queries are built from the selected coordinates, radius, and categories; results are cached for ten minutes and are never replaced with fabricated data.

The API tries Overpass servers sequentially, with a timeout, delayed retries, and failover for HTTP 429, 502, 503, and 504 responses. If all servers fail, the discovery panel shows an error and offers a retry. Place cards link to the corresponding OpenStreetMap object and display the required attribution.

## Local development with Vercel

The `/api/places` endpoint is a Vercel Node.js serverless function. Use Vercel's local runtime rather than Python's static server so the API route is available:

```sh
npm install
npx vercel login
npx vercel link
npx vercel dev
```

When prompted, use `http://localhost:3000/`. If you prefer a local `.env.local`, create it from `.env.example`, set the real key there, and never commit it:

```sh
cp .env.example .env.local
npx vercel dev
```

Do not use `python3 -m http.server` for full local development; it serves `index.html` but returns 404 for `/api/places`.

No API key is required for place discovery. The public Overpass services have their own usage policies and availability limits.

## Deployment verification

After deployment, verify the server-side route without exposing the key:

```sh
curl -i -X POST https://YOUR_DOMAIN/api/places \
  -H "Content-Type: application/json" \
  -d '{"latitude":37.9838,"longitude":23.7275,"radius":5000}'
```

The response should contain a `places` array and `source: "OpenStreetMap"`. A `502` means all configured Overpass servers failed; retry the request later.
