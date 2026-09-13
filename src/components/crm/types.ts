export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: "MASTER" | "COLLECTOR";
  mustChangePassword: boolean;
  active: boolean;
};

export type Zone = { id: string; name: string };

export type Administrator = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
};

export type Collector = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  active: boolean;
  mustChangePassword: boolean;
  zone?: Zone | null;
  finance: {
    baseCents: number;
    currentCashCents: number;
    baseDifferenceCents: number;
    supportNeededCents: number;
    lastClosedAt?: string | null;
  };
  _count: { assignedClients: number; managedCredits: number };
};

export type Installment = { id: string; number: number; dueDate: string; expectedCents: number; paidCents: number; status: string; paidAt?: string | null };
export type StoredDocument = { id: string; category: string; label?: string | null; fileName: string; mimeType: string; sizeBytes: number; paymentId?: string | null; createdAt: string };
export type CreditActivity = { id: string; type: string; title: string; description?: string | null; createdAt: string; actor?: { name: string } | null };
export type Payment = { id: string; amountCents: number; paidAt: string; method: string; source: string; note?: string | null; collector?: { name: string } | null; allocations?: { amountCents: number; installment: { number: number } }[]; documents?: StoredDocument[] };

export type Credit = {
  id: string; code: string; clientId: string; collectorId?: string | null;
  principalCents: number; interestCents: number; totalDueCents: number; installmentCount: number; installmentCents: number;
  disbursedAt: string; maturityDate: string; status: string; microinsuranceCents: number; advancePaymentCents: number;
  priorSettlementCents: number; cashDeliveredCents: number; paidCents: number; balanceCents: number;
  daysRemaining: number; daysElapsed: number; excelStatus: "B" | "Q"; zeroPaymentDays: number; dueTodayCents: number; progress: number;
  paidInstallmentsCount: number; currentInstallmentNumber: number; noPaymentToday?: boolean; notes?: string | null;
  client: { id: string; name: string; phone?: string | null; businessName?: string | null; latitude?: number | null; longitude?: number | null };
  collector?: { id: string; name: string } | null; installments: Installment[]; payments?: Payment[]; activities?: CreditActivity[]; documents?: StoredDocument[];
};

export type Client = {
  id: string; code: string; name: string; documentNumber?: string | null; phone?: string | null; alternatePhone?: string | null;
  businessName?: string | null; businessType?: string | null; address?: string | null; locationNotes?: string | null;
  latitude?: number | null; longitude?: number | null; locationAccuracyMeters?: number | null; locationCapturedAt?: string | null;
  reference?: string | null; notes?: string | null; zoneId?: string | null; collectorId?: string | null; riskStatus: string;
  collector?: { id: string; name: string; email?: string } | null; zone?: Zone | null; credits: Credit[]; documents?: StoredDocument[]; activities?: CreditActivity[];
};

export type Notification = { id: string; type: string; title: string; message: string; entityType?: string | null; entityId?: string | null; actionUrl?: string | null; details?: Record<string, unknown> | null; readAt?: string | null; createdAt: string; actor?: { id: string; name: string; email: string } | null };
export type DashboardData = { stats: { clients: number; collectors: number; activeCredits: number; overdue: number; activeCapitalCents: number; portfolioCents: number; expectedProfitCents: number; todayDueCents: number; collectedTodayCents: number; operationalBaseCents: number; availableBaseCents: number; supportNeededCents: number; surplusCents: number; unread: number }; urgentCredits: Credit[]; series: { date: string; amountCents: number }[] };

export type Liquidation = {
  id: string; date: string; openingBaseCents: number; cashOutCents: number; collectedCashCents: number; collectedYapeCents: number; disbursedCents: number;
  expensesCents: number; manualExpensesCents: number; collectorSalaryCents: number; collectorWithdrawalCents: number; chainWithdrawalCents: number; surplusCents: number;
  microinsuranceCents: number; closingCashCents: number; expectedClosingCents: number; differenceCents: number; newClientsCount: number;
  totalAssignedClients: number; overdue30Count: number; zeroBalanceCount: number; status: string; notes?: string | null;
  collector: { id?: string; name: string }; documents?: StoredDocument[];
};

export type LiquidationSummary = {
  openingBaseCents: number; previousClosingCents?: number | null; collectedCashCents: number; collectedYapeCents: number; collectedTransferCents: number;
  collectedDigitalCents: number; totalCollectedCents: number; ledgerCollectedCashCents: number; totalIncomeCents: number; ledgerCollectedTotalCents: number;
  disbursedCents: number; advancePaymentCents: number; microinsuranceCents: number; renewalSettlementCents: number; cashOutCents: number;
  expensesCents: number; manualExpensesCents: number; collectorSalaryCents: number; collectorWithdrawalCents: number; chainWithdrawalCents: number; surplusCents: number;
  expectedClosingCents: number; closingCashCents?: number | null; differenceCents?: number | null; status: string; notes?: string | null;
  totalAssignedClients: number; newClientsCount: number; overdue30Count: number; zeroBalanceCount: number; movementCount: number;
};

export type FinancialDay = {
  date: string; dayName: string; isFuture: boolean; source: "AUTOMATIC" | "SUBMITTED" | "EXCEL"; openingBaseCents: number;
  ledgerCollectedCashCents: number; totalIncomeCents: number; collectedDigitalCents: number; disbursedCents: number; microinsuranceCents: number;
  advancePaymentCents: number; renewalSettlementCents: number; expensesCents: number; manualExpensesCents: number; collectorSalaryCents: number;
  collectorWithdrawalCents: number; chainWithdrawalCents: number; surplusCents: number; expectedClosingCents: number; closingCashCents: number | null;
  differenceCents: number | null; newClientsCount: number; totalAssignedClients: number; overdue30Count: number; zeroBalanceCount: number;
  movementCount: number; notes: string | null; detailNotes: string[];
};

export type FinancialOverview = {
  days: FinancialDay[];
  weekly: { collectedBeforeMicroinsuranceCents: number; collectedCents: number; collectionCommissionCents: number; collectorSalaryCents: number; disbursedCents: number; projectedInterestCents: number; microinsuranceCents: number; manualExpensesCents: number; chainWithdrawalCents: number; expensesCents: number; collectorWithdrawalCents: number; resultBeforeExpensesCents: number; resultBeforeMicroinsuranceCents: number; profitCents: number; netResultCents: number; newClientsCount: number };
  chain: { initialCapitalCents: number; totalProfitCents: number; rows: { week: number; chain: string; date: string | null; profitCents: number | null; source: string }[] };
  undatedSnapshots: { label: string; baseCents: string; collectedCents: string; disbursedCents: string; expensesCents: string; collectorCents: string; closingCashCents: string; differenceCents: string }[];
};

export type CreditPreview = { interestCents: number; totalDueCents: number; installmentCents: number; minimumAdvancePaymentCents: number; advancePaymentCents: number; priorSettlementCents: number; microinsuranceCents: number; cashDeliveredCents: number };
export type AuditEntry = { id: string; action: string; entityType: string; entityId: string; beforeData?: unknown; afterData?: unknown; metadata?: unknown; createdAt: string; actor?: { name: string; email: string } | null };
