-- El adaptador histórico persistió las fechas del Excel como medianoche de
-- Madrid (22:00 UTC). Al llevarlas al mediodía siguiente quedan dentro del
-- mismo día de negocio en America/Lima sin inventar una hora de cobro.
UPDATE "Payment"
SET "paidAt" = "paidAt" + INTERVAL '12 hours'
WHERE source = 'EXCEL_IMPORT'
  AND ("paidAt" AT TIME ZONE 'UTC')::time = TIME '22:00:00';

UPDATE "CashMovement"
SET "occurredAt" = "occurredAt" + INTERVAL '12 hours'
WHERE note IN ('Importado de Excel', 'Microseguro diario importado del Excel')
  AND ("occurredAt" AT TIME ZONE 'UTC')::time = TIME '22:00:00';
