import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";

export async function GET(request: Request) {
  try {
    await requireUser(request, ["MASTER"]);
    const logs = await prisma.auditLog.findMany({ include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 250 });
    return jsonResponse({ logs });
  } catch (error) { return apiError(error); }
}
