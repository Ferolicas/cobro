import { businessDateKey } from "../loans/calculation";

export type DailyCashMovement = {
  type: string;
  direction: string;
  amountCents: bigint;
};

const ORIGINATION_MOVEMENT_TYPES = new Set([
  "DISBURSEMENT",
  "ADVANCE_INSTALLMENT",
  "MICROINSURANCE",
  "RENEWAL_SETTLEMENT",
]);

export function financialEventDateKey(event: { type: string; occurredAt: Date | string }) {
  const occurredAt = new Date(event.occurredAt);
  const isLegacyUtcMidnight = ORIGINATION_MOVEMENT_TYPES.has(event.type)
    && occurredAt.getUTCHours() === 0
    && occurredAt.getUTCMinutes() === 0
    && occurredAt.getUTCSeconds() === 0
    && occurredAt.getUTCMilliseconds() === 0;
  return isLegacyUtcMidnight
    ? occurredAt.toISOString().slice(0, 10)
    : businessDateKey(occurredAt);
}

export function financialEventsForDate<T extends { type: string; occurredAt: Date | string }>(events: T[], date: Date | string) {
  const key = typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  return events.filter((event) => financialEventDateKey(event) === key);
}

function sumType(movements: DailyCashMovement[], type: string) {
  return movements
    .filter((movement) => movement.type === type)
    .reduce((total, movement) => total + movement.amountCents, BigInt(0));
}

export function calculateAutomaticLiquidation(input: {
  movements: DailyCashMovement[];
  openingBaseCents: bigint;
  manualExpensesCents: bigint;
  collectorSalaryCents: bigint;
  chainWithdrawalCents: bigint;
}) {
  const collectedCashCents = sumType(input.movements, "PAYMENT_CASH");
  const collectedYapeCents = sumType(input.movements, "PAYMENT_YAPE");
  const collectedTransferCents = sumType(input.movements, "PAYMENT_TRANSFER");
  const disbursedCents = sumType(input.movements, "DISBURSEMENT");
  const advancePaymentCents = sumType(input.movements, "ADVANCE_INSTALLMENT");
  const microinsuranceCents = sumType(input.movements, "MICROINSURANCE");
  const renewalSettlementCents = sumType(input.movements, "RENEWAL_SETTLEMENT");
  const retainedBeforeMicroinsuranceCents = advancePaymentCents + renewalSettlementCents;
  const retainedFromDisbursements = retainedBeforeMicroinsuranceCents + microinsuranceCents;
  const cashOutCents = disbursedCents > retainedFromDisbursements ? disbursedCents - retainedFromDisbursements : BigInt(0);
  const collectedDigitalCents = collectedYapeCents + collectedTransferCents;
  const totalCollectedCents = collectedCashCents + collectedDigitalCents;
  // PRESTAMOS es el capital bruto. COBRADO incluye pagos en efectivo, primeras
  // cuotas y saldos retenidos por renovación; M.S se muestra y se suma aparte.
  const ledgerCollectedCashCents = collectedCashCents + retainedBeforeMicroinsuranceCents;
  const totalIncomeCents = ledgerCollectedCashCents + microinsuranceCents;
  const ledgerCollectedTotalCents = totalIncomeCents + collectedDigitalCents;
  const beforeChainCents =
    input.openingBaseCents +
    totalIncomeCents -
    disbursedCents -
    input.manualExpensesCents -
    input.collectorSalaryCents;
  const surplusCents = beforeChainCents > input.openingBaseCents
    ? beforeChainCents - input.openingBaseCents
    : BigInt(0);
  if (input.chainWithdrawalCents < BigInt(0) || input.chainWithdrawalCents > surplusCents) {
    throw new Error("El retiro de cadena no puede superar el sobrante disponible");
  }
  const expensesCents =
    input.manualExpensesCents + input.collectorSalaryCents + input.chainWithdrawalCents;
  const expectedClosingCents = beforeChainCents - input.chainWithdrawalCents;

  return {
    collectedCashCents,
    collectedYapeCents,
    collectedTransferCents,
    collectedDigitalCents,
    totalCollectedCents,
    ledgerCollectedCashCents,
    totalIncomeCents,
    ledgerCollectedTotalCents,
    disbursedCents,
    advancePaymentCents,
    microinsuranceCents,
    renewalSettlementCents,
    cashOutCents,
    manualExpensesCents: input.manualExpensesCents,
    collectorSalaryCents: input.collectorSalaryCents,
    chainWithdrawalCents: input.chainWithdrawalCents,
    expensesCents,
    surplusCents,
    expectedClosingCents,
  };
}
