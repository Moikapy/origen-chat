"use client";

import { ThemeProvider } from "@0xkobold/warm-editorial";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return <ThemeProvider defaultTheme="dark">{children}</ThemeProvider>;
}