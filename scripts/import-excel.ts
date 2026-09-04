import "dotenv/config";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { addDays } from "date-fns";
import { prisma } from "../src/lib/db/prisma";

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Uso: pnpm db:import-excel /ruta/archivo.xlsx");

function value(cell: ExcelJS.Cell) {
  const raw = cell.value;
  if (raw && typeof raw === "object" && "result" in raw) return raw.result;
  return raw;
}
function amount(cell: ExcelJS.Cell) { const raw = value(cell); return typeof raw === "number" && Number.isFinite(raw) ? BigInt(Math.round(raw * 100)) : BigInt(0); }
function text(cell: ExcelJS.Cell) { const raw = value(cell); return raw == null ? "" : String(raw).trim(); }
function date(cell: ExcelJS.Cell) { const raw = value(cell); if (raw instanceof Date) return new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate())); return null; }
function businessTimestamp(day: Date) { return new Date(day.getTime() + 12 * 60 * 60 * 1000); }
function code(prefix: string, key: string) { return `${prefix}-${createHash("sha256").update(key).digest("hex").slice(0, 10).toUpperCase()}`; }

async function main() {
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(sourcePath);
  const sheet = workbook.getWorksheet("LIQUIDACION"); const balance = workbook.getWorksheet("BALANCE");
  if (!sheet || !balance) throw new Error("El archivo debe contener LIQUIDACION y BALANCE");
  const collector = await prisma.user.findUniqueOrThrow({ where: { email: (process.env.IMPORT_COLLECTOR_EMAIL ?? "beatriz@cobro.olcas.app").toLowerCase() } });
  const microinsuranceMarker = await prisma.systemSetting.findUnique({ where: { key: "excel_microinsurance_2026_09_02" } });
  if (!microinsuranceMarker) {
    let movements = 0; let totalCents = BigInt(0);
    for (let column = 28; column <= 146; column++) {
      const occurredAt = date(sheet.getCell(1, column)); const amountCents = amount(sheet.getCell(174, column));
      if (!occurredAt || amountCents <= BigInt(0)) continue;
      await prisma.cashMovement.create({ data: { collectorId: collector.id, type: "MICROINSURANCE", direction: "IN", amountCents, occurredAt: businessTimestamp(occurredAt), note: "Microseguro diario importado del Excel" } });
      movements++; totalCents += amountCents;
    }
    await prisma.systemSetting.create({ data: { key: "excel_microinsurance_2026_09_02", value: { movements, totalCents: totalCents.toString(), importedAt: new Date().toISOString() } } });
    console.log(`Microseguro histórico: ${movements} movimientos, S/ ${(Number(totalCents) / 100).toFixed(2)}.`);
  }
  const balanceDetailMarker = await prisma.systemSetting.findUnique({ where: { key: "excel_balance_detail_2026_09_02" } });
  if (!balanceDetailMarker) {
    const totalAssignedClients = Number(value(sheet.getCell(187, 3)) ?? 0);
    const overdue30Count = Number(value(sheet.getCell(189, 3)) ?? 0);
    const zeroBalanceCount = Number(value(sheet.getCell(191, 3)) ?? 0);
    const legacyDays = [
      {
        id: "excel-liquidation-2026-08-31", date: date(sheet.getCell(1, 144))!,
        base: amount(balance.getCell(5, 3)), collected: amount(balance.getCell(7, 3)),
        disbursed: amount(balance.getCell(8, 3)), expenses: amount(balance.getCell(9, 3)),
        closing: amount(balance.getCell(11, 3)), microinsurance: amount(sheet.getCell(174, 144)),
        newClients: Number(value(balance.getCell(44, 2)) ?? 0),
        notes: "Importado de BALANCE. Gastos anotados: 255 supervisor; 50 gasolina; 40 plan; 12 parchada.",
      },
      {
        id: "excel-liquidation-2026-09-01", date: date(sheet.getCell(1, 145))!,
        base: amount(balance.getCell(5, 6)), collected: amount(balance.getCell(7, 6)),
        disbursed: amount(balance.getCell(8, 6)), expenses: amount(balance.getCell(9, 6)),
        closing: amount(balance.getCell(11, 6)), microinsurance: amount(sheet.getCell(174, 145)),
        newClients: Number(value(balance.getCell(44, 3)) ?? 0),
        notes: "Importado de LIQUIDACION/BALANCE. Préstamo anotado: 837 compra de moto y GPS. Gastos anotados: arriendo supervisor y plan.",
      },
    ];
    for (const item of legacyDays) {
      const difference = item.base + item.collected - item.disbursed - item.expenses - item.closing;
      await prisma.liquidation.upsert({
        where: { collectorId_date: { collectorId: collector.id, date: item.date } },
        create: {
          id: item.id, collectorId: collector.id, date: item.date, openingBaseCents: item.base,
          cashOutCents: item.disbursed, collectedCashCents: item.collected, disbursedCents: item.disbursed,
          expensesCents: item.expenses, microinsuranceCents: item.microinsurance,
          closingCashCents: item.closing, expectedClosingCents: item.closing + difference,
          differenceCents: -difference, newClientsCount: item.newClients, totalAssignedClients,
          overdue30Count, zeroBalanceCount, status: "LEGACY_IMPORTED", notes: item.notes,
        },
        update: {},
      });
    }
    await prisma.systemSetting.create({
      data: {
        key: "excel_balance_detail_2026_09_02",
        value: {
          collectorEmail: collector.email,
          initialChainCapitalCents: "150000",
          dailyNotes: [
            { date: "2026-08-31", notes: ["255 gastos supervisor", "50 gasolina", "40 plan", "12 parchada"] },
            { date: "2026-09-01", notes: ["837 compra de moto y GPS", "300 arriendo supervisor", "30 plan"] },
            { date: "2026-09-02", notes: ["12 lavada"] },
            { date: "2026-09-03", notes: ["620 gastos empresa", "135 amigos"] },
            { date: "2026-09-04", notes: ["112 tarjetería"] },
            { date: "2026-09-05", notes: ["500 sueldo", "295 administración", "86 medicamento", "53 taller", "38 abogado", "12 lavada"] },
          ],
          undatedSnapshots: [{ label: "INSERTOS · registro adicional sin fecha", baseCents: "202500", collectedCents: "237200", disbursedCents: "275000", expensesCents: "5500", collectorCents: "0", closingCashCents: "159200", differenceCents: "0" }],
        },
      },
    });
  }
  const marker = await prisma.systemSetting.findUnique({ where: { key: "excel_import_2026_09_02" } });
  if (marker) { console.log("El Excel del 02/09/2026 ya fue importado; no se duplicó información."); return; }
  let currentZone = await prisma.zone.findFirst({ orderBy: { name: "asc" } });
  let clientsCreated = 0, creditsCreated = 0, paymentsCreated = 0;
  const clientByIdentity = new Map<string, string>();
  for (let row = 2; row <= 173; row++) {
    const name = text(sheet.getCell(row, 3)); const disbursedAt = date(sheet.getCell(row, 4)); const principalCents = amount(sheet.getCell(row, 5));
    if (!name) continue;
    if (!disbursedAt || principalCents <= BigInt(100)) {
      currentZone = await prisma.zone.upsert({ where: { name: name.replace(/\b\w/g, (letter) => letter.toUpperCase()).toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) }, create: { name: name.replace(/\b\w/g, (letter) => letter.toUpperCase()).toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) }, update: { active: true } });
      continue;
    }
    const phone = text(sheet.getCell(row, 149)); const identity = `${name.toLocaleLowerCase("es")}::${phone}`;
    let clientId = clientByIdentity.get(identity);
    if (!clientId) {
      const client = await prisma.client.create({ data: { code: code("IMP-CL", identity), name, phone: phone || null, zoneId: currentZone?.id, collectorId: collector.id, notes: "Importado desde COBRO BEATRIS UNIDO 02/09/2026" } });
      clientId = client.id; clientByIdentity.set(identity, client.id); clientsCreated++;
    }
    const interestCents = principalCents * BigInt(20) / BigInt(100); const totalDueCents = principalCents + interestCents; const baseInstallment = totalDueCents / BigInt(24); const remainder = totalDueCents - baseInstallment * BigInt(24);
    const paymentCells: { paidAt: Date; amountCents: bigint }[] = [];
    for (let column = 28; column <= 146; column++) { const paidAt = date(sheet.getCell(1, column)); const paid = amount(sheet.getCell(row, column)); if (paidAt && paid > BigInt(0)) paymentCells.push({ paidAt: businessTimestamp(paidAt), amountCents: paid }); }
    const paidCents = paymentCells.reduce((sum, item) => sum + item.amountCents, BigInt(0)); const balanceCents = totalDueCents - paidCents; const maturityDate = addDays(disbursedAt, 23); const status = balanceCents <= BigInt(0) ? "PAID" : maturityDate < new Date("2026-09-02T23:59:59Z") ? "OVERDUE" : "ACTIVE";
    const credit = await prisma.credit.create({ data: { code: code("IMP-CR", `${row}-${name}-${disbursedAt.toISOString()}`), clientId, collectorId: collector.id, principalCents, interestRateBps: 2000, interestCents, totalDueCents, installmentCount: 24, installmentCents: baseInstallment, disbursedAt, maturityDate, status, microinsuranceCents: BigInt(0), advancePaymentCents: BigInt(0), priorSettlementCents: BigInt(0), cashDeliveredCents: principalCents, paidCents: BigInt(0), balanceCents: totalDueCents, notes: "Saldo y pagos importados fielmente del Excel; la cuota adelantada histórica no estaba identificada por separado.", installments: { create: Array.from({length:24},(_,index)=>({number:index+1,dueDate:addDays(disbursedAt,index),expectedCents:baseInstallment+(BigInt(index)<remainder?BigInt(1):BigInt(0))})) } } });
    await prisma.cashMovement.create({ data: { collectorId: collector.id, creditId: credit.id, type: "DISBURSEMENT", direction: "OUT", amountCents: principalCents, occurredAt: businessTimestamp(disbursedAt), note: "Importado de Excel" } });
    for (const importedPayment of paymentCells) {
      const payment = await prisma.payment.create({ data: { creditId: credit.id, collectorId: collector.id, amountCents: importedPayment.amountCents, paidAt: importedPayment.paidAt, method: "CASH", source: "EXCEL_IMPORT", note: "Movimiento histórico importado" } });
      let remaining = importedPayment.amountCents; const pending = await prisma.installment.findMany({ where: { creditId: credit.id, status: { not: "PAID" } }, orderBy: { number: "asc" } });
      for (const installment of pending) { if (remaining <= BigInt(0)) break; const missing = installment.expectedCents - installment.paidCents; const allocated = remaining < missing ? remaining : missing; remaining -= allocated; const installmentPaid = installment.paidCents + allocated; await prisma.paymentAllocation.create({ data: { paymentId: payment.id, installmentId: installment.id, amountCents: allocated } }); await prisma.installment.update({ where: { id: installment.id }, data: { paidCents: installmentPaid, status: installmentPaid >= installment.expectedCents ? "PAID" : "PARTIAL", paidAt: installmentPaid >= installment.expectedCents ? importedPayment.paidAt : null } }); }
      await prisma.cashMovement.create({ data: { collectorId: collector.id, creditId: credit.id, paymentId: payment.id, type: "PAYMENT_CASH", direction: "IN", amountCents: importedPayment.amountCents, occurredAt: importedPayment.paidAt, note: "Importado de Excel" } }); paymentsCreated++;
    }
    await prisma.credit.update({ where: { id: credit.id }, data: { paidCents, balanceCents: balanceCents < BigInt(0) ? BigInt(0) : balanceCents, status, closedAt: status === "PAID" ? new Date("2026-09-02T12:00:00Z") : null } }); creditsCreated++;
  }
  const weekly: { week: string; chain: string; date: string | null; profit: number }[] = [];
  for (let row = 50; row <= 60; row++) weekly.push({ week: text(balance.getCell(row, 2)), chain: text(balance.getCell(row, 3)), date: date(balance.getCell(row, 4))?.toISOString() ?? null, profit: Number(value(balance.getCell(row, 5)) ?? 0) });
  await prisma.systemSetting.create({ data: { key: "excel_import_2026_09_02", value: { source: "COBRO BEATRIS UNIDO 02 SEPTIEMBRE2026.xlsx", importedAt: new Date().toISOString(), clientsCreated, creditsCreated, paymentsCreated, legacyWeeklyBalance: weekly, note: "Microseguro diario y balance semanal conservados como referencia; no se crearon créditos ficticios para esas filas." } } });
  await prisma.auditLog.create({ data: { actorId: collector.id, action: "EXCEL_IMPORTED", entityType: "system", entityId: "excel_import_2026_09_02", metadata: { clientsCreated, creditsCreated, paymentsCreated } } });
  console.log(`Importación completa: ${clientsCreated} clientes, ${creditsCreated} créditos, ${paymentsCreated} pagos.`);
}

main().finally(() => prisma.$disconnect());
