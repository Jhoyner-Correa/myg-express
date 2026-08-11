import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '../../core/auth/authState';
import apiClient from '../../core/api/apiClient';
import * as XLSX from 'xlsx';
import { showToast, showConfirm } from '../../core/utils/toast';

type LoteItem = {
  nombre: string;
  fecha_creacion: string;
  total: number;
  recibidos: number;
  incidencias: number;
};

type HistoryItem = {
  id: number;
  codigo_paquete: string;
  codigo_escaneado?: string;
  consignado?: string;
  nombre?: string;
  direccion?: string;
  telefono?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
  estado: string;
  lote_importacion?: string;
  fecha_escaneo?: string;
  fecha?: string;
};

type ScanStatus = 'neutral' | 'success' | 'error' | 'warning' | 'other-lote';

const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const playBeepSuccess = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, ctx.currentTime);
    gain1.gain.setValueAtTime(0.8, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.07);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.07);
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, ctx.currentTime);
      gain2.gain.setValueAtTime(0.8, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start();
      osc2.stop(ctx.currentTime + 0.15);
    }, 60);
  } catch { /* silent */ }
};

const playBeepError = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const play = (freq: number, dur: number, delay: number) => {
      setTimeout(() => {
        [0, 4, 0].forEach((offset, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = i === 2 ? 'square' : 'sawtooth';
          osc.frequency.setValueAtTime(freq + offset, ctx.currentTime);
          gain.gain.setValueAtTime(0.8, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + dur);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + dur);
        });
      }, delay);
    };
    play(140, 0.25, 0);
    play(130, 0.38, 280);
  } catch { /* silent */ }
};

const playBeepWarning = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const squeak = (freqStart: number, freqEnd: number, dur: number, delay: number) => {
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + dur);
        gain.gain.setValueAtTime(0.85, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + dur + 0.02);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + dur + 0.02);
      }, delay);
    };
    squeak(550, 1600, 0.08, 0);
    squeak(1500, 800, 0.12, 90);
  } catch { /* silent */ }
};

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'LLEGÓ':
      return { badgeClass: 'ss-badge success', badgeText: 'LLEGO' };
    case 'DUPLICADO':
    case 'REPETIDO':
      return { badgeClass: 'ss-badge warning', badgeText: 'REPETIDO' };
    case 'OTRO_LOTE':
      return { badgeClass: 'ss-badge warning', badgeText: 'OTRO LOTE' };
    default:
      return { badgeClass: 'ss-badge error', badgeText: 'NO EXISTE' };
  }
};

const getColumnValue = (row: any, aliases: string[]): string => {
  const match = Object.keys(row || {}).find((key) =>
    aliases.some((alias) => {
      const normKey = String(key)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_');
      const normAlias = String(alias)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_');
      return normKey.includes(normAlias);
    })
  );
  return match ? String(row[match] || '').trim() : '';
};

export const SavarScan: React.FC = () => {
  const { user } = useAuth();

  const [lotes, setLotes] = useState<LoteItem[]>([]);
  const [activeLoteName, setActiveLoteName] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [incidenciasCount, setIncidenciasCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'escaneo' | 'reportes'>('escaneo');
  const [scanInput, setScanInput] = useState('');

  const [scanStatus, setScanStatus] = useState<{ type: ScanStatus; title: string; subtitle: string }>({
    type: 'neutral',
    title: 'ESPERANDO',
    subtitle: 'Escanee un código de barras para comenzar',
  });

  const [scannedPackage, setScannedPackage] = useState<HistoryItem | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showFaltantesModal, setShowFaltantesModal] = useState(false);
  const [faltantes, setFaltantes] = useState<HistoryItem[]>([]);
  const [faltantesFilter, setFaltantesFilter] = useState('');

  const [filterReportLote, setFilterReportLote] = useState('');
  const [filterReportMes, setFilterReportMes] = useState('');

  const [importLoteName, setImportLoteName] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [tempParsedRows, setTempParsedRows] = useState<any[]>([]);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [selectedZones, setSelectedZones] = useState<Set<string>>(new Set());
  const [zoneSearch, setZoneSearch] = useState('');

  const zoneTree = useMemo(() => {
    const tree: Record<string, { total: number; districts: Record<string, number> }> = {};
    tempParsedRows.forEach((item) => {
      const prov = String(item.provincia || 'SIN PROVINCIA').trim().toUpperCase();
      const dist = String(item.distrito || 'SIN DISTRITO').trim().toUpperCase();
      if (!tree[prov]) {
        tree[prov] = { total: 0, districts: {} };
      }
      tree[prov].total++;
      tree[prov].districts[dist] = (tree[prov].districts[dist] || 0) + 1;
    });
    return tree;
  }, [tempParsedRows]);

  const filteredZoneTree = useMemo(() => {
    const search = zoneSearch.trim().toUpperCase();
    if (!search) return zoneTree;

    const filtered: Record<string, { total: number; districts: Record<string, number> }> = {};
    Object.entries(zoneTree).forEach(([prov, data]) => {
      const provMatches = prov.includes(search);
      const matchingDistricts: Record<string, number> = {};
      
      Object.entries(data.districts).forEach(([dist, count]) => {
        if (provMatches || dist.includes(search)) {
          matchingDistricts[dist] = count;
        }
      });

      if (Object.keys(matchingDistricts).length > 0) {
        filtered[prov] = {
          total: Object.values(matchingDistricts).reduce((a, b) => a + b, 0),
          districts: matchingDistricts
        };
      }
    });
    return filtered;
  }, [zoneTree, zoneSearch]);

  const filteredRowsCount = useMemo(() => {
    return tempParsedRows.filter((item) => {
      const prov = String(item.provincia || 'SIN PROVINCIA').trim().toUpperCase();
      const dist = String(item.distrito || 'SIN DISTRITO').trim().toUpperCase();
      return selectedZones.has(`${prov} - ${dist}`);
    });
  }, [tempParsedRows, selectedZones]);

  const toggleDistrict = useCallback((prov: string, dist: string) => {
    const key = `${prov} - ${dist}`;
    setSelectedZones((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const toggleProvince = useCallback((prov: string, districts: string[]) => {
    setSelectedZones((prev) => {
      const next = new Set(prev);
      const keys = districts.map((d) => `${prov} - ${d}`);
      const anyUnchecked = keys.some((k) => !next.has(k));
      if (anyUnchecked) {
        keys.forEach((k) => next.add(k));
      } else {
        keys.forEach((k) => next.delete(k));
      }
      return next;
    });
  }, []);

  const isProvinceChecked = useCallback((prov: string, districts: string[]) => {
    return districts.every((d) => selectedZones.has(`${prov} - ${d}`));
  }, [selectedZones]);

  const scanInputRef = useRef<HTMLInputElement>(null);
  const strokeIntervalsRef = useRef<number[]>([]);
  const lastKeyTimeRef = useRef(0);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioInitializedRef = useRef(false);

  const currentDate = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  const initAudio = useCallback(() => {
    if (!audioInitializedRef.current) {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        ctx.close();
        audioInitializedRef.current = true;
      } catch { /* silent */ }
    }
  }, []);

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => scanInputRef.current?.focus());
  }, []);

  const activeLote = useMemo(() => lotes.find((l) => l.nombre === activeLoteName) || null, [lotes, activeLoteName]);

  const progressPct = useMemo(() => {
    if (!activeLote || activeLote.total === 0) return 0;
    return Math.round((activeLote.recibidos / activeLote.total) * 100);
  }, [activeLote]);

  const loadLotes = useCallback(async (autoSelect = false) => {
    try {
      const res = await apiClient.get('/savar-scan/lotes');
      if (res.data?.ok) {
        const list: LoteItem[] = Array.isArray(res.data.data) ? res.data.data : [];
        setLotes(list);
        if (autoSelect && list.length > 0) {
          const hoyLocal = new Date().toLocaleDateString('es-PE');
          const loteHoy = list.find((l) => {
            if (!l.fecha_creacion) return false;
            return new Date(l.fecha_creacion).toLocaleDateString('es-PE') === hoyLocal;
          });
          setActiveLoteName(loteHoy ? loteHoy.nombre : list[0].nombre);
        }
      }
    } catch { /* silent */ }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await apiClient.get('/savar-scan/paquetes', { params: { estado: 'LLEGÓ', limit: 50 } });
      if (res.data?.ok) setHistory(Array.isArray(res.data.data) ? res.data.data : []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadLotes(true);
    loadHistory();
  }, [loadLotes, loadHistory]);

  useEffect(() => {
    if (activeTab === 'escaneo') focusInput();
  }, [activeTab, focusInput]);

  const scanCode = useCallback(async (codigo: string) => {
    if (!activeLoteName) {
      showToast('Seleccione o cargue un Lote de Carga Activo antes de escanear.', 'warning', { title: 'Lote no seleccionado' });
      focusInput();
      return;
    }
    try {
      const res = await apiClient.post('/savar-scan/procesar', { codigo, lote_activo: activeLoteName });
      if (res.data?.ok) {
        playBeepSuccess();
        const data: HistoryItem = res.data.data || res.data.paquete;
        setScannedPackage(data);
        setScanStatus({ type: 'success', title: 'LLEGO', subtitle: `Paquete registrado con éxito en lote "${activeLoteName}".` });
        setHistory((prev) => [data, ...prev].slice(0, 50));
        await loadLotes();
        setScanInput('');
        focusInput();
      }
    } catch (err: any) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || '';
      const data = err.response?.data?.data || err.response?.data?.paquete;

      if (status === 422) {
        playBeepWarning();
        setScanStatus({ type: 'other-lote', title: 'OTRO LOTE', subtitle: msg || 'El paquete pertenece a otro lote de carga.' });
        if (data) {
          setScannedPackage(data);
          setHistory((prev) => [{ ...data, estado: 'OTRO_LOTE', fecha_escaneo: new Date().toISOString() }, ...prev].slice(0, 50));
        }
        setIncidenciasCount((c) => c + 1);
      } else if (status === 409) {
        playBeepWarning();
        setScanStatus({ type: 'warning', title: 'REPETIDO', subtitle: msg || 'Este código ya fue escaneado.' });
        if (data) setScannedPackage(data);
        setIncidenciasCount((c) => c + 1);
      } else if (status === 404) {
        playBeepError();
        setScanStatus({ type: 'error', title: 'NO EXISTE', subtitle: msg || 'El código no existe en la lista del sistema.' });
        setScannedPackage({ id: 0, codigo_paquete: codigo, nombre: '', telefono: '', direccion: '', distrito: '', departamento: '', provincia: '', estado: 'NO_EXISTE' });
        setIncidenciasCount((c) => c + 1);
      } else {
        playBeepError();
        showToast(err.message || 'Error de red al conectar con el servidor.', 'error', { title: 'Error de escaneo' });
      }
      setScanInput('');
      focusInput();
    }
  }, [activeLoteName, loadLotes, focusInput]);

  const handleScanInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
      strokeIntervalsRef.current = [];
      const code = scanInput.trim();
      if (code) scanCode(code);
      return;
    }
    const now = Date.now();
    if (lastKeyTimeRef.current > 0) {
      strokeIntervalsRef.current.push(now - lastKeyTimeRef.current);
      if (strokeIntervalsRef.current.length > 5) strokeIntervalsRef.current.shift();
    }
    lastKeyTimeRef.current = now;
  }, [scanInput, scanCode]);

  const handleScanInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setScanInput(val);
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    const code = val.trim();
    if (!code) return;
    const isStandard = /^SE\d{11}$/i.test(code);
    if (isStandard || code.length === 13) {
      scanTimeoutRef.current = null;
      strokeIntervalsRef.current = [];
      scanCode(code);
      return;
    }
    if (strokeIntervalsRef.current.length >= 3) {
      const avg = strokeIntervalsRef.current.reduce((a, b) => a + b, 0) / strokeIntervalsRef.current.length;
      if (avg < 45) {
        scanTimeoutRef.current = setTimeout(() => {
          const finalCode = e.target.value.trim();
          if (finalCode) scanCode(finalCode);
          strokeIntervalsRef.current = [];
        }, 150);
      }
    }
  }, [scanCode]);

  const handlePageClick = useCallback((e: React.MouseEvent) => {
    initAudio();
    if (!audioInitializedRef.current) {
      audioInitializedRef.current = true;
    }
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'SELECT' ||
      target.tagName === 'TEXTAREA' || target.tagName === 'A' ||
      target.closest('button') || target.closest('.ss-btn') || target.closest('.modal-overlay') ||
      target.closest('.sui-confirm-dialog') || target.closest('.scan-tabs') ||
      target.closest('.row-actions') || document.activeElement?.tagName === 'INPUT'
    ) return;
    if (window.getSelection()?.toString().trim()) return;
    focusInput();
  }, [focusInput, initAudio]);

  const resetProfile = useCallback(() => {
    setScanStatus({ type: 'neutral', title: 'ESPERANDO', subtitle: 'Escanee un código de barras para comenzar' });
    setScannedPackage(null);
    setScanInput('');
    focusInput();
  }, [focusInput]);

  const openImportModal = useCallback(() => {
    const hoy = new Date();
    const dd = String(hoy.getDate()).padStart(2, '0');
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const yyyy = hoy.getFullYear();
    setImportLoteName(`SAVAR - ${dd}-${mm}-${yyyy}`);
    setImportStatus('');
    setShowImportModal(true);
  }, []);

  const importExcel = useCallback(async (file: File) => {
    const loteNombre = importLoteName.trim();
    if (!loteNombre) {
      showToast('Por favor, defina un Nombre para el Lote/Carga.', 'warning');
      return;
    }
    if (!file) return;

    setImportLoading(true);
    setImportStatus('Leyendo archivo Excel...');

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (rawRows.length === 0) {
        throw new Error('El archivo Excel está vacío.');
      }

      const mappedRows = rawRows.map((row: any) => {
        return {
          codigo: getColumnValue(row, ['codigo', 'code', 'cod', 'codigo_paquete', 'paquete']),
          consignado: getColumnValue(row, ['consignado', 'nombre', 'cliente', 'name', 'destinatario']),
          direccion: getColumnValue(row, ['direccion', 'address', 'dir', 'domicilio']),
          telefono: getColumnValue(row, ['telefono', 'celular', 'cel', 'phone', 'numero']),
          departamento: getColumnValue(row, ['departamento', 'dpto', 'dept', 'region']),
          provincia: getColumnValue(row, ['provincia', 'prov', 'ciudad']),
          distrito: getColumnValue(row, ['distrito', 'dist', 'zona'])
        };
      }).filter((item: any) => item.codigo && item.consignado);

      if (mappedRows.length === 0) {
        throw new Error('No se encontraron filas con campos de Código y Consignado válidos.');
      }

      setTempParsedRows(mappedRows);
      
      const initialZones = new Set<string>();
      mappedRows.forEach((item: any) => {
        const prov = String(item.provincia || 'SIN PROVINCIA').trim().toUpperCase();
        const dist = String(item.distrito || 'SIN DISTRITO').trim().toUpperCase();
        initialZones.add(`${prov} - ${dist}`);
      });
      setSelectedZones(initialZones);

      setShowImportModal(false);
      setImportStatus('');
      setTimeout(() => {
        setShowZoneModal(true);
        setZoneSearch('');
      }, 150);

    } catch (err: any) {
      console.error('Import error:', err);
      showToast(err.message || 'Error al procesar el archivo Excel.', 'error', { title: 'Error de Importación' });
      setImportStatus(err.message || 'Error al procesar el archivo Excel.');
    } finally {
      setImportLoading(false);
    }
  }, [importLoteName]);

  const handleImportSubmit = useCallback(async () => {
    const loteNombre = importLoteName.trim();
    if (!loteNombre) {
      showToast('Por favor, defina un Nombre para el Lote/Carga.', 'warning');
      return;
    }

    const filteredRows = tempParsedRows.filter((item) => {
      const prov = String(item.provincia || 'SIN PROVINCIA').trim().toUpperCase();
      const dist = String(item.distrito || 'SIN DISTRITO').trim().toUpperCase();
      return selectedZones.has(`${prov} - ${dist}`);
    });

    if (filteredRows.length === 0) {
      showToast('Debe seleccionar al menos una zona para importar.', 'warning');
      return;
    }

    setImportLoading(true);
    setImportStatus(`Subiendo ${filteredRows.length} paquetes...`);

    try {
      const res = await apiClient.post('/savar-scan/importar', {
        paquetes: filteredRows,
        lote_importacion: loteNombre
      });

      if (res.data?.ok) {
        showToast('Catálogo importado correctamente.', 'success', { title: 'Importación exitosa' });
        setActiveLoteName(loteNombre);
        setShowImportModal(false);
        setShowZoneModal(false);
        setTempParsedRows([]);
        await loadLotes();
        resetProfile();
      } else {
        showToast(res.data?.message || 'Error al procesar la importación.', 'error');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Error al conectar con el servidor.', 'error');
    } finally {
      setImportLoading(false);
    }
  }, [importLoteName, tempParsedRows, selectedZones, loadLotes, resetProfile]);

  const loadFaltantes = useCallback(async () => {
    if (!activeLoteName) return;
    try {
      const res = await apiClient.get('/savar-scan/faltantes', { params: { lote: activeLoteName } });
      if (res.data?.ok) setFaltantes(Array.isArray(res.data.data) ? res.data.data : []);
    } catch { /* silent */ }
  }, [activeLoteName]);

  const handleResetLote = useCallback(async () => {
    if (!activeLoteName) return;
    const confirmed = await showConfirm({
      title: 'Restablecer escaneos',
      message: `¿Estás seguro de restablecer TODOS los paquetes escaneados del lote "${activeLoteName}" a pendiente?`,
      confirmText: 'Sí, Restablecer',
      cancelText: 'Cancelar',
      type: 'danger',
    });
    if (!confirmed) return;
    try {
      const res = await apiClient.post('/savar-scan/reset', null, { params: { lote: activeLoteName } });
      if (res.data?.ok) {
        showToast(res.data.message || 'Escaneos restablecidos con éxito.', 'success');
        setHistory([]);
        setIncidenciasCount(0);
        resetProfile();
        await loadLotes();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Error al restablecer.', 'error');
    }
  }, [activeLoteName, loadLotes, resetProfile]);

  const handleDeleteLote = useCallback(async (name: string) => {
    const confirmed = await showConfirm({
      title: 'Eliminar Lote',
      message: `Se borrará de forma permanente el lote "${name}" y todos sus paquetes asociados. ¿Desea continuar?`,
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      type: 'danger',
    });
    if (!confirmed) return;
    try {
      const res = await apiClient.delete(`/savar-scan/lotes/${encodeURIComponent(name)}`);
      if (res.data?.ok) {
        showToast(res.data.message || 'Lote eliminado con éxito.', 'success');
        if (activeLoteName === name) {
          setActiveLoteName('');
          setIncidenciasCount(0);
          resetProfile();
        }
        await loadLotes();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Error al eliminar lote.', 'error');
    }
  }, [activeLoteName, loadLotes, resetProfile]);

  const handleActivateLote = useCallback((name: string) => {
    setActiveLoteName(name);
    setIncidenciasCount(0);
    resetProfile();
    setActiveTab('escaneo');
    showToast(`Lote "${name}" activado para escaneo.`, 'success', { title: 'Lote cambiado' });
  }, [resetProfile]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    lotes.forEach((l) => {
      if (l.fecha_creacion) {
        const d = new Date(l.fecha_creacion);
        months.add(`${d.getMonth() + 1}/${d.getFullYear()}`);
      }
    });
    return Array.from(months).sort((a, b) => {
      const [m1, y1] = a.split('/').map(Number);
      const [m2, y2] = b.split('/').map(Number);
      return y2 - y1 || m2 - m1;
    });
  }, [lotes]);

  const filteredReportLotes = useMemo(() => {
    return lotes.filter((l) => {
      if (filterReportLote && !l.nombre.toLowerCase().includes(filterReportLote.toLowerCase())) return false;
      if (filterReportMes && l.fecha_creacion) {
        const d = new Date(l.fecha_creacion);
        if (`${d.getMonth() + 1}/${d.getFullYear()}` !== filterReportMes) return false;
      }
      return true;
    });
  }, [lotes, filterReportLote, filterReportMes]);

  const exportScanned = useCallback(async (loteName: string, tipo: 'LLEGÓ' | 'PENDIENTE' = 'LLEGÓ') => {
    try {
      showToast(`Generando listado de ${tipo === 'LLEGÓ' ? 'Recibidos' : 'Faltantes'}...`, 'info');
      let url = `/savar-scan/paquetes?estado=LLEGÓ&lote_importacion=${encodeURIComponent(loteName)}&limit=500`;
      if (tipo === 'PENDIENTE') {
        url = `/savar-scan/faltantes?lote=${encodeURIComponent(loteName)}`;
      }
      const res = await apiClient.get(url);
      if (res.data?.ok) {
        const list: HistoryItem[] = Array.isArray(res.data.data) ? res.data.data : [];
        if (!list.length) {
          showToast(`No hay paquetes en estado ${tipo} para este lote.`, 'warning');
          return;
        }
        const rows = list.map((item, idx) => {
          if (tipo === 'LLEGÓ') {
            return {
              'N°': idx + 1,
              'Código': item.codigo_paquete,
              'Consignado': item.consignado || item.nombre,
              'Dirección': item.direccion || '',
              'Teléfono': item.telefono || '',
              'Departamento': item.departamento || '',
              'Provincia': item.provincia || '',
              'Distrito': item.distrito || '',
              'Lote Carga': item.lote_importacion || loteName,
              'Fecha Escaneo': item.fecha_escaneo ? new Date(item.fecha_escaneo).toLocaleString('es-PE') : '',
            };
          }
          return {
            'N°': idx + 1,
            'Código Faltante': item.codigo_paquete,
            'Consignado': item.consignado || item.nombre,
            'Dirección': item.direccion || '',
            'Teléfono': item.telefono || '',
            'Distrito': item.distrito || '',
            'Estado': 'PENDIENTE (NO LLEGÓ)',
          };
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, tipo === 'LLEGÓ' ? 'Recibidos' : 'Faltantes');
        XLSX.writeFile(wb, `savar_${tipo.toLowerCase()}_${loteName.replace(/[\s/\\:]+/g, '_')}.xlsx`);
        showToast(`Excel descargado con éxito.`, 'success');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Error al exportar.', 'error');
    }
  }, []);

  const exportConsolidado = useCallback(() => {
    if (!filteredReportLotes.length) {
      showToast('No hay cargas para exportar consolidado.', 'warning');
      return;
    }
    let totalGeneral = 0;
    let recibidosGeneral = 0;
    const rows = filteredReportLotes.map((l) => {
      const total = Number(l.total || 0);
      const recibidos = Number(l.recibidos || 0);
      const pendientes = Math.max(0, total - recibidos);
      totalGeneral += total;
      recibidosGeneral += recibidos;
      return {
        'Lote / Carga': l.nombre,
        'Fecha Carga': l.fecha_creacion ? new Date(l.fecha_creacion).toLocaleDateString('es-PE') : '—',
        'Total Paquetes': total,
        'Recibidos (LLEGÓ)': recibidos,
        'Faltantes (PENDIENTE)': pendientes,
        'Efectividad (%)': `${total > 0 ? Math.round((recibidos / total) * 100) : 0}%`,
      };
    });
    rows.push({
      'Lote / Carga': 'TOTAL CONSOLIDADO',
      'Fecha Carga': '—',
      'Total Paquetes': totalGeneral,
      'Recibidos (LLEGÓ)': recibidosGeneral,
      'Faltantes (PENDIENTE)': Math.max(0, totalGeneral - recibidosGeneral),
      'Efectividad (%)': totalGeneral > 0 ? `${Math.round((recibidosGeneral / totalGeneral) * 100)}%` : '0%',
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resumen Mensual Cargas');
    let periodName = 'global';
    if (filterReportMes) {
      const [m, y] = filterReportMes.split('/');
      periodName = `${MESES_ES[Number(m) - 1]}_${y}`.toLowerCase();
    }
    XLSX.writeFile(wb, `consolidado_cargas_savar_${periodName}.xlsx`);
    showToast('Consolidado mensual exportado con éxito.', 'success');
  }, [filteredReportLotes, filterReportMes]);

  const faltantesFiltered = useMemo(() => {
    const q = faltantesFilter.toLowerCase().trim();
    if (!q) return faltantes;
    return faltantes.filter(
      (item) =>
        String(item.codigo_paquete || '').toLowerCase().includes(q) ||
        String(item.consignado || item.nombre || '').toLowerCase().includes(q) ||
        String(item.direccion || '').toLowerCase().includes(q) ||
        String(item.distrito || '').toLowerCase().includes(q),
    );
  }, [faltantes, faltantesFilter]);

  const showReset = user?.rol === 'SysAdmin' || user?.rol === 'AdminEmpresa' || user?.es_superadmin;

  return (
    <main className="main" id="main-content" onClick={handlePageClick}>
      <header className="topbar">
        <div>
          <div className="topbar-title" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            SAVAR SCAN
          </div>
          <div className="topbar-sub" style={{ fontSize: '0.82rem', color: '#64748b' }}>
            Módulo de escaneo y registro de paquetes
          </div>
        </div>
        <div className="topbar-right" style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <span className="topbar-date">{currentDate}</span>
          <div className="user-profile-badge" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="user-profile-info" style={{ textAlign: 'right' }}>
              <div className="user-profile-name" style={{ fontWeight: 700, fontSize: '0.95rem' }}>{user?.nombre || 'Operador'}</div>
              <div className="user-profile-sede" style={{ fontSize: '0.8rem', color: '#64748b' }}>{user?.sede_nombre || 'Operador'}</div>
            </div>
            <div className="user-profile-avatar" style={{ width: 40, height: 40, background: 'rgba(34,168,90,0.08)', border: '1px solid rgba(34,168,90,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22a85a' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
          </div>
        </div>
      </header>

      <main className="content page-body scan-page-body" style={{ padding: '12px 16px' }}>
        <div className="scan-wrapper" style={{ maxWidth: 1440, margin: '0 auto', display: 'grid', gridTemplateColumns: '460px 1fr', gap: 16 }}>
          <div className="ss-top-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, gridColumn: '1 / -1', marginBottom: 16 }}>
            <section className="ss-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, margin: 0 }}>
              <div className="ss-progress-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="ss-card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.85rem', fontWeight: 700 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                    </svg>
                    Lote Activo:{' '}
                    <span
                      id="lote-activo-label"
                      style={{ color: '#2563eb', fontWeight: 800, fontSize: '1.05rem', borderBottom: '1.5px solid #2563eb', paddingBottom: 1, marginLeft: 4 }}
                    >
                      {activeLoteName || 'Ninguno (Suba un Excel)'}
                    </span>
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    value={activeLoteName}
                    onChange={(e) => { setActiveLoteName(e.target.value); setIncidenciasCount(0); }}
                    className="ss-lote-select"
                    style={{ padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer', minWidth: 220, appearance: 'none', background: '#fff', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 32 }}
                  >
                    {lotes.map((l) => (
                      <option key={l.nombre} value={l.nombre}>{l.nombre}</option>
                    ))}
                  </select>
                  <button
                    id="btn-ver-faltantes"
                    className="ss-btn ss-btn-secondary"
                    disabled={!activeLoteName}
                    onClick={async () => {
                      await loadFaltantes();
                      setShowFaltantesModal(true);
                    }}
                    type="button"
                    style={{ width: 'auto', padding: '6px 14px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    Ver faltantes
                  </button>
                </div>
              </div>

              <div className="ss-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
                {[
                  { icon: <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />, label: 'Total Lote', value: activeLote?.total || 0, statClass: 'stat-total', iconColor: '#2563eb', iconBg: 'rgba(37,99,235,0.07)', valueColor: '#1e3a8a' },
                  { icon: <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />, label: 'Recibidos', value: activeLote?.recibidos || 0, statClass: 'stat-recibidos', iconColor: '#16a34a', iconBg: 'rgba(22,163,74,0.07)', valueColor: '#15803d' },
                  { icon: <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />, label: 'Faltantes', value: activeLote ? Math.max(0, activeLote.total - activeLote.recibidos) : 0, statClass: 'stat-faltantes', iconColor: '#64748b', iconBg: 'rgba(100,116,139,0.07)', valueColor: '#b45309' },
                  { icon: <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />, label: 'Incidencias', value: incidenciasCount, statClass: 'stat-incidencias', iconColor: '#dc2626', iconBg: 'rgba(220,38,38,0.07)', valueColor: '#b91c1c' },
                ].map((s) => (
                  <div key={s.label} className={`ss-stat ${s.statClass}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0' }}>
                    <div className="ss-stat-icon" style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: s.iconBg, color: s.iconColor }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
                        {s.icon}
                      </svg>
                    </div>
                    <div className="ss-stat-info">
                      <div className="ss-stat-label" style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 4 }}>{s.label}</div>
                      <div className="ss-stat-value" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1.6rem', fontWeight: 800, lineHeight: 1.2, color: s.valueColor }}>{s.value}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="ss-progress-wrap" style={{ marginTop: 14 }}>
                <div className="ss-progress-info" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, color: '#64748b' }}>Progreso de recepción</span>
                  <span id="lote-progress-pct" style={{ fontWeight: 700, color: '#0f172a' }}>{progressPct}%</span>
                </div>
                <div className="ss-progress-bar-bg" style={{ height: 5, background: '#e2e8f0', borderRadius: 999, border: 'none' }}>
                  <div className="ss-progress-bar-fill" style={{ width: `${progressPct}%`, height: 5, borderRadius: 999, background: '#2563eb', transition: 'width 0.4s ease' }} />
                </div>
              </div>

              {progressPct === 100 && activeLote && activeLote.total > 0 && (
                <div className="ss-complete-banner" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '10px 14px', background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '1px solid #86efac', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, color: '#166534' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  CARGA COMPLETADA AL 100% — TODOS LOS PAQUETES RECIBIDOS
                </div>
              )}
            </section>

            <section className="ss-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, margin: 0 }}>
              <div className="ss-card-header" style={{ marginBottom: 16, borderBottom: 'none', paddingBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#1e3a8a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, color: '#1e3a8a' }}>
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                <div className="ss-card-title" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.95rem', fontWeight: 700 }}>Acciones Rápidas</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  id="btn-open-import"
                  className="ss-btn ss-btn-primary"
                  onClick={openImportModal}
                  type="button"
                  style={{ background: '#1e3a8a', color: '#fff', fontWeight: 600, padding: '10px 16px', borderRadius: 8, border: 'none', fontSize: '0.82rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><line x1="12" y1="3" x2="12" y2="12" />
                  </svg>
                  Importar Catálogo (Excel)
                </button>
                <button
                  id="btn-export-scans"
                  className="ss-btn ss-btn-secondary"
                  disabled={!activeLoteName}
                  onClick={() => exportScanned(activeLoteName)}
                  type="button"
                  style={{ background: '#fff', border: '1.5px solid #e2e8f0', color: '#0f172a', fontWeight: 600, padding: '10px 16px', borderRadius: 8, fontSize: '0.82rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Exportar Escaneados
                </button>
                {showReset && (
                  <button
                    id="btn-reset-scans"
                    className="ss-btn ss-btn-secondary"
                    disabled={!activeLoteName}
                    onClick={handleResetLote}
                    type="button"
                    style={{ background: '#fff', border: '1.5px solid #e2e8f0', color: '#0f172a', fontWeight: 600, padding: '10px 16px', borderRadius: 8, fontSize: '0.82rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    Reiniciar Lote
                  </button>
                )}
              </div>
            </section>
          </div>

          <div className="ss-ops-column" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <section className="ss-card ss-scan-card" style={{ padding: 24, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 }}>
              <div className="ss-scan-label" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', fontWeight: 600, color: '#64748b' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, color: '#22a85a' }}>
                  <path d="M3 5v14M21 5v14M7 5v14M17 5v14M11 5v14M14 5v14" />
                </svg>
                Caja de Escaneo
              </div>
              <div className="ss-scan-input-wrap" style={{ position: 'relative', width: '100%' }}>
                <input
                  ref={scanInputRef}
                  type="text"
                  id="scan-input"
                  className="ss-scan-input"
                  placeholder="ESCANEAR CÓDIGO DE BARRAS..."
                  autoComplete="off"
                  value={scanInput}
                  onChange={handleScanInputChange}
                  onKeyDown={handleScanInputKeyDown}
                  style={{ width: '100%', padding: '16px 18px 16px 50px', fontSize: '1.2rem', fontWeight: 500, fontFamily: "'Inter', monospace", border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#f6f8fa', textTransform: 'uppercase', letterSpacing: '0.04em', outline: 'none', boxSizing: 'border-box' }}
                />
                <svg className="ss-scan-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, color: '#94a3b8' }}>
                  <path d="M3 5v14M21 5v14M7 5v14M17 5v14M11 5v14M14 5v14" />
                </svg>
              </div>
              <div
                id="scan-status-card"
                className={`ss-status-card state-${scanStatus.type}`}
                style={{ width: '100%', marginTop: 18, padding: 14, borderRadius: 8, textAlign: 'center', border: '1.5px solid transparent', height: 96, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: scanStatus.type === 'success' ? '#f4fbf7' : scanStatus.type === 'error' ? '#fffbfb' : scanStatus.type === 'warning' || scanStatus.type === 'other-lote' ? '#fffdf5' : '#fafafa', borderColor: scanStatus.type === 'success' ? '#10b981' : scanStatus.type === 'error' ? '#ef4444' : scanStatus.type === 'warning' ? '#f59e0b' : scanStatus.type === 'other-lote' ? '#3b82f6' : '#e2e8f0' }}
              >
                <div className="ss-status-indicator" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="ss-status-dot" style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', background: scanStatus.type === 'success' ? '#10b981' : scanStatus.type === 'error' ? '#ef4444' : scanStatus.type === 'warning' ? '#f59e0b' : scanStatus.type === 'other-lote' ? '#3b82f6' : '#64748b' }} />
                  <div id="status-badge-title" className="ss-status-title" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.95rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: scanStatus.type === 'success' ? '#15803d' : scanStatus.type === 'error' ? '#b91c1c' : scanStatus.type === 'warning' ? '#b45309' : scanStatus.type === 'other-lote' ? '#1d4ed8' : '#64748b' }}>{scanStatus.title}</div>
                </div>
                <div id="status-badge-subtitle" className="ss-status-subtitle" style={{ fontSize: '0.76rem', fontWeight: 550, color: '#64748b', lineHeight: 1.35, maxWidth: '95%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{scanStatus.subtitle}</div>
              </div>
            </section>

            <section className="ss-card ss-package-card" style={{ padding: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 }}>
              <div className="ss-card-header" style={{ marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, color: '#22a85a' }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" />
                </svg>
                <div className="ss-card-title" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.85rem', fontWeight: 700 }}>Información del Paquete</div>
              </div>
              <div className="ss-info-container" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="ss-info-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="ss-info-item" style={{ padding: '10px 12px', borderRadius: 6, background: '#f6f8fa', border: '1px solid #e2e8f0' }}>
                    <div className="ss-info-label" style={{ fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                      Código
                    </div>
                    <div id="info-codigo" className="ss-info-value" style={{ fontSize: '0.88rem', fontWeight: 600, wordBreak: 'break-word' }}>{scannedPackage?.codigo_paquete || '—'}</div>
                  </div>
                  <div className="ss-info-item" style={{ padding: '10px 12px', borderRadius: 6, background: '#f6f8fa', border: '1px solid #e2e8f0' }}>
                    <div className="ss-info-label" style={{ fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                      Teléfono
                    </div>
                    <div id="info-telefono" className="ss-info-value" style={{ fontSize: '0.88rem', fontWeight: 600, wordBreak: 'break-word' }}>{scannedPackage?.telefono || '—'}</div>
                  </div>
                </div>
                <div className="ss-info-item" style={{ padding: '10px 12px', borderRadius: 6, background: '#f6f8fa', border: '1px solid #e2e8f0' }}>
                  <div className="ss-info-label" style={{ fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    Consignado / Cliente
                  </div>
                  <div id="info-consignado" className="ss-info-value" style={{ fontSize: '0.88rem', fontWeight: 600, wordBreak: 'break-word' }}>{scannedPackage?.consignado || scannedPackage?.nombre || '—'}</div>
                </div>
                <div className="ss-info-item" style={{ padding: '10px 12px', borderRadius: 6, background: '#f6f8fa', border: '1px solid #e2e8f0' }}>
                  <div className="ss-info-label" style={{ fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                    Dirección de Entrega
                  </div>
                  <div id="info-direccion" className="ss-info-value" style={{ fontSize: '0.88rem', fontWeight: 600, wordBreak: 'break-word' }}>
                    {scannedPackage ? `${scannedPackage.direccion || ''} (${scannedPackage.distrito || ''})` : '—'}
                  </div>
                </div>
                <div className="ss-info-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="ss-info-item" style={{ padding: '10px 12px', borderRadius: 6, background: '#f6f8fa', border: '1px solid #e2e8f0' }}>
                    <div className="ss-info-label" style={{ fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>Dpto / Prov</div>
                    <div className="ss-info-value" style={{ fontSize: '0.88rem', fontWeight: 600, wordBreak: 'break-word' }}>
                      <span id="info-departamento">{scannedPackage?.departamento || '—'}</span> / <span id="info-provincia">{scannedPackage?.provincia || '—'}</span>
                    </div>
                  </div>
                  <div className="ss-info-item" style={{ padding: '10px 12px', borderRadius: 6, background: '#f6f8fa', border: '1px solid #e2e8f0' }}>
                    <div className="ss-info-label" style={{ fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>Distrito</div>
                    <div id="info-distrito" className="ss-info-value" style={{ fontSize: '0.88rem', fontWeight: 600, wordBreak: 'break-word' }}>{scannedPackage?.distrito || '—'}</div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="ss-reports-column" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <section className="ss-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 24, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 }}>
              <div className="scan-tabs" style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e2e8f0', marginBottom: 14 }}>
                <button
                  className={`scan-tab-btn${activeTab === 'escaneo' ? ' active' : ''}`}
                  onClick={() => setActiveTab('escaneo')}
                  style={{ background: 'none', border: 'none', borderBottom: activeTab === 'escaneo' ? '2px solid #0f172a' : '2px solid transparent', marginBottom: -1, padding: '8px 16px 6px', fontSize: '0.8rem', fontWeight: activeTab === 'escaneo' ? 600 : 500, color: activeTab === 'escaneo' ? '#0f172a' : '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M3 5v14M21 5v14M7 5v14M17 5v14M11 5v14M14 5v14" /></svg>
                  Escaneo de la Sesión
                </button>
                <button
                  className={`scan-tab-btn${activeTab === 'reportes' ? ' active' : ''}`}
                  onClick={() => setActiveTab('reportes')}
                  type="button"
                  style={{ background: 'none', border: 'none', borderBottom: activeTab === 'reportes' ? '2px solid #0f172a' : '2px solid transparent', marginBottom: -1, padding: '8px 16px 6px', fontSize: '0.8rem', fontWeight: activeTab === 'reportes' ? 600 : 500, color: activeTab === 'reportes' ? '#0f172a' : '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                  Historial de Cargas y Reportes
                </button>
              </div>

              {activeTab === 'escaneo' && (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <div className="ss-history-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <h3 className="ss-card-title" style={{ margin: 0, fontSize: '1.05rem', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700 }}>Registros de la Sesión Actual</h3>
                    <div className="ss-history-count" style={{ fontSize: '0.72rem', fontWeight: 500, color: '#94a3b8', background: '#f6f8fa', padding: '3px 10px', borderRadius: 4, fontFamily: "'Inter', monospace" }}>
                      Sesión: <span id="total-scanned-count">{history.length}</span> leídos
                    </div>
                  </div>
                  <div className="ss-table-wrap" style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'auto', maxHeight: 480 }}>
                    <table className="ss-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', tableLayout: 'fixed' }}>
                      <thead>
                        <tr>
                          <th style={{ width: 40, background: '#f6f8fa', padding: '7px 12px', fontWeight: 600, fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>#</th>
                          <th style={{ width: 130, background: '#f6f8fa', padding: '7px 12px', fontWeight: 600, fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Código</th>
                          <th style={{ width: 180, background: '#f6f8fa', padding: '7px 12px', fontWeight: 600, fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Consignado</th>
                          <th style={{ background: '#f6f8fa', padding: '7px 12px', fontWeight: 600, fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Dirección</th>
                          <th style={{ width: 120, background: '#f6f8fa', padding: '7px 12px', fontWeight: 600, fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Distrito</th>
                          <th style={{ width: 90, background: '#f6f8fa', padding: '7px 12px', fontWeight: 600, fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Estado</th>
                          <th style={{ width: 80, background: '#f6f8fa', padding: '7px 12px', fontWeight: 600, fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Hora</th>
                        </tr>
                      </thead>
                      <tbody id="scan-history-body">
                        {history.length > 0 ? (
                          history.map((item, idx) => {
                            const cfg = getStatusConfig(item.estado);
                            return (
                              <tr key={item.id || idx} style={{ borderBottom: '1px solid #f1f4f8' }}>
                                <td style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600 }}>{idx + 1}</td>
                                <td style={{ padding: '6px 12px', fontSize: '0.8rem', fontFamily: "'Inter', monospace", fontWeight: 600, letterSpacing: '0.03em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.codigo_paquete || item.codigo_escaneado || ''}>{item.codigo_paquete || item.codigo_escaneado || '—'}</td>
                                <td style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.consignado || item.nombre || ''}>{item.consignado || item.nombre || '—'}</td>
                                <td style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.direccion || ''}>{item.direccion || '—'}</td>
                                <td style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.distrito || ''}>{item.distrito || '—'}</td>
                                <td style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                                  <span className={cfg.badgeClass}>{cfg.badgeText}</span>
                                </td>
                                <td style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                                  {item.fecha_escaneo ? new Date(item.fecha_escaneo).toLocaleTimeString('es-PE') : new Date().toLocaleTimeString('es-PE')}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={7} className="empty-row" style={{ textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', padding: 20, fontSize: '0.8rem' }}>
                              No se han registrado escaneos en esta sesión.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'reportes' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="text"
                        value={filterReportLote}
                        onChange={(e) => setFilterReportLote(e.target.value)}
                        className="filter-input"
                        placeholder="Buscar lote..."
                        style={{ width: 200, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.82rem' }}
                      />
                      <select
                        value={filterReportMes}
                        onChange={(e) => setFilterReportMes(e.target.value)}
                        className="filter-input"
                        style={{ padding: '8px 12px', fontWeight: 600, border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.82rem' }}
                      >
                        <option value="">Todos los meses</option>
                        {monthOptions.map((m) => {
                          const [mNum, y] = m.split('/');
                          return <option key={m} value={m}>{MESES_ES[Number(mNum) - 1]} {y}</option>;
                        })}
                      </select>
                    </div>
                    <button
                      id="btn-export-consolidado"
                      className="ss-btn ss-btn-primary"
                      onClick={exportConsolidado}
                      type="button"
                      style={{ background: '#0f172a', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><line x1="12" y1="3" x2="12" y2="12" />
                      </svg>
                      Exportar Consolidado Mensual
                    </button>
                  </div>

                  <div className="ss-table-wrap ss-report-table-wrap" style={{ border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'auto', maxHeight: 480 }}>
                    <table className="ss-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead>
                        <tr>
                          <th style={{ background: '#f6f8fa', padding: '7px 12px', fontWeight: 600, fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Lote / Carga</th>
                          <th style={{ background: '#f6f8fa', padding: '7px 12px', fontWeight: 600, fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Fecha Carga</th>
                          <th style={{ background: '#f6f8fa', padding: '7px 12px', fontWeight: 600, fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>Total</th>
                          <th style={{ background: '#f6f8fa', padding: '7px 12px', fontWeight: 600, fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>Llegaron</th>
                          <th style={{ background: '#f6f8fa', padding: '7px 12px', fontWeight: 600, fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>Faltan</th>
                          <th style={{ background: '#f6f8fa', padding: '7px 12px', fontWeight: 600, fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Efectividad / Progreso</th>
                          <th style={{ background: '#f6f8fa', padding: '7px 12px', fontWeight: 600, fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', textAlign: 'center', width: 120 }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody id="reportes-lotes-body">
                        {filteredReportLotes.length > 0 ? (
                          filteredReportLotes.map((lote) => {
                            const pct = lote.total > 0 ? Math.round((lote.recibidos / lote.total) * 100) : 0;
                            const faltan = Math.max(0, lote.total - lote.recibidos);
                            return (
                              <tr key={lote.nombre} style={{ borderBottom: '1px solid #f1f4f8' }}>
                                <td style={{ padding: '6px 12px', fontSize: '0.8rem' }}><span style={{ fontWeight: 700, color: '#1e293b' }}>{lote.nombre}</span></td>
                                <td style={{ padding: '6px 12px', fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>{lote.fecha_creacion ? new Date(lote.fecha_creacion).toLocaleDateString('es-PE') : '—'}</td>
                                <td style={{ padding: '6px 12px', fontSize: '0.8rem', textAlign: 'center', fontWeight: 600, color: '#1e3a8a' }}>{lote.total}</td>
                                <td style={{ padding: '6px 12px', fontSize: '0.8rem', textAlign: 'center', color: '#15803d', fontWeight: 700 }}>{lote.recibidos}</td>
                                <td style={{ padding: '6px 12px', fontSize: '0.8rem', textAlign: 'center', color: '#b45309', fontWeight: 700 }}>{faltan}</td>
                                <td style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                                  <div className="mini-progress-container" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 130 }}>
                                    <div className="mini-progress-bg" style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                                      <div className="mini-progress-bar" style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: '#2563eb', transition: 'width 0.3s ease' }} />
                                    </div>
                                    <div className="mini-progress-pct" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a', minWidth: 32, textAlign: 'right', fontFamily: "'Inter', monospace" }}>{pct}%</div>
                                  </div>
                                </td>
                                <td style={{ padding: '6px 12px', fontSize: '0.8rem', textAlign: 'center' }}>
                                  <div className="row-actions" style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                                    <button
                                      className="btn-row-action action-activate"
                                      title="Activar lote para escaneo"
                                      onClick={() => handleActivateLote(lote.nombre)}
                                      type="button"
                                      style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 6, cursor: 'pointer', color: '#64748b', display: 'inline-flex', alignItems: 'center' }}
                                    >
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M20 12H4M12 4v16" /></svg>
                                    </button>
                                    <button
                                      className="btn-row-action action-export"
                                      title="Descargar recibidos"
                                      onClick={() => exportScanned(lote.nombre)}
                                      type="button"
                                      style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 6, cursor: 'pointer', color: '#64748b', display: 'inline-flex', alignItems: 'center' }}
                                    >
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                                    </button>
                                    <button
                                      className="btn-row-action action-missing"
                                      title="Exportar faltantes"
                                      onClick={() => exportScanned(lote.nombre, 'PENDIENTE')}
                                      type="button"
                                      style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 6, cursor: 'pointer', color: '#64748b', display: 'inline-flex', alignItems: 'center' }}
                                    >
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                                    </button>
                                    <button
                                      className="btn-row-action action-delete"
                                      title="Eliminar lote y paquetes"
                                      onClick={() => handleDeleteLote(lote.nombre)}
                                      type="button"
                                      style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 6, cursor: 'pointer', color: '#64748b', display: 'inline-flex', alignItems: 'center' }}
                                    >
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={7} className="empty-row" style={{ textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', padding: 25, fontSize: '0.8rem' }}>
                              No hay cargas registradas en la base de datos.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      {showImportModal && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) setShowImportModal(false); }}>
          <div className="modal-box" style={{ maxWidth: 520, background: '#fff', borderRadius: 12, width: '100%', boxShadow: '0 20px 40px -12px rgba(15,23,42,0.2)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div className="modal-header" style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(34,168,90,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#22a85a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, lineHeight: 1.3, fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1rem', fontWeight: 700 }}>Importar Catálogo</h3>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400 }}>Cargue un lote de paquetes desde Excel</div>
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowImportModal(false)} type="button" aria-label="Cerrar" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, borderRadius: 4 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="modal-body" style={{ padding: '16px 20px' }}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: '0.8rem', marginBottom: 8 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#22a85a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>
                  Nombre del Lote
                </label>
                <input
                  type="text"
                  className="filter-input"
                  value={importLoteName}
                  onChange={(e) => setImportLoteName(e.target.value)}
                  style={{ width: '100%', borderRadius: 10, padding: '12px 14px', fontSize: '0.9rem', fontWeight: 500, background: '#f6f8fa', border: '1px solid #e2e8f0', boxSizing: 'border-box' }}
                  placeholder="Ej. SAVAR - Carga 02/07"
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: '0.8rem', marginBottom: 10 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#22a85a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                  Archivo Excel
                </div>
                <div
                  className="import-dropzone"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (importLoading) return;
                    const file = e.dataTransfer.files?.[0];
                    if (file) importExcel(file);
                  }}
                  style={{ border: '2px dashed #e2e8f0', borderRadius: 10, padding: '32px 20px', textAlign: 'center', cursor: importLoading ? 'not-allowed' : 'pointer', background: '#f6f8fa', opacity: importLoading ? 0.6 : 1 }}
                >
                  {importLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 0' }}>
                      <span className="spinner" style={{ display: 'inline-block', width: 24, height: 24, border: '2px solid #e2e8f0', borderTopColor: '#22a85a', borderRadius: '50%', marginBottom: 8 }}></span>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>Importando catálogo...</div>
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 2 }}>Por favor, espere un momento.</div>
                    </div>
                  ) : (
                    <>
                      <svg className="import-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 36, height: 36, color: '#94a3b8', marginBottom: 8 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><line x1="12" y1="3" x2="12" y2="12" /></svg>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>Arrastra tu archivo Excel aquí</div>
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 2 }}>o haz clic para seleccionar un archivo</div>
                      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                        {['.XLSX', '.XLS', '.CSV'].map((ext) => (
                          <span key={ext} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', fontWeight: 500, color: '#94a3b8', background: '#fff', padding: '3px 10px', borderRadius: 4, border: '1px solid #e2e8f0' }}>{ext}</span>
                        ))}
                      </div>
                      <label>
                        <input
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          style={{ display: 'none' }}
                          disabled={importLoading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) importExcel(file);
                          }}
                        />
                      </label>
                    </>
                  )}
                </div>
              </div>
              {importStatus && (
                <div style={{ fontSize: '0.8rem', color: '#1e3a8a', textAlign: 'center', fontWeight: 600, marginTop: 8 }}>
                  {importStatus}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showZoneModal && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) { setShowZoneModal(false); setTempParsedRows([]); setSelectedZones(new Set()); } }}>
          <div className="modal-box" style={{ maxWidth: 650, background: '#fff', borderRadius: 12, width: '100%', boxShadow: '0 20px 40px -12px rgba(15,23,42,0.2)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div className="modal-header" style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(34,168,90,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#22a85a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                    <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
                  </svg>
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, lineHeight: 1.3, fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1rem', fontWeight: 700 }}>Zonas a Importar</h3>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400 }}>Seleccione las provincias y distritos que desea cargar</div>
                </div>
              </div>
              <button className="modal-close" onClick={() => { setShowZoneModal(false); setTempParsedRows([]); setSelectedZones(new Set()); }} type="button" aria-label="Cerrar" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, borderRadius: 4 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="modal-body" style={{ padding: 20 }}>
              <div id="filter-modal-file-info" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', fontSize: '0.8rem', color: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>Nombre del Lote: <strong style={{ color: '#0f172a' }}>{importLoteName}</strong></div>
                <div style={{ fontWeight: 700, color: '#22a85a' }}>{tempParsedRows.length} paquetes detectados</div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <input
                  type="text"
                  className="filter-input"
                  placeholder="Buscar por provincia o distrito..."
                  value={zoneSearch}
                  onChange={(e) => setZoneSearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>

              <div className="import-filters-list" style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4 }}>
                {Object.keys(filteredZoneTree).length > 0 ? (
                  Object.entries(filteredZoneTree).map(([prov, data]) => {
                    const districts = Object.keys(data.districts);
                    const isAllChecked = isProvinceChecked(prov, districts);
                    return (
                      <div key={prov} className="province-group-card" style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#fff' }}>
                        {/* Cabecera de Provincia */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: 8, marginBottom: 8 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#0f172a', fontSize: '0.85rem', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={isAllChecked}
                              onChange={() => toggleProvince(prov, districts)}
                              style={{ width: 16, height: 16, accentColor: '#22a85a', cursor: 'pointer' }}
                            />
                            {prov}
                          </label>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, background: 'rgba(34,168,90,0.08)', color: '#22a85a', padding: '2px 8px', borderRadius: 4 }}>
                            {data.total} pqtes
                          </span>
                        </div>
                        {/* Sub-grilla de Distritos */}
                        <div className="province-districts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, paddingLeft: 4 }}>
                          {Object.entries(data.districts).map(([dist, count]) => {
                            const isChecked = selectedZones.has(`${prov} - ${dist}`);
                            return (
                              <label key={dist} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, background: '#f8fafc' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleDistrict(prov, dist)}
                                    style={{ width: 14, height: 14, accentColor: '#22a85a', cursor: 'pointer' }}
                                  />
                                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155' }}>{dist}</span>
                                </div>
                                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 500 }}>{count} pqtes</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', padding: 20, fontSize: '0.8rem' }}>
                    No se encontraron provincias o distritos que coincidan con la búsqueda.
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer" style={{ padding: '14px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="ss-btn ss-btn-secondary"
                onClick={() => {
                  setShowZoneModal(false);
                  setTempParsedRows([]);
                  setSelectedZones(new Set());
                }}
                style={{ background: '#fff', border: '1px solid #cbd5e1', color: '#475569', padding: '8px 16px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="ss-btn ss-btn-primary"
                disabled={filteredRowsCount.length === 0 || importLoading}
                onClick={handleImportSubmit}
                style={{
                  background: filteredRowsCount.length === 0 ? '#94a3b8' : '#22a85a',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: filteredRowsCount.length === 0 || importLoading ? 'not-allowed' : 'pointer'
                }}
              >
                {importLoading ? 'Importando...' : `Importar seleccionados (${filteredRowsCount.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showFaltantesModal && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) setShowFaltantesModal(false); }}>
          <div className="modal-box" style={{ maxWidth: 850, background: '#fff', borderRadius: 12, width: '100%', boxShadow: '0 20px 40px -12px rgba(15,23,42,0.2)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div className="modal-header" style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 className="modal-title" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1rem', fontWeight: 700 }}>Paquetes Faltantes del Lote: {activeLoteName}</h3>
              <button className="modal-close" onClick={() => setShowFaltantesModal(false)} type="button" aria-label="Cerrar" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, borderRadius: 4 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="modal-body" style={{ padding: 20 }}>
              <div style={{ marginBottom: 12 }}>
                <input
                  type="text"
                  className="filter-input"
                  placeholder="Buscar en faltantes por código, consignado..."
                  value={faltantesFilter}
                  onChange={(e) => setFaltantesFilter(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.82rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ maxHeight: 350, overflowY: 'auto', border: '1.5px solid #e2e8f0', borderRadius: 6 }}>
                <table className="ss-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 120, background: '#f6f8fa', padding: '7px 12px', fontWeight: 600, fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Código</th>
                      <th style={{ width: 180, background: '#f6f8fa', padding: '7px 12px', fontWeight: 600, fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Consignado</th>
                      <th style={{ background: '#f6f8fa', padding: '7px 12px', fontWeight: 600, fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Dirección</th>
                      <th style={{ width: 140, background: '#f6f8fa', padding: '7px 12px', fontWeight: 600, fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Distrito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faltantesFiltered.length > 0 ? (
                      faltantesFiltered.map((item) => (
                        <tr key={item.id} style={{ borderBottom: '1px solid #f1f4f8' }}>
                          <td style={{ padding: '6px 12px', fontSize: '0.8rem', fontFamily: "'Inter', monospace", fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.codigo_paquete}>{item.codigo_paquete}</td>
                          <td style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.consignado || item.nombre || ''}>{item.consignado || item.nombre || '—'}</td>
                          <td style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.direccion || ''}>{item.direccion || '—'}</td>
                          <td style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.distrito || ''}>{item.distrito || '—'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="empty-row" style={{ textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', padding: 20, fontSize: '0.8rem' }}>
                          {faltantes.length === 0 ? 'Todos los paquetes de este lote ya han sido recibidos.' : 'Ningún paquete coincide con la búsqueda.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
