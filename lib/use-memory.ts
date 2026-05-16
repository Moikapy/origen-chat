"use client";

import { useState, useEffect, useCallback } from "react";
import type { MemoryFact } from "@moikapy/origen";

/**
 * React hook for managing user memory facts.
 * Authenticated users: server-side via /api/memory.
 * Guest users: localStorage only.
 */

const GUEST_MEMORY_KEY = "origen_memory";
const GUEST_MAX_FACTS = 50;

export function useMemory() {
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [loading, setLoading] = useState(true);

  // Load facts on mount
  useEffect(() => {
    loadFacts();
  }, []);

  const loadFacts = useCallback(async () => {
    setLoading(true);
    try {
      // Try server-side memory first (authenticated)
      const res = await fetch("/api/memory");
      if (res.ok) {
        const data = await res.json() as { facts: MemoryFact[] };
        setFacts(data.facts);
        setLoading(false);
        return;
      }
    } catch {
      // Not authenticated or network error — fall through to localStorage
    }

    // Guest: load from localStorage
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(GUEST_MEMORY_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as MemoryFact[];
          setFacts(parsed.slice(0, GUEST_MAX_FACTS));
        } catch {
          setFacts([]);
        }
      }
    }
    setLoading(false);
  }, []);

  const saveFact = useCallback(async (key: string, value: string): Promise<boolean> => {
    // Try server-side
    try {
      const res = await fetch("/api/memory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (res.ok) {
        await loadFacts(); // refresh
        return true;
      }
    } catch {
      // Fall through to localStorage
    }

    // Guest: save to localStorage
    if (typeof window === "undefined") return false;
    const now = Date.now();
    const newFact: MemoryFact = { key, value, createdAt: now, updatedAt: now };
    const updated = [...facts.filter((f) => f.key !== key), newFact].slice(0, GUEST_MAX_FACTS);
    setFacts(updated);
    localStorage.setItem(GUEST_MEMORY_KEY, JSON.stringify(updated));
    return true;
  }, [facts, loadFacts]);

  const deleteFact = useCallback(async (key: string): Promise<boolean> => {
    // Try server-side
    try {
      const res = await fetch(`/api/memory?key=${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await loadFacts();
        return true;
      }
    } catch {
      // Fall through to localStorage
    }

    // Guest: delete from localStorage
    if (typeof window === "undefined") return false;
    const updated = facts.filter((f) => f.key !== key);
    setFacts(updated);
    localStorage.setItem(GUEST_MEMORY_KEY, JSON.stringify(updated));
    return true;
  }, [facts, loadFacts]);

  return { facts, loading, saveFact, deleteFact, refresh: loadFacts };
}