import * as React from "react"
import { type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface KPICardProps {
  label: string
  value: string | number
  subtitle?: string
  /** Optional accent — used as a tiny dot next to the label, not a heavy bar */
  accentColor?: "cobalt" | "teal" | "coral" | "neutral"
  /** Kept for API back-compat with existing callers; no longer rendered */
  icon?: LucideIcon
  className?: string
}

const dotColor = {
  cobalt: "bg-bs-cobalt",
  teal: "bg-bs-teal-dark",
  coral: "bg-bs-coral",
  neutral: "bg-bs-brand-gray",
}

export function KPICard({
  label,
  value,
  subtitle,
  accentColor = "neutral",
  className,
}: KPICardProps) {
  return (
    <div
      className={cn(
        "bg-card rounded-2xl border border-border px-5 py-5 transition-shadow hover:shadow-[var(--shadow-card-hover)]",
        className
      )}
    >
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className={cn("size-1.5 rounded-full", dotColor[accentColor])} />
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      {subtitle && (
        <p className="mt-1.5 text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  )
}
