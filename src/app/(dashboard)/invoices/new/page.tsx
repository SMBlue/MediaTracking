import { Suspense } from "react";
import { NewInvoiceForm } from "./form";

export default function NewInvoicePage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto p-4">Loading...</div>}>
      <NewInvoiceForm />
    </Suspense>
  );
}
