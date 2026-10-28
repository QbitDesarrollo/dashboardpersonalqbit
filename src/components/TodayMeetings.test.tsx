import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import * as api from '@/lib/apiClient';
import { TodayMeetings } from './TodayMeetings';

vi.mock('@/lib/apiClient', () => ({ getGoogleCalendarEvents: vi.fn() }));

const evento = (id: string, summary: string, es_reunion: boolean, hora = '10:30') => ({
  id,
  summary,
  start: `2026-10-27T${hora}:00-05:00`,
  end: `2026-10-27T${hora.replace(/^(\d\d)/, (h) => String(Number(h) + 1).padStart(2, '0'))}:00-05:00`,
  htmlLink: '#',
  status: 'confirmed',
  es_tarea_tiusdei: summary.startsWith('[Tiusdei]'),
  es_reunion,
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T16:00:00Z'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const cargar = async () => { await act(async () => { await Promise.resolve(); }); };

describe('TodayMeetings · solo reuniones de verdad', () => {
  it('no muestra ni cuenta las tareas "[Tiusdei]" ni los eventos que no son reunión', async () => {
    vi.mocked(api.getGoogleCalendarEvents).mockResolvedValue({
      events: [
        evento('t1', '[Tiusdei] Citas a Obra M02', false, '04:00'),
        evento('r1', 'Daily Desarrollo', true, '08:30'),
        evento('b1', 'Almuerzo', false, '13:00'),
        evento('r2', 'Revisión de avance con Dinatek', true, '10:30'),
      ],
    } as never);

    render(<TodayMeetings />);

    await cargar();
    expect(screen.getByText(/2 reuniones/)).toBeTruthy();
    expect(screen.getByText('Daily Desarrollo')).toBeTruthy();
    expect(screen.getByText('Revisión de avance con Dinatek')).toBeTruthy();
    expect(screen.queryByText(/\[Tiusdei\]/)).toBeNull();
    expect(screen.queryByText('Almuerzo')).toBeNull();
  });

  it('muestra todas, enlaza a la reunión y recuerda el ingreso solo mientras está en curso', async () => {
    vi.mocked(api.getGoogleCalendarEvents).mockResolvedValue({ events: [
      evento('past', 'Pasada', true, '08:00'),
      { ...evento('live', 'En vivo', true), enlace: { url: 'https://meet.google.com/abc', plataforma: 'meet' } },
      evento('next', 'Presencial', true, '14:00'),
      evento('extra', 'Otra reunión', true, '16:00'),
    ] } as never);
    const { unmount } = render(<TodayMeetings />);
    await cargar();
    expect(screen.getByText(/4 reuniones · 4h 0m/)).toBeTruthy();
    expect(within(screen.getByRole('article', { name: 'Pasada' })).queryByRole('link')).toBeNull();
    const live = within(screen.getByRole('article', { name: 'En vivo' }));
    expect(live.getByText('En curso')).toBeTruthy();
    const join = live.getByRole('link', { name: 'Entrar' });
    expect(join.getAttribute('href')).toBe('https://meet.google.com/abc');
    expect(join.getAttribute('target')).toBe('_blank');
    expect(join.getAttribute('rel')).toContain('noopener');
    fireEvent.click(join);
    expect(live.getByText('Estás aquí · llevas 0 min')).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(60000); });
    expect(live.getByText('Estás aquí · llevas 1 min')).toBeTruthy();
    expect(within(screen.getByRole('article', { name: 'Presencial' })).getByRole('link', { name: 'Ver en Calendar' }).getAttribute('href')).toBe('#');
    unmount();
    render(<TodayMeetings />);
    await cargar();
    expect(screen.getByText('Estás aquí · llevas 1 min')).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(29 * 60000); });
    expect(screen.queryByText(/Estás aquí/)).toBeNull();
    expect(within(screen.getByRole('article', { name: 'En vivo' })).queryByRole('link')).toBeNull();
  });

  it('persiste Compacta y mantiene el contenido y los botones de desplazamiento', async () => {
    vi.mocked(api.getGoogleCalendarEvents).mockResolvedValue({ events: [evento('r1', 'Daily', true)] } as never);
    const { unmount } = render(<TodayMeetings />);
    await cargar();
    fireEvent.click(screen.getByRole('tab', { name: 'Compacta' }));
    expect(screen.getByRole('tab', { name: 'Compacta' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: 'Reuniones anteriores' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reuniones siguientes' })).toBeTruthy();
    unmount();
    render(<TodayMeetings />);
    await cargar();
    expect(screen.getByRole('tab', { name: 'Compacta' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Daily')).toBeTruthy();
  });

  it('actualiza con reloj local, refresca al volver sin ráfagas y limpia listeners', async () => {
    vi.mocked(api.getGoogleCalendarEvents).mockResolvedValue({ events: [evento('r1', 'Siguiente', true, '11:01')] } as never);
    const { unmount } = render(<TodayMeetings />);
    await cargar();
    expect(screen.getByText('en 1 min')).toBeTruthy();
    fireEvent.focus(window);
    fireEvent(document, new Event('visibilitychange'));
    expect(api.getGoogleCalendarEvents).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(60000); });
    expect(screen.getByText('En curso')).toBeTruthy();
    expect(api.getGoogleCalendarEvents).toHaveBeenCalledTimes(1);
    fireEvent.focus(window);
    fireEvent(document, new Event('visibilitychange'));
    await cargar();
    expect(api.getGoogleCalendarEvents).toHaveBeenCalledTimes(2);
    await act(async () => { vi.advanceTimersByTime(4 * 60000); });
    expect(api.getGoogleCalendarEvents).toHaveBeenCalledTimes(3);
    unmount();
    fireEvent.focus(window);
    fireEvent(document, new Event('visibilitychange'));
    await act(async () => { vi.advanceTimersByTime(5 * 60000); });
    expect(api.getGoogleCalendarEvents).toHaveBeenCalledTimes(3);
  });

  it('solo explica Estás aquí durante una reunión en curso', async () => {
    vi.mocked(api.getGoogleCalendarEvents).mockResolvedValue({ events: [evento('r1', 'Siguiente', true, '11:01')] } as never);
    render(<TodayMeetings />); await cargar();
    expect(screen.queryByRole('button', { name: 'Acerca de Estás aquí' })).not.toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(60000); });
    expect(screen.getByRole('button', { name: 'Acerca de Estás aquí' })).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(60 * 60000); });
    expect(screen.queryByRole('button', { name: 'Acerca de Estás aquí' })).not.toBeInTheDocument();
  });

  it('sin reuniones reales no ocupa espacio', async () => {
    vi.mocked(api.getGoogleCalendarEvents).mockResolvedValue({ events: [evento('t1', '[Tiusdei] Tarea', false)] } as never);
    const { container } = render(<TodayMeetings />);
    await cargar();
    expect(api.getGoogleCalendarEvents).toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });
});
