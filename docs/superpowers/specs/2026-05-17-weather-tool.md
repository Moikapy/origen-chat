# Weather Tool Spec — Origen Chat

## Overview
Add a weather tool using the **National Weather Service (NWS) API** (free, no API key, US-only). The LLM calls the tool when users ask about weather, and dedicated UI components render the results.

## NWS API Endpoints Used

| Endpoint | Purpose |
|---|---|
| `GET /points/{lat},{lon}` | Lat/lon → gridpoint mapping, city/state, timezone, sunrise/sunset |
| `GET /gridpoints/{wfo}/{x},{y}/forecast` | 7-day forecast (12h periods) |
| `GET /gridpoints/{wfo}/{x},{y}/forecast/hourly` | Hourly forecast (7 days) |
| `GET /alerts?point={lat},{lon}` | Active weather alerts for a point |

All endpoints are free, require no API key, and return JSON. Must set `User-Agent` header.

## Flow: User → LLM → Tool → UI

1. User types "What's the weather like?" or "Do I need a jacket in NYC?"
2. LLM calls `get_weather` tool with location (city name or "current" for GPS)
3. Tool resolves location, fetches NWS data, returns structured JSON
4. Chat renders weather response with dedicated UI components

## Location Resolution

The tool accepts these location formats:
- **City name**: "New York", "Los Angeles" → geocode via NWS `/points` after resolving lat/lon
- **ZIP code**: "10001" → geocode
- **"current"**: Request user's GPS position (browser geolocation API)

### GPS Flow (Client-Side)
1. Tool returns `{ needsLocation: true }` when location is "current"
2. Frontend prompts for Geolocation API permission
3. On success, re-sends message with `{ latitude, longitude }` in the tool call
4. If denied, falls back to asking user for city/ZIP

### Location Caching
- Last known location stored in `localStorage` as `origen_location`
- Includes lat, lon, city, state, timestamp
- Auto-used when user says "weather" without specifying location

## Tool Definition

```json
{
  "name": "get_weather",
  "description": "Get current weather conditions, forecasts, and alerts for a US location. Use this when the user asks about weather, temperature, rain, snow, forecasts, or whether they need a jacket/umbrella. Supports city names, ZIP codes, or 'current' for GPS location.",
  "parameters": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "City name ('New York'), ZIP code ('10001'), or 'current' for GPS location"
      },
      "latitude": { "type": "number", "description": "Latitude (if known from GPS)" },
      "longitude": { "type": "number", "description": "Longitude (if known from GPS)" },
      "type": {
        "type": "string",
        "enum": ["current", "forecast", "hourly", "alerts"],
        "description": "Type of weather data. Default: 'current' for current conditions, 'forecast' for 7-day, 'hourly' for hourly breakdown, 'alerts' for active warnings."
      }
    },
    "required": ["location"]
  }
}
```

## Tool Response Format

The tool returns JSON with a `type` field the UI uses for rendering:

### Current Conditions (`type: "current"`)
```json
{
  "type": "current",
  "location": { "city": "Hoboken", "state": "NJ", "lat": 40.71, "lon": -74.01 },
  "condition": "Partly Cloudy",
  "temperature": 72,
  "temperatureUnit": "F",
  "humidity": 45,
  "windSpeed": "10 mph",
  "windDirection": "NW",
  "feelsLike": 70,
  "icon": "https://api.weather.gov/icons/land/day/sct?size=medium",
  "description": "Partly cloudy, with a high near 72.",
  "sunrise": "2026-05-16T05:36:08-04:00",
  "sunset": "2026-05-16T20:08:41-04:00"
}
```

### Forecast (`type: "forecast"`)
```json
{
  "type": "forecast",
  "location": { "city": "Hoboken", "state": "NJ" },
  "periods": [
    {
      "name": "Today",
      "startTime": "2026-05-16T06:00:00-04:00",
      "endTime": "2026-05-16T18:00:00-04:00",
      "isDaytime": true,
      "temperature": 72,
      "temperatureUnit": "F",
      "windSpeed": "10 mph",
      "windDirection": "NW",
      "icon": "https://api.weather.gov/icons/land/day/sct?size=medium",
      "shortForecast": "Partly Cloudy",
      "detailedForecast": "Partly cloudy, with a high near 72. Northwest wind around 10 mph."
    }
  ]
}
```

### Alerts (`type: "alerts"`)
```json
{
  "type": "alerts",
  "location": { "city": "Hoboken", "state": "NJ" },
  "alerts": [
    {
      "id": "https://api.weather.gov/alerts/...",
      "event": "Heat Advisory",
      "severity": "Moderate",
      "urgency": "Expected",
      "headline": "Heat Advisory in effect from 12 PM to 8 PM EDT",
      "description": "...",
      "instruction": "...",
      "starts": "2026-05-16T12:00:00-04:00",
      "expires": "2026-05-16T20:00:00-04:00"
    }
  ]
}
```

## UI Components

### WeatherCard (current conditions)
- Large temperature + condition icon
- City/state label
- Feels like, humidity, wind
- Sunrise/sunset times

### ForecastStrip (forecast periods)
- Horizontal scrollable strip of day/night periods
- Each card: day name, icon, hi/lo temps, short forecast

### AlertBanner (active alerts)
- Color-coded by severity (Extreme=red, Severe=orange, Moderate=yellow, Minor=green)
- Expandable for full description
- Expires time shown

## Implementation Plan

1. **`lib/tools/weather.ts`** — Tool definition + NWS API calls
2. **`lib/weather-client.ts`** — NWS API client (fetch, User-Agent, caching)
3. **`lib/use-location.ts`** — Geolocation hook + localStorage cache
4. **`components/weather-card.tsx`** — Current conditions renderer
5. **`components/weather-forecast.tsx`** — Forecast strip
6. **`components/weather-alert.tsx`** — Alert banner
7. Wire tool into `lib/tools/index.ts` and agent config
8. Add weather-specific rendering in chat message component