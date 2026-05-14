import { redirect } from "next/navigation";

/** Catch-all: any unknown route redirects to the landing page */
export default function CatchAll() {
  redirect("/");
}