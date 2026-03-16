"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LineItem {
  campaignName: string;
  amount: number;
  platform?: string;
}

interface CSVUploadProps {
  onImport: (lineItems: LineItem[]) => void;
  onCancel: () => void;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(current.trim());
        current = "";
      } else if (char === "\n" || (char === "\r" && next === "\n")) {
        row.push(current.trim());
        current = "";
        if (row.some((cell) => cell !== "")) rows.push(row);
        row = [];
        if (char === "\r") i++;
      } else {
        current += char;
      }
    }
  }
  // Last row
  row.push(current.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);

  return rows;
}

const CAMPAIGN_COLUMNS = ["campaign_name", "campaign", "name", "description"];
const AMOUNT_COLUMNS = ["amount", "cost", "spend", "total"];
const PLATFORM_COLUMNS = ["platform", "channel", "network"];

function detectColumn(header: string, candidates: string[]): boolean {
  const normalized = header.toLowerCase().trim();
  return candidates.includes(normalized);
}

export function CSVUpload({ onImport, onCancel }: CSVUploadProps) {
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<LineItem[]>([]);
  const [warnings, setWarnings] = useState<number[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setPreview([]);
    setWarnings([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text?.trim()) {
        setError("CSV file is empty");
        return;
      }

      const rows = parseCSV(text);
      if (rows.length < 2) {
        setError("CSV file is empty or has no data rows");
        return;
      }

      const headers = rows[0];
      let campaignIdx = -1;
      let amountIdx = -1;
      let platformIdx = -1;

      headers.forEach((h, i) => {
        if (detectColumn(h, CAMPAIGN_COLUMNS)) campaignIdx = i;
        if (detectColumn(h, AMOUNT_COLUMNS)) amountIdx = i;
        if (detectColumn(h, PLATFORM_COLUMNS)) platformIdx = i;
      });

      if (campaignIdx === -1 && amountIdx === -1) {
        setError("Could not detect columns. Expected: campaign_name, amount");
        return;
      }

      const items: LineItem[] = [];
      const warnRows: number[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const campaignName = campaignIdx >= 0 ? row[campaignIdx]?.trim() || "" : "";
        const amountStr = amountIdx >= 0 ? row[amountIdx]?.replace(/[$,]/g, "").trim() : "";
        const amount = parseFloat(amountStr || "0");
        const platform = platformIdx >= 0 ? row[platformIdx]?.trim() || undefined : undefined;

        if (!campaignName && isNaN(amount)) continue;

        if (isNaN(amount) || amount === 0) {
          warnRows.push(i - 1);
        }

        items.push({
          campaignName,
          amount: isNaN(amount) ? 0 : amount,
          platform,
        });
      }

      if (items.length === 0) {
        setError("No data rows found in CSV");
        return;
      }

      setPreview(items);
      setWarnings(warnRows);
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
      <div className="space-y-2">
        <p className="text-sm font-medium">Import line items from CSV</p>
        <p className="text-xs text-muted-foreground">
          Expected columns: campaign_name (or campaign/name), amount (or cost/spend), platform (optional)
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:cursor-pointer"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {preview.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign Name</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Platform</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((item, i) => (
                <TableRow key={i} className={warnings.includes(i) ? "bg-yellow-50" : ""}>
                  <TableCell>{item.campaignName || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className={`text-right ${warnings.includes(i) ? "text-orange-600" : ""}`}>
                    {item.amount === 0 && warnings.includes(i) ? "Invalid" : `$${item.amount.toLocaleString()}`}
                  </TableCell>
                  <TableCell>{item.platform || <span className="text-muted-foreground">—</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {warnings.length > 0 && (
            <p className="text-xs text-orange-600">
              {warnings.length} row(s) have missing or invalid amounts
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onImport(preview)}>
              Import {preview.length} line items
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </>
      )}

      {preview.length === 0 && !error && (
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}
