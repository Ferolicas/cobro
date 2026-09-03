import { describe, expect, it } from "vitest";
import { calculateAutomaticLiquidation } from "./calculation";

describe("calculateAutomaticLiquidation", () => {
  it("calcula la caja usando solo los movimientos registrados", () => {
    const result = calculateAutomaticLiquidation({
      openingBaseCents: BigInt(50_000),
      expensesCents: BigInt(3_000),
      collectorWithdrawalCents: BigInt(2_000),
      movements: [
        { type: "PAYMENT_CASH", direction: "IN", amountCents: BigInt(20_000) },
        { type: "PAYMENT_YAPE", direction: "IN", amountCents: BigInt(5_000) },
        { type: "DISBURSEMENT", direction: "OUT", amountCents: BigInt(20_000) },
        { type: "ADVANCE_INSTALLMENT", direction: "IN", amountCents: BigInt(1_000) },
        { type: "MICROINSURANCE", direction: "IN", amountCents: BigInt(2_000) },
      ],
    });

    expect(result.cashOutCents).toBe(BigInt(17_000));
    expect(result.totalCollectedCents).toBe(BigInt(25_000));
    expect(result.expectedClosingCents).toBe(BigInt(48_000));
  });

  it("descuenta la liquidacion anterior de una renovacion del efectivo entregado", () => {
    const result = calculateAutomaticLiquidation({
      openingBaseCents: BigInt(0),
      expensesCents: BigInt(0),
      collectorWithdrawalCents: BigInt(0),
      movements: [
        { type: "DISBURSEMENT", direction: "OUT", amountCents: BigInt(30_000) },
        { type: "ADVANCE_INSTALLMENT", direction: "IN", amountCents: BigInt(1_500) },
        { type: "RENEWAL_SETTLEMENT", direction: "IN", amountCents: BigInt(10_000) },
      ],
    });

    expect(result.cashOutCents).toBe(BigInt(18_500));
    expect(result.expectedClosingCents).toBe(BigInt(-18_500));
  });
});
