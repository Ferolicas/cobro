-- Persist the collector's live client location.
ALTER TABLE "Client"
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION,
ADD COLUMN "locationAccuracyMeters" DOUBLE PRECISION,
ADD COLUMN "locationCapturedAt" TIMESTAMPTZ(3);

-- Keep the automatic salary, weekly chain withdrawal and manual expenses
-- separated while preserving the historical total in expensesCents.
ALTER TABLE "Liquidation"
ADD COLUMN "manualExpensesCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "collectorSalaryCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "chainWithdrawalCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "surplusCents" BIGINT NOT NULL DEFAULT 0;

UPDATE "Liquidation"
SET "manualExpensesCents" = "expensesCents";

-- Link every digital proof to its payment and give uploaded files an
-- operational label such as Yape 1, Yape 2, DNI 1, and so on.
ALTER TABLE "Document"
ADD COLUMN "paymentId" TEXT,
ADD COLUMN "label" TEXT;

CREATE INDEX "Document_paymentId_idx" ON "Document"("paymentId");

ALTER TABLE "Document"
ADD CONSTRAINT "Document_paymentId_fkey"
FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
