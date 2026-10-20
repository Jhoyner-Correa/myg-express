export type AuditClassification =
  | 'ENTREGA_DIRECTA'
  | 'ENTREGA_CON_MOTIVOS'
  | 'DISCREPANCIA_NO_ENTREGADO'
  | 'EN_GESTION'
  | 'NO_ENCONTRADO';

export type AuditedGuideResult = {
  guide: string;
  found: boolean;
  declared: {
    provider: string | null;
    route: string | null;
    date: string | null;
    status: string | null;
    cost: number | null;
    weightKg: number | null;
    agency: string | null;
  };
  urbano: {
    guide: string;
    tracking: string;
    recipient: string;
    phone: string;
    destination: string;
    address: string;
    status: string;
    statusDetail: string;
    sender: string;
    service: string;
    contract: string;
    pieces: number | null;
    weightKg: number | null;
    registeredAt: string;
    estimatedDeliveryDate: string;
    dates: {
      pickup: string;
      dispatched: string;
      admitted: string;
      outForDelivery: string;
      deadline: string;
    };
  } | null;
  audit: {
    classification: AuditClassification;
    attempts: number;
    motives: number;
    isDiscrepancy: boolean;
    recipientSignature: string | null;
    recipientDni: string | null;
    summaryText: string;
  };
  localNotice: {
    avisoId: number;
    telefono: string;
    estadoAviso: string;
    fechaEnvio: string | null;
  } | null;
  error?: string;
};

export type AuditSummaryKpi = {
  total: number;
  found: number;
  notFound: number;
  cleanDeliveries: number;
  cleanDeliveriesPct: number;
  motivatedDeliveries: number;
  motivatedDeliveriesPct: number;
  motives1Attempt: number;
  motives2Attempts: number;
  motives3PlusAttempts: number;
  discrepancies: number;
  discrepanciesPct: number;
  inManagement: number;
  inManagementPct: number;
  totalDeclaredCost: number;
  discrepantDeclaredCost: number;
};

export type GuideAuditBatchResponse = {
  site: {
    id: number;
    name: string;
  };
  kpis: AuditSummaryKpi;
  records: AuditedGuideResult[];
  auditedAt: string;
};

export type UrbanoAuditSite = {
  id: number;
  name: string;
  integrationStatus: 'activo' | 'inactivo' | 'sin_configurar';
  available: boolean;
};
