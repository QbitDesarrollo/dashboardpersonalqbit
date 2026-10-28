import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as api from '@/lib/apiClient';
import { GlobalTimerGuard } from './GlobalTimerGuard';

vi.mock('@/lib/apiClient', () => ({
  timerHeartbeat: vi.fn(async () => ({ active: false })),
  getTimerResumeSuggestion: vi.fn(),
  resumeAutoTimer: vi.fn(async () => ({ ok: true, recuperado_seg: 0 })),
  pauseMyTimer: vi.fn(async () => ({ ok: true })),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PAUSE = { task_id: 't1', titulo: 'Demo task', end_time: '2026-10-17T14:00:00.000Z', duration_seconds: 360 };

async function dismissPause() {
  const view = render(<GlobalTimerGuard />);
  await screen.findByRole('alertdialog', { name: 'Tu timer se pausó solo' });
  fireEvent.click(screen.getByRole('button', { name: 'Dejarlo pausado' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  view.unmount();
}

describe('GlobalTimerGuard automatic pause notice', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(api.getTimerResumeSuggestion).mockResolvedValue(PAUSE);
  });
  afterEach(cleanup);

  it('does not repeat an acknowledged pause after reopening the app', async () => {
    await dismissPause();
    render(<GlobalTimerGuard />);
    await waitFor(() => expect(api.getTimerResumeSuggestion).toHaveBeenCalledTimes(2));
    expect(api.resumeAutoTimer).toHaveBeenCalledWith('descartar');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows a new pause even when a previous pause was acknowledged', async () => {
    await dismissPause();
    vi.mocked(api.getTimerResumeSuggestion).mockResolvedValue({ ...PAUSE, end_time: '2026-10-17T15:00:00.000Z' });
    render(<GlobalTimerGuard />);
    expect(await screen.findByRole('alertdialog', { name: 'Tu timer se pausó solo' })).toHaveTextContent('Demo task');
  });

  it('does not show a notice without a recent automatic pause', async () => {
    vi.mocked(api.getTimerResumeSuggestion).mockResolvedValue({});
    render(<GlobalTimerGuard />);
    await waitFor(() => expect(api.getTimerResumeSuggestion).toHaveBeenCalled());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('GlobalTimerGuard después de la hora de cierre', () => {
  const sesion = (inicioHaceMs: number) => ({
    active: true, session_id: 'ses-1', task_id: 't1', titulo: 'Exigir las guardas del juez', eod: true,
    start_time: new Date(Date.now() - inicioHaceMs).toISOString(),
  });
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(api.getTimerResumeSuggestion).mockResolvedValue({});
  });
  afterEach(cleanup);

  it('no pregunta si el timer se acaba de iniciar', async () => {
    vi.mocked(api.timerHeartbeat).mockResolvedValue(sesion(16_000));
    render(<GlobalTimerGuard />);
    await waitFor(() => expect(api.timerHeartbeat).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('alertdialog', { name: '¿Sigues trabajando?' })).not.toBeInTheDocument();
  });

  it('pregunta si el timer lleva más de 3 horas y la confirmación sobrevive a recargar la app', async () => {
    vi.mocked(api.timerHeartbeat).mockResolvedValue(sesion(4 * 3600_000));
    const vista = render(<GlobalTimerGuard />);
    await screen.findByRole('alertdialog', { name: '¿Sigues trabajando?' });
    fireEvent.click(screen.getByRole('button', { name: 'Sí, sigo trabajando' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    vista.unmount();

    render(<GlobalTimerGuard />);
    await waitFor(() => expect(api.timerHeartbeat).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('alertdialog', { name: '¿Sigues trabajando?' })).not.toBeInTheDocument();
  });
});
