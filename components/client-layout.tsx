"use client";

import { ThemeProvider } from "@0xkobold/warm-editorial";
import "@0xkobold/warm-editorial/styles.css";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return <ThemeProvider defaultTheme="dark">{children}</ThemeProvider>;
}