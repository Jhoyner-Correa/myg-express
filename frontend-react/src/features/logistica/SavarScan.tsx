import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { AlertTriangle, Barcode, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { PageHeader } from '../../components/ui/PageHeader/PageHeader';
import { PageLoader } from '../../components/ui/PageLoader/PageLoader';
import { getApiErrorMessage } from '../../core/api/errors';
import { PERMISSIONS, usePermissions } from '../../core/auth/permissions';
import { showConfirm, showToast } from '../../core/utils/toast';
import { initializeScannerAudio, playScanTone } from './savar-scan/audio';
import { ImportCatalogModal } from './savar-scan/components/ImportCatalogModal';
import { MissingPackagesModal } from './savar-scan/components/MissingPackagesModal';
import { SavarOverview } from './savar-scan/components/SavarOverview';
import { SavarRecordsPanel } from './savar-scan/components/SavarRecordsPanel';
import { ScannerWorkspace } from './savar-scan/components/ScannerWorkspace';
import { ZoneSelectionModal } from './savar-scan/components/ZoneSelectionModal';
import {
  buildZoneTree,
  filterLots,
  filterMissing,
  filterPackagesByZones,
  filterZoneTree,
  mapSpreadsheetRows,
  monthKey,
  zoneKey,
} from './savar-scan/domain';
import { exportLotsSummary, exportPackageList, readSpreadsheet } from './savar-scan/excel';
import { useSavarScanData } from './savar-scan/hooks/useSavarScanData';
import { readScanFailure, savarScanService } from './savar-scan/savar-scan.service';
import type { ExportStatus, ImportedPackage, SavarPackage, SavarTab, ScanFeedback } from './savar-scan/types';
import styles from './savar-scan/SavarScan.module.css';

const IDLE_FEEDBACK: ScanFeedback = {
  tone: 'neutral',
  title: 'ESPERANDO',
  description: 'Escanea un código de barras para comenzar.',
};

function defaultLotName() {
  const now = new Date();
  return `SAVAR - ${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
}

export const SavarScan: React.FC = () => {
  const { can } = usePermissions();
  const canManage = can(PERMISSIONS.SAVAR_SCAN_MANAGE);
  const {
    lots, history, setHistory, activeLotName, setActiveLotName,
    loading, error, reload, reloadLots,
  } = useSavarScanData();

  const [tab, setTab] = useState<SavarTab>('escaneo');
  const [scanInput, setScanInput] = useState('');
  const [feedback, setFeedback] = useState<ScanFeedback>(IDLE_FEEDBACK);
  const [scannedPackage, setScannedPackage] = useState<SavarPackage | null>(null);
  const [incidents, setIncidents] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [lotFilter, setLotFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');

  const [importOpen, setImportOpen] = useState(false);
  const [zoneOpen, setZoneOpen] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [importLotName, setImportLotName] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [parsedRows, setParsedRows] = useState<ImportedPackage[]>([]);
  const [selectedZones, setSelectedZones] = useState<Set<string>>(new Set());
  const [zoneSearch, setZoneSearch] = useState('');
  const [missing, setMissing] = useState<SavarPackage[]>([]);
  const [missingQuery, setMissingQuery] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const scanningRef = useRef(false);
  const audioReadyRef = useRef(false);

  const focusScanner = useCallback(() => window.requestAnimationFrame(() => inputRef.current?.focus()), []);
  const resetScanner = useCallback(() => {
    setFeedback(IDLE_FEEDBACK);
    setScannedPackage(null);
    setScanInput('');
    focusScanner();
  }, [focusScanner]);

  const selectLot = useCallback((name: string) => {
    setActiveLotName(name);
    setIncidents(0);
    setTab('escaneo');
    resetScanner();
  }, [resetScanner, setActiveLotName]);

  const processScan = useCallback(async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code || scanningRef.current) return;
    if (!activeLotName) {
      showToast('Selecciona o importa un lote antes de escanear.', 'warning', { title: 'Lote no seleccionado' });
      focusScanner();
      return;
    }
    if (!canManage) {
      showToast('Tu cuenta tiene acceso de consulta, pero no puede registrar escaneos.', 'warning', { title: 'Acción restringida' });
      return;
    }

    scanningRef.current = true;
    setScanning(true);
    try {
      const item = await savarScanService.scan(code, activeLotName);
      playScanTone('success');
      setScannedPackage(item);
      setFeedback({ tone: 'success', title: 'LLEGÓ', description: `Paquete registrado en el lote “${activeLotName}”.` });
      setHistory(current => [item, ...current.filter(entry => entry.id !== item.id)].slice(0, 50));
      await reloadLots();
    } catch (scanError) {
      const failure = readScanFailure(scanError);
      if (failure.status === 422) {
        playScanTone('warning');
        setFeedback({ tone: 'other-lote', title: 'OTRO LOTE', description: failure.message });
        if (failure.package) {
          const incident = { ...failure.package, estado: 'OTRO_LOTE', fecha_escaneo: new Date().toISOString() };
          setScannedPackage(incident);
          setHistory(current => [incident, ...current].slice(0, 50));
        }
        setIncidents(value => value + 1);
      } else if (failure.status === 409) {
        playScanTone('warning');
        setFeedback({ tone: 'warning', title: 'REPETIDO', description: failure.message });
        if (failure.package) setScannedPackage(failure.package);
        setIncidents(value => value + 1);
      } else if (failure.status === 404) {
        playScanTone('error');
        setFeedback({ tone: 'error', title: 'NO EXISTE', description: failure.message });
        setScannedPackage({ id: 0, codigo_paquete: code, estado: 'NO_EXISTE' });
        setIncidents(value => value + 1);
      } else {
        playScanTone('error');
        showToast(failure.message, 'error', { title: 'Error de escaneo' });
      }
    } finally {
      setScanInput('');
      scanningRef.current = false;
      setScanning(false);
      focusScanner();
    }
  }, [activeLotName, canManage, focusScanner, reloadLots, setHistory]);

  const trackScannerKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void processScan(scanInput);
  };

  const updateScanInput = (value: string) => {
    setScanInput(value);
  };

  const openImport = () => {
    setImportLotName(defaultLotName());
    setImportStatus('');
    setImportOpen(true);
  };

  const parseFile = async (file: File) => {
    if (!importLotName.trim()) {
      showToast('Define el nombre del lote antes de leer el archivo.', 'warning');
      return;
    }
    setImportLoading(true);
    setImportStatus('Leyendo archivo...');
    try {
      const rows = mapSpreadsheetRows(await readSpreadsheet(file));
      if (!rows.length) throw new Error('No se encontraron filas válidas con código y consignado.');
      setParsedRows(rows);
      setSelectedZones(new Set(rows.map(item => zoneKey(item.provincia, item.distrito))));
      setImportOpen(false);
      setZoneSearch('');
      setZoneOpen(true);
      setImportStatus('');
    } catch (fileError) {
      const message = fileError instanceof Error
        ? fileError.message
        : getApiErrorMessage(fileError, 'No se pudo procesar el archivo Excel.');
      setImportStatus(message);
      showToast(message, 'error', { title: 'Error de importación' });
    } finally {
      setImportLoading(false);
    }
  };

  const closeZoneSelection = () => {
    setZoneOpen(false);
    setParsedRows([]);
    setSelectedZones(new Set());
  };

  const importSelected = async () => {
    const selectedRows = filterPackagesByZones(parsedRows, selectedZones);
    if (!selectedRows.length) return;
    setImportLoading(true);
    try {
      const message = await savarScanService.importPackages(importLotName.trim(), selectedRows);
      showToast(message || 'Catálogo importado correctamente.', 'success', { title: 'Importación completada' });
      closeZoneSelection();
      await reloadLots();
      selectLot(importLotName.trim());
    } catch (importError) {
      showToast(getApiErrorMessage(importError, 'No se pudo importar el catálogo.'), 'error');
    } finally {
      setImportLoading(false);
    }
  };

  const openMissing = async (lotName = activeLotName) => {
    if (!lotName) return;
    try {
      setMissing(await savarScanService.listMissing(lotName));
      setMissingQuery('');
      setMissingOpen(true);
    } catch (missingError) {
      showToast(getApiErrorMessage(missingError, 'No se pudieron consultar los paquetes faltantes.'), 'error');
    }
  };

  const resetLot = async () => {
    if (!activeLotName || !await showConfirm({ title: 'Restablecer escaneos', message: `Todos los paquetes recibidos del lote “${activeLotName}” volverán a pendiente.`, confirmText: 'Restablecer', type: 'danger' })) return;
    try {
      const message = await savarScanService.resetLot(activeLotName);
      showToast(message || 'Lote restablecido.', 'success');
      setHistory([]);
      setIncidents(0);
      resetScanner();
      await reloadLots();
    } catch (resetError) {
      showToast(getApiErrorMessage(resetError, 'No se pudo restablecer el lote.'), 'error');
    }
  };

  const deleteLot = async (name: string) => {
    if (!await showConfirm({ title: 'Eliminar lote', message: `Se eliminarán permanentemente el lote “${name}” y todos sus paquetes.`, confirmText: 'Eliminar lote', type: 'danger' })) return;
    try {
      const message = await savarScanService.deleteLot(name);
      showToast(message || 'Lote eliminado.', 'success');
      if (activeLotName === name) selectLot('');
      await reloadLots();
    } catch (deleteError) {
      showToast(getApiErrorMessage(deleteError, 'No se pudo eliminar el lote.'), 'error');
    }
  };

  const exportPackages = async (lot: string, status: ExportStatus = 'LLEGÓ') => {
    try {
      const items = status === 'LLEGÓ'
        ? await savarScanService.listPackages({ status, lot, limit: 500 })
        : await savarScanService.listMissing(lot);
      if (!items.length) return showToast(`No hay paquetes en estado ${status} para este lote.`, 'warning');
      await exportPackageList(items, lot, status);
      showToast('Archivo Excel generado correctamente.', 'success');
    } catch (exportError) {
      showToast(getApiErrorMessage(exportError, 'No se pudo generar el archivo.'), 'error');
    }
  };

  const exportSummary = async () => {
    try {
      await exportLotsSummary(filteredLots, monthFilter);
      showToast('Consolidado Excel generado correctamente.', 'success');
    } catch (exportError) {
      showToast(getApiErrorMessage(exportError, 'No se pudo generar el consolidado.'), 'error');
    }
  };

  const filteredLots = useMemo(() => filterLots(lots, lotFilter, monthFilter), [lots, lotFilter, monthFilter]);
  const months = useMemo(() => Array.from(new Set(lots.map(lot => monthKey(lot.fecha_creacion)).filter(Boolean))).sort((a, b) => {
    const [monthA = 0, yearA = 0] = a.split('/').map(Number);
    const [monthB = 0, yearB = 0] = b.split('/').map(Number);
    return yearB - yearA || monthB - monthA;
  }), [lots]);
  const zones = useMemo(() => filterZoneTree(buildZoneTree(parsedRows), zoneSearch), [parsedRows, zoneSearch]);
  const selectedRows = useMemo(() => filterPackagesByZones(parsedRows, selectedZones), [parsedRows, selectedZones]);
  const filteredMissing = useMemo(() => filterMissing(missing, missingQuery), [missing, missingQuery]);

  const toggleDistrict = (province: string, district: string) => {
    setSelectedZones(current => {
      const next = new Set(current);
      const key = zoneKey(province, district);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleProvince = (province: string, districts: string[]) => {
    setSelectedZones(current => {
      const next = new Set(current);
      const keys = districts.map(district => zoneKey(province, district));
      const shouldSelect = keys.some(key => !next.has(key));
      keys.forEach(key => {
        if (shouldSelect) next.add(key);
        else next.delete(key);
      });
      return next;
    });
  };

  const handlePageClick = (event: MouseEvent<HTMLElement>) => {
    if (!audioReadyRef.current) { initializeScannerAudio(); audioReadyRef.current = true; }
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('button, input, select, textarea, a, [role="dialog"]') || window.getSelection()?.toString()) return;
    focusScanner();
  };

  if (loading) return <PageLoader label="Cargando SAVAR SCAN" />;

  return (
    <main className={`main ${styles.page}`} id="main-content" onClick={handlePageClick}>
      <PageHeader icon={<Barcode />} title="SAVAR SCAN" subtitle="Recepción y control operativo de paquetes" />
      <div className={styles.content}>
        {error && !lots.length ? (
          <section className={styles.errorState} role="alert"><AlertTriangle aria-hidden="true" /><strong>No se pudo cargar SAVAR SCAN</strong><p>{getApiErrorMessage(error, 'Verifica la conexión con el servidor.')}</p><Button icon={<RefreshCw />} onClick={() => void reload()}>Reintentar</Button></section>
        ) : (
          <>
            {error && <div className={styles.refreshWarning} role="alert"><AlertTriangle /><span>Se muestran los últimos datos disponibles.</span><button type="button" onClick={() => void reload()}>Reintentar</button></div>}
            <SavarOverview lots={lots} activeLotName={activeLotName} incidents={incidents} canManage={canManage} onSelect={selectLot} onOpenMissing={() => void openMissing()} onImport={openImport} onExport={() => void exportPackages(activeLotName)} onReset={() => void resetLot()} />
            <section className={styles.workspace}>
              <ScannerWorkspace inputRef={inputRef} value={scanInput} feedback={feedback} packageItem={scannedPackage} disabled={!activeLotName || !canManage || scanning} onChange={updateScanInput} onKeyDown={trackScannerKey} />
              <SavarRecordsPanel tab={tab} history={history} lots={filteredLots} months={months} lotFilter={lotFilter} monthFilter={monthFilter} canManage={canManage} onTab={setTab} onLotFilter={setLotFilter} onMonthFilter={setMonthFilter} onActivate={selectLot} onExport={(name, status) => void exportPackages(name, status)} onDelete={name => void deleteLot(name)} onExportSummary={() => void exportSummary()} />
            </section>
          </>
        )}
      </div>
      <ImportCatalogModal open={importOpen} lotName={importLotName} loading={importLoading} status={importStatus} onLotName={setImportLotName} onFile={file => void parseFile(file)} onClose={() => setImportOpen(false)} />
      <ZoneSelectionModal
        open={zoneOpen}
        lotName={importLotName}
        total={parsedRows.length}
        tree={zones}
        selected={selectedZones}
        search={zoneSearch}
        selectedCount={selectedRows.length}
        loading={importLoading}
        onSearch={setZoneSearch}
        onDistrict={toggleDistrict}
        onProvince={toggleProvince}
        onSubmit={() => void importSelected()}
        onClose={closeZoneSelection}
      />
      <MissingPackagesModal open={missingOpen} lotName={activeLotName} items={filteredMissing} query={missingQuery} onQuery={setMissingQuery} onClose={() => setMissingOpen(false)} />
    </main>
  );
};
