"use client";

import { useState, useTransition, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { bulkAssignLineItems } from "@/app/(dashboard)/invoices/[id]/actions";

interface LineItem {
  id: string;
  campaignName: string;
  platform: string | null;
  amount: number;
  mbaId: string | null;
  confidence: number | null;
}

interface MBAOption {
  id: string;
  mbaNumber: string;
  name: string;
  client: { name: string };
}

interface Props {
  invoiceId: string;
  lineItems: LineItem[];
  activeMBAs: MBAOption[];
  isDraft: boolean;
  totalAmount: number;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function confidenceBadge(confidence: number | null) {
  if (confidence === null) return null;
  if (confidence >= 0.8) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        High ({Math.round(confidence * 100)}%)
      </span>
    );
  }
  if (confidence >= 0.5) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
        Medium ({Math.round(confidence * 100)}%)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
      Low ({Math.round(confidence * 100)}%)
    </span>
  );
}

const UNMAP = "__unmap__";

export function LineItemAssignments({
  invoiceId,
  lineItems,
  activeMBAs,
  isDraft,
  totalAmount,
}: Props) {
  // Track local assignment overrides: lineItemId → mbaId (or null for unmapped)
  const [overrides, setOverrides] = useState<Map<string, string | null>>(
    new Map()
  );
  const [isPending, startTransition] = useTransition();

  const lineItemsTotal = lineItems.reduce((sum, li) => sum + li.amount, 0);

  // Group MBAs by client
  const mbasByClient = new Map<string, MBAOption[]>();
  for (const mba of activeMBAs) {
    const group = mbasByClient.get(mba.client.name) || [];
    group.push(mba);
    mbasByClient.set(mba.client.name, group);
  }

  const getCurrentMbaId = useCallback(
    (item: LineItem): string | null => {
      if (overrides.has(item.id)) return overrides.get(item.id)!;
      return item.mbaId;
    },
    [overrides]
  );

  const handleChange = (lineItemId: string, value: string) => {
    const mbaId = value === UNMAP ? null : value;
    setOverrides((prev) => {
      const next = new Map(prev);
      // Find the original item to check if this reverts the change
      const original = lineItems.find((li) => li.id === lineItemId);
      if (original && original.mbaId === mbaId) {
        next.delete(lineItemId);
      } else {
        next.set(lineItemId, mbaId);
      }
      return next;
    });
  };

  const handleSaveAll = () => {
    const assignments = Array.from(overrides.entries()).map(
      ([lineItemId, mbaId]) => ({ lineItemId, mbaId })
    );
    startTransition(async () => {
      await bulkAssignLineItems(invoiceId, assignments);
      setOverrides(new Map());
    });
  };

  const changedCount = overrides.size;

  return (
    <div className="relative">
      {lineItems.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No line items recorded for this invoice
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign Name</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {isDraft && <TableHead>Confidence</TableHead>}
                <TableHead>MBA Assignment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((item) => {
                const currentMbaId = getCurrentMbaId(item);
                const isChanged = overrides.has(item.id);
                return (
                  <TableRow
                    key={item.id}
                    className={isChanged ? "border-l-2 border-l-blue-500" : ""}
                  >
                    <TableCell className="font-medium">
                      {item.campaignName}
                    </TableCell>
                    <TableCell>{item.platform || "\u2013"}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.amount)}
                    </TableCell>
                    {isDraft && (
                      <TableCell>{confidenceBadge(item.confidence)}</TableCell>
                    )}
                    <TableCell>
                      <Select
                        value={currentMbaId || UNMAP}
                        onValueChange={(val) => handleChange(item.id, val)}
                      >
                        <SelectTrigger className="w-56 h-8 text-xs">
                          <SelectValue placeholder="Unmapped" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNMAP}>Unmapped</SelectItem>
                          {Array.from(mbasByClient.entries()).map(
                            ([clientName, mbas]) => (
                              <SelectGroup key={clientName}>
                                <SelectLabel>{clientName}</SelectLabel>
                                {mbas.map((mba) => (
                                  <SelectItem key={mba.id} value={mba.id}>
                                    {mba.mbaNumber} - {mba.name}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="flex justify-between text-sm pt-2 border-t mt-2">
            <span>Line items total: {formatCurrency(lineItemsTotal)}</span>
            <span
              className={
                Math.abs(lineItemsTotal - totalAmount) < 0.01
                  ? "text-green-600"
                  : "text-orange-600"
              }
            >
              {Math.abs(lineItemsTotal - totalAmount) < 0.01
                ? "Matches invoice total"
                : `Invoice total: ${formatCurrency(totalAmount)}`}
            </span>
          </div>
        </>
      )}

      {changedCount > 0 && (
        <div className="sticky bottom-0 mt-4 -mx-6 -mb-6 px-6 py-3 bg-blue-50 border-t border-blue-200 flex items-center justify-between rounded-b-lg">
          <span className="text-sm text-blue-800">
            {changedCount} unsaved{" "}
            {changedCount === 1 ? "change" : "changes"}
          </span>
          <Button onClick={handleSaveAll} disabled={isPending} size="sm">
            {isPending ? "Saving..." : "Save All Assignments"}
          </Button>
        </div>
      )}
    </div>
  );
}
