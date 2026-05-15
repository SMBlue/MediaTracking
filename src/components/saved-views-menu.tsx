"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Bookmark, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSavedViews } from "@/lib/use-saved-views";

type Props = {
  /** Per-page scope, e.g. "invoices" or "mbas". Views don't share across scopes. */
  scope: string;
};

export function SavedViewsMenu({ scope }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { views, saveView, deleteView } = useSavedViews(scope);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const currentQuery = searchParams.toString();

  const handleSave = () => {
    saveView(name, currentQuery);
    setName("");
    setNaming(false);
  };

  const loadView = (query: string) => {
    router.replace(`${pathname}${query ? `?${query}` : ""}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {views.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Views:</span>
          {views.map((view) => (
            <div
              key={view.id}
              className="inline-flex items-center rounded-full border border-border bg-card pl-2 text-xs"
            >
              <button
                type="button"
                onClick={() => loadView(view.query)}
                className="hover:text-foreground py-1"
              >
                {view.name}
              </button>
              <button
                type="button"
                aria-label={`Delete view ${view.name}`}
                onClick={() => deleteView(view.id)}
                className="px-1.5 py-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {naming ? (
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="View name"
            className="h-8 w-[160px]"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") {
                setName("");
                setNaming(false);
              }
            }}
          />
          <Button size="sm" onClick={handleSave} disabled={!name.trim()}>
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setName("");
              setNaming(false);
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setNaming(true)}
          disabled={currentQuery.length === 0}
          title={
            currentQuery.length === 0
              ? "Apply at least one filter or sort before saving"
              : "Save the current filter+sort as a named view"
          }
        >
          <Bookmark className="size-3.5 mr-1" />
          Save view
        </Button>
      )}
    </div>
  );
}
