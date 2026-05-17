"use client";

import { useState } from "react";

// ── Types ───────────────────────────────────────────────────────────────

interface WeatherLocation {
  city: string;
  state: string;
  lat: number;
  lon: number;
}

interface CurrentWeather {
  type: "current";
  location: WeatherLocation;
  timezone: string;
  condition: string;
  temperature: number;
  temperatureUnit: string;
  feelsLike: number | null;
  humidity: number;
  windSpeed: string;
  windDirection: string;
  icon: string;
  description: string;
  sunrise: string;
  sunset: string;
  visibility: string;
}

interface ForecastPeriod {
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

interface ForecastWeather {
  type: "forecast";
  location: WeatherLocation;
  timezone: string;
  periods: ForecastPeriod[];
}

interface HourlyWeather {
  type: "hourly";
  location: WeatherLocation;
  timezone: string;
  periods: ForecastPeriod[];
}

interface AlertData {
  event: string;
  severity: "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown";
  urgency: string;
  headline: string;
  description: string;
  instruction: string;
  starts: string;
  expires: string;
}

interface AlertsWeather {
  type: "alerts";
  location: WeatherLocation;
  alerts: AlertData[];
}

interface LocationNeeded {
  type: "needs_location";
  message: string;
}

type WeatherData = CurrentWeather | ForecastWeather | HourlyWeather | AlertsWeather | LocationNeeded | { type: "error"; message: string };

// ── Weather Icon Mapping ────────────────────────────────────────────────
// NWS icon URLs contain codes like /day/sct, /night/rain, etc.
// We map to simple text labels since we're text-only (no emojis policy).

function getConditionIcon(iconUrl: string): string {
  if (!iconUrl) return "—";
  const parts = iconUrl.split("/");
  const code = parts[parts.length - 2] || "";
  const isDay = code.startsWith("day") || !code.startsWith("night");

  if (iconUrl.includes("snow")) return isDay ? "❅" : "❅";
  if (iconUrl.includes("rain") || iconUrl.includes("shwr")) return "🌧";
  if (iconUrl.includes("tstms") || iconUrl.includes("tsra")) return "⛈";
  if (iconUrl.includes("fg") || iconUrl.includes("fog")) return "🌫";
  if (iconUrl.includes("wind")) return "💨";
  if (iconUrl.includes("sct") || iconUrl.includes("few")) return isDay ? "⛅" : "☁";
  if (iconUrl.includes("bkn") || iconUrl.includes("ovc")) return "☁";
  if (iconUrl.includes("clr") || iconUrl.includes("sunny")) return isDay ? "☀" : "🌙";
  return isDay ? "☀" : "🌙";
}

function formatTime(iso: string, tz?: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    });
  } catch {
    return iso;
  }
}

function formatDay(iso: string, tz?: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = date.toDateString() === tomorrow.toDateString();

    if (isToday) return "Today";
    if (isTomorrow) return "Tomorrow";

    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: tz,
    });
  } catch {
    return iso;
  }
}

function severityColor(severity: string): string {
  switch (severity) {
    case "Extreme": return "border-red-500/50 bg-red-500/10 text-red-400";
    case "Severe": return "border-orange-500/50 bg-orange-500/10 text-orange-400";
    case "Moderate": return "border-yellow-500/50 bg-yellow-500/10 text-yellow-400";
    case "Minor": return "border-green-500/50 bg-green-500/10 text-green-400";
    default: return "border-border bg-card text-foreground";
  }
}

// ── Weather Card (renders any weather data type) ─────────────────────────

export function WeatherCard({ data }: { data: string }) {
  let parsed: WeatherData;
  try {
    parsed = JSON.parse(data);
  } catch {
    return <div className="text-sm text-muted-foreground">Invalid weather data</div>;
  }

  if (parsed.type === "needs_location") {
    return (
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 my-2">
        <p className="text-sm text-foreground">{parsed.message}</p>
        <p className="text-xs text-muted-foreground mt-1">Try asking with a city name, like: &quot;Weather in New York&quot;</p>
      </div>
    );
  }

  if (parsed.type === "error") {
    return <div className="text-sm text-red-400">{(parsed as any).message}</div>;
  }

  switch (parsed.type) {
    case "current":
      return <CurrentConditionsCard data={parsed} />;
    case "forecast":
      return <ForecastCard data={parsed} />;
    case "hourly":
      return <HourlyCard data={parsed} />;
    case "alerts":
      return <AlertsCard data={parsed} />;
    default:
      return <div className="text-sm text-muted-foreground">Unknown weather data type</div>;
  }
}

// ── Current Conditions ──────────────────────────────────────────────────

function CurrentConditionsCard({ data }: { data: CurrentWeather }) {
  const loc = data.location;
  const label = loc.city && loc.state ? `${loc.city}, ${loc.state}` : loc.city || `${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}`;

  return (
    <div className="rounded-xl border border-border bg-card p-4 my-2 max-w-md">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-3xl font-bold text-foreground mt-1">
            {data.temperature}°{data.temperatureUnit}
          </div>
          <div className="text-sm text-muted-foreground">{data.condition}</div>
        </div>
        {data.icon && (
          <img
            src={data.icon}
            alt={data.condition}
            className="w-16 h-16"
            crossOrigin="anonymous"
          />
        )}
      </div>

      {data.feelsLike && (
        <div className="text-xs text-muted-foreground mt-2">
          Feels like {data.feelsLike}°{data.temperatureUnit}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
        <div>Humidity: {data.humidity}%</div>
        <div>Wind: {data.windDirection} {data.windSpeed}</div>
        {data.visibility !== "N/A" && <div>Visibility: {data.visibility}</div>}
        {data.sunrise && <div>Sunrise: {formatTime(data.sunrise, data.timezone)}</div>}
        {data.sunset && <div>Sunset: {formatTime(data.sunset, data.timezone)}</div>}
      </div>

      {data.description && (
        <div className="text-xs text-muted-foreground mt-2 border-t border-border pt-2">
          {data.description}
        </div>
      )}
    </div>
  );
}

// ── 7-Day Forecast ──────────────────────────────────────────────────────

function ForecastCard({ data }: { data: ForecastWeather }) {
  const loc = data.location;
  const label = loc.city && loc.state ? `${loc.city}, ${loc.state}` : loc.city || "";
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="rounded-xl border border-border bg-card p-4 my-2 max-w-lg">
      <div className="text-xs text-muted-foreground mb-2">7-Day Forecast — {label}</div>
      <div className="space-y-1.5">
        {data.periods.map((period, i) => (
          <div
            key={i}
            className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={() => setExpanded(expanded === i ? null : i)}
          >
            <div className="w-20 text-xs font-medium text-foreground shrink-0">
              {formatDay(period.startTime, data.timezone)}
            </div>
            <div className="w-8 shrink-0">
              {period.icon && (
                <img src={period.icon} alt={period.shortForecast} className="w-8 h-8" crossOrigin="anonymous" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {period.temperature}°{period.temperatureUnit}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {period.shortForecast}
                </span>
              </div>
              {expanded === i && period.detailedForecast && (
                <div className="text-xs text-muted-foreground mt-1">{period.detailedForecast}</div>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground shrink-0">
              {period.windSpeed}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Hourly Forecast ─────────────────────────────────────────────────────

function HourlyCard({ data }: { data: HourlyWeather }) {
  const loc = data.location;
  const label = loc.city && loc.state ? `${loc.city}, ${loc.state}` : loc.city || "";

  return (
    <div className="rounded-xl border border-border bg-card p-4 my-2 max-w-lg">
      <div className="text-xs text-muted-foreground mb-2">Hourly Forecast — {label}</div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {data.periods.map((period, i) => (
          <div key={i} className="flex flex-col items-center gap-1 min-w-[4rem] text-center">
            <div className="text-[10px] text-muted-foreground">
              {formatDay(period.startTime, data.timezone) === "Today"
                ? formatTime(period.startTime, data.timezone)
                : formatTime(period.startTime, data.timezone)}
            </div>
            {period.icon && (
              <img src={period.icon} alt="" className="w-8 h-8" crossOrigin="anonymous" />
            )}
            <div className="text-sm font-semibold text-foreground">
              {period.temperature}°
            </div>
            <div className="text-[10px] text-muted-foreground truncate max-w-[3.5rem]">
              {period.shortForecast}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Weather Alerts ──────────────────────────────────────────────────────

function AlertsCard({ data }: { data: AlertsWeather }) {
  const loc = data.location;
  const label = loc.city && loc.state ? `${loc.city}, ${loc.state}` : loc.city || "";

  if (!data.alerts.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 my-2 max-w-md">
        <div className="text-sm text-foreground">No active weather alerts for {label}</div>
        <div className="text-xs text-muted-foreground mt-1">Your area is clear of any watches, warnings, or advisories.</div>
      </div>
    );
  }

  return (
    <div className="space-y-2 my-2">
      <div className="text-xs text-muted-foreground">
        Active Alerts — {label} ({data.alerts.length})
      </div>
      {data.alerts.map((alert, i) => (
        <AlertBanner key={i} alert={alert} />
      ))}
    </div>
  );
}

function AlertBanner({ alert }: { alert: AlertData }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-lg border p-3 ${severityColor(alert.severity)}`}>
      <div className="flex items-start justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div>
          <div className="text-sm font-semibold">{alert.event}</div>
          <div className="text-xs mt-0.5 opacity-80">{alert.headline}</div>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-background/20 font-medium uppercase">
          {alert.severity}
        </span>
      </div>
      {expanded && (
        <div className="mt-2 text-xs opacity-90 space-y-1.5 border-t border-current/10 pt-2">
          {alert.description && <p>{alert.description}</p>}
          {alert.instruction && (
            <p className="font-medium">What to do: {alert.instruction}</p>
          )}
          {alert.expires && (
            <p className="text-[10px] opacity-70">Expires: {new Date(alert.expires).toLocaleString()}</p>
          )}
        </div>
      )}
    </div>
  );
}