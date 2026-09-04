import { describe, expect, it } from "vitest";
import { calculateWeeklyBalance, type FinancialDay } from "./weekly";

function day(values: Partial<FinancialDay>): FinancialDay {
  return {
    date: "2026-08-31",
    dayName: "LUNES",
    isFuture: false,
    source: "EXCEL",
    openingBaseCents: BigInt(0),
    ledgerCollectedCashCents: BigInt(0),
    totalIncomeCents: BigInt(0),
    collectedDigitalCents: BigInt(0),
    disbursedCents: BigInt(0),
    microinsuranceCents: BigInt(0),
    advancePaymentCents: BigInt(0),
    renewalSettlementCents: BigInt(0),
    expensesCents: BigInt(0),
    collectorWithdrawalCents: BigInt(0),
    expectedClosingCents: BigInt(0),
    closingCashCents: null,
    differenceCents: null,
    newClientsCount: 0,
    totalAssignedClients: 0,
    overdue30Count: 0,
    zeroBalanceCount: 0,
    movementCount: 0,
    notes: null,
    detailNotes: [],
    ...values,
  };
}

describe("calculateWeeklyBalance", () => {
  it("reproduce el balance semanal del Excel de Beatriz", () => {
    const result = calculateWeeklyBalance([
      day({ ledgerCollectedCashCents: BigInt(297_500), totalIncomeCents: BigInt(315_500), disbursedCents: BigInt(380_000), expensesCents: BigInt(3_500), microinsuranceCents: BigInt(18_000), newClientsCount: 6 }),
      day({ date: "2026-09-01", dayName: "MARTES", ledgerCollectedCashCents: BigInt(208_200), totalIncomeCents: BigInt(213_700), disbursedCents: BigInt(110_000), expensesCents: BigInt(30_000), microinsuranceCents: BigInt(5_500), newClientsCount: 3 }),
    ]);

    expect(result.collectedBeforeMicroinsuranceCents).toBe(BigInt(505_700));
    expect(result.collectedCents).toBe(BigInt(529_200));
    expect(result.collectionCommissionCents).toBe(BigInt(15_876));
    expect(result.disbursedCents).toBe(BigInt(490_000));
    expect(result.projectedInterestCents).toBe(BigInt(98_000));
    expect(result.microinsuranceCents).toBe(BigInt(23_500));
    expect(result.expensesCents).toBe(BigInt(33_500));
    expect(result.profitCents).toBe(BigInt(64_500));
    expect(result.newClientsCount).toBe(9);
  });
});
