"use client";

import { ThemeProvider } from "@0xkobold/warm-editorial";
import { useEffect } from "react";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW registration failed — app still works without it
      });
    }
  }, []);

  return <ThemeProvider defaultTheme="dark">{children}</ThemeProvider>;
}