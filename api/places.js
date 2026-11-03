const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
];
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15000;
const RETRY_DELAY_MS = 500;
const MAX_ATTEMPTS_PER_SERVER = 2;
const cache = new Map();

const CATEGORY_TAGS = {
  "Food & Restaurants": [
    '[amenity~"restaurant|fast_food|food_court|biergarten|marketplace"]',
    '[shop~"bakery|deli|confectionery|greengrocer|supermarket"]',
  ],
  Cafes: ['[amenity="cafe"]'],
  "Nightlife & Bars": ['[amenity~"bar|pub|nightclub|music_venue"]'],
  "Parks & Nature": [
    '[leisure~"park|garden|nature_reserve|golf_course"]',
    '[tourism~"viewpoint|beach"]',
  ],
  "Museums & Culture": [
    '[tourism~"museum|gallery"]',
    '[historic~"archaeological_site|castle|fort|memorial|monument|ruins|wayside_shrine|boundary_stone|manor|palace|city_gate"]',
  ],
  "Activities & Entertainment": [
    '[tourism~"attraction|theme_park|zoo|aquarium|arts_centre"]',
    '[leisure~"sports_centre|stadium|water_park"]',
  ],
  Shopping: ["[shop]", "[craft]", "[office]"],
};

function isValidCoordinate(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function selectedTagFilters(categories) {
  const filters = new Set();
  for (const category of categories) {
    for (const filter of CATEGORY_TAGS[category] || []) filters.add(filter);
  }
  return [...filters];
}

function buildQuery(latitude, longitude, radius, categories) {
  const filters = selectedTagFilters(categories);
  const clauses = filters.map((filter) =>
    `nwr(around:${radius},${latitude},${longitude})[name]${filter};`,
  );
  return `[out:json][timeout:25];(${clauses.join("")});out center tags;`;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithTimeout(url, query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "text/plain;charset=UTF-8",
        "User-Agent": "Orbit Earth Travel Discovery/1.0 (OpenStreetMap client)",
      },
      body: query,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function cacheKey(latitude, longitude, radius, categories) {
  return [latitude.toFixed(4), longitude.toFixed(4), radius, [...categories].sort().join(",")].join("|");
}

async function requestOverpass(query) {
  const failures = [];
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_SERVER; attempt += 1) {
      try {
        const upstream = await fetchWithTimeout(endpoint, query);
        if (upstream.ok) {
          const body = await upstream.json();
          return Array.isArray(body.elements) ? body.elements : [];
        }

        failures.push(`${new URL(endpoint).hostname} HTTP ${upstream.status}`);
        const retryable = [429, 502, 503, 504].includes(upstream.status);
        if (!retryable || attempt === MAX_ATTEMPTS_PER_SERVER) break;
      } catch (error) {
        failures.push(`${new URL(endpoint).hostname} ${error.name === "AbortError" ? "timeout" : "network error"}`);
        if (attempt === MAX_ATTEMPTS_PER_SERVER) break;
      }
      await wait(RETRY_DELAY_MS * attempt);
    }
  }
  throw new Error(`All Overpass servers failed: ${failures.join("; ")}`);
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed. Use POST /api/places." });
    return;
  }

  const body = request.body || {};
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const radius = Number(body.radius ?? 5000);
  const categories = Array.isArray(body.categories)
    ? body.categories.filter((category) => Object.prototype.hasOwnProperty.call(CATEGORY_TAGS, category))
    : Object.keys(CATEGORY_TAGS);

  if (!isValidCoordinate(latitude, -90, 90) ||
      !isValidCoordinate(longitude, -180, 180) ||
      !Number.isFinite(radius) || radius < 1000 || radius > 20000 ||
      !categories.length) {
    response.status(400).json({
      error: "latitude and longitude must be valid coordinates; radius must be between 1000 and 20000 meters.",
    });
    return;
  }

  const key = cacheKey(latitude, longitude, radius, categories);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    response.setHeader("Cache-Control", "public, max-age=600");
    response.status(200).json({ places: cached.elements, source: "OpenStreetMap" });
    return;
  }
  cache.delete(key);

  try {
    const elements = await requestOverpass(buildQuery(latitude, longitude, radius, categories));
    cache.set(key, { elements, expiresAt: Date.now() + CACHE_TTL_MS });
    response.setHeader("Cache-Control", "public, max-age=600");
    response.status(200).json({ places: elements, source: "OpenStreetMap" });
  } catch (error) {
    console.error(`Overpass places request failed: ${error instanceof Error ? error.message : "unknown error"}`);
    response.status(502).json({
      error: "OpenStreetMap discovery is temporarily unavailable. Please try again.",
    });
  }
};
