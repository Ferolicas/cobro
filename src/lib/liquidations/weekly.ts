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
  manualExpensesCents: bigint;
  collectorSalaryCents: bigint;
  chainWithdrawalCents: bigint;
  surplusCents: bigint;
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

export function calculateWeeklyResult(input: {
  collectedCents: bigint;
  disbursedCents: bigint;
  microinsuranceCents: bigint;
  manualExpensesCents: bigint;
  collectorSalaryCents: bigint;
  chainWithdrawalCents: bigint;
}) {
  const expensesCents = input.manualExpensesCents + input.collectorSalaryCents + input.chainWithdrawalCents;
  const resultBeforeExpensesCents = input.collectedCents - input.disbursedCents;
  const resultBeforeMicroinsuranceCents = resultBeforeExpensesCents - expensesCents;
  const netResultCents = resultBeforeMicroinsuranceCents + input.microinsuranceCents;
  return { expensesCents, resultBeforeExpensesCents, resultBeforeMicroinsuranceCents, netResultCents };
}

export function calculateWeeklyBalance(days: FinancialDay[]) {
  const activeDays = days.filter((day) => !day.isFuture);
  const sum = (field: keyof FinancialDay) =>
    activeDays.reduce((total, day) => total + BigInt(day[field] as bigint), BigInt(0));
  const collectedBeforeMicroinsuranceCents = sum("ledgerCollectedCashCents") + sum("collectedDigitalCents");
  const collectedCents = sum("totalIncomeCents") + sum("collectedDigitalCents");
  const disbursedCents = sum("disbursedCents");
  const manualExpensesCents = sum("manualExpensesCents");
  const microinsuranceCents = sum("microinsuranceCents");
  const chainWithdrawalCents = sum("chainWithdrawalCents");
  const collectionCommissionCents = (collectedBeforeMicroinsuranceCents * BigInt(3)) / BigInt(100);
  const collectorSalaryCents = collectionCommissionCents;
  const projectedInterestCents = (disbursedCents * BigInt(20)) / BigInt(100);
  const { expensesCents, resultBeforeExpensesCents, resultBeforeMicroinsuranceCents, netResultCents } = calculateWeeklyResult({
    collectedCents: collectedBeforeMicroinsuranceCents,
    disbursedCents,
    microinsuranceCents,
    manualExpensesCents,
    collectorSalaryCents,
    chainWithdrawalCents,
  });
  const profitCents = netResultCents;

  return {
    collectedBeforeMicroinsuranceCents,
    collectedCents,
    collectionCommissionCents,
    disbursedCents,
    projectedInterestCents,
    microinsuranceCents,
    manualExpensesCents,
    collectorSalaryCents,
    chainWithdrawalCents,
    expensesCents,
    collectorWithdrawalCents: collectorSalaryCents,
    resultBeforeExpensesCents,
    resultBeforeMicroinsuranceCents,
    profitCents,
    netResultCents,
    newClientsCount: activeDays.reduce((total, day) => total + day.newClientsCount, 0),
  };
}
