import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import * as api from '@/lib/reportesApi';
import type { ReporteResumen } from '@/lib/reportesApi';
import { ReportesProyecto } from './ReportesProyecto';

vi.mock('@/lib/reportesApi', async (orig) => ({
  ...(await orig<typeof import('@/lib/reportesApi')>()),
  leerConfigReportes: vi.fn(), guardarConfigReportes: vi.fn(), listarReportes: vi.fn(), generarReporte: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('./VisorReporte', () => ({
  VisorReporte: ({ reporteId, abierto }: { reporteId: string; abierto: boolean }) => (abierto ? <div role="dialog">Visor de {reporteId}</div> : null),
}));

const m = vi.mocked(api);
const fila = (r: Partial<ReporteResumen>): ReporteResumen => ({
  id: 'r1', project_id: 'p1', periodo_desde: '2026-09-21', periodo_hasta: '2026-09-27', entregar_en: '2026-09-28T13:00:00Z',
  estado: 'borrador', error: null, indicaciones: null, generado_en: '2026-09-28T10:40:00Z', aprobado_por_nombre: null, aprobado_en: null, resumen: 'Semana tranquila.', ...r,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.leerConfigReportes.mockResolvedValue({ activo: false, dia_entrega: 1, hora_entrega: '08:00' });
  m.listarReportes.mockResolvedValue([]);
});

const mostrar = (reporteInicial?: string) => render(<ReportesProyecto proyectoId="p1" personas={[]} reporteInicial={reporteInicial} />);

describe('ReportesProyecto', () => {
  it('sin reportes lo dice; el líder activa la cadencia con día y hora', async () => {
    m.guardarConfigReportes.mockResolvedValue({ activo: true, dia_entrega: 5, hora_entrega: '17:30' });
    mostrar();
    expect(await screen.findByText('Todavía no hay reportes.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Generar reportes automáticamente' }));
    fireEvent.change(screen.getByLabelText('Día de entrega'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Hora de entrega'), { target: { value: '17:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(m.guardarConfigReportes).toHaveBeenCalledWith('p1', { activo: true, dia_entrega: 5, hora_entrega: '17:30' }));
    expect(toast.success).toHaveBeenCalledWith('Configuración guardada');
  });

  it('lista los reportes con su periodo y estado, y abre el que elijas', async () => {
    m.listarReportes.mockResolvedValue([fila({}), fila({ id: 'r0', periodo_desde: '2026-09-14', periodo_hasta: '2026-09-20', estado: 'aprobado' })]);
    mostrar();
    expect(await screen.findByText('21 sep – 27 sep 2026')).toBeInTheDocument();
    expect(screen.getByText('Aprobado')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /^Ver/ })[1]);
    expect(await screen.findByText('Visor de r0')).toBeInTheDocument();
  });

  it('"Generar ahora" pide el reporte y lo abre mientras se genera', async () => {
    m.generarReporte.mockResolvedValue({ id: 'r9' });
    mostrar();
    await screen.findByText('Todavía no hay reportes.');
    fireEvent.click(screen.getByRole('button', { name: 'Generar ahora' }));
    await waitFor(() => expect(m.generarReporte).toHaveBeenCalledWith('p1'));
    expect(await screen.findByText('Visor de r9')).toBeInTheDocument();
    expect(m.listarReportes).toHaveBeenCalledTimes(2);
  });

  it('abre directo el reporte que llega en el enlace del correo', async () => {
    mostrar('r5');
    expect(await screen.findByText('Visor de r5')).toBeInTheDocument();
  });
});
