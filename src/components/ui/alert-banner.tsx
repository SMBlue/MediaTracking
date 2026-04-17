import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react"

import { cn } from "@/lib/utils"

const alertBannerVariants = cva(
  "flex items-start gap-3 rounded-lg border p-4",
  {
    variants: {
      variant: {
        info: "bg-bs-light-blue border-bs-cobalt/20",
        warning: "bg-bs-yellow/40 border-bs-yellow",
        error: "bg-bs-coral/10 border-bs-coral/30",
        success: "bg-bs-teal/15 border-bs-teal/30",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
)

const iconMap = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  success: CheckCircle2,
}

const iconColorMap = {
  info: "text-bs-cobalt",
  warning: "text-bs-dark-gray",
  error: "text-bs-coral-dark",
  success: "text-bs-teal-dark",
}

interface AlertBannerProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof alertBannerVariants> {
  action?: React.ReactNode
}

function AlertBanner({
  className,
  variant = "info",
  action,
  children,
  ...props
}: AlertBannerProps) {
  const Icon = iconMap[variant ?? "info"]
  const iconColor = iconColorMap[variant ?? "info"]

  return (
    <div className={cn(alertBannerVariants({ variant }), className)} {...props}>
      <Icon className={cn("size-5 shrink-0 mt-0.5", iconColor)} />
      <div className="flex-1 text-bs-midnight">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export { AlertBanner, alertBannerVariants }
