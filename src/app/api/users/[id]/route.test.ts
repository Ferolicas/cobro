import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireSuperAdmin: vi.fn(),
  findUser: vi.fn(),
  deleteUser: vi.fn(),
  createAudit: vi.fn(),
  transaction: vi.fn(),
  disconnectRealtimeUser: vi.fn(),
  emitDataChanged: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({
  requireUser: mocks.requireUser,
  apiError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 }),
}));
vi.mock("@/lib/auth/scope", () => ({ requireSuperAdmin: mocks.requireSuperAdmin }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUser }, $transaction: mocks.transaction },
}));
vi.mock("@/lib/json", () => ({
  jsonResponse: (data: unknown, init?: ResponseInit) => Response.json(data, init),
  jsonValue: (value: unknown) => value,
}));
vi.mock("@/lib/realtime/hub", () => ({
  disconnectRealtimeUser: mocks.disconnectRealtimeUser,
  emitDataChanged: mocks.emitDataChanged,
}));

import { DELETE } from "./route";

describe("eliminación definitiva de usuarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ user: { id: "principal-1", role: "MASTER", isSuperAdmin: true } });
    mocks.findUser.mockResolvedValue({
      id: "collector-1",
      name: "Cobrador",
      email: "cobrador@example.com",
      role: "COLLECTOR",
      isSuperAdmin: false,
      _count: { assignedClients: 2, managedCredits: 1, payments: 4, liquidations: 1, uploadedDocuments: 2, cashMovements: 5 },
    });
    mocks.deleteUser.mockResolvedValue({ id: "collector-1" });
    mocks.createAudit.mockResolvedValue({ id: "audit-1" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      user: { delete: mocks.deleteUser },
      auditLog: { create: mocks.createAudit },
    }));
  });

  it("borra la cuenta, conserva el conteo histórico y desconecta su socket", async () => {
    const response = await DELETE(new Request("http://localhost/api/users/collector-1", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "cobrador@example.com" }),
    }), { params: Promise.resolve({ id: "collector-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.deleteUser).toHaveBeenCalledWith({ where: { id: "collector-1" } });
    expect(mocks.createAudit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "USER_PERMANENTLY_DELETED" }) });
    expect(mocks.disconnectRealtimeUser).toHaveBeenCalledWith("collector-1");
    expect(body.detachedRecords).toMatchObject({ assignedClients: 2, payments: 4 });
  });

  it("impide eliminar la propia cuenta principal", async () => {
    const response = await DELETE(new Request("http://localhost/api/users/principal-1", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "principal@example.com" }),
    }), { params: Promise.resolve({ id: "principal-1" }) });

    expect(response.status).toBe(400);
    expect(mocks.findUser).not.toHaveBeenCalled();
  });
});
