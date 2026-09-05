export type UrbanoDispatchSite = {
  id: number;
  name: string;
  integrationStatus: 'activo' | 'inactivo' | 'sin_configurar';
  available: boolean;
};

export type UrbanoDispatchGuide = {
  id: string;
  guide: string;
  tracking: string;
  recipient: string;
  phone: string;
  destination: string;
  address: string;
  status: string;
  customer: string;
  service: string;
  manifest: string;
  pieces: number | null;
  weightKg: number | null;
  registeredAt: string;
  attributes: Record<string, string | number | boolean | null>;
  detail: UrbanoGuideDetail | null;
};

export type UrbanoDispatchSummary = {
  id: string;
  cdp: string;
  destinationCode: string;
  destination: string;
  origin: string;
  dispatchedAt: string;
  admittedAt: string;
  containerType: string;
  operator: string;
  status: string;
  totalGuides: number;
  admittedGuides: number;
  totalPieces: number;
  admittedPieces: number;
  totalWeightKg: number;
  admittedWeightKg: number;
  line: number;
};

export type UrbanoDispatchListResult = {
  fromDate: string;
  toDate: string;
  total: number;
  retrievedAt: string;
  site: { id: number; name: string };
  records: UrbanoDispatchSummary[];
};

export type UrbanoDispatchResult = {
  dispatchId: string;
  destinationProvince: string;
  line: number;
  page: number;
  limit: 25 | 50 | 100 | 500;
  total: number;
  totalPages: number;
  returned: number;
  retrievedAt: string;
  site: { id: number; name: string };
  records: UrbanoDispatchGuide[];
};

export type UrbanoDispatchQuery = {
  siteId: number;
  dispatchId: string;
  line: number;
  page: number;
  limit: 25 | 50 | 100 | 500;
};

export type UrbanoDispatchListQuery = {
  siteId: number;
  fromDate: string;
  toDate: string;
};

export type UrbanoGuideDetail = {
  guide: string;
  tracking: string;
  recipient: string;
  phone: string;
  email: string;
  address: string;
  locality: string;
  origin: string;
  destination: string;
  sender: string;
  pieces: number | null;
  weightKg: number | null;
  status: string;
  statusDetail: string;
  service: string;
  seller: string;
  contract: string;
  contents: string;
  registeredAt: string;
  estimatedDeliveryDate: string;
  pieceReference: string;
  latitude: number | null;
  longitude: number | null;
  fragile: boolean | null;
  insured: boolean | null;
  insuranceValue: number | null;
  dates: {
    pickup: string;
    dispatched: string;
    admitted: string;
    outForDelivery: string;
    deadline: string;
  };
  retrievedAt: string;
};
