"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PLATFORMS = [
  { value: "GOOGLE_ADS", label: "Google Ads" },
  { value: "META", label: "Meta" },
  { value: "BING", label: "Bing" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "OTHER", label: "Other" },
];

interface MBA {
  id: string;
  mbaNumber: string;
  name: string;
  client: { name: string };
}

interface Allocation {
  mbaId: string;
  amount: string;
}

export function NewInvoiceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedMbaId = searchParams.get("mbaId");

  const [mbas, setMbas] = useState<MBA[]>([]);
  const [loading, setLoading] = useState(true);
  const [allocations, setAllocations] = useState<Allocation[]>(
    preselectedMbaId ? [{ mbaId: preselectedMbaId, amount: "" }] : []
  );
  const [totalAmount, setTotalAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Load MBAs on mount
  useEffect(() => {
    fetch("/api/mbas")
      .then((res) => res.json())
      .then((data) => {
        setMbas(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const allocatedTotal = allocations.reduce(
    (sum, alloc) => sum + (parseFloat(alloc.amount) || 0),
    0
  );
  const invoiceTotal = parseFloat(totalAmount) || 0;
  const remaining = invoiceTotal - allocatedTotal;

  const addAllocation = () => {
    setAllocations([...allocations, { mbaId: "", amount: "" }]);
  };

  const removeAllocation = (index: number) => {
    setAllocations(allocations.filter((_, i) => i !== index));
  };

  const updateAllocation = (
    index: number,
    field: "mbaId" | "amount",
    value: string
  ) => {
    const updated = [...allocations];
    updated[index][field] = value;
    setAllocations(updated);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: formData.get("type"),
          vendor: formData.get("vendor"),
          invoiceNumber: formData.get("invoiceNumber"),
          invoiceDate: formData.get("invoiceDate"),
          totalAmount: parseFloat(formData.get("totalAmount") as string),
          currency: formData.get("currency"),
          isPaid: formData.get("isPaid") === "true",
          notes: formData.get("notes"),
          allocations: allocations
            .filter((a) => a.mbaId && a.amount)
            .map((a) => ({
              mbaId: a.mbaId,
              amount: parseFloat(a.amount),
            })),
        }),
      });

      if (res.ok) {
        router.push("/invoices");
      } else {
        const error = await res.json();
        alert(error.message || "Failed to create invoice");
      }
    } catch {
      alert("Failed to create invoice");
    } finally {
      setSubmitting(false);
    }
  };

  const today = new Date().toISOString().split("T")[0];

  if (loading) {
    return <div className="max-w-2xl mx-auto p-4">Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Record Vendor Invoice</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select name="type" defaultValue="INVOICE">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INVOICE">Invoice</SelectItem>
                    <SelectItem value="CREDIT_NOTE">Credit Note</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vendor">Platform</Label>
                <Select name="vendor" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select platform" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="invoiceNumber">Invoice/Credit # </Label>
                <Input
                  id="invoiceNumber"
                  name="invoiceNumber"
                  placeholder="INV-2024-001"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="invoiceDate">Invoice Date</Label>
                <Input
                  id="invoiceDate"
                  name="invoiceDate"
                  type="date"
                  defaultValue={today}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select name="currency" defaultValue="USD">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="totalAmount">Total Amount</Label>
              <Input
                id="totalAmount"
                name="totalAmount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input id="notes" name="notes" placeholder="Any notes..." />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Allocate to MBAs</Label>
                <Button type="button" variant="outline" size="sm" onClick={addAllocation}>
                  + Add MBA
                </Button>
              </div>

              {allocations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No allocations added. Click &quot;Add MBA&quot; to allocate this invoice.
                </p>
              ) : (
                <div className="space-y-3">
                  {allocations.map((alloc, index) => (
                    <div key={index} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Select
                          value={alloc.mbaId}
                          onValueChange={(v) => updateAllocation(index, "mbaId", v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select MBA" />
                          </SelectTrigger>
                          <SelectContent>
                            {mbas.map((mba) => (
                              <SelectItem key={mba.id} value={mba.id}>
                                {mba.client.name} - {mba.mbaNumber}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-32">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Amount"
                          value={alloc.amount}
                          onChange={(e) =>
                            updateAllocation(index, "amount", e.target.value)
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAllocation(index)}
                      >
                        &times;
                      </Button>
                    </div>
                  ))}

                  <div className="flex justify-between text-sm pt-2 border-t">
                    <span>Allocated: ${allocatedTotal.toFixed(2)}</span>
                    <span
                      className={
                        Math.abs(remaining) < 0.01
                          ? "text-green-600"
                          : "text-orange-600"
                      }
                    >
                      {Math.abs(remaining) < 0.01
                        ? "Fully allocated"
                        : `$${remaining.toFixed(2)} remaining`}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Payment Status</Label>
              <Select name="isPaid" defaultValue="false">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">Unpaid</SelectItem>
                  <SelectItem value="true">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Save Invoice"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <a href="/invoices">Cancel</a>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
