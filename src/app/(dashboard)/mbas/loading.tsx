import { Skeleton } from "@/components/ui/skeleton"

export default function MBAsLoading() {
  return (
    <div className="space-y-6">
      <div className="border-b border-border/60 pb-6">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-64 mt-2" />
      </div>

      <Skeleton className="h-9 w-48" />

      <div className="border rounded-lg bg-card overflow-hidden">
        <div className="bg-bs-lavender/50 px-3 py-3">
          <div className="flex gap-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-20" />
            ))}
          </div>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-8 px-3 py-3 border-b border-border/40">
            {Array.from({ length: 8 }).map((_, j) => (
              <Skeleton key={j} className="h-4 w-20" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
