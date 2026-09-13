ALTER TABLE "User" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Los administradores existentes antes de este alcance conservan acceso global.
UPDATE "User" SET "isSuperAdmin" = true WHERE "role" = 'MASTER';

CREATE TABLE "CollectorAssignment" (
    "administratorId" TEXT NOT NULL,
    "collectorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollectorAssignment_pkey" PRIMARY KEY ("administratorId", "collectorId")
);

CREATE INDEX "CollectorAssignment_collectorId_idx" ON "CollectorAssignment"("collectorId");

ALTER TABLE "CollectorAssignment" ADD CONSTRAINT "CollectorAssignment_administratorId_fkey"
FOREIGN KEY ("administratorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CollectorAssignment" ADD CONSTRAINT "CollectorAssignment_collectorId_fkey"
FOREIGN KEY ("collectorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
