import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
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

beforeEach(() => { vi.clearAllMocks(); });

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

    expect(await screen.findByText(/2 reuniones/)).toBeTruthy();
    expect(screen.getByText('Daily Desarrollo')).toBeTruthy();
    expect(screen.getByText('Revisión de avance con Dinatek')).toBeTruthy();
    expect(screen.queryByText(/\[Tiusdei\]/)).toBeNull();
    expect(screen.queryByText('Almuerzo')).toBeNull();
  });

  it('sin reuniones reales no ocupa espacio', async () => {
    vi.mocked(api.getGoogleCalendarEvents).mockResolvedValue({ events: [evento('t1', '[Tiusdei] Tarea', false)] } as never);
    const { container } = render(<TodayMeetings />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(api.getGoogleCalendarEvents).toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });
});
