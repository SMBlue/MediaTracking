import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="border-b border-border/60 pb-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 mt-2" />
      </div>

      {/* KPI cards */}
      <Skeleton className="h-3 w-32" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 -mt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border/60 p-5 border-l-4 border-l-bs-lavender">
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="size-10 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Status cards */}
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border/60 p-6">
            <Skeleton className="h-5 w-40 mb-4" />
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
