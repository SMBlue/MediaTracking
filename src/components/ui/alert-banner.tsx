import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react"

import { cn } from "@/lib/utils"

const alertBannerVariants = cva(
  "flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm",
  {
    variants: {
      variant: {
        info: "border-border",
        warning: "border-bs-yellow",
        error: "border-bs-coral/30",
        success: "border-bs-teal/40",
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
      <Icon className={cn("size-4 shrink-0", iconColor)} />
      <div className="flex-1 text-foreground">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export { AlertBanner, alertBannerVariants }
