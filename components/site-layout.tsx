import Link from "next/link";

/**
 * Shared site navigation bar.
 * - `active`: which nav item is highlighted ("models" | "chat" | null)
 * - `variant`: "default" shows Models + Chat, "landing" shows Models + Sign in
 */
export function SiteNav({ active, variant = "default" }: { active?: "models" | "chat"; variant?: "default" | "landing" }) {
  return (
    <nav className="border-b border-border/50">
      <div className={`mx-auto px-6 py-4 flex items-center justify-between ${variant === "landing" ? "max-w-6xl" : "max-w-7xl"}`}>
        <Link href="/" className="text-lg font-bold tracking-tight hover:opacity-80 transition-opacity">
          Origen
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/models"
            className={`text-sm font-medium transition-colors ${
              active === "models" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Models
          </Link>
          {variant === "landing" ? (
            <Link href="/auth/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Sign in
            </Link>
          ) : (
            <Link
              href="/chat"
              className={`text-sm font-medium transition-colors ${
                active === "chat" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Chat
            </Link>
          )}
          <Link
            href="/chat"
            className="text-sm px-4 py-2 rounded-lg bg-foreground text-background font-medium hover:opacity-90 transition-opacity"
          >
            Start free
          </Link>
        </div>
      </div>
    </nav>
  );
}

/**
 * Shared site footer.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border/50 mt-12">
      <div className="mx-auto max-w-7xl px-6 py-6 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Built by{" "}
          <a href="https://moikapy.dev" className="hover:text-foreground transition-colors">
            Moikapy
          </a>
        </span>
        <a href="https://moikapy.dev" className="hover:text-foreground transition-colors">
          moikapy.dev
        </a>
      </div>
    </footer>
  );
}