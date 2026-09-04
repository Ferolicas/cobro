export type FinancialDay = {
  date: string;
  dayName: string;
  isFuture: boolean;
  source: "AUTOMATIC" | "SUBMITTED" | "EXCEL";
  openingBaseCents: bigint;
  ledgerCollectedCashCents: bigint;
  totalIncomeCents: bigint;
  collectedDigitalCents: bigint;
  disbursedCents: bigint;
  microinsuranceCents: bigint;
  advancePaymentCents: bigint;
  renewalSettlementCents: bigint;
  expensesCents: bigint;
  collectorWithdrawalCents: bigint;
  expectedClosingCents: bigint;
  closingCashCents: bigint | null;
  differenceCents: bigint | null;
  newClientsCount: number;
  totalAssignedClients: number;
  overdue30Count: number;
  zeroBalanceCount: number;
  movementCount: number;
  notes: string | null;
  detailNotes: string[];
};

export function calculateWeeklyBalance(days: FinancialDay[]) {
  const activeDays = days.filter((day) => !day.isFuture);
  const sum = (field: keyof FinancialDay) =>
    activeDays.reduce((total, day) => total + BigInt(day[field] as bigint), BigInt(0));
  const collectedBeforeMicroinsuranceCents = sum("ledgerCollectedCashCents") + sum("collectedDigitalCents");
  const collectedCents = sum("totalIncomeCents") + sum("collectedDigitalCents");
  const disbursedCents = sum("disbursedCents");
  const expensesCents = sum("expensesCents");
  const microinsuranceCents = sum("microinsuranceCents");
  const collectorWithdrawalCents = sum("collectorWithdrawalCents");
  const collectionCommissionCents = (collectedCents * BigInt(3)) / BigInt(100);
  const projectedInterestCents = (disbursedCents * BigInt(20)) / BigInt(100);
  const profitCents = projectedInterestCents - expensesCents;
  const netResultCents = projectedInterestCents + microinsuranceCents - expensesCents - collectionCommissionCents - collectorWithdrawalCents;

  return {
    collectedBeforeMicroinsuranceCents,
    collectedCents,
    collectionCommissionCents,
    disbursedCents,
    projectedInterestCents,
    microinsuranceCents,
    expensesCents,
    collectorWithdrawalCents,
    profitCents,
    netResultCents,
    newClientsCount: activeDays.reduce((total, day) => total + day.newClientsCount, 0),
  };
}
