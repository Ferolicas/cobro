import { subDays } from "date-fns";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";
import { creditProgress, refreshOverdueStatuses } from "@/lib/loans/service";
import { businessDateKey, businessDayStartUtc, businessToday } from "@/lib/loans/calculation";

export async function GET(request: Request) {
  try {
    const { user } = await requireUser(request);
    await refreshOverdueStatuses();
    const collectorScope = user.role === "COLLECTOR" ? { collectorId: user.id } : {};
    const today = businessToday();
    const todayStart = businessDayStartUtc();
    const [clients, credits, collectors, todayPayments, recentPayments, unread] = await Promise.all([
      prisma.client.count({ where: { ...collectorScope, active: true } }),
      prisma.credit.findMany({
        where: { ...collectorScope, status: { in: ["ACTIVE", "OVERDUE"] } },
        include: {
          client: { select: { id: true, name: true, phone: true, businessName: true } },
          installments: { select: { dueDate: true, expectedCents: true, paidCents: true } },
        },
        orderBy: [{ maturityDate: "asc" }, { createdAt: "desc" }],
      }),
      user.role === "MASTER" ? prisma.user.count({ where: { role: "COLLECTOR", active: true } }) : Promise.resolve(0),
      prisma.payment.aggregate({
        where: { ...collectorScope, paidAt: { gte: todayStart }, method: { not: "RENEWAL" } },
        _sum: { amountCents: true },
      }),
      prisma.payment.findMany({
        where: { ...collectorScope, paidAt: { gte: subDays(todayStart, 6) }, method: { not: "RENEWAL" } },
        select: { paidAt: true, amountCents: true },
      }),
      prisma.notification.count({ where: { recipientId: user.id, readAt: null } }),
    ]);
    const activeCapitalCents = credits.reduce((sum, credit) => sum + credit.principalCents, BigInt(0));
    const portfolioCents = credits.reduce((sum, credit) => sum + credit.balanceCents, BigInt(0));
    const expectedProfitCents = credits.reduce((sum, credit) => sum + credit.interestCents, BigInt(0));
    const todayDueCents = credits.reduce((sum, credit) => sum + creditProgress(credit).dueTodayCents, BigInt(0));
    const overdue = credits.filter((credit) => credit.maturityDate < today && credit.balanceCents > BigInt(0)).length;
    const series = Array.from({ length: 7 }, (_, index) => {
      const date = subDays(todayStart, 6 - index);
      const key = businessDateKey(date);
      return {
        date: key,
        amountCents: recentPayments
          .filter((payment) => businessDateKey(payment.paidAt) === key)
          .reduce((sum, payment) => sum + payment.amountCents, BigInt(0)),
      };
    });
    return jsonResponse({
      stats: { clients, collectors, activeCredits: credits.length, overdue, activeCapitalCents, portfolioCents, expectedProfitCents, todayDueCents, collectedTodayCents: todayPayments._sum.amountCents ?? BigInt(0), unread },
      urgentCredits: credits.slice(0, 10).map((credit) => ({ ...credit, ...creditProgress(credit) })),
      series,
    });
  } catch (error) {
    return apiError(error);
  }
}
