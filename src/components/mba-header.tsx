"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
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
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_TO_VARIANT: Record<string, "active" | "closed" | "reconciling" | "draft"> = {
  ACTIVE: "active",
  CLOSED: "closed",
  RECONCILING: "reconciling",
  DRAFT: "draft",
};

export function MBAHeader({
  mba,
  clients,
  updateMBA,
  updateMBAStatus,
  updateNetsuiteProject,
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
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{mba.mbaNumber}</h1>
          <Badge variant={STATUS_TO_VARIANT[mba.status] ?? "draft"} dot>
            {mba.status}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          {mba.clientName} &middot; {mba.name}
        </p>
        <p className="text-sm text-muted-foreground">
          {formatDate(mba.startDate)} - {formatDate(mba.endDate)}
        </p>
        <div className="flex items-center gap-3 pt-1">
          <form action={updateNetsuiteProject} className="flex items-center gap-1.5">
            <input type="hidden" name="id" value={mba.id} />
            <span className="text-xs text-muted-foreground">NS Project:</span>
            <Input
              name="netsuiteProjectNumber"
              defaultValue={mba.netsuiteProjectNumber || ""}
              placeholder="Not set"
              className="h-7 w-28 text-xs"
            />
            <Button type="submit" variant="ghost" size="sm" className="h-7 text-xs px-2">
              Save
            </Button>
          </form>
          <Button
            variant="link"
            size="sm"
            className="px-0 h-auto text-xs"
            onClick={() => setEditing(true)}
          >
            Edit MBA details
          </Button>
        </div>
      </div>
      <form action={updateMBAStatus} className="flex items-center gap-2">
        <input type="hidden" name="id" value={mba.id} />
        <Select name="status" defaultValue={mba.status}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="CLOSED">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" variant="outline" size="sm">
          Update
        </Button>
      </form>
    </div>
  );
}
