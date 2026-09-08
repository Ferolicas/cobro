import { describe, expect, it } from "vitest";
import { installmentVisualStatus } from "./utils";

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
