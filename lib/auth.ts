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
  openrouterKeyValid: boolean;
  openrouterInfo: { balance: number; usage: number; usageMonthly: number; usageDaily: number; label: string } | null;
  connectOpenRouter: () => void;
  disconnectOpenRouter: () => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => void;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [openrouterConnected, setOpenrouterConnected] = useState(false);
  const [openrouterKeyValid, setOpenrouterKeyValid] = useState(false);
  const [openrouterInfo, setOpenrouterInfo] = useState<{ balance: number; usage: number; usageMonthly: number; usageDaily: number; label: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSession = useCallback(() => {
    return fetch("/api/auth/session")
      .then((r) => r.json() as Promise<{ user: User | null; openrouterConnected: boolean; openrouterKeyValid: boolean; openrouter?: { balance: number; usage: number; usageMonthly: number; usageDaily?: number; usage_daily?: number; label: string } | null }>)
      .then((data) => {
        if (data.user) setUser(data.user);
        setOpenrouterConnected(data.openrouterConnected ?? false);
        setOpenrouterKeyValid(data.openrouterKeyValid ?? false);
        setOpenrouterInfo(data.openrouter ? { ...data.openrouter, usageDaily: data.openrouter.usageDaily ?? data.openrouter.usage_daily ?? 0 } : null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchSession().finally(() => setLoading(false));
  }, [fetchSession]);

  const connectOpenRouter = useCallback(() => {
    startOAuth({
      callbackUrl: `${window.location.origin}/auth/callback`,
    });
  }, []);

  const disconnectOpenRouter = useCallback(async () => {
    try {
      await fetch("/auth/exchange", { method: "DELETE" });
      setOpenrouterConnected(false);
      setOpenrouterKeyValid(false);
    } catch {
      // Silently fail
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setOpenrouterConnected(false);
    setOpenrouterKeyValid(false);
  }, []);

  return {
    user,
    loading,
    openrouterConnected,
    openrouterKeyValid,
    openrouterInfo,
    connectOpenRouter,
    disconnectOpenRouter,
    logout,
    refreshSession: fetchSession,
  };
}