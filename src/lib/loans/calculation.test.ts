import { describe, expect, it } from "vitest";
import { businessDayStartUtc, businessToday, creditNumbers, installmentPlan } from "./calculation";

describe("reglas de crédito", () => {
  it("calcula 20% y 24 cuotas exactas para S/ 200", () => {
    const principal = BigInt(20_000);
    const numbers = creditNumbers(principal);
    const plan = installmentPlan(principal, new Date("2026-09-04T00:00:00.000Z"));

    expect(numbers.interestCents).toBe(BigInt(4_000));
    expect(numbers.totalDueCents).toBe(BigInt(24_000));
    expect(plan).toHaveLength(24);
    expect(plan.reduce((sum, quota) => sum + quota.expectedCents, BigInt(0))).toBe(BigInt(24_000));
    expect(plan[0].expectedCents).toBe(BigInt(1_000));
  });

  it("distribuye los céntimos residuales sin perder dinero", () => {
    const plan = installmentPlan(BigInt(10_001), new Date("2026-09-04T00:00:00.000Z"));
    expect(plan.reduce((sum, quota) => sum + quota.expectedCents, BigInt(0))).toBe(BigInt(12_001));
  });

  it("calcula el día de negocio en la zona horaria de Perú", () => {
    expect(businessToday(new Date("2026-09-04T03:30:00.000Z")).toISOString()).toBe("2026-09-03T00:00:00.000Z");
    expect(businessToday(new Date("2026-09-04T05:30:00.000Z")).toISOString()).toBe("2026-09-04T00:00:00.000Z");
    expect(businessDayStartUtc(new Date("2026-09-04T05:30:00.000Z")).toISOString()).toBe("2026-09-04T05:00:00.000Z");
  });
});
