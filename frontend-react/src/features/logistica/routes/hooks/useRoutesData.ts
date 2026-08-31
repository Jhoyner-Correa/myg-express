import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { routesService } from '../routes.service';
import type { RouteItem, ZoneItem } from '../types';

function routeSortTime(route: RouteItem): number {
  for (const value of [route.created_at, route.updated_at, route.fecha]) {
    if (!value) continue;
    const timestamp = new Date(value).getTime();
    if (!Number.isNaN(timestamp)) return timestamp;
  }
  return 0;
}

function sortRoutes(routes: RouteItem[]): RouteItem[] {
  return [...routes].sort((left, right) => {
    const byDate = routeSortTime(right) - routeSortTime(left);
    return byDate || right.id - left.id;
  });
}

export function useRoutesData() {
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [zones, setZones] = useState<ZoneItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [routeItems, zoneItems] = await Promise.all([
        routesService.listRoutes({ signal }),
        routesService.listZones({ signal }),
      ]);
      setRoutes(sortRoutes(routeItems));
      setZones(zoneItems);
    } catch (loadError) {
      if (!axios.isCancel(loadError)) setError(loadError);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  const refreshZones = useCallback(async () => {
    setZones(await routesService.listZones());
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return {
    routes,
    zones,
    loading,
    error,
    reload: () => load(),
    refreshZones,
  };
}
