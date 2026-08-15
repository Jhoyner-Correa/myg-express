export type ExecutiveAlert = {
  id: string;
  tone: 'critical' | 'warning' | 'info';
  kind: 'attendance' | 'request';
  title: string;
  site: string;
  time: string;
  target: string;
};
