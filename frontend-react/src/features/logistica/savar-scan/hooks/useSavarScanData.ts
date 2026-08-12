import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { savarScanService } from '../savar-scan.service';
import type { SavarLot, SavarPackage } from '../types';

function selectCurrentLot(lots: SavarLot[]) {
  const today = new Date().toLocaleDateString('es-PE');
  return lots.find(lot => lot.fecha_creacion && new Date(lot.fecha_creacion).toLocaleDateString('es-PE') === today)?.nombre
    ?? lots[0]?.nombre
    ?? '';
}

export function useSavarScanData() {
  const [lots, setLots] = useState<SavarLot[]>([]);
  const [history, setHistory] = useState<SavarPackage[]>([]);
  const [activeLotName, setActiveLotName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const loadLots = useCallback(async (autoSelect = false, signal?: AbortSignal) => {
    const nextLots = await savarScanService.listLots(signal);
    setLots(nextLots);
    setActiveLotName(current => {
      if (current && nextLots.some(lot => lot.nombre === current)) return current;
      return autoSelect ? selectCurrentLot(nextLots) : nextLots[0]?.nombre ?? '';
    });
    return nextLots;
  }, []);

  const loadHistory = useCallback(async (signal?: AbortSignal) => {
    setHistory(await savarScanService.listPackages({ status: 'LLEGÓ', limit: 50 }, signal));
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadLots(true, signal), loadHistory(signal)]);
    } catch (loadError) {
      if (!axios.isCancel(loadError)) setError(loadError);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [loadHistory, loadLots]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return {
    lots, setLots, history, setHistory, activeLotName, setActiveLotName,
    loading, error, reload: () => load(), reloadLots: () => loadLots(false),
  };
}
