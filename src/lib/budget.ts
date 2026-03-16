import { Decimal } from "@prisma/client/runtime/library";

export function calculateEffectiveBudget(mba: {
  budget: Decimal | number;
  changeOrders?: { amount: Decimal | number }[];
  creditsIn?: { amount: Decimal | number }[];
  creditsOut?: { amount: Decimal | number }[];
}): number {
  const base = Number(mba.budget);

  const changeOrderTotal = (mba.changeOrders ?? []).reduce(
    (sum, co) => sum + Number(co.amount),
    0
  );

  const creditsInTotal = (mba.creditsIn ?? []).reduce(
    (sum, cr) => sum + Number(cr.amount),
    0
  );

  const creditsOutTotal = (mba.creditsOut ?? []).reduce(
    (sum, cr) => sum + Number(cr.amount),
    0
  );

  return base + changeOrderTotal + creditsInTotal - creditsOutTotal;
}
