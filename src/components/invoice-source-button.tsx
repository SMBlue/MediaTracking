"use client";

import { useState } from "react";
import { Eye, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type SourceResponse =
  | { kind: "pdf"; url: string; filename: string | null }
  | { kind: "email"; body: string }
  | { kind: "none" }
  | { error: string };

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "showEmail"; body: string }
  | { status: "error"; message: string };

export function InvoiceSourceButton({
  invoiceId,
  hasSource,
}: {
  invoiceId: string;
  /** Set server-side: true when sourcePdfPath or sourceEmailBodyText is non-null. */
  hasSource: boolean;
}) {
  const [state, setState] = useState<State>({ status: "idle" });

  const handleClick = async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/source`, {
        cache: "no-store",
      });
      const data: SourceResponse = await res.json();
      if ("error" in data) {
        setState({ status: "error", message: data.error });
        return;
      }
      if (data.kind === "pdf") {
        // PDFs open in a new tab — most accurate render and easy to download.
        window.open(data.url, "_blank", "noopener,noreferrer");
        setState({ status: "idle" });
        return;
      }
      if (data.kind === "email") {
        setState({ status: "showEmail", body: data.body });
        return;
      }
      setState({
        status: "error",
        message:
          "No source persisted for this invoice. It was ingested before source persistence was enabled.",
      });
    } catch (err) {
      setState({ status: "error", message: String(err) });
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={!hasSource || state.status === "loading"}
        title={
          hasSource
            ? "Open the original invoice source"
            : "No persisted source for this invoice"
        }
      >
        <Eye className="size-3.5 mr-1.5" />
        {state.status === "loading" ? "Loading…" : "View source"}
      </Button>

      <Dialog
        open={state.status === "showEmail" || state.status === "error"}
        onOpenChange={(open) => {
          if (!open) setState({ status: "idle" });
        }}
      >
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          {state.status === "showEmail" ? (
            <>
              <DialogHeader>
                <DialogTitle>Invoice email body</DialogTitle>
                <DialogDescription>
                  This invoice arrived without a PDF attachment — the body
                  text below is what the parser saw.
                </DialogDescription>
              </DialogHeader>
              <pre className="text-sm whitespace-pre-wrap font-mono bg-secondary/40 p-4 rounded-md border border-border">
                {state.body}
              </pre>
            </>
          ) : state.status === "error" ? (
            <>
              <DialogHeader>
                <DialogTitle>Source unavailable</DialogTitle>
                <DialogDescription>{state.message}</DialogDescription>
              </DialogHeader>
              {state.message.includes("ingested before") && (
                <p className="text-sm text-muted-foreground">
                  <ExternalLink className="inline size-3 mr-1" />
                  Re-running the email ingestion for this Gmail message would
                  backfill the source.
                </p>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
