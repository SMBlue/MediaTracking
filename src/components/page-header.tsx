import * as React from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

interface Breadcrumb {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: string
  description?: string
  breadcrumbs?: Breadcrumb[]
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("pb-2", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground/50" />}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="hover:text-foreground transition-colors"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-foreground font-medium">{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      {(title || description || actions) && (
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            {title && (
              <h1 className="text-[28px] font-semibold tracking-tight leading-tight">
                {title}
              </h1>
            )}
            {description && (
              <p className="text-muted-foreground text-sm mt-1.5">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
    </div>
  )
}
