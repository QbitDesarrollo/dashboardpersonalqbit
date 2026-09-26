import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as api from '@/lib/reportesApi';
import { usePendientesReportes } from './usePendientesReportes';

vi.mock('@/lib/reportesApi', () => ({ pendientesReportes: vi.fn() }));
const pendientes = vi.mocked(api.pendientesReportes);

beforeEach(() => { vi.useFakeTimers(); pendientes.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe('usePendientesReportes', () => {
  it('cuenta los reportes por revisar al entrar y cada cinco minutos', async () => {
    pendientes.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const { result } = renderHook(() => usePendientesReportes(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(result.current).toBe(2);
  });

  it('para quien no es del equipo no pregunta nada; si falla muestra cero', async () => {
    renderHook(() => usePendientesReportes(false));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(pendientes).not.toHaveBeenCalled();
    pendientes.mockRejectedValue(new Error('sin red'));
    const { result } = renderHook(() => usePendientesReportes(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current).toBe(0);
  });
});
