"use client";

import { useState, useEffect, useCallback } from "react";

interface User {
  id: string;
  email: string;
  displayName: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((r) => r.json() as Promise<{ user: User | null }>)
      .then((data) => {
        if (!cancelled && data.user) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  return { user, loading, logout };
}