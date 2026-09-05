export type PackageLabel = { sequence: string; recipient: string; phone: string };
export type LabelDesign = {
  brand: string; subtitle: string; font_family: 'ARIAL' | 'VERDANA' | 'GEORGIA';
  recipient_size: number; phone_size: number; day_size: number; density: number; show_sequence_circle: boolean;
};

export type PrintSite = {
  id: number;
  name: string;
  agentConfigured: boolean;
  agentOnline: boolean;
  lastSeenAt: string | null;
  printers: string[];
};

export type PrintAgent = {
  id: number; siteId: number; name: string; computerName: string | null;
  printerName: string | null; printers: string[]; connectorVersion: string | null;
  status: 'ACTIVO' | 'INACTIVO'; online: boolean; lastSeenAt: string | null; pairedAt: string | null;
};

export type PrintPairing = { code: string; expiresInSeconds: number };

export type PrintJobStatus = 'PENDIENTE' | 'PROCESANDO' | 'ENVIADO' | 'ERROR' | 'CANCELADO';

export type PrintJob = {
  id: number;
  siteId: number;
  siteName: string;
  requestedBy: string;
  status: PrintJobStatus;
  reference: string;
  labels: PackageLabel[];
  dispatchDay: string;
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
