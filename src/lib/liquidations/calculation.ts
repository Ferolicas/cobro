export type DailyCashMovement = {
  type: string;
  direction: string;
  amountCents: bigint;
};

function sumType(movements: DailyCashMovement[], type: string) {
  return movements
    .filter((movement) => movement.type === type)
    .reduce((total, movement) => total + movement.amountCents, BigInt(0));
}

export function calculateAutomaticLiquidation(input: {
  movements: DailyCashMovement[];
  openingBaseCents: bigint;
  expensesCents: bigint;
  collectorWithdrawalCents: bigint;
}) {
  const collectedCashCents = sumType(input.movements, "PAYMENT_CASH");
  const collectedYapeCents = sumType(input.movements, "PAYMENT_YAPE");
  const collectedTransferCents = sumType(input.movements, "PAYMENT_TRANSFER");
  const disbursedCents = sumType(input.movements, "DISBURSEMENT");
  const advancePaymentCents = sumType(input.movements, "ADVANCE_INSTALLMENT");
  const microinsuranceCents = sumType(input.movements, "MICROINSURANCE");
  const renewalSettlementCents = sumType(input.movements, "RENEWAL_SETTLEMENT");
  const retainedFromDisbursements = advancePaymentCents + microinsuranceCents + renewalSettlementCents;
  const cashOutCents = disbursedCents > retainedFromDisbursements ? disbursedCents - retainedFromDisbursements : BigInt(0);
  const collectedDigitalCents = collectedYapeCents + collectedTransferCents;
  const totalCollectedCents = collectedCashCents + collectedDigitalCents;
  // El Excel usa PRESTÓ como capital bruto. Para que el cuadre siga siendo
  // BASE + COBRO - PRESTÓ - GASTOS - COBRADOR, COBRO incluye todo lo que se
  // retuvo al desembolsar: primera cuota, microseguro y saldo de renovación.
  const ledgerCollectedCashCents = collectedCashCents + retainedFromDisbursements;
  const ledgerCollectedTotalCents = ledgerCollectedCashCents + collectedDigitalCents;
  const expectedClosingCents = input.openingBaseCents + ledgerCollectedCashCents - disbursedCents - input.expensesCents - input.collectorWithdrawalCents;

  return {
    collectedCashCents,
    collectedYapeCents,
    collectedTransferCents,
    collectedDigitalCents,
    totalCollectedCents,
    ledgerCollectedCashCents,
    ledgerCollectedTotalCents,
    disbursedCents,
    advancePaymentCents,
    microinsuranceCents,
    renewalSettlementCents,
    cashOutCents,
    expectedClosingCents,
  };
}
