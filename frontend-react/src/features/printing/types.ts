export type PackageLabel = { sequence: string; recipient: string; phone: string };
export type LabelDesign = {
  brand: string; subtitle: string; font_family: 'ARIAL' | 'VERDANA' | 'GEORGIA';
  recipient_size: number; phone_size: number; day_size: number; density: number; show_sequence_circle: boolean;
};

export type ClaimsLabelConfig = {
  siteName: string;
  phone: string;
  brand?: string;
  subtitle?: string;
  title?: string;
  message?: string;
  callToAction?: string;
  schedule?: string;
  address?: string;
  density?: number;
};

export type PrintSite = {
  id: number;
  name: string;
  phone?: string;
  address?: string;
  claimsPhone?: string;
  agentConfigured: boolean;
  agentOnline: boolean;
  lastSeenAt: string | null;
  printers: string[];
};

export type PrintAgent = {
  id: number; siteId: number; name: string; computerName: string | null;
  printerName: string | null; printers: string[]; connectorVersion: string | null;
  status: 'ACTIVO' | 'INACTIVO'; online: boolean; printerConnected?: boolean;
  lastSeenAt: string | null; pairedAt: string | null;
};

export type PrintPairing = { id?: number; code: string; expiresInSeconds: number };

export type PairingStatus = {
  id: number;
  siteId: number;
  paired: boolean;
  expired: boolean;
  agent: {
    id: number;
    name: string;
    computerName: string | null;
    printerName: string | null;
  } | null;
};

export type PrintJobStatus = 'PENDIENTE' | 'PROCESANDO' | 'ENVIADO' | 'ERROR' | 'CANCELADO';

export type PrintJob = {
  id: number;
  siteId: number;
  siteName: string;
  requestedBy: string;
  type?: 'COMANDA' | 'RECLAMOS';
  status: PrintJobStatus;
  reference: string;
  labels: PackageLabel[];
  dispatchDay: string;
  claimsConfig?: ClaimsLabelConfig | null;
  packageCount: number;
  labelCount: number;
  copies: number;
  attempts: number;
  error: string | null;
  agentName: string | null;
  printerName: string | null;
  createdAt: string;
  sentAt: string | null;
};

export type CreatePrintJobInput = {
  site_id: number;
  reference: string;
  copies: number;
  idempotency_key: string;
  dispatch_day: string;
  labels: PackageLabel[];
  design: LabelDesign;
};

export type CreateClaimsPrintJobInput = {
  job_type: 'RECLAMOS';
  site_id: number;
  site_name: string;
  phone: string;
  copies: number;
  idempotency_key: string;
  reference?: string;
  brand?: string;
  subtitle?: string;
  title?: string;
  message?: string;
  call_to_action?: string;
  schedule?: string;
  address?: string;
  density?: number;
};
