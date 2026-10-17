import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as api from '@/lib/apiClient';
import { GlobalTimerGuard } from './GlobalTimerGuard';

vi.mock('@/lib/apiClient', () => ({
  timerHeartbeat: vi.fn(async () => ({ active: false })),
  getTimerResumeSuggestion: vi.fn(),
  resumeAutoTimer: vi.fn(async () => ({ ok: true, recuperado_seg: 0 })),
}));

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
