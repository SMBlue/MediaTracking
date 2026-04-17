import { Skeleton } from "@/components/ui/skeleton"

export default function AuditLoading() {
  return (
    <div className="space-y-6">
      <div className="border-b border-border/60 pb-6">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-56 mt-2" />
      </div>

      <div className="bg-card rounded-xl border border-border/60 p-6">
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex gap-8">
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-24" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
