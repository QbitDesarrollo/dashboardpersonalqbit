import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as api from '@/lib/apiClient';
import { useActivityTracker } from './useActivityTracker';

vi.mock('@/lib/apiClient', () => ({ postActivitySnapshot: vi.fn() }));

beforeEach(() => { vi.useFakeTimers(); vi.mocked(api.postActivitySnapshot).mockReset(); });
afterEach(() => { vi.useRealTimers(); });

const unMinuto = () => act(async () => { await vi.advanceTimersByTimeAsync(60_000); });

describe('useActivityTracker', () => {
  it('si la sesión ya terminó en otro lado (404), avisa para dejar de rastrearla', async () => {
    vi.mocked(api.postActivitySnapshot).mockRejectedValue(Object.assign(new Error('Sesión no encontrada'), { status: 404 }));
    const onSesionCerrada = vi.fn();
    renderHook(() => useActivityTracker('s1', onSesionCerrada));
    await unMinuto();
    expect(onSesionCerrada).toHaveBeenCalledTimes(1);
  });

  it('un fallo de red no cierra nada: vuelve a intentar el siguiente minuto', async () => {
    vi.mocked(api.postActivitySnapshot).mockRejectedValue(new Error('Failed to fetch'));
    const onSesionCerrada = vi.fn();
    renderHook(() => useActivityTracker('s1', onSesionCerrada));
    await unMinuto();
    await unMinuto();
    expect(onSesionCerrada).not.toHaveBeenCalled();
    expect(api.postActivitySnapshot).toHaveBeenCalledTimes(2);
  });
});
