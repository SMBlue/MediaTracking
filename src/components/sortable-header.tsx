import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  field: string;
  label: string;
  currentSort: string | null;
  currentDir: "asc" | "desc";
  /** Carry forward all other URL params when toggling sort. */
  preserveParams: URLSearchParams;
  basePath: string;
  className?: string;
};

export function SortableHeader({
  field,
  label,
  currentSort,
  currentDir,
  preserveParams,
  basePath,
  className,
}: Props) {
  const isActive = currentSort === field;
  const nextDir = isActive && currentDir === "desc" ? "asc" : "desc";

  const next = new URLSearchParams(preserveParams.toString());
  next.set("sort", field);
  next.set("dir", nextDir);

  const Icon = !isActive ? ArrowUpDown : currentDir === "desc" ? ArrowDown : ArrowUp;

  return (
    <Link
      href={`${basePath}?${next.toString()}`}
      scroll={false}
      className={cn(
        "inline-flex items-center gap-1 hover:text-foreground transition-colors",
        isActive ? "text-foreground" : "text-muted-foreground",
        className
      )}
    >
      <span>{label}</span>
      <Icon className="size-3" />
    </Link>
  );
}
