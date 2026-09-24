import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import * as api from '@/lib/apiClient';
import { TimeSessionProvider } from './TimeSessionContext';

vi.mock('@/lib/apiClient', () => ({ getActiveTimeSession: vi.fn(), getSiteSettings: vi.fn(async () => ({})), postActivitySnapshot: vi.fn(), uploadScreenshot: vi.fn() }));
// Same object on every render, like the real auth state.
const auth = { profile: { id: 'u1' } };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('html2canvas', () => ({ default: vi.fn(async () => ({ toDataURL: () => 'x' })) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); });

describe('TimeSessionProvider', () => {
  it('si la sesión se cerró en otro lado, vuelve a consultarla y deja de rastrear la vieja', async () => {
    vi.mocked(api.getActiveTimeSession)
      .mockResolvedValueOnce({ session: { id: 's1', task_id: 't1', user_id: 'u1', start_time: new Date().toISOString(), status: 'active', activity_level: 0 } } as never)
      .mockResolvedValue({ session: null } as never);
    vi.mocked(api.postActivitySnapshot).mockRejectedValue(Object.assign(new Error('Sesión no encontrada'), { status: 404 }));
    render(<TimeSessionProvider><p>app</p></TimeSessionProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(api.getActiveTimeSession).toHaveBeenCalledTimes(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(api.postActivitySnapshot).toHaveBeenCalledTimes(1);
  });
});
