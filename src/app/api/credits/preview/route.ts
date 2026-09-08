import { z } from "zod";
import { apiError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/json";
import { creditNumbers, dateOnly, installmentPlan } from "@/lib/loans/service";
import { toCents } from "@/lib/money";

const schema = z.object({
  principal: z.coerce.number().positive().max(1_000_000),
  microinsurance: z.coerce.number().min(0).max(1_000_000).default(0),
  advancePayment: z.coerce.number().positive().max(1_000_000).optional(),
  disbursedAt: z.string().min(10),
  previousCreditId: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request, ["COLLECTOR"]);
    const input = schema.parse(await request.json());
    const principalCents = toCents(input.principal);
    const microinsuranceCents = toCents(input.microinsurance);
    const plan = installmentPlan(principalCents, dateOnly(input.disbursedAt));
    const minimumAdvancePaymentCents = plan[0].expectedCents;
    const advancePaymentCents = input.advancePayment == null
      ? minimumAdvancePaymentCents
      : toCents(input.advancePayment);
    if (advancePaymentCents < minimumAdvancePaymentCents) {
      return Response.json(
        { error: "El pago inicial debe cubrir como mínimo la primera cuota" },
        { status: 400 },
      );
    }

    let priorSettlementCents = BigInt(0);
    if (input.previousCreditId) {
      const previous = await prisma.credit.findFirst({
        where: { id: input.previousCreditId, collectorId: user.id },
        select: { balanceCents: true },
      });
      if (!previous) return Response.json({ error: "Crédito anterior no encontrado" }, { status: 404 });
      priorSettlementCents = previous.balanceCents;
    }

    const cashDeliveredCents =
      principalCents - microinsuranceCents - advancePaymentCents - priorSettlementCents;
    if (cashDeliveredCents < BigInt(0)) {
      return Response.json(
        { error: "El capital no cubre el pago inicial, el microseguro y la liquidación anterior" },
        { status: 400 },
      );
    }
    const numbers = creditNumbers(principalCents);
    return jsonResponse({
      ...numbers,
      minimumAdvancePaymentCents,
      advancePaymentCents,
      priorSettlementCents,
      microinsuranceCents,
      cashDeliveredCents,
    });
  } catch (error) {
    return apiError(error);
  }
}
