import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as api from '@/lib/apiClient';
import { TaskTimer } from './TaskTimer';

vi.mock('@/lib/apiClient', () => ({
  getActiveTimers: vi.fn(), patchTask: vi.fn(), getActiveTimeSession: vi.fn(),
  stopTimeSession: vi.fn(), startTimeSession: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.patchTask).mockResolvedValue({});
  vi.mocked(api.getActiveTimers).mockResolvedValue([{
    id: 'task-a', titulo: 'Current task', brand_nombre: 'Demo',
    timer_inicio: new Date(Date.now() - 60_000).toISOString(), tiempo_trabajado: 3600,
  }]);
  vi.mocked(api.getActiveTimeSession).mockResolvedValue({ session: { id: 'session-a', task_id: 'task-a' } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('TaskTimer', () => {
  it('preserves the current session when switching tasks is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<TaskTimer taskId="task-b" initialTime={0} isActive={false} startTime={null} canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar' }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(api.patchTask).not.toHaveBeenCalled();
    expect(api.getActiveTimeSession).not.toHaveBeenCalled();
    expect(api.stopTimeSession).not.toHaveBeenCalled();
    expect(api.startTimeSession).not.toHaveBeenCalled();
  });

  it('does not stop the activity session when pausing the task fails', async () => {
    vi.mocked(api.patchTask).mockRejectedValueOnce(new Error('Offline'));
    render(<TaskTimer taskId="task-a" initialTime={3600} isActive startTime={new Date(Date.now() - 60_000).toISOString()} canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    await waitFor(() => expect(api.patchTask).toHaveBeenCalled());
    expect(api.getActiveTimeSession).not.toHaveBeenCalled();
    expect(api.stopTimeSession).not.toHaveBeenCalled();
  });

  it('starts only one session when the start button is pressed twice', async () => {
    vi.mocked(api.getActiveTimers).mockResolvedValue([]);
    let complete!: (value: object) => void;
    vi.mocked(api.patchTask).mockReturnValue(new Promise(resolve => { complete = resolve; }));
    render(<TaskTimer taskId="task-b" initialTime={0} isActive={false} startTime={null} canEdit />);
    const start = screen.getByRole('button', { name: 'Iniciar' });
    fireEvent.click(start);
    fireEvent.click(start);
    await waitFor(() => expect(api.patchTask).toHaveBeenCalled());
    await act(async () => { complete({}); });
    expect(api.getActiveTimers).toHaveBeenCalledTimes(1);
    expect(api.startTimeSession).toHaveBeenCalledTimes(1);
  });

  it('preserves the current session if the server refuses to pause its task', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(api.patchTask).mockResolvedValue({ error: 'Permission denied' });
    render(<TaskTimer taskId="task-b" initialTime={0} isActive={false} startTime={null} canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar' }));
    await waitFor(() => expect(api.patchTask).toHaveBeenCalled());
    expect(api.patchTask).toHaveBeenCalledTimes(1);
    expect(api.getActiveTimeSession).not.toHaveBeenCalled();
    expect(api.startTimeSession).not.toHaveBeenCalled();
  });
});
