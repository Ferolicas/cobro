-- Conserva los dos cierres fechados y todas las notas visibles del Excel original.
-- Los registros históricos se identifican por status para no confundirlos con
-- cierres automáticos creados desde la aplicación.
WITH collector AS (
  SELECT id FROM "User" WHERE email = 'beatriz@cobro.olcas.app' AND role = 'COLLECTOR' LIMIT 1
)
INSERT INTO "Liquidation" (
  id, "collectorId", date, "openingBaseCents", "cashOutCents",
  "collectedCashCents", "collectedYapeCents", "disbursedCents",
  "expensesCents", "collectorWithdrawalCents", "microinsuranceCents",
  "closingCashCents", "expectedClosingCents", "differenceCents",
  "newClientsCount", "totalAssignedClients", "overdue30Count",
  "zeroBalanceCount", status, notes, "createdAt", "updatedAt"
)
SELECT
  'excel-liquidation-2026-08-31', id, DATE '2026-08-31', 156000, 380000,
  315500, 0, 380000, 3500, 0, 18000, 88000, 88000, 0,
  6, 172, 25, 0, 'LEGACY_IMPORTED',
  'Importado de BALANCE. Gastos anotados: 255 supervisor; 50 gasolina; 40 plan; 12 parchada.',
  now(), now()
FROM collector
ON CONFLICT ("collectorId", date) DO NOTHING;

WITH collector AS (
  SELECT id FROM "User" WHERE email = 'beatriz@cobro.olcas.app' AND role = 'COLLECTOR' LIMIT 1
)
INSERT INTO "Liquidation" (
  id, "collectorId", date, "openingBaseCents", "cashOutCents",
  "collectedCashCents", "collectedYapeCents", "disbursedCents",
  "expensesCents", "collectorWithdrawalCents", "microinsuranceCents",
  "closingCashCents", "expectedClosingCents", "differenceCents",
  "newClientsCount", "totalAssignedClients", "overdue30Count",
  "zeroBalanceCount", status, notes, "createdAt", "updatedAt"
)
SELECT
  'excel-liquidation-2026-09-01', id, DATE '2026-09-01', 88000, 110000,
  213700, 0, 110000, 30000, 0, 5500, 161700, 161700, 0,
  3, 172, 25, 0, 'LEGACY_IMPORTED',
  'Importado de LIQUIDACION/BALANCE. Préstamo anotado: 837 compra de moto y GPS. Gastos anotados: arriendo supervisor y plan.',
  now(), now()
FROM collector
ON CONFLICT ("collectorId", date) DO NOTHING;

INSERT INTO "SystemSetting" (key, value, "updatedAt")
VALUES (
  'excel_balance_detail_2026_09_02',
  '{
    "collectorEmail": "beatriz@cobro.olcas.app",
    "initialChainCapitalCents": "150000",
    "dailyNotes": [
      {"date":"2026-08-31","notes":["255 gastos supervisor","50 gasolina","40 plan","12 parchada"]},
      {"date":"2026-09-01","notes":["837 compra de moto y GPS","300 arriendo supervisor","30 plan"]},
      {"date":"2026-09-02","notes":["12 lavada"]},
      {"date":"2026-09-03","notes":["620 gastos empresa","135 amigos"]},
      {"date":"2026-09-04","notes":["112 tarjetería"]},
      {"date":"2026-09-05","notes":["500 sueldo","295 administración","86 medicamento","53 taller","38 abogado","12 lavada"]}
    ],
    "undatedSnapshots": [
      {"label":"INSERTOS · registro adicional sin fecha","baseCents":"202500","collectedCents":"237200","disbursedCents":"275000","expensesCents":"5500","collectorCents":"0","closingCashCents":"159200","differenceCents":"0"}
    ]
  }'::jsonb,
  now()
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now();

-- ExcelJS importó los días históricos a las 00:00 UTC, cinco horas antes del
-- comienzo del día peruano. Se llevan al mediodía UTC una sola vez mediante
-- esta migración para conservar la fecha de negocio escrita en el Excel.
UPDATE "Payment"
SET "paidAt" = "paidAt" + INTERVAL '12 hours'
WHERE source = 'EXCEL_IMPORT'
  AND ("paidAt" AT TIME ZONE 'UTC')::time = TIME '00:00:00';

UPDATE "CashMovement"
SET "occurredAt" = "occurredAt" + INTERVAL '12 hours'
WHERE note IN ('Importado de Excel', 'Microseguro diario importado del Excel')
  AND ("occurredAt" AT TIME ZONE 'UTC')::time = TIME '00:00:00';
