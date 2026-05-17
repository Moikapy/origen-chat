"use client";

import { useState, useEffect, useCallback } from "react";
import { startOAuth, isConnected, disconnect as orDisconnect } from "@moikapy/openrouter-auth";

interface User {
  id: string;
  email: string;
  displayName: string | null;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  openrouterConnected: boolean;
  connectOpenRouter: () => void;
  disconnectOpenRouter: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [openrouterConnected, setOpenrouterConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/session")
      .then((r) => r.json() as Promise<{ user: User | null; openrouterConnected: boolean }>)
      .then((data) => {
        if (!cancelled) {
          if (data.user) setUser(data.user);
          setOpenrouterConnected(data.openrouterConnected ?? false);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const connectOpenRouter = useCallback(() => {
    startOAuth({
      callbackUrl: `${window.location.origin}/auth/callback`,
    });
  }, []);

  const disconnectOpenRouter = useCallback(async () => {
    try {
      await fetch("/auth/exchange", { method: "DELETE" });
      setOpenrouterConnected(false);
    } catch {
      // Silently fail
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setOpenrouterConnected(false);
  }, []);

  return {
    user,
    loading,
    openrouterConnected,
    connectOpenRouter,
    disconnectOpenRouter,
    logout,
  };
}