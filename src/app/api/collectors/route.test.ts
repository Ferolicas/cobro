import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  hashPassword: vi.fn(),
  zoneFindFirst: vi.fn(),
  previousCollectorFindFirst: vi.fn(),
  createCollector: vi.fn(),
  updatePreviousCollector: vi.fn(),
  transferClients: vi.fn(),
  transferCredits: vi.fn(),
  deleteSessions: vi.fn(),
  createAudit: vi.fn(),
  transaction: vi.fn(),
  notifyMasters: vi.fn(),
}));

vi.mock("better-auth/crypto", () => ({ hashPassword: mocks.hashPassword }));
vi.mock("@/lib/auth/guard", () => ({
  requireUser: mocks.requireUser,
  apiError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 }),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    zone: { findFirst: mocks.zoneFindFirst },
    user: { findFirst: mocks.previousCollectorFindFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/json", () => ({
  jsonResponse: (data: unknown, init?: ResponseInit) => Response.json(data, init),
  jsonValue: (value: unknown) => value,
}));
vi.mock("@/lib/notify", () => ({ notifyMasters: mocks.notifyMasters }));
vi.mock("@/lib/liquidations/constants", () => ({ COLLECTOR_BASE_CENTS: BigInt(3_000_000) }));
vi.mock("@/lib/loans/calculation", () => ({
  businessDateKey: () => "2026-09-14",
  businessDayStartUtc: () => new Date("2026-09-14T05:00:00.000Z"),
}));

import { POST } from "./route";

describe("transferencia al crear un cobrador", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ user: { id: "master-1", name: "Maestro" } });
    mocks.hashPassword.mockResolvedValue("hashed-password");
    mocks.zoneFindFirst.mockResolvedValue({ id: "zone-1", name: "Centro", active: true });
    mocks.previousCollectorFindFirst.mockResolvedValue({ id: "old-1", name: "Juan David", role: "COLLECTOR", active: true });
    mocks.createCollector.mockImplementation(({ data }) => Promise.resolve({
      id: data.id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      zoneId: data.zoneId,
      role: data.role,
      active: data.active,
      mustChangePassword: data.mustChangePassword,
    }));
    mocks.transferClients.mockResolvedValue({ count: 18 });
    mocks.transferCredits.mockResolvedValue({ count: 11 });
    mocks.updatePreviousCollector.mockResolvedValue({ id: "old-1", active: false });
    mocks.deleteSessions.mockResolvedValue({ count: 2 });
    mocks.createAudit.mockResolvedValue({ id: "audit-1" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      user: { create: mocks.createCollector, update: mocks.updatePreviousCollector },
      client: { updateMany: mocks.transferClients },
      credit: { updateMany: mocks.transferCredits },
      session: { deleteMany: mocks.deleteSessions },
      auditLog: { create: mocks.createAudit },
    }));
    mocks.notifyMasters.mockResolvedValue([]);
  });

  it("mueve solo la cartera operativa, desactiva el acceso anterior y conserva la atribución histórica", async () => {
    const response = await POST(new Request("http://localhost/api/collectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Carlos Pérez",
        email: "CARLOS@EXAMPLE.COM",
        phone: "999999999",
        zoneId: "zone-1",
        transferFromCollectorId: "old-1",
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.transferClients).toHaveBeenCalledWith({
      where: { collectorId: "old-1", active: true },
      data: { collectorId: body.collector.id },
    });
    expect(mocks.transferCredits).toHaveBeenCalledWith({
      where: { collectorId: "old-1", status: { in: ["ACTIVE", "OVERDUE"] } },
      data: { collectorId: body.collector.id },
    });
    expect(mocks.updatePreviousCollector).toHaveBeenCalledWith({ where: { id: "old-1" }, data: { active: false } });
    expect(mocks.deleteSessions).toHaveBeenCalledWith({ where: { userId: "old-1" } });
    expect(mocks.createAudit).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: "COLLECTOR_PORTFOLIO_TRANSFERRED",
      metadata: expect.objectContaining({
        previousCollectorName: "Juan David",
        transferredClients: 18,
        transferredCredits: 11,
        historicalRecordsPreserved: true,
      }),
    }) });
    expect(body.transfer).toMatchObject({
      previousCollector: { id: "old-1", name: "Juan David" },
      clients: 18,
      credits: 11,
    });
  });
});
