import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
  {
    variants: {
      variant: {
        active: "bg-bs-teal/20 text-bs-teal-dark",
        closed: "bg-bs-dark-gray/10 text-bs-dark-gray",
        reconciling: "bg-bs-cobalt/10 text-bs-cobalt",
        draft: "bg-bs-yellow text-bs-dark-gray",
        paid: "bg-bs-teal/20 text-bs-teal-dark",
        partial: "bg-bs-yellow text-bs-dark-gray",
        outstanding: "bg-bs-coral/15 text-bs-coral-dark",
        unpaid: "bg-bs-coral/15 text-bs-coral-dark",
        invoice: "bg-bs-dark-gray/10 text-bs-dark-gray",
        credit: "bg-bs-cobalt/10 text-bs-cobalt",
        create: "bg-bs-teal/20 text-bs-teal-dark",
        update: "bg-bs-cobalt/10 text-bs-cobalt",
        delete: "bg-bs-coral/15 text-bs-coral-dark",
        high: "bg-bs-teal/20 text-bs-teal-dark",
        medium: "bg-bs-yellow text-bs-dark-gray",
        low: "bg-bs-coral/15 text-bs-coral-dark",
        info: "bg-bs-light-blue text-bs-cobalt",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
)

const dotColorMap: Record<string, string> = {
  active: "bg-bs-teal-dark",
  closed: "bg-bs-dark-gray",
  reconciling: "bg-bs-cobalt",
  draft: "bg-bs-dark-gray",
  paid: "bg-bs-teal-dark",
  partial: "bg-bs-dark-gray",
  outstanding: "bg-bs-coral-dark",
  unpaid: "bg-bs-coral-dark",
  high: "bg-bs-teal-dark",
  medium: "bg-bs-dark-gray",
  low: "bg-bs-coral-dark",
}

interface BadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && variant && (
        <span
          className={cn(
            "size-1.5 rounded-full",
            dotColorMap[variant] ?? "bg-current"
          )}
        />
      )}
      {children}
    </span>
  )
}

export { Badge, badgeVariants }
