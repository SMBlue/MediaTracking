import { prisma } from "./db";

type EntityType = "Client" | "MBA" | "Invoice" | "SpendEntry" | "InvoiceAllocation";
type Action = "CREATE" | "UPDATE" | "DELETE";

interface AuditLogParams {
  entityType: EntityType;
  entityId: string;
  action: Action;
  changes?: Record<string, { old: unknown; new: unknown }>;
  userId?: string;
  userEmail?: string;
}

export async function logAudit({
  entityType,
  entityId,
  action,
  changes,
  userId,
  userEmail,
}: AuditLogParams) {
  try {
    await prisma.auditLog.create({
      data: {
        entityType,
        entityId,
        action,
        changes: changes ?? null,
        userId,
        userEmail,
      },
    });
  } catch (error) {
    // Don't let audit logging failures break the main operation
    console.error("Failed to create audit log:", error);
  }
}

// Helper to compute changes between old and new objects
export function computeChanges<T extends Record<string, unknown>>(
  oldObj: T | null,
  newObj: T,
  fields: (keyof T)[]
): Record<string, { old: unknown; new: unknown }> | undefined {
  if (!oldObj) {
    return undefined; // No changes to track for CREATE
  }

  const changes: Record<string, { old: unknown; new: unknown }> = {};

  for (const field of fields) {
    const oldVal = oldObj[field];
    const newVal = newObj[field];

    // Convert Decimals to numbers for comparison
    const normalizedOld = oldVal instanceof Object && "toNumber" in oldVal
      ? (oldVal as { toNumber: () => number }).toNumber()
      : oldVal;
    const normalizedNew = newVal instanceof Object && "toNumber" in newVal
      ? (newVal as { toNumber: () => number }).toNumber()
      : newVal;

    if (normalizedOld !== normalizedNew) {
      changes[String(field)] = { old: normalizedOld, new: normalizedNew };
    }
  }

  return Object.keys(changes).length > 0 ? changes : undefined;
}
