"use client";

import { useState } from "react";
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

interface MBAHeaderProps {
  mba: {
    id: string;
    mbaNumber: string;
    name: string;
    budget: number;
    currency: string;
    startDate: string;
    endDate: string;
    status: string;
    netsuiteProjectNumber: string | null;
    clientId: string;
    clientName: string;
  };
  clients: { id: string; name: string }[];
  updateMBA: (formData: FormData) => Promise<void>;
  updateMBAStatus: (formData: FormData) => Promise<void>;
  updateNetsuiteProject: (formData: FormData) => Promise<void>;
  startReconciliation: ((formData: FormData) => Promise<void>) | null;
  remaining: number;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-bs-teal/20 text-bs-teal-dark",
  CLOSED: "bg-bs-dark-gray/10 text-bs-dark-gray",
  RECONCILING: "bg-bs-cobalt/10 text-bs-cobalt",
  DRAFT: "bg-bs-yellow text-bs-dark-gray",
};

export function MBAHeader({
  mba,
  clients,
  updateMBA,
  updateMBAStatus,
  updateNetsuiteProject,
  startReconciliation,
  remaining,
}: MBAHeaderProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <form
        action={async (formData) => {
          await updateMBA(formData);
          setEditing(false);
        }}
        className="space-y-4 rounded-lg border p-4"
      >
        <input type="hidden" name="id" value={mba.id} />
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit MBA — {mba.mbaNumber}</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="edit-clientId">Client</Label>
            <Select name="clientId" defaultValue={mba.clientId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-name">Campaign Name</Label>
            <Input
              id="edit-name"
              name="name"
              defaultValue={mba.name}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="edit-budget">Budget</Label>
            <Input
              id="edit-budget"
              name="budget"
              type="number"
              step="0.01"
              min="0"
              defaultValue={mba.budget}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-currency">Currency</Label>
            <Select name="currency" defaultValue={mba.currency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="CAD">CAD</SelectItem>
                <SelectItem value="AUD">AUD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="edit-startDate">Start Date</Label>
            <Input
              id="edit-startDate"
              name="startDate"
              type="date"
              defaultValue={mba.startDate}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-endDate">End Date</Label>
            <Input
              id="edit-endDate"
              name="endDate"
              type="date"
              defaultValue={mba.endDate}
              required
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" size="sm">
            Save Changes
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{mba.mbaNumber}</h1>
          <span
            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              STATUS_STYLES[mba.status] || STATUS_STYLES.DRAFT
            }`}
          >
            {mba.status}
          </span>
        </div>
        <p className="text-muted-foreground">
          {mba.clientName} &middot; {mba.name}
        </p>
        <p className="text-sm text-muted-foreground">
          {formatDate(mba.startDate)} - {formatDate(mba.endDate)}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <form action={updateNetsuiteProject} className="flex items-center gap-1">
            <input type="hidden" name="id" value={mba.id} />
            <span className="text-xs text-muted-foreground">NS Project:</span>
            <Input
              name="netsuiteProjectNumber"
              defaultValue={mba.netsuiteProjectNumber || ""}
              placeholder="Not set"
              className="h-6 w-24 text-xs"
            />
            <Button type="submit" variant="ghost" size="sm" className="h-6 text-xs px-2">
              Save
            </Button>
          </form>
        </div>
        <Button
          variant="link"
          size="sm"
          className="px-0 h-auto text-xs"
          onClick={() => setEditing(true)}
        >
          Edit MBA details
        </Button>
      </div>
      <div className="flex gap-2">
        <form action={updateMBAStatus}>
          <input type="hidden" name="id" value={mba.id} />
          <Select name="status" defaultValue={mba.status}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="RECONCILING">Reconciling</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" variant="outline" size="sm" className="ml-2">
            Update
          </Button>
        </form>
        {startReconciliation && (
          <form action={startReconciliation}>
            <input type="hidden" name="mbaId" value={mba.id} />
            <input type="hidden" name="finalBalance" value={remaining.toString()} />
            <Button type="submit" variant="outline" size="sm">
              Start Reconciliation
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
