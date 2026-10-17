import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import * as api from '@/lib/reportesApi';
import type { ReporteResumen } from '@/lib/reportesApi';
import { ReportesProyecto } from './ReportesProyecto';

vi.mock('@/lib/reportesApi', async (orig) => ({
  ...(await orig<typeof import('@/lib/reportesApi')>()),
  leerConfigReportes: vi.fn(), guardarConfigReportes: vi.fn(), listarReportes: vi.fn(), generarReporte: vi.fn(), semanasReportes: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('./VisorReporte', () => ({
  VisorReporte: ({ reporteId, abierto }: { reporteId: string; abierto: boolean }) => (abierto ? <div role="dialog">Visor de {reporteId}</div> : null),
}));

const m = vi.mocked(api);
const fila = (r: Partial<ReporteResumen>): ReporteResumen => ({
  id: 'r1', project_id: 'p1', periodo_desde: '2026-09-21', periodo_hasta: '2026-09-27', entregar_en: '2026-09-28T13:00:00Z',
  estado: 'borrador', error: null, indicaciones: null, generado_en: '2026-09-28T10:40:00Z', aprobado_por_nombre: null, aprobado_en: null,
  resumen: 'Semana tranquila.', parcial: false, ...r,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.leerConfigReportes.mockResolvedValue({ activo: false, dia_entrega: 1, hora_entrega: '08:00' });
  m.listarReportes.mockResolvedValue([]);
  m.semanasReportes.mockResolvedValue([
    { desde: '2026-09-21', hasta: '2026-09-26', parcial: true },
    { desde: '2026-09-14', hasta: '2026-09-20', parcial: false },
  ]);
});

const mostrar = (reporteInicial?: string) => render(<ReportesProyecto proyectoId="p1" personas={[]} reporteInicial={reporteInicial} />);

describe('ReportesProyecto', () => {
  it('se muestra compacta: dice si el automático está activo y esconde la configuración hasta pedirla', async () => {
    m.guardarConfigReportes.mockResolvedValue({ activo: true, dia_entrega: 5, hora_entrega: '17:30' });
    mostrar();
    expect(await screen.findByText('Automático apagado')).toBeInTheDocument();
    expect(screen.queryByLabelText('Día de entrega')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Configurar' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Generar reportes automáticamente' }));
    fireEvent.change(screen.getByLabelText('Día de entrega'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Hora de entrega'), { target: { value: '17:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(m.guardarConfigReportes).toHaveBeenCalledWith('p1', { activo: true, dia_entrega: 5, hora_entrega: '17:30' }));
    expect(toast.success).toHaveBeenCalledWith('Configuración guardada');
    expect(await screen.findByText('Automático: viernes a las 17:30')).toBeInTheDocument();
  });

  it('genera la semana elegida: por defecto esta semana hasta hoy', async () => {
    m.generarReporte.mockResolvedValue({ id: 'r9' });
    mostrar();
    await screen.findByText('Automático apagado');
    fireEvent.click(screen.getByRole('button', { name: 'Generar reporte' }));
    const semana = await screen.findByLabelText('Semana');
    expect(semana).toHaveValue('2026-09-21');
    expect(screen.getByRole('option', { name: 'Esta semana (21 sep – 26 sep, hasta hoy)' })).toBeInTheDocument();
    fireEvent.change(semana, { target: { value: '2026-09-14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    await waitFor(() => expect(m.generarReporte).toHaveBeenCalledWith('p1', '2026-09-14'));
    expect(await screen.findByText('Visor de r9')).toBeInTheDocument();
  });

  it('muestra los últimos reportes y el resto con "Ver todos"; abre el que elijas', async () => {
    m.listarReportes.mockResolvedValue([
      fila({ id: 'r4', periodo_desde: '2026-09-28', periodo_hasta: '2026-09-29', parcial: true }),
      fila({ id: 'r3' }), fila({ id: 'r2', periodo_desde: '2026-09-14', periodo_hasta: '2026-09-20', estado: 'aprobado' }),
      fila({ id: 'r1', periodo_desde: '2026-09-07', periodo_hasta: '2026-09-13', estado: 'aprobado' }),
    ]);
    mostrar();
    expect(await screen.findByText('28 sep – 29 sep 2026 · en curso')).toBeInTheDocument();
    expect(screen.queryByText('7 sep – 13 sep 2026')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver todos (4)' }));
    expect(screen.getByText('7 sep – 13 sep 2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver el reporte 14 sep – 20 sep 2026' }));
    expect(await screen.findByText('Visor de r2')).toBeInTheDocument();
  });

  it('abre directo el reporte que llega en el enlace del correo', async () => {
    mostrar('r5');
    expect(await screen.findByText('Visor de r5')).toBeInTheDocument();
  });
});
