/**
 * Weather tool — gives the LLM access to current conditions, forecasts,
 * and alerts via the National Weather Service API.
 *
 * Handles:
 * - City/ZIP geocoding
 * - GPS location ("current")
 * - Current conditions, 7-day forecast, hourly breakdown, alerts
 * - Structured JSON output for UI rendering
 */

import type { OrigenTool } from "@moikapy/origen";
import {
  geocodeLocation,
  getPoint,
  getForecast,
  getHourlyForecast,
  getAlerts,
  getCurrentObservation,
  type ForecastPeriod,
  type WeatherAlert,
} from "@/lib/weather-client";

export const weatherTool: OrigenTool = {
  name: "get_weather",
  description:
    "Get weather information for a US location. Supports current conditions, 7-day forecasts, hourly forecasts, and active weather alerts. " +
    "Use this when the user asks about weather, temperature, rain, snow, what to wear, whether to bring an umbrella, or any weather-related question. " +
    "The location can be a city name ('New York'), ZIP code ('10001'), or 'current' for the user's GPS location. " +
    "The type parameter controls what data to return: 'current' (default), 'forecast', 'hourly', or 'alerts'.",
  parameters: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "City name ('New York', 'Los Angeles'), ZIP code ('10001'), or 'current' for GPS location. Required.",
      },
      latitude: {
        type: "number",
        description: "Latitude from GPS. Only needed if location is 'current' and GPS coordinates are available.",
      },
      longitude: {
        type: "number",
        description: "Longitude from GPS. Only needed if location is 'current' and GPS coordinates are available.",
      },
      type: {
        type: "string",
        enum: ["current", "forecast", "hourly", "alerts"],
        description: "Type of weather data: 'current' for conditions right now, 'forecast' for 7-day outlook, 'hourly' for hour-by-hour, 'alerts' for active warnings. Default: 'current'.",
      },
    },
    required: ["location"],
  },
  execute: async (args: Record<string, unknown>) => {
    const location = args.location as string;
    const type = (args.type as string) || "current";

    try {
      // Resolve lat/lon
      let lat: number;
      let lon: number;
      let city: string;
      let state: string;

      if (location.toLowerCase() === "current" && args.latitude && args.longitude) {
        lat = args.latitude as number;
        lon = args.longitude as number;
        city = "Current Location";
        state = "";
      } else if (location.toLowerCase() === "current") {
        return JSON.stringify({
          type: "needs_location",
          message: "Please share your location to get current weather. You can also specify a city name or ZIP code.",
        });
      } else {
        const geo = await geocodeLocation(location);
        lat = geo.lat;
        lon = geo.lon;
        city = geo.city;
        state = geo.state;
      }

      // Get point data (gridpoint mapping)
      const point = await getPoint(lat, lon);
      city = city || point.city;
      state = state || point.state;

      const locationInfo = { city, state, lat, lon };

      switch (type) {
        case "current": {
          return await handleCurrent(point, locationInfo);
        }
        case "forecast": {
          return await handleForecast(point, locationInfo);
        }
        case "hourly": {
          return await handleHourly(point, locationInfo);
        }
        case "alerts": {
          return await handleAlerts(lat, lon, locationInfo);
        }
        default: {
          return await handleCurrent(point, locationInfo);
        }
      }
    } catch (err) {
      return JSON.stringify({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to fetch weather data. Please try again.",
      });
    }
  },
};

async function handleCurrent(point: Awaited<ReturnType<typeof getPoint>>, locationInfo: { city: string; state: string; lat: number; lon: number }) {
  // Fetch forecast (first period = current) + observation
  const [periods, observation] = await Promise.all([
    getForecast(point.forecastUrl).catch(() => []),
    getCurrentObservation(point.observationStationsUrl).catch(() => null),
  ]);

  const current = periods[0];
  if (!current && !observation) {
    return JSON.stringify({ type: "error", message: "No weather data available for this location." });
  }

  return JSON.stringify({
    type: "current",
    location: locationInfo,
    timezone: point.timeZone,
    condition: observation?.description || current?.shortForecast || "Unknown",
    temperature: observation?.temperature || current?.temperature || 0,
    temperatureUnit: "F",
    feelsLike: observation?.feelsLike || null,
    humidity: observation?.humidity || 0,
    windSpeed: observation?.windSpeed || current?.windSpeed || "N/A",
    windDirection: observation?.windDirection || current?.windDirection || "",
    icon: observation?.icon || current?.icon || "",
    description: current?.detailedForecast || "",
    sunrise: point.sunrise || "",
    sunset: point.sunset || "",
    visibility: observation?.visibility || "N/A",
  });
}

async function handleForecast(point: Awaited<ReturnType<typeof getPoint>>, locationInfo: { city: string; state: string; lat: number; lon: number }) {
  const periods = await getForecast(point.forecastUrl);

  return JSON.stringify({
    type: "forecast",
    location: locationInfo,
    timezone: point.timeZone,
    periods: periods.slice(0, 14).map(formatPeriod),
  });
}

async function handleHourly(point: Awaited<ReturnType<typeof getPoint>>, locationInfo: { city: string; state: string; lat: number; lon: number }) {
  const periods = await getHourlyForecast(point.forecastHourlyUrl);

  return JSON.stringify({
    type: "hourly",
    location: locationInfo,
    timezone: point.timeZone,
    periods: periods.slice(0, 24).map(formatPeriod),
  });
}

async function handleAlerts(lat: number, lon: number, locationInfo: { city: string; state: string; lat: number; lon: number }) {
  const alerts = await getAlerts(lat, lon);

  return JSON.stringify({
    type: "alerts",
    location: locationInfo,
    alerts: alerts.map(formatAlert),
  });
}

function formatPeriod(p: ForecastPeriod) {
  return {
    name: p.name,
    startTime: p.startTime,
    endTime: p.endTime,
    isDaytime: p.isDaytime,
    temperature: p.temperature,
    temperatureUnit: p.temperatureUnit,
    windSpeed: p.windSpeed,
    windDirection: p.windDirection,
    icon: p.icon,
    shortForecast: p.shortForecast,
    detailedForecast: p.detailedForecast,
  };
}

function formatAlert(a: WeatherAlert) {
  return {
    event: a.event,
    severity: a.severity,
    urgency: a.urgency,
    headline: a.headline,
    description: a.description,
    instruction: a.instruction,
    starts: a.starts,
    expires: a.expires,
  };
}

export function createWeatherTool(): OrigenTool {
  return weatherTool;
}