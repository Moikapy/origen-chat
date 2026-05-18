/**
 * NWS Weather API client — free, no API key, US-only.
 *
 * All endpoints return JSON-LD. We extract the data we need.
 * Must set a User-Agent header or NWS returns 403.
 *
 * Flow: location → /points/{lat},{lon} → gridpoint URLs → forecast/alerts
 */

const NWS_BASE = "https://api.weather.gov";
const USER_AGENT = "OrigenChat/1.0 (origen-chat.moikapy.workers.dev)";

// ── Geocoding ──────────────────────────────────────────────────────────
// NWS doesn't have a geocoding endpoint. We use Nominatim (OpenStreetMap)
// to convert city names and ZIP codes to lat/lon.

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";

interface GeoResult {
  lat: number;
  lon: number;
  city: string;
  state: string;
  displayName: string;
}

export async function geocodeLocation(query: string): Promise<GeoResult> {
  const q = /\d{5}/.test(query) ? `${query}, USA` : `${query}, USA`;

  const url = `${NOMINATIM_BASE}?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=us`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!res.ok) {
    throw new Error(`Geocoding failed for "${query}": ${res.status}`);
  }

  const results = await res.json() as Array<{
    lat: string;
    lon: string;
    name: string;
    display_name: string;
    address?: { city?: string; state?: string; town?: string; village?: string };
  }>;

  if (!results.length) {
    throw new Error(`Location not found: "${query}". Try a US city name or ZIP code.`);
  }

  const r = results[0];
  const city = r.address?.city || r.address?.town || r.address?.village || r.name;
  const state = r.address?.state || "";

  return {
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    city,
    state,
    displayName: r.display_name,
  };
}

// ── NWS Points ─────────────────────────────────────────────────────────

interface NWSPoint {
  gridId: string;
  gridX: number;
  gridY: number;
  city: string;
  state: string;
  timeZone: string;
  sunrise?: string;
  sunset?: string;
  forecastUrl: string;
  forecastHourlyUrl: string;
  observationStationsUrl: string;
}

export async function getPoint(lat: number, lon: number): Promise<NWSPoint> {
  const url = `${NWS_BASE}/points/${lat.toFixed(4)},${lon.toFixed(4)}`;
  const data = await nwsFetch(url);
  const props = data.properties || data;
  const rel = props.relativeLocation?.properties || {};

  return {
    gridId: props.gridId,
    gridX: props.gridX,
    gridY: props.gridY,
    city: rel.city || "",
    state: rel.state || "",
    timeZone: props.timeZone || "America/New_York",
    sunrise: props.astronomicalData?.sunrise,
    sunset: props.astronomicalData?.sunset,
    forecastUrl: props.forecast,
    forecastHourlyUrl: props.forecastHourly,
    observationStationsUrl: props.observationStations,
  };
}

// ── NWS Forecast ────────────────────────────────────────────────────────

export interface ForecastPeriod {
  name: string;
  startTime: string;
  endTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  windSpeed: string;
  windDirection: string;
  icon: string;
  shortForecast: string;
  detailedForecast: string;
}

export async function getForecast(forecastUrl: string): Promise<ForecastPeriod[]> {
  const data = await nwsFetch(forecastUrl);
  // JSON-LD format: periods at top level or in properties
  const periods = data.periods || data.properties?.periods || [];
  return periods;
}

export async function getHourlyForecast(hourlyUrl: string): Promise<ForecastPeriod[]> {
  const data = await nwsFetch(hourlyUrl);
  const periods = data.periods || data.properties?.periods || [];
  return periods;
}

// ── NWS Alerts ──────────────────────────────────────────────────────────

export interface WeatherAlert {
  id: string;
  event: string;
  severity: "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown";
  urgency: string;
  headline: string;
  description: string;
  instruction: string;
  starts: string;
  expires: string;
}

export async function getAlerts(lat: number, lon: number): Promise<WeatherAlert[]> {
  const url = `${NWS_BASE}/alerts?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
  const data = await nwsFetch(url);

  // JSON-LD alerts come in @graph, regular JSON in features
  const features = data.features || data["@graph"] || [];
  return features.map((f: any) => {
    const props = f.properties || f;
    return {
      id: f.id || props.id || "",
      event: props.event || "",
      severity: props.severity || "Unknown",
      urgency: props.urgency || "",
      headline: props.headline || props.event || "",
      description: props.description || "",
      instruction: props.instruction || "",
      starts: props.onset || props.effective || "",
      expires: props.expires || "",
    };
  });
}

// ── NWS Current Observation ─────────────────────────────────────────────

export interface CurrentObservation {
  temperature: number;
  temperatureUnit: string;
  description: string;
  icon: string;
  windSpeed: string;
  windDirection: string;
  humidity: number;
  feelsLike: number | null;
  visibility: string;
}

export async function getCurrentObservation(stationsUrl: string): Promise<CurrentObservation | null> {
  try {
    const data = await nwsFetch(stationsUrl);
    // JSON-LD: observationStations is an array of URLs
    const stationUrls: string[] = data.observationStations || (data.features || []).map((f: any) => f.id || f).filter(Boolean);
    if (!stationUrls.length) return null;

    const stationUrl = stationUrls[0];
    const stationId = stationUrl.split("/").pop();
    if (!stationId) return null;

    return getObservationForStation(stationId);
  } catch {
    return null;
  }
}

async function getObservationForStation(stationId: string): Promise<CurrentObservation | null> {
  try {
    const url = `${NWS_BASE}/stations/${stationId}/observations/latest`;
    const data = await nwsFetch(url);
    const props = data.properties || data;

    return {
      temperature: fahrenheitFromCelsius(props.temperature?.value),
      temperatureUnit: "F",
      description: props.textDescription || "",
      icon: props.icon || "",
      windSpeed: props.windSpeed?.value != null
        ? `${Math.round(props.windSpeed.value * 0.621371)} mph` // km/h to mph
        : "N/A",
      windDirection: props.windDirection?.value != null
        ? degreeToDirection(props.windDirection.value)
        : "",
      humidity: props.relativeHumidity?.value != null
        ? Math.round(props.relativeHumidity.value)
        : 0,
      feelsLike: props.heatIndex?.value != null
        ? fahrenheitFromCelsius(props.heatIndex.value)
        : props.windChill?.value != null
          ? fahrenheitFromCelsius(props.windChill.value)
          : null,
      visibility: props.visibility?.value != null
        ? `${Math.round(props.visibility.value * 0.000621371 * 10) / 10} mi`
        : "N/A",
    };
  } catch {
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function nwsFetch(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "application/ld+json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`NWS API error: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`);
  }

  return res.json();
}

function fahrenheitFromCelsius(c: number | null | undefined): number {
  if (c == null) return 0;
  return Math.round(c * 9 / 5 + 32);
}

function degreeToDirection(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}