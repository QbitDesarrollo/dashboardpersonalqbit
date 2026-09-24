import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { toast } from 'sonner';
import * as api from '@/lib/apiClient';
import { GlobalTimerGuard } from './GlobalTimerGuard';

vi.mock('@/lib/apiClient', () => ({
  timerHeartbeat: vi.fn(async () => ({ active: false })),
  getTimerResumeSuggestion: vi.fn(),
  pauseMyTimer: vi.fn(), patchTask: vi.fn(), startTimeSession: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const PAUSA = { task_id: 't1', titulo: 'Proyecta Connect', end_time: '2026-09-24T08:48:00.000Z', duration_seconds: 360 };

async function montarYEsperar() {
  render(<GlobalTimerGuard />);
  await waitFor(() => expect(api.getTimerResumeSuggestion).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 0));
  cleanup();
}

describe('GlobalTimerGuard · aviso de pausa automática', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(toast).mockClear();
    vi.mocked(api.getTimerResumeSuggestion).mockReset().mockResolvedValue(PAUSA);
  });

  it('avisa una sola vez por cada pausa, aunque Tiusdei se abra de nuevo', async () => {
    await montarYEsperar();
    await montarYEsperar();
    await montarYEsperar();
    expect(toast).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast).mock.calls[0][0]).toMatch(/Proyecta Connect.*se pausó solo/);
  });

  it('si hay una pausa nueva, vuelve a avisar', async () => {
    await montarYEsperar();
    vi.mocked(api.getTimerResumeSuggestion).mockResolvedValue({ ...PAUSA, end_time: '2026-09-24T15:10:00.000Z' });
    await montarYEsperar();
    expect(toast).toHaveBeenCalledTimes(2);
  });

  it('sin pausa reciente no avisa nada', async () => {
    vi.mocked(api.getTimerResumeSuggestion).mockResolvedValue({});
    await montarYEsperar();
    expect(toast).not.toHaveBeenCalled();
  });
});
