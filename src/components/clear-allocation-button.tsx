"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearMbaAllocation } from "@/app/(dashboard)/invoices/[id]/actions";

export function ClearAllocationButton({
  allocationId,
  mbaLabel,
}: {
  allocationId: string;
  mbaLabel: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() => {
        if (
          !window.confirm(
            `Clear the allocation to ${mbaLabel}? Line items routed to this MBA will become Unmapped.`
          )
        ) {
          return;
        }
        startTransition(() => clearMbaAllocation(allocationId));
      }}
      aria-label={`Clear allocation to ${mbaLabel}`}
      title="Clear this allocation"
    >
      <X className="size-3.5" />
    </Button>
  );
}
