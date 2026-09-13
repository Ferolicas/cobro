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

  it("conserva las cuotas ya pagadas cuando sus pagos históricos quedaron fuera del calendario recalculado", () => {
    const ledger = installmentLedger({
      installments: [
        { number: 1, dueDate: "2026-08-03T00:00:00.000Z", paidCents: 4_000, status: "PAID", paidAt: "2026-08-03T16:00:00.000Z" },
        { number: 2, dueDate: "2026-08-04T00:00:00.000Z", paidCents: 4_000, status: "PAID", paidAt: "2026-09-10T16:00:00.000Z" },
      ],
      payments: [
        { amountCents: 4_000, paidAt: "2026-08-03T16:00:00.000Z", source: "EXCEL_IMPORT", allocations: [{ installment: { number: 1 } }] },
        { amountCents: 4_000, paidAt: "2026-09-10T16:00:00.000Z", source: "EXCEL_IMPORT", allocations: [{ installment: { number: 2 } }] },
      ],
      totalDueCents: 8_000,
      installmentCents: 4_000,
      today: "2026-09-10",
    });
    expect(ledger[0]).toMatchObject({ displayCents: 4_000, visualStatus: "paid", checked: true });
    expect(ledger[1]).toMatchObject({ displayCents: 4_000, visualStatus: "paid-late", checked: true });
  });

  it("no convierte en verde un día impago cuando el dinero se recibió en el siguiente día del plan", () => {
    const ledger = installmentLedger({
      installments: [
        { number: 1, dueDate: "2026-09-07T00:00:00.000Z", paidCents: 4_000, status: "PAID", paidAt: "2026-09-08T15:00:00.000Z" },
        { number: 2, dueDate: "2026-09-08T00:00:00.000Z", paidCents: 4_000, status: "PAID", paidAt: "2026-09-08T15:00:00.000Z" },
      ],
      payments: [{
        amountCents: 8_000,
        paidAt: "2026-09-08T15:00:00.000Z",
        source: "DAILY_COLLECTION",
        allocations: [{ installment: { number: 1 } }, { installment: { number: 2 } }],
      }],
      totalDueCents: 8_000,
      installmentCents: 4_000,
      today: "2026-09-08",
    });
    expect(ledger[0]).toMatchObject({ displayCents: 0, visualStatus: "partial", checked: false });
    expect(ledger[1]).toMatchObject({ displayCents: 8_000, visualStatus: "paid", checked: true });
  });

  it("nunca recalcula días anteriores con el saldo FIFO pagado después", () => {
    const ledger = installmentLedger({
      installments: [
        { number: 1, dueDate: "2026-10-01T00:00:00.000Z", paidCents: 4_000, status: "PAID", paidAt: "2026-09-08T15:00:00.000Z" },
        { number: 2, dueDate: "2026-10-02T00:00:00.000Z", paidCents: 3_000, status: "PARTIAL", paidAt: null },
        { number: 3, dueDate: "2026-10-03T00:00:00.000Z", paidCents: 0, status: "PENDING", paidAt: null },
      ],
      payments: [
        { amountCents: 3_000, paidAt: "2026-09-07T15:00:00.000Z", source: "DAILY_COLLECTION", allocations: [{ installment: { number: 1 } }] },
        { amountCents: 4_000, paidAt: "2026-09-08T15:00:00.000Z", source: "DAILY_COLLECTION", allocations: [{ installment: { number: 1 } }, { installment: { number: 2 } }] },
      ],
      totalDueCents: 12_000,
      installmentCents: 4_000,
      today: "2026-09-08",
    });
    expect(ledger[0]).toMatchObject({ dueCents: 4_000, displayCents: 3_000, visualStatus: "partial", checked: true });
    expect(ledger[1]).toMatchObject({ dueCents: 5_000, displayCents: 4_000, visualStatus: "partial", checked: true });
    expect(ledger[2]).toMatchObject({ dueCents: 5_000, displayCents: 5_000, visualStatus: "pending", checked: false });
  });

  it("muestra cada cuota registrada por separado aunque todas se cobren el mismo día", () => {
    const ledger = installmentLedger({
      installments: Array.from({ length: 6 }, (_, index) => ({
        number: index + 1,
        dueDate: `2026-09-${String(14 + index).padStart(2, "0")}T00:00:00.000Z`,
      })),
      payments: [
        { id: "01", amountCents: 4_000, paidAt: "2026-09-13T12:00:00.000Z", source: "ADVANCE_INSTALLMENT" },
        { id: "02", amountCents: 4_000, paidAt: "2026-09-13T19:45:00.000Z", source: "DAILY_COLLECTION" },
        { id: "03", amountCents: 3_000, paidAt: "2026-09-13T19:49:00.000Z", source: "DAILY_COLLECTION" },
        { id: "04", amountCents: 5_000, paidAt: "2026-09-13T19:50:00.000Z", source: "DAILY_COLLECTION" },
      ],
      totalDueCents: 24_000,
      installmentCents: 4_000,
      today: "2026-09-13",
    });

    expect(ledger.slice(0, 5).map((installment) => installment.displayCents)).toEqual([4_000, 4_000, 3_000, 5_000, 4_000]);
    expect(ledger.slice(0, 4).map((installment) => installment.checked)).toEqual([true, true, true, true]);
    expect(ledger[4].visualStatus).toBe("pending");
  });
});
