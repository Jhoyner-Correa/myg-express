import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { deliveriesService } from '../deliveries.service';
import { EMPTY_DELIVERY_FILTERS, EMPTY_DELIVERY_STATS, type DeliveryClient, type DeliveryFilters, type DeliveryPackage, type DeliveryRouteOption } from '../types';

export function useDeliveries() {
  const [filters, setFilters] = useState<DeliveryFilters>(EMPTY_DELIVERY_FILTERS);
  const [clients, setClients] = useState<DeliveryClient[]>([]);
  const [selectedClient, setSelectedClient] = useState<DeliveryClient | null>(null);
  const [packages, setPackages] = useState<DeliveryPackage[]>([]);
  const [routes, setRoutes] = useState<DeliveryRouteOption[]>([]);
  const [stats, setStats] = useState(EMPTY_DELIVERY_STATS);
  const [initialError, setInitialError] = useState<unknown>(null);
  const [searchError, setSearchError] = useState<unknown>(null);
  const [profileError, setProfileError] = useState<unknown>(null);
  const [searching, setSearching] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchRequest = useRef<AbortController | null>(null);
  const profileRequest = useRef<AbortController | null>(null);

  const refreshSummary = useCallback(async (signal?: AbortSignal) => {
    setStats(await deliveriesService.stats(signal));
  }, []);

  const loadInitial = useCallback(async (signal?: AbortSignal) => {
    setInitialError(null);
    try {
      const [nextStats, nextRoutes] = await Promise.all([
        deliveriesService.stats(signal), deliveriesService.routes(signal),
      ]);
      setStats(nextStats);
      setRoutes(nextRoutes);
    } catch (error) {
      if (!axios.isCancel(error)) setInitialError(error);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadInitial(controller.signal);
    return () => {
      controller.abort();
      searchRequest.current?.abort();
      profileRequest.current?.abort();
    };
  }, [loadInitial]);

  const search = useCallback(async (nextFilters: DeliveryFilters = filters) => {
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setSearching(true);
    setHasSearched(true);
    setSearchError(null);
    try {
      const nextClients = await deliveriesService.searchClients(nextFilters, controller.signal);
      setClients(nextClients);
      setSelectedClient(null);
      setPackages([]);
      return nextClients;
    } catch (error) {
      if (!axios.isCancel(error)) {
        setClients([]);
        setSelectedClient(null);
        setPackages([]);
        setSearchError(error);
      }
      return [];
    } finally {
      if (searchRequest.current === controller) setSearching(false);
    }
  }, [filters]);

  const selectClient = useCallback(async (client: DeliveryClient) => {
    profileRequest.current?.abort();
    const controller = new AbortController();
    profileRequest.current = controller;
    setSelectedClient(client);
    setLoadingProfile(true);
    setProfileError(null);
    try {
      setPackages(await deliveriesService.clientPackages(client.cliente_key, controller.signal));
    } catch (error) {
      if (!axios.isCancel(error)) {
        setPackages([]);
        setProfileError(error);
      }
    } finally {
      if (profileRequest.current === controller) setLoadingProfile(false);
    }
  }, []);

  const refreshCurrent = useCallback(async () => {
    const clientKey = selectedClient?.cliente_key;
    const nextClients = await search(filters);
    try {
      await refreshSummary();
      setInitialError(null);
    } catch (error) {
      if (!axios.isCancel(error)) setInitialError(error);
    }
    if (!clientKey) return;
    const current = nextClients.find(client => client.cliente_key === clientKey);
    if (current) await selectClient(current);
  }, [filters, refreshSummary, search, selectClient, selectedClient?.cliente_key]);

  const reset = useCallback(() => {
    searchRequest.current?.abort();
    profileRequest.current?.abort();
    setFilters(EMPTY_DELIVERY_FILTERS);
    setClients([]);
    setSelectedClient(null);
    setPackages([]);
    setSearchError(null);
    setProfileError(null);
    setHasSearched(false);
    setSearching(false);
    setLoadingProfile(false);
  }, []);

  return {
    filters, setFilters, clients, selectedClient, packages, routes, stats,
    initialError, searchError, profileError, searching, loadingProfile, hasSearched,
    search, selectClient, refreshCurrent, refreshSummary, reloadInitial: loadInitial, reset,
  };
}
