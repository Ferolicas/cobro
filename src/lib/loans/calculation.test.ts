import { describe, expect, it } from "vitest";
import { businessDayStartUtc, businessToday, collectionDate, collectionDayDifference, creditNumbers, creditRating, installmentPlan } from "./calculation";

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

  it("genera 24 días de cobro de lunes a sábado sin contar domingos", () => {
    const plan = installmentPlan(BigInt(20_000), new Date("2026-09-04T00:00:00.000Z"));
    expect(plan[0].dueDate.toISOString()).toBe("2026-09-04T00:00:00.000Z");
    expect(plan[1].dueDate.toISOString()).toBe("2026-09-05T00:00:00.000Z");
    expect(plan[2].dueDate.toISOString()).toBe("2026-09-07T00:00:00.000Z");
    expect(plan[23].dueDate.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(plan.some((installment) => installment.dueDate.getUTCDay() === 0)).toBe(false);
  });

  it("mueve al lunes la primera cuota si la fecha indicada cae en domingo", () => {
    expect(collectionDate(new Date("2026-09-06T00:00:00.000Z"), 0).toISOString()).toBe("2026-09-07T00:00:00.000Z");
  });

  it("calcula los días restantes sin contar domingos", () => {
    expect(collectionDayDifference(new Date("2026-09-04T00:00:00.000Z"), new Date("2026-09-07T00:00:00.000Z"))).toBe(2);
    expect(collectionDayDifference(new Date("2026-09-07T00:00:00.000Z"), new Date("2026-09-04T00:00:00.000Z"))).toBe(-2);
  });

  it("cambia la clasificación de B a Q al tercer día de atraso", () => {
    expect(creditRating(2)).toBe("B");
    expect(creditRating(3)).toBe("Q");
  });

  it("calcula el día de negocio en la zona horaria de Perú", () => {
    expect(businessToday(new Date("2026-09-04T03:30:00.000Z")).toISOString()).toBe("2026-09-03T00:00:00.000Z");
    expect(businessToday(new Date("2026-09-04T05:30:00.000Z")).toISOString()).toBe("2026-09-04T00:00:00.000Z");
    expect(businessDayStartUtc(new Date("2026-09-04T05:30:00.000Z")).toISOString()).toBe("2026-09-04T05:00:00.000Z");
  });
});
