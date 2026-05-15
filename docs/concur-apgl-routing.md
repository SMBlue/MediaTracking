# Concur APGL routing — investigation

## What we want

Gail's ask from the 2026-05-14 review call:

> Skip the Unassigned Queue and the media-planner submission step. When
> the app pushes a fully-allocated invoice to Concur, it should land in
> the **APGL Coding** workflow step directly — that's where Gail starts
> her finance review.

## What the app does today

`src/lib/concur/invoices.ts:pushInvoiceToConcur` does exactly one Concur
call per invoice:

```
POST /api/v3.0/invoice/paymentrequest
```

with a payload built by `invoiceToConcurPaymentRequest` in
`src/lib/concur/mappers.ts`. The response gives us a `PaymentRequestId`
which we store on `Invoice.concurInvoiceId`.

After that call, the resulting Payment Request in Concur is in its
**default landing state** — per BSD's current configuration, that is
the Unassigned Queue. There is no second call. Nothing in our code
advances the workflow.

## Why a single POST isn't enough

The Concur Invoice v3 API treats Payment Request **creation** and
**workflow transitions** as separate concerns. Creating a Payment
Request leaves it in whatever state your instance configures as the
landing state. To move it forward you call a workflow endpoint.

The Concur v3 Invoice API surfaces three relevant endpoints (public
documentation; have not yet confirmed in BSD sandbox):

| Endpoint | Purpose |
|---|---|
| `POST /api/v3.0/invoice/paymentrequest` | Create (what we do now) |
| `POST /api/v3.0/invoice/paymentrequest/{id}/submit` | Submit current owner's request to workflow |
| `POST /api/v3.0/invoice/paymentrequestwfaction/{id}` | Explicit workflow action with `ApprovalStatusName` |

The workflow action endpoint is the one we likely need, because
"submit" assumes there is a current owner (the media planner in BSD's
flow) and the action would normally re-route. "Skip directly to APGL"
is the kind of transition that `paymentrequestwfaction` was designed
for.

## What we don't know yet (blocker)

These can only be answered by calling the sandbox or pulling the
Concur admin config:

1. **Workflow step names.** BSD's Invoice workflow has named steps
   (Unassigned Queue, Media Planner, APGL Coding, Approval, Paid).
   The Concur API takes these as either step IDs or
   `ApprovalStatusName` strings. We need the exact string Concur
   expects for the APGL step.

2. **Does the workflow allow direct transitions?** Concur workflows
   can be configured to forbid skipping steps. If so we either:
   - Have Concur admin add a transition rule (Unassigned → APGL) gated
     on a custom field we set on the Payment Request (e.g.,
     `Custom20 = "PRE_ALLOCATED"`), then submit normally and let the
     rule auto-advance, or
   - Have Concur admin remove the Unassigned-Queue step entirely for
     Payment Requests that arrive with a non-null
     `Custom20=PRE_ALLOCATED` header field.

3. **Permissions.** The OAuth client behind `getConcurClient()` needs
   permission to perform workflow actions. Today it has Invoice scopes
   for create/read. Submitting/transitioning may need an additional
   scope. Concur's OAuth scopes for Invoice include
   `INVOICE` (read/write) and `WORKFLOW`. We currently request the
   former; the latter may or may not be in our token. Check
   `src/lib/concur/auth.ts` for the scope list.

4. **`ApprovalStatusCode` vs `ApprovalStatusName`.** The Concur SDK
   uses both interchangeably depending on endpoint version. Need to
   confirm which one the v3 action endpoint expects.

## Plan to unblock

1. **Sandbox call A — observe landing state.** Push an invoice via the
   existing `pushInvoiceToConcur` against the BSD sandbox. Immediately
   `GET /api/v3.0/invoice/paymentrequest/{id}` and capture the
   `ApprovalStatusName`, `ApprovalStatusCode`, and `WorkflowActionUrl`
   fields. This tells us the default landing state and what actions
   are available from there.

2. **Sandbox call B — try the workflow action.** Using the URL from
   the previous response (or constructing
   `POST /api/v3.0/invoice/paymentrequestwfaction/{id}`), submit with
   `ApprovalStatusName` set to the APGL step name. Observe whether
   the request moves to APGL Coding or errors with
   "transition not allowed."

3. **If transition fails:** loop in Concur admin to add the
   transition rule, or to configure the Payment Request type so that
   pre-allocated invoices skip the Unassigned Queue. We will likely
   need to set a custom header field to identify pre-allocated
   invoices (probably reusing one of the unused `Custom7-20` slots,
   not the ones in `CUSTOM_FIELD_MAP`).

4. **Verify scopes.** Check the OAuth client's `scope` claim — if
   `WORKFLOW` is missing, request a token regen with the right
   scopes.

## What PR #8 will do (skeleton committed)

`PR #8` lands a stub that, after the existing POST, calls a new
`advanceToAPGL(paymentRequestId)` helper. The helper is gated behind
the env var `CONCUR_ROUTE_TO_APGL=true` and is a no-op when unset,
which lets us merge the wiring before the sandbox calls are done.
When the env is on, the helper calls the workflow action endpoint
with a configurable `CONCUR_APGL_APPROVAL_STATUS_NAME`. Both env vars
should remain unset in production until step (1)+(2) above succeed.

## Risk summary

- **Highest:** the transition may not be permitted by BSD's workflow
  config. Mitigation requires admin involvement, not a code change.
- **Medium:** payload shape unknown for the action endpoint. Will need
  iteration once we have a sandbox session to read the actual response.
- **Low:** rollback. Both calls are idempotent on our side — if the
  workflow call fails we still have the Payment Request created and
  can manually advance it in Concur as we do today. The env-gated
  stub means default behavior is the current (working, if manual)
  flow.

## Open questions for Gail / Concur admin

- What is the exact APGL Coding step name in the Invoice workflow
  config? (Concur surfaces this as `ApprovalStatusName`.)
- Is there a workflow rule that already auto-routes invoices created
  via API away from the Unassigned Queue?
- Does the BSD Concur instance support skipping workflow steps via
  API, or do we need a config change to allow it?
- Are we expected to pass an `Approver` field on the Payment Request
  so APGL Coding has an assigned owner?

## Pointer files

- `src/lib/concur/invoices.ts` — entry point for the push
- `src/lib/concur/mappers.ts` — payload builder
- `src/lib/concur/constants.ts` — `CUSTOM_FIELD_MAP`, paths, defaults
- `src/lib/concur/client.ts` — HTTP client
- `src/lib/concur/auth.ts` — OAuth scopes (verify `WORKFLOW` is present)
