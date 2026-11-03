# Orbit Earth Travel Discovery

This is a Three.js globe app with worldwide live place discovery.

## Place discovery

Destination coordinates come from Nominatim. Place discovery combines an optional server-side Foursquare Places search with OpenStreetMap Overpass results. Results are merged by name and proximity, cached for ten minutes, and never replaced with city-specific fabricated data.

OpenStreetMap works without an API key through multiple public Overpass mirrors. Foursquare adds business photos, ratings, prices, hours, phone numbers, and websites when configured. If one provider fails, the other provider can still supply results. If both fail, the actual error appears in the discovery panel.

## Local development with Vercel

The `/api/places` endpoint is a Vercel Node.js serverless function. Use Vercel's local runtime rather than Python's static server so the API route is available:

```sh
npm install
npx vercel login
npx vercel link
npx vercel env add FOURSQUARE_API_KEY development
npx vercel dev
```

When prompted, use `http://localhost:3000/`. If you prefer a local `.env.local`, create it from `.env.example`, set the real key there, and never commit it:

```sh
cp .env.example .env.local
# edit .env.local and set FOURSQUARE_API_KEY
npx vercel dev
```

Do not use `python3 -m http.server` for full local development; it serves `index.html` but returns 404 for `/api/places`.

## Foursquare setup

1. Create a Foursquare Service API Key in the Foursquare Developer Console.
2. Import this repository into Vercel, or run `npx vercel` from the repository root.
3. In Vercel Project Settings → Environment Variables, add the Service API Key as `FOURSQUARE_API_KEY` for the required environments.
4. Redeploy after changing environment variables.
5. Do not put the key in `index.html`, public environment variables, or committed files.

Foursquare availability, quotas, and pricing depend on the account plan. OpenStreetMap/Overpass remains the no-key fallback, subject to public service usage policies.

## Deployment verification

After deployment, verify the server-side route without exposing the key:

```sh
curl -i -X POST https://YOUR_DOMAIN/api/places \
  -H "Content-Type: application/json" \
  -d '{"latitude":37.9838,"longitude":23.7275,"radius":5000}'
```

The response should contain a `places` array. The API key must never appear in the response or browser source. A `503` means the server variable is missing; `502` means the upstream request or credentials failed; `429` means Foursquare rate limiting was reached.
