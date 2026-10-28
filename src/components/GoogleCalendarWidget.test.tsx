import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as api from '@/lib/apiClient';
import GoogleCalendarWidget from './GoogleCalendarWidget';

vi.mock('@/lib/apiClient', () => ({ getGoogleCalendarStatus: vi.fn(), getGoogleCalendarEvents: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'u1' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('GoogleCalendarWidget · tareas de Tiusdei', () => {
  it('no pinta en el calendario las tareas "[Tiusdei]" sincronizadas', async () => {
    const hoy = new Date();
    const dia = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    vi.mocked(api.getGoogleCalendarStatus).mockResolvedValue({ connected: true, calendar: true } as never);
    vi.mocked(api.getGoogleCalendarEvents).mockResolvedValue({
      events: [
        { id: 't1', summary: '[Tiusdei] Ajustes landing campaña', description: '', start: `${dia}T09:00:00`, end: `${dia}T10:00:00`, htmlLink: '#', status: 'confirmed', es_tarea_tiusdei: true },
        { id: 'r1', summary: 'Kickoff Pycca campañas', description: '', start: `${dia}T15:00:00`, end: `${dia}T16:00:00`, htmlLink: '#', status: 'confirmed', es_tarea_tiusdei: false },
      ],
    } as never);

    render(<GoogleCalendarWidget />);

    expect((await screen.findAllByText(/Kickoff Pycca campañas/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\[Tiusdei\]/)).toBeNull();
  });

  it('si hay cuenta de Google pero falta el permiso de Calendar, lo dice y ofrece volver a dar permiso sin pedir eventos', async () => {
    vi.mocked(api.getGoogleCalendarEvents).mockClear();
    vi.mocked(api.getGoogleCalendarStatus).mockResolvedValue({ connected: true, calendar: false } as never);

    render(<GoogleCalendarWidget />);

    expect(await screen.findByText('Falta el permiso de Google Calendar')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Dar permiso/ })).toBeTruthy();
    expect(screen.queryByText(/Error cargando eventos/)).toBeNull();
    expect(api.getGoogleCalendarEvents).not.toHaveBeenCalled();
  });

  it('sin cuenta de Google conectada sigue ofreciendo conectar, como hoy', async () => {
    vi.mocked(api.getGoogleCalendarStatus).mockResolvedValue({ connected: false, calendar: false } as never);
    render(<GoogleCalendarWidget />);
    expect(await screen.findByRole('button', { name: /Conectar Google Calendar/ })).toBeTruthy();
  });
});
