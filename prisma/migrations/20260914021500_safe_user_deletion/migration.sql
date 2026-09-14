ALTER TABLE "Liquidation" DROP CONSTRAINT "Liquidation_collectorId_fkey";
ALTER TABLE "Document" DROP CONSTRAINT "Document_uploadedById_fkey";

ALTER TABLE "Liquidation" ALTER COLUMN "collectorId" DROP NOT NULL;
ALTER TABLE "Document" ALTER COLUMN "uploadedById" DROP NOT NULL;

ALTER TABLE "Liquidation" ADD CONSTRAINT "Liquidation_collectorId_fkey"
FOREIGN KEY ("collectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey"
FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
