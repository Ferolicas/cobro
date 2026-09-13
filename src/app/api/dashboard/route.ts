import { subDays } from "date-fns";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";
import { creditProgress, refreshOverdueStatuses } from "@/lib/loans/service";
import { businessDateKey, businessDayStartUtc, businessToday } from "@/lib/loans/calculation";
import { addDays } from "date-fns";
import { COLLECTOR_BASE_CENTS } from "@/lib/liquidations/constants";
import { financialEventDateKey, financialEventsForDate } from "@/lib/liquidations/calculation";

export async function GET(request: Request) {
  try {
    const { user } = await requireUser(request);
    await refreshOverdueStatuses();
    const collectorScope = user.role === "COLLECTOR" ? { collectorId: user.id } : {};
    const today = businessToday();
    const todayKey = today.toISOString().slice(0, 10);
    const todayStart = businessDayStartUtc();
    const [clients, credits, collectors, todayPaymentRows, recentPayments, unread, todayMovementRows, todayLiquidations] = await Promise.all([
      prisma.client.count({ where: { ...collectorScope, active: true } }),
      prisma.credit.findMany({
        where: { ...collectorScope, status: { in: ["ACTIVE", "OVERDUE"] } },
        include: {
          client: { select: { id: true, name: true, phone: true, businessName: true } },
          installments: { select: { number: true, dueDate: true, expectedCents: true, paidCents: true } },
        },
        orderBy: [{ maturityDate: "asc" }, { createdAt: "desc" }],
      }),
      user.role === "MASTER" ? prisma.user.count({ where: { role: "COLLECTOR", active: true } }) : Promise.resolve(0),
      prisma.payment.findMany({
        where: { ...collectorScope, paidAt: { gte: today, lt: addDays(todayStart, 1) }, method: { not: "RENEWAL" } },
        select: { paidAt: true, amountCents: true, source: true },
      }),
      prisma.payment.findMany({
        where: { ...collectorScope, paidAt: { gte: subDays(today, 6) }, method: { not: "RENEWAL" } },
        select: { paidAt: true, amountCents: true, source: true },
      }),
      prisma.notification.count({ where: { recipientId: user.id, readAt: null } }),
      prisma.cashMovement.findMany({
        where: { ...collectorScope, occurredAt: { gte: today, lt: addDays(todayStart, 1) } },
        select: { type: true, amountCents: true, occurredAt: true },
      }),
      prisma.liquidation.findMany({
        where: { ...collectorScope, date: today },
        select: { expensesCents: true },
      }),
    ]);
    const activeCapitalCents = credits.reduce((sum, credit) => sum + credit.principalCents, BigInt(0));
    const portfolioCents = credits.reduce((sum, credit) => sum + credit.balanceCents, BigInt(0));
    const expectedProfitCents = credits.reduce((sum, credit) => sum + credit.interestCents, BigInt(0));
    const todayDueCents = credits.reduce((sum, credit) => sum + creditProgress(credit).dueTodayCents, BigInt(0));
    const overdue = credits.filter((credit) => creditProgress(credit).daysRemaining < 0 && credit.balanceCents > BigInt(0)).length;
    const operationalBaseCents = COLLECTOR_BASE_CENTS * BigInt(user.role === "MASTER" ? collectors : 1);
    const todayMovements = financialEventsForDate(todayMovementRows, today);
    const collectedTodayCents = todayPaymentRows
      .filter((payment) => financialEventDateKey({ type: payment.source, occurredAt: payment.paidAt }) === todayKey)
      .reduce((total, payment) => total + payment.amountCents, BigInt(0));
    const physicalIncomeCents = todayMovements
      .filter((movement) => ["PAYMENT_CASH", "ADVANCE_INSTALLMENT", "MICROINSURANCE", "RENEWAL_SETTLEMENT"].includes(movement.type))
      .reduce((total, movement) => total + movement.amountCents, BigInt(0));
    const disbursedTodayCents = todayMovements
      .filter((movement) => movement.type === "DISBURSEMENT")
      .reduce((total, movement) => total + movement.amountCents, BigInt(0));
    const expensesTodayCents = todayLiquidations.reduce((total, item) => total + item.expensesCents, BigInt(0));
    const availableBaseCents = operationalBaseCents + physicalIncomeCents - disbursedTodayCents - expensesTodayCents;
    const supportNeededCents = availableBaseCents < BigInt(0) ? -availableBaseCents : BigInt(0);
    const surplusCents = availableBaseCents > operationalBaseCents ? availableBaseCents - operationalBaseCents : BigInt(0);
    const series = Array.from({ length: 7 }, (_, index) => {
      const date = subDays(todayStart, 6 - index);
      const key = businessDateKey(date);
      return {
        date: key,
        amountCents: recentPayments
          .filter((payment) => financialEventDateKey({ type: payment.source, occurredAt: payment.paidAt }) === key)
          .reduce((sum, payment) => sum + payment.amountCents, BigInt(0)),
      };
    });
    return jsonResponse({
      stats: { clients, collectors, activeCredits: credits.length, overdue, activeCapitalCents, portfolioCents, expectedProfitCents, todayDueCents, collectedTodayCents, operationalBaseCents, availableBaseCents, supportNeededCents, surplusCents, unread },
      urgentCredits: credits.slice(0, 10).map((credit) => ({ ...credit, ...creditProgress(credit) })),
      series,
    });
  } catch (error) {
    return apiError(error);
  }
}
