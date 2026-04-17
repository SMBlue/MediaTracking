import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { NewInvoiceForm } from "./form";

export default function NewInvoicePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Record Invoice"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Vendor Invoices", href: "/invoices" },
          { label: "New Invoice" },
        ]}
      />
      <Suspense fallback={<div className="max-w-2xl mx-auto p-4">Loading...</div>}>
        <NewInvoiceForm />
      </Suspense>
    </div>
  );
}
