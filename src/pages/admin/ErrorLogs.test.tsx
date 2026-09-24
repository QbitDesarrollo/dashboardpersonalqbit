import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as api from '@/lib/apiClient';
import ErrorLogs from './ErrorLogs';

vi.mock('@/lib/apiClient', () => ({ getErrorLogs: vi.fn(), getErrorLogStats: vi.fn(), resolveErrorLog: vi.fn() }));
vi.mock('@/components/admin/AgentChat', () => ({ AgentChat: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const m = vi.mocked(api);
const log = (id: string, message: string) => ({
  id, level: 'error', tag: null, message, stack: null, route: '/api/x', method: 'GET', status_code: 500,
  user_id: null, user_nombre: null, count: 1, resolved: false, created_at: '2026-09-24T15:00:00Z', last_seen_at: '2026-09-24T15:00:00Z',
});

beforeEach(() => {
  vi.clearAllMocks();
  m.getErrorLogs.mockResolvedValue({ logs: [log('e1', 'Timeout de MySQL')], total: 1 } as never);
  m.getErrorLogStats.mockResolvedValue({ abiertos: 1, resueltos: 0, ultima_hora: 0, fatales: 0 } as never);
});
afterEach(async () => { await act(async () => {}); });

describe('Consola de errores · buscador', () => {
  it('espera a que se termine de escribir para buscar y no borra la lista mientras tanto', async () => {
    render(<ErrorLogs />);
    await screen.findByText('Timeout de MySQL');
    m.getErrorLogs.mockClear();

    const buscador = screen.getByPlaceholderText('Buscar mensaje/ruta/tag…');
    for (const texto of ['t', 'ti', 'tim']) fireEvent.change(buscador, { target: { value: texto } });
    expect(screen.getByText('Timeout de MySQL')).toBeInTheDocument();

    await waitFor(() => expect(m.getErrorLogs).toHaveBeenCalledWith(expect.objectContaining({ q: 'tim' })));
    expect(m.getErrorLogs).toHaveBeenCalledTimes(1);
    expect(buscador).toHaveValue('tim');
  });

  it('si la respuesta de una búsqueda anterior llega tarde, se queda con la última', async () => {
    render(<ErrorLogs />);
    await screen.findByText('Timeout de MySQL');
    let soltarVieja: (v: unknown) => void = () => {};
    m.getErrorLogs.mockImplementation(((p: { q?: string }) => (p.q === 'viejo'
      ? new Promise((r) => { soltarVieja = r; })
      : Promise.resolve({ logs: [log('e2', 'Error nuevo')], total: 1 }))) as never);

    const buscador = screen.getByPlaceholderText('Buscar mensaje/ruta/tag…');
    fireEvent.change(buscador, { target: { value: 'viejo' } });
    await waitFor(() => expect(m.getErrorLogs).toHaveBeenCalledWith(expect.objectContaining({ q: 'viejo' })));
    fireEvent.change(buscador, { target: { value: 'nuevo' } });
    await screen.findByText('Error nuevo');
    await act(async () => { soltarVieja({ logs: [log('e3', 'Error viejo')], total: 1 }); });

    expect(screen.queryByText('Error viejo')).not.toBeInTheDocument();
    expect(screen.getByText('Error nuevo')).toBeInTheDocument();
  });
});
