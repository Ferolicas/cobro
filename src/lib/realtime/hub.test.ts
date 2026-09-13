import { afterEach, describe, expect, it, vi } from "vitest";
import { emitDataChanged, emitRealtime } from "./hub";

afterEach(() => {
  globalThis.__cobroRealtime = undefined;
});

describe("publicación de cambios en tiempo real", () => {
  it("invalida por defecto a todas las sesiones autenticadas", () => {
    const emit = vi.fn();
    const to = vi.fn((room: string) => {
      void room;
      return { emit };
    });
    globalThis.__cobroRealtime = { to } as never;

    emitDataChanged({ action: "DOCUMENTS_UPLOADED", entityType: "client", entityId: "client-1" });

    expect(to).toHaveBeenCalledWith("authenticated");
    expect(emit).toHaveBeenCalledWith("data:changed", expect.objectContaining({
      action: "DOCUMENTS_UPLOADED",
      entityType: "client",
      entityId: "client-1",
      occurredAt: expect.any(String),
    }));
  });

  it("respeta el alcance de administrador y usuario sin duplicar la persistencia", () => {
    const emit = vi.fn();
    const to = vi.fn((room: string) => {
      void room;
      return { emit };
    });
    globalThis.__cobroRealtime = { to } as never;

    emitDataChanged(
      { action: "PAYMENT_RECORDED", entityType: "credit", entityId: "credit-1" },
      ["masters", "user:collector-1"],
    );

    expect(to.mock.calls.map(([room]) => room)).toEqual(["masters", "user:collector-1"]);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it("no falla cuando el servidor Socket.IO todavía no está preparado", () => {
    expect(() => emitRealtime("data:changed", {})).not.toThrow();
  });
});
