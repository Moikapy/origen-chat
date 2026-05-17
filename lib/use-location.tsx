"use client";

import { useState, useEffect, useCallback } from "react";

interface SavedLocation {
  lat: number;
  lon: number;
  city: string;
  state: string;
  timestamp: number;
}

const STORAGE_KEY = "origen_location";

/**
 * Hook for GPS geolocation with localStorage caching.
 * Returns location state + request function + permission status.
 */
export function useLocation() {
  const [location, setLocation] = useState<SavedLocation | null>(null);
  const [permission, setPermission] = useState<PermissionState>("prompt");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load cached location on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as SavedLocation;
        // Use cache if less than 7 days old
        if (Date.now() - parsed.timestamp < 7 * 24 * 60 * 60 * 1000) {
          setLocation(parsed);
        }
      }
    } catch { /* ignore */ }

    // Check geolocation permission status
    if (navigator.permissions) {
      navigator.permissions.query({ name: "geolocation" }).then((status) => {
        setPermission(status.state);
        status.onchange = () => setPermission(status.state);
      }).catch(() => {});
    }
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: SavedLocation = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          city: "Current Location",
          state: "",
          timestamp: Date.now(),
        };
        setLocation(loc);
        setPermission("granted");

        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
        } catch { /* storage full */ }

        setLoading(false);
      },
      (err) => {
        setPermission("denied");
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setError("Location permission denied. You can still search by city name or ZIP code.");
            break;
          case err.POSITION_UNAVAILABLE:
            setError("Location unavailable. Try searching by city name or ZIP code.");
            break;
          case err.TIMEOUT:
            setError("Location request timed out. Try again or search by city name.");
            break;
          default:
            setError("Could not get your location. Try searching by city name or ZIP code.");
        }
        setLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  const clearLocation = useCallback(() => {
    setLocation(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  return { location, permission, loading, error, requestLocation, clearLocation };
}

/**
 * Geolocation prompt component — shown when the LLM needs GPS access.
 * This is embedded in the chat UI, not a standalone page.
 */
export function LocationPrompt({ onRequest, onDismiss }: {
  onRequest: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 my-2">
      <div className="flex items-start gap-3">
        <span className="text-lg shrink-0">📍</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm text-foreground">Allow location access?</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            To get weather for your current location, we need access to your GPS.
            You can also search by city name or ZIP code.
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={onRequest}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-colors"
            >
              Allow location
            </button>
            <button
              onClick={onDismiss}
              className="text-xs px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:opacity-90 transition-colors"
            >
              Search by city
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}