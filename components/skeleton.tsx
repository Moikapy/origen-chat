"use client";

/** Skeleton shimmer placeholder for loading states */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-md bg-muted/50 ${className}`} />
  );
}

/** Line skeleton — mimics a line of text */
export function SkeletonLine({ width = "w-3/4" }: { width?: string }) {
  return <Skeleton className={`h-4 ${width}`} />;
}

/** Card skeleton — mimics a model card */
export function SkeletonCard() {
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-12 rounded-full" />
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}

/** Table row skeleton — mimics a model table row */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-border/50">
      <Skeleton className="h-5 w-1/4" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-16 ml-auto" />
      <Skeleton className="h-4 w-24" />
    </div>
  );
}

/** Sidebar chat item skeleton */
export function SkeletonChatItem() {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Skeleton className="h-8 w-8 rounded" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-2.5 w-1/3" />
      </div>
    </div>
  );
}