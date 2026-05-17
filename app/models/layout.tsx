// Force dynamic rendering for models pages — avoids prerender error
export const dynamic = "force-dynamic";

export default function ModelsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
