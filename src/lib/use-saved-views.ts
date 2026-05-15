"use client";

/**
 * Per-page named view persistence.
 *
 * Pairs with the URL-param-driven filter/sort approach in
 * src/lib/invoice-list-params.ts so a "saved view" is literally a
 * snapshot of the URL search string. Storage is localStorage keyed by
 * the page scope ("invoices", "mbas") so views don't leak across
 * pages.
 *
 * No server table yet — that's a future PR if/when cross-device
 * sharing becomes a real need. Until then this is per-browser.
 */

import { useCallback, useEffect, useState } from "react";

export type SavedView = {
  id: string;
  name: string;
  query: string; // URLSearchParams.toString() — no leading "?"
  createdAt: string;
};

export function storageKeyFor(scope: string): string {
  return `mba-tracker:saved-views:${scope}`;
}

export function readSavedViews(scope: string): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKeyFor(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSavedView);
  } catch {
    return [];
  }
}

function isValidSavedView(value: unknown): value is SavedView {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.query === "string" &&
    typeof v.createdAt === "string"
  );
}

export function writeSavedViews(scope: string, views: SavedView[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKeyFor(scope), JSON.stringify(views));
}

export type UseSavedViewsResult = {
  views: SavedView[];
  saveView: (name: string, query: string) => SavedView;
  deleteView: (id: string) => void;
};

export function useSavedViews(scope: string): UseSavedViewsResult {
  const [views, setViews] = useState<SavedView[]>([]);

  useEffect(() => {
    setViews(readSavedViews(scope));
  }, [scope]);

  const saveView = useCallback(
    (name: string, query: string): SavedView => {
      const view: SavedView = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim() || "Untitled view",
        query,
        createdAt: new Date().toISOString(),
      };
      setViews((prev) => {
        const next = [...prev, view];
        writeSavedViews(scope, next);
        return next;
      });
      return view;
    },
    [scope]
  );

  const deleteView = useCallback(
    (id: string) => {
      setViews((prev) => {
        const next = prev.filter((v) => v.id !== id);
        writeSavedViews(scope, next);
        return next;
      });
    },
    [scope]
  );

  return { views, saveView, deleteView };
}
