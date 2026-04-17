import { Skeleton } from "@/components/ui/skeleton"

export default function CashPositionLoading() {
  return (
    <div className="space-y-8">
      <div className="border-b border-border/60 pb-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-80 mt-2" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border/60 p-5 border-l-4 border-l-bs-lavender">
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
              <Skeleton className="size-10 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border/60 p-6">
        <Skeleton className="h-5 w-24 mb-1" />
        <Skeleton className="h-4 w-64 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-8">
              {Array.from({ length: 8 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-20" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
