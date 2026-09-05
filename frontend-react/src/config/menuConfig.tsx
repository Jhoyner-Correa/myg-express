import React from 'react';
import {
  CalendarCheck2,
  CalendarClock,
  ClipboardList,
  LayoutDashboard,
  MapPinned,
  Printer,
  Settings2,
  Truck,
  UsersRound,
  WalletCards,
} from 'lucide-react';

export interface MenuItem {
  title: string;
  path?: string;
  icon: React.ReactNode;
  permission?: string; // Permiso PBAC (opcional)
  roles?: string[]; // Roles específicos admitidos (opcional)
  alwaysShow?: boolean; // Visible para todos
  exact?: boolean; // Solo se activa cuando la URL coincide exactamente
  group: 'operations' | 'tools' | 'administration';
  children?: Omit<MenuItem, 'group'>[]; // Elementos anidados (submenús)
}

export const sidebarMenuConfig: MenuItem[] = [
  {
    title: 'WhatsApp Masivo',
    group: 'operations',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 12a7.6 7.6 0 0 1-7.8 7.5 8.5 8.5 0 0 1-2.5-.38L5 20.5l1.42-4.22A7.18 7.18 0 0 1 5.4 12 7.6 7.6 0 0 1 13.2 4.5 7.6 7.6 0 0 1 21 12Z"></path>
        <path d="M9.3 11.2h6.2"></path>
        <path d="M9.3 14.2h3.8"></path>
      </svg>
    ),
    children: [
      {
        title: 'Rutas',
        path: '/logistica',
        exact: true,
        permission: 'rutas.ver',
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
        )
      },
      {
        title: 'WhatsApp',
        path: '/logistica/whatsapp',
        permission: 'whatsapp.ver',
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6.6 4.8 8.35 4a1.35 1.35 0 0 1 1.72.58l1.15 2.02a1.35 1.35 0 0 1-.24 1.62l-.92.92a10.6 10.6 0 0 0 4.8 4.8l.92-.92a1.35 1.35 0 0 1 1.62-.24l2.02 1.15a1.35 1.35 0 0 1 .58 1.72l-.8 1.75a2.8 2.8 0 0 1-2.95 1.6C10.3 18.1 5.9 13.7 5 7.75a2.8 2.8 0 0 1 1.6-2.95Z"></path>
          </svg>
        )
      },
      {
        title: 'Consulta de rutas',
        path: '/logistica/consulta',
        permission: 'urbano.rutas.ver',
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 7h13v10H3z"></path>
            <path d="M16 10h2l3 3v4h-5z"></path>
            <circle cx="7.5" cy="18.5" r="1.5"></circle>
            <circle cx="17.5" cy="18.5" r="1.5"></circle>
          </svg>
        )
      }
    ]
  },
  {
    title: 'Impresion',
    path: '/impresion',
    permission: 'impresion.ver',
    group: 'tools',
    icon: <Printer aria-hidden="true" />,
  },
  {
    title: 'SAVAR SCAN',
    path: '/logistica/savar-scan',
    permission: 'savarscan.ver',
    group: 'tools',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 5v14M21 5v14M7 5v14M17 5v14M11 5v14M14 5v14" />
      </svg>
    )
  },
  {
    title: 'Recursos Humanos',
    group: 'tools',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
    children: [
      { title: 'Resumen ejecutivo', path: '/rrhh/resumen', permission: 'rrhh.ver', icon: <LayoutDashboard aria-hidden="true" /> },
      { title: 'Personal', path: '/rrhh/personal', permission: 'rrhh.ver', icon: <UsersRound aria-hidden="true" /> },
      { title: 'Asistencia', path: '/rrhh/asistencia', permission: 'rrhh.ver', icon: <CalendarCheck2 aria-hidden="true" /> },
      { title: 'Solicitudes', path: '/rrhh/solicitudes', permission: 'rrhh.ver', icon: <ClipboardList aria-hidden="true" /> },
      { title: 'Horarios y calendario', path: '/rrhh/horarios', permission: 'rrhh.ver', icon: <CalendarClock aria-hidden="true" /> },
      { title: 'Pagos mensuales', path: '/rrhh/pagos', permission: 'rrhh.pagos.ver', icon: <WalletCards aria-hidden="true" /> },
      { title: 'Rastreo GPS', path: '/rrhh/gps', permission: 'gps.ver', icon: <MapPinned aria-hidden="true" /> },
      { title: 'Configuración', path: '/rrhh/configuracion', permission: 'rrhh.configurar', icon: <Settings2 aria-hidden="true" /> },
    ],
  },
  {
    title: 'Panel central',
    path: '/admin',
    exact: true,
    permission: 'admin.panel.ver',
    group: 'administration',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1"></rect>
        <rect x="14" y="3" width="7" height="7" rx="1"></rect>
        <rect x="3" y="14" width="7" height="7" rx="1"></rect>
        <rect x="14" y="14" width="7" height="7" rx="1"></rect>
      </svg>
    )
  },
  {
    title: 'Despachos Urbano',
    path: '/admin/despachos-urbano',
    permission: 'urbano.despachos.ver',
    group: 'administration',
    icon: <Truck aria-hidden="true" />,
  }
];
