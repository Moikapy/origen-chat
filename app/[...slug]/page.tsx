import { redirect } from "next/navigation";

/**
 * Catch-all: redirect any unknown path to the landing page.
 * Known routes have their own page files and won't reach this.
 */
export default function CatchAll() {
  redirect("/");
}

export const dynamic = "force-dynamic";