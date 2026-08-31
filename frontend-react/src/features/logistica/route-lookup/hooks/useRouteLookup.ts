import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { activeDestinationsForToday, filterLookupRecords, normalizeRouteId, uniqueLocalities } from '../domain';
import { routeLookupService } from '../routeLookup.service';
import { readLookupState, writeLookupState } from '../storage';
import { EMPTY_LOOKUP_FILTERS, type LookupFilters, type RouteDestination, type RouteLookupResult } from '../types';

export function useRouteLookup() {
  const [routeId, setRouteIdState] = useState('');
  const [result, setResult] = useState<RouteLookupResult | null>(null);
  const [destinations, setDestinations] = useState<RouteDestination[]>([]);
  const [selectedDestinationId, setSelectedDestinationId] = useState('');
  const [filters, setFilters] = useState<LookupFilters>(EMPTY_LOOKUP_FILTERS);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialError, setInitialError] = useState<unknown>(null);
  const [lookupError, setLookupError] = useState<unknown>(null);
  const request = useRef<AbortController | null>(null);

  const setRouteId = useCallback((value: string) => setRouteIdState(normalizeRouteId(value)), []);

  const loadInitial = useCallback(async (signal?: AbortSignal) => {
    setInitialError(null);
    const [status, routes, latest] = await Promise.allSettled([
      routeLookupService.status(signal), routeLookupService.destinations(signal), routeLookupService.latest(signal),
    ]);
    if (status.status === 'fulfilled') setConnected(status.value.connected);
    if (routes.status === 'fulfilled') setDestinations(activeDestinationsForToday(routes.value));
    if (latest.status === 'fulfilled' && latest.value?.result) {
      const cached = latest.value;
      setRouteIdState(normalizeRouteId(cached.routeId));
      setResult(cached.result);
      const stored = readLookupState();
      if (stored?.queriedRouteId === String(cached.routeId)) {
        setFilters(stored.filters);
        setSelectedDestinationId(stored.selectedDestinationId);
      }
    }
    if ([status, routes, latest].some(item => item.status === 'rejected' && !axios.isCancel(item.reason))) {
      setInitialError(new Error('No se pudo cargar toda la informaci\u00f3n inicial.'));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadInitial(controller.signal);
    return () => { controller.abort(); request.current?.abort(); };
  }, [loadInitial]);

  useEffect(() => {
    if (!result?.routeId) return;
    writeLookupState({ queriedRouteId: result.routeId, selectedDestinationId, filters });
  }, [filters, result?.routeId, selectedDestinationId]);

  const lookup = useCallback(async () => {
    const normalized = normalizeRouteId(routeId);
    if (!normalized) return null;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setLookupError(null);
    setFilters(EMPTY_LOOKUP_FILTERS);
    try {
      const next = await routeLookupService.lookup(normalized, controller.signal);
      setResult({ ...next, routeId: normalizeRouteId(next.routeId || normalized), records: Array.isArray(next.records) ? next.records : [] });
      setConnected(true);
      return next;
    } catch (error) {
      if (!axios.isCancel(error)) {
        setLookupError(error);
        setResult(null);
      }
      return null;
    } finally {
      if (request.current === controller) setLoading(false);
    }
  }, [routeId]);

  const records = useMemo(() => result?.records ?? [], [result?.records]);
  const localities = useMemo(() => uniqueLocalities(records), [records]);
  const filteredRecords = useMemo(() => filterLookupRecords(records, filters), [filters, records]);
  const selectedDestination = useMemo(() => destinations.find(route => String(route.id) === selectedDestinationId) ?? null, [destinations, selectedDestinationId]);

  return {
    routeId, setRouteId, result, records, filteredRecords, localities, destinations,
    selectedDestinationId, setSelectedDestinationId, selectedDestination,
    filters, setFilters, connected, setConnected, loading, initialError, lookupError,
    lookup, reloadInitial: loadInitial,
  };
}
