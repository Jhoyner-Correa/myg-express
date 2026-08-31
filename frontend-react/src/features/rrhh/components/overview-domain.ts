import type { AttendanceDashboardEmployee } from '../types';

export type SitePerformance = {
  siteId: number;
  siteName: string;
  employees: number;
  present: number;
  attendanceRate: number;
  late: number;
  overtimeMinutes: number;
};

export function summarizeSitePerformance(rows: AttendanceDashboardEmployee[]): SitePerformance[] {
  const sites = new Map<number, Omit<SitePerformance, 'attendanceRate'>>();
  rows.forEach(row => {
    const current = sites.get(row.site_id) ?? {
      siteId: row.site_id,
      siteName: row.site_name,
      employees: 0,
      present: 0,
      late: 0,
      overtimeMinutes: 0,
    };
    current.employees += 1;
    if (row.status === 'PRESENTE' || row.status === 'TARDANZA') current.present += 1;
    if (row.status === 'TARDANZA') current.late += 1;
    current.overtimeMinutes += row.overtime_minutes;
    sites.set(row.site_id, current);
  });

  return [...sites.values()]
    .map(site => ({ ...site, attendanceRate: site.employees ? Math.round(site.present / site.employees * 100) : 0 }))
    .sort((a, b) => b.attendanceRate - a.attendanceRate || a.siteName.localeCompare(b.siteName, 'es'));
}
