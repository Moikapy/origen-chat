import type { Metadata, Viewport } from "next";
import { ClientLayout } from "@/components/client-layout";
import "./globals.css";

export const metadata: Metadata = {
  title: "Origen Chat",
  description: "Chat with any AI model — free models included, no vendor lock-in",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Origen",
  },
  openGraph: {
    title: "Origen Chat",
    description: "Chat with any AI model — free models included",
    type: "website",
    siteName: "Origen Chat",
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&family=Geist+Mono:wght@400&display=swap"
        />
      </head>
      <body suppressHydrationWarning>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}