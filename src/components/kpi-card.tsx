import * as React from "react"
import { type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface KPICardProps {
  label: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  accentColor?: "cobalt" | "teal" | "coral" | "neutral"
  className?: string
}

const accentStyles = {
  cobalt: {
    border: "border-l-bs-cobalt",
    iconBg: "bg-bs-cobalt/10",
    iconColor: "text-bs-cobalt",
  },
  teal: {
    border: "border-l-bs-teal-dark",
    iconBg: "bg-bs-teal/15",
    iconColor: "text-bs-teal-dark",
  },
  coral: {
    border: "border-l-bs-coral",
    iconBg: "bg-bs-coral/10",
    iconColor: "text-bs-coral-dark",
  },
  neutral: {
    border: "border-l-bs-brand-gray",
    iconBg: "bg-bs-dark-gray/10",
    iconColor: "text-bs-dark-gray",
  },
}

export function KPICard({
  label,
  value,
  subtitle,
  icon: Icon,
  accentColor = "cobalt",
  className,
}: KPICardProps) {
  const styles = accentStyles[accentColor]

  return (
    <div
      className={cn(
        "bg-card rounded-xl border border-border/60 shadow-[var(--shadow-card)] py-5 px-6 border-l-4 transition-shadow duration-150",
        styles.border,
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div
          className={cn(
            "size-10 rounded-lg flex items-center justify-center shrink-0",
            styles.iconBg
          )}
        >
          <Icon className={cn("size-5", styles.iconColor)} />
        </div>
      </div>
    </div>
  )
}
