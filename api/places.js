module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed. Use POST /api/places." });
    return;
  }

  const apiKey = String(process.env.FOURSQUARE_API_KEY || "").trim();
  if (!apiKey) {
    response.status(503).json({ error: "Primary places provider is unavailable: FOURSQUARE_API_KEY is not configured on the server." });
    return;
  }

  const { latitude, longitude, radius = 5000 } = request.body || {};
  const numericLatitude = Number(latitude);
  const numericLongitude = Number(longitude);
  const numericRadius = Number(radius);
  if (!Number.isFinite(numericLatitude) || numericLatitude < -90 || numericLatitude > 90 ||
      !Number.isFinite(numericLongitude) || numericLongitude < -180 || numericLongitude > 180 ||
      !Number.isFinite(numericRadius) || numericRadius < 1000 || numericRadius > 20000) {
    response.status(400).json({ error: "latitude and longitude must be valid coordinates; radius must be between 1000 and 20000 meters." });
    return;
  }

  const url = new URL("https://places-api.foursquare.com/places/search");
  url.searchParams.set("ll", `${numericLatitude},${numericLongitude}`);
  url.searchParams.set("radius", String(numericRadius));
  url.searchParams.set("limit", "50");
  url.searchParams.set("sort", "DISTANCE");
  url.searchParams.set("fields", "fsq_place_id,name,categories,location,latitude,longitude,distance,tel,website,description,hours,photos,price,rating,stats");

  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    "X-Places-Api-Version": "2025-06-17",
  };

  const sanitizeBody = (body) => body.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]").slice(0, 1000);

  try {
    const upstream = await fetch(url, { headers });
    if (upstream.status === 401 || upstream.status === 403) {
      const errorBody = sanitizeBody(await upstream.text());
      console.error(`Foursquare places request rejected credentials (HTTP ${upstream.status}): ${errorBody}`);
      response.status(502).json({ error: "Foursquare rejected the server credentials. Check FOURSQUARE_API_KEY." });
      return;
    }
    if (upstream.status === 429) {
      const errorBody = sanitizeBody(await upstream.text());
      console.error(`Foursquare places request rate limited (HTTP 429): ${errorBody}`);
      response.status(429).json({ error: "Foursquare rate limit reached. Please retry later." });
      return;
    }
    if (!upstream.ok) {
      const errorBody = sanitizeBody(await upstream.text());
      console.error(`Foursquare places request failed (HTTP ${upstream.status}): ${errorBody}`);
      response.status(502).json({ error: `Foursquare places request failed with HTTP ${upstream.status}.` });
      return;
    }
    const body = await upstream.json();
    const places = Array.isArray(body.results) ? [...body.results] : [];
    let nextUrl = upstream.headers.get("link");
    let pageCount = 1;
    while (nextUrl && pageCount < 2 && places.length < 100) {
      const next = await fetch(new URL(nextUrl, url), { headers });
      if (!next.ok) {
        const errorBody = sanitizeBody(await next.text());
        console.error(`Foursquare pagination request failed (HTTP ${next.status}): ${errorBody}`);
        break;
      }
      const nextBody = await next.json();
      if (!Array.isArray(nextBody.results) || !nextBody.results.length) break;
      places.push(...nextBody.results);
      nextUrl = next.headers.get("link");
      pageCount += 1;
    }
    response.status(200).json({ places });
  } catch (error) {
    console.error(`Foursquare places request failed: ${error instanceof Error ? error.message : "unknown error"}`);
    response.status(502).json({ error: "Foursquare places request could not be completed." });
  }
};
