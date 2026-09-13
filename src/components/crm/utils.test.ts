import { describe, expect, it } from "vitest";
import { installmentLedger, installmentVisualStatus } from "./utils";

describe("estado visual de las cuotas", () => {
  it("mantiene verde una cuota completada en su día de vencimiento en Perú", () => {
    expect(installmentVisualStatus({
      status: "PAID",
      dueDate: "2026-09-04T00:00:00.000Z",
      paidAt: "2026-09-05T02:30:00.000Z",
    })).toBe("paid");
  });

  it("marca en amarillo una cuota completada después de su vencimiento", () => {
    expect(installmentVisualStatus({
      status: "PAID",
      dueDate: "2026-09-04T00:00:00.000Z",
      paidAt: "2026-09-05T05:00:00.000Z",
    })).toBe("paid-late");
  });

  it("conserva el estado de una cuota parcial", () => {
    expect(installmentVisualStatus({
      status: "PARTIAL",
      dueDate: "2026-09-04T00:00:00.000Z",
      paidAt: null,
    })).toBe("partial");
  });
});

describe("lectura diaria del plan", () => {
  it("conserva 30 en amarillo y traslada 10 para mostrar 50 verdes al día siguiente", () => {
    const ledger = installmentLedger({
      installments: [
        { number: 1, dueDate: "2026-09-07T00:00:00.000Z" },
        { number: 2, dueDate: "2026-09-08T00:00:00.000Z" },
      ],
      payments: [
        { amountCents: 3_000, paidAt: "2026-09-07T15:00:00.000Z", source: "DAILY_COLLECTION" },
        { amountCents: 5_000, paidAt: "2026-09-08T15:00:00.000Z", source: "DAILY_COLLECTION" },
      ],
      totalDueCents: 8_000,
      installmentCents: 4_000,
      today: "2026-09-08",
    });
    expect(ledger[0]).toMatchObject({ displayCents: 3_000, visualStatus: "partial", checked: true });
    expect(ledger[1]).toMatchObject({ dueCents: 5_000, displayCents: 5_000, visualStatus: "paid", checked: true });
  });

  it("muestra cero amarillo en un día sin pago y acumula la cuota siguiente", () => {
    const ledger = installmentLedger({
      installments: [
        { number: 1, dueDate: "2026-09-07T00:00:00.000Z" },
        { number: 2, dueDate: "2026-09-08T00:00:00.000Z" },
      ],
      payments: [],
      totalDueCents: 8_000,
      installmentCents: 4_000,
      today: "2026-09-08",
    });
    expect(ledger[0]).toMatchObject({ displayCents: 0, visualStatus: "partial", checked: false });
    expect(ledger[1].dueCents).toBe(8_000);
  });
});
