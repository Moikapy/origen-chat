"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NotFound() {
  const router = useRouter();

  useEffect(() => {
    router.push("/");
  }, [router]);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="text-6xl font-bold text-muted-foreground">404</div>
        <p className="text-muted-foreground">Page not found. Redirecting home…</p>
      </div>
    </div>
  );
}