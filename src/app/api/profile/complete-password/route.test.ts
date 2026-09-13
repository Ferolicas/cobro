import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  hashPassword: vi.fn(),
  findAccount: vi.fn(),
  updateAccount: vi.fn(),
  updateUser: vi.fn(),
  deleteSessions: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("better-auth/crypto", () => ({ hashPassword: mocks.hashPassword }));
vi.mock("@/lib/auth/guard", () => ({
  requireUser: mocks.requireUser,
  apiError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 }),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    account: { findFirst: mocks.findAccount, update: mocks.updateAccount },
    user: { update: mocks.updateUser },
    session: { deleteMany: mocks.deleteSessions },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));

import { POST } from "./route";

describe("primer cambio de contraseña", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      user: { id: "collector-1", mustChangePassword: true },
      session: { session: { id: "session-1" } },
    });
    mocks.findAccount.mockResolvedValue({ id: "account-1" });
    mocks.hashPassword.mockResolvedValue("secure-hash");
    mocks.updateAccount.mockReturnValue({ operation: "account" });
    mocks.updateUser.mockReturnValue({ operation: "user" });
    mocks.deleteSessions.mockReturnValue({ operation: "sessions" });
    mocks.transaction.mockResolvedValue([]);
    mocks.audit.mockResolvedValue(undefined);
  });

  it("solo exige la contraseña nueva y su confirmación", async () => {
    const response = await POST(new Request("http://localhost/api/profile/complete-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "NuevaClave12", confirmPassword: "NuevaClave12" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.hashPassword).toHaveBeenCalledWith("NuevaClave12");
    expect(mocks.updateAccount).toHaveBeenCalledWith({ where: { id: "account-1" }, data: { password: "secure-hash" } });
    expect(mocks.updateUser).toHaveBeenCalledWith({ where: { id: "collector-1" }, data: { mustChangePassword: false } });
    expect(mocks.deleteSessions).toHaveBeenCalledWith({ where: { userId: "collector-1", id: { not: "session-1" } } });
  });

  it("rechaza repetir una contraseña distinta", async () => {
    const response = await POST(new Request("http://localhost/api/profile/complete-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "NuevaClave12", confirmPassword: "NuevaClave13" }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Las contraseñas no coinciden" });
    expect(mocks.hashPassword).not.toHaveBeenCalled();
  });

  it("no permite reutilizar el flujo después del primer acceso", async () => {
    mocks.requireUser.mockResolvedValue({
      user: { id: "collector-1", mustChangePassword: false },
      session: { session: { id: "session-1" } },
    });
    const response = await POST(new Request("http://localhost/api/profile/complete-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "NuevaClave12", confirmPassword: "NuevaClave12" }),
    }));

    expect(response.status).toBe(409);
    expect(mocks.findAccount).not.toHaveBeenCalled();
  });
});
