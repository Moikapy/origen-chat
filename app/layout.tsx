import type { Metadata } from "next";
import { ThemeProvider } from "@0xkobold/warm-editorial";
import "@0xkobold/warm-editorial/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Origen Chat",
  description: "AI agent powered by Origen",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <ThemeProvider defaultTheme="dark">
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}