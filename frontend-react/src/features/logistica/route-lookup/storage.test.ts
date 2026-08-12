import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readLookupState, writeLookupState } from './storage';

describe('persistencia temporal de Consulta de rutas', () => {
  beforeEach(() => localStorage.clear());

  it('guarda y recupera filtros y ruta destino', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    writeLookupState({ queriedRouteId: '123', selectedDestinationId: '8', filters: { locality: 'Satipo', contract: 'temu', sort: 'cliente-asc' } });
    expect(readLookupState(2000)).toMatchObject({ queriedRouteId: '123', selectedDestinationId: '8', filters: { locality: 'Satipo', contract: 'temu', sort: 'cliente-asc' } });
  });

  it('elimina estados vencidos o corruptos', () => {
    localStorage.setItem('myg_consulta_rutas_state', JSON.stringify({ savedAt: 1, queriedRouteId: '123' }));
    expect(readLookupState(13 * 60 * 60 * 1000)).toBeNull();
    localStorage.setItem('myg_consulta_rutas_state', '{inv\u00e1lido');
    expect(readLookupState()).toBeNull();
  });
});
