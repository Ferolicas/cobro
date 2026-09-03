-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'COLLECTOR',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "phone" TEXT,
    "zoneId" TEXT,
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMPTZ(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "impersonatedBy" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ(3),
    "refreshTokenExpiresAt" TIMESTAMPTZ(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "documentNumber" TEXT,
    "phone" TEXT,
    "alternatePhone" TEXT,
    "businessName" TEXT,
    "businessType" TEXT,
    "address" TEXT,
    "locationNotes" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "zoneId" TEXT,
    "collectorId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "riskStatus" TEXT NOT NULL DEFAULT 'NORMAL',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "collectorId" TEXT,
    "previousCreditId" TEXT,
    "principalCents" BIGINT NOT NULL,
    "interestRateBps" INTEGER NOT NULL DEFAULT 2000,
    "interestCents" BIGINT NOT NULL,
    "totalDueCents" BIGINT NOT NULL,
    "installmentCount" INTEGER NOT NULL DEFAULT 24,
    "installmentCents" BIGINT NOT NULL,
    "disbursedAt" DATE NOT NULL,
    "maturityDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "microinsuranceCents" BIGINT NOT NULL DEFAULT 0,
    "advancePaymentCents" BIGINT NOT NULL DEFAULT 0,
    "priorSettlementCents" BIGINT NOT NULL DEFAULT 0,
    "cashDeliveredCents" BIGINT NOT NULL,
    "paidCents" BIGINT NOT NULL DEFAULT 0,
    "balanceCents" BIGINT NOT NULL,
    "writtenOffCents" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "closedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Credit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installment" (
    "id" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "expectedCents" BIGINT NOT NULL,
    "paidCents" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMPTZ(3),

    CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "collectorId" TEXT,
    "amountCents" BIGINT NOT NULL,
    "paidAt" TIMESTAMPTZ(3) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "source" TEXT NOT NULL DEFAULT 'DAILY_COLLECTION',
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Liquidation" (
    "id" TEXT NOT NULL,
    "collectorId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "openingBaseCents" BIGINT NOT NULL,
    "cashOutCents" BIGINT NOT NULL DEFAULT 0,
    "collectedCashCents" BIGINT NOT NULL,
    "collectedYapeCents" BIGINT NOT NULL DEFAULT 0,
    "disbursedCents" BIGINT NOT NULL,
    "expensesCents" BIGINT NOT NULL DEFAULT 0,
    "collectorWithdrawalCents" BIGINT NOT NULL DEFAULT 0,
    "microinsuranceCents" BIGINT NOT NULL DEFAULT 0,
    "closingCashCents" BIGINT NOT NULL,
    "expectedClosingCents" BIGINT NOT NULL,
    "differenceCents" BIGINT NOT NULL,
    "newClientsCount" INTEGER NOT NULL DEFAULT 0,
    "totalAssignedClients" INTEGER NOT NULL DEFAULT 0,
    "overdue30Count" INTEGER NOT NULL DEFAULT 0,
    "zeroBalanceCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "notes" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Liquidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "creditId" TEXT,
    "liquidationId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sanityAssetId" TEXT NOT NULL,
    "sanityUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "collectorId" TEXT,
    "creditId" TEXT,
    "paymentId" TEXT,
    "liquidationId" TEXT,
    "type" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "actionUrl" TEXT,
    "details" JSONB,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeData" JSONB,
    "afterData" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientActivity" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "creditId" TEXT,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_active_idx" ON "User"("role", "active");

-- CreateIndex
CREATE INDEX "User_zoneId_idx" ON "User"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE INDEX "Verification_expiresAt_idx" ON "Verification"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_name_key" ON "Zone"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Client_code_key" ON "Client"("code");

-- CreateIndex
CREATE INDEX "Client_collectorId_active_idx" ON "Client"("collectorId", "active");

-- CreateIndex
CREATE INDEX "Client_zoneId_idx" ON "Client"("zoneId");

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "Client"("name");

-- CreateIndex
CREATE INDEX "Client_documentNumber_idx" ON "Client"("documentNumber");

-- CreateIndex
CREATE INDEX "Client_phone_idx" ON "Client"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Credit_code_key" ON "Credit"("code");

-- CreateIndex
CREATE INDEX "Credit_clientId_status_idx" ON "Credit"("clientId", "status");

-- CreateIndex
CREATE INDEX "Credit_collectorId_status_idx" ON "Credit"("collectorId", "status");

-- CreateIndex
CREATE INDEX "Credit_maturityDate_status_idx" ON "Credit"("maturityDate", "status");

-- CreateIndex
CREATE INDEX "Credit_disbursedAt_idx" ON "Credit"("disbursedAt");

-- CreateIndex
CREATE INDEX "Installment_dueDate_status_idx" ON "Installment"("dueDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Installment_creditId_number_key" ON "Installment"("creditId", "number");

-- CreateIndex
CREATE INDEX "Payment_creditId_paidAt_idx" ON "Payment"("creditId", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_collectorId_paidAt_idx" ON "Payment"("collectorId", "paidAt");

-- CreateIndex
CREATE INDEX "PaymentAllocation_installmentId_idx" ON "PaymentAllocation"("installmentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_installmentId_key" ON "PaymentAllocation"("paymentId", "installmentId");

-- CreateIndex
CREATE INDEX "Liquidation_date_status_idx" ON "Liquidation"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Liquidation_collectorId_date_key" ON "Liquidation"("collectorId", "date");

-- CreateIndex
CREATE INDEX "Document_clientId_category_idx" ON "Document"("clientId", "category");

-- CreateIndex
CREATE INDEX "Document_creditId_category_idx" ON "Document"("creditId", "category");

-- CreateIndex
CREATE INDEX "Document_liquidationId_idx" ON "Document"("liquidationId");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_paymentId_key" ON "CashMovement"("paymentId");

-- CreateIndex
CREATE INDEX "CashMovement_collectorId_occurredAt_idx" ON "CashMovement"("collectorId", "occurredAt");

-- CreateIndex
CREATE INDEX "CashMovement_type_occurredAt_idx" ON "CashMovement"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "Notification_recipientId_readAt_createdAt_idx" ON "Notification"("recipientId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_entityType_entityId_idx" ON "Notification"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ClientActivity_clientId_createdAt_idx" ON "ClientActivity"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "ClientActivity_creditId_createdAt_idx" ON "ClientActivity"("creditId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_day_base_quote_key" ON "ExchangeRate"("day", "base", "quote");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credit" ADD CONSTRAINT "Credit_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credit" ADD CONSTRAINT "Credit_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credit" ADD CONSTRAINT "Credit_previousCreditId_fkey" FOREIGN KEY ("previousCreditId") REFERENCES "Credit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "Credit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "Credit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "Installment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidation" ADD CONSTRAINT "Liquidation_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "Credit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_liquidationId_fkey" FOREIGN KEY ("liquidationId") REFERENCES "Liquidation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "Credit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_liquidationId_fkey" FOREIGN KEY ("liquidationId") REFERENCES "Liquidation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientActivity" ADD CONSTRAINT "ClientActivity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientActivity" ADD CONSTRAINT "ClientActivity_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "Credit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientActivity" ADD CONSTRAINT "ClientActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
