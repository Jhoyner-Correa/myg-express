import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { rrhhService } from './rrhh.service';
import type { Employee } from './types';

export function useEmployees(branchId: number | null) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(branchId !== null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (branchId === null) {
      setEmployees([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setEmployees(await rrhhService.listEmployeesByBranch(branchId, signal));
    } catch (loadError) {
      if (!axios.isCancel(loadError)) setError(loadError);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return { employees, loading, error, reload: () => load() };
}
