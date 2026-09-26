import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import * as api from '@/lib/reportesApi';
import type { Reporte } from '@/lib/reportesApi';
import { VisorReporte } from './VisorReporte';

vi.mock('@/lib/reportesApi', async (orig) => ({
  ...(await orig<typeof import('@/lib/reportesApi')>()),
  leerReporte: vi.fn(), esperarReporte: vi.fn(), pdfReporte: vi.fn(), regenerarReporte: vi.fn(), aprobarReporte: vi.fn(), enviarReporte: vi.fn(), eliminarReporte: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const m = vi.mocked(api);
const PERSONAS = [{ id: 'u1', nombre: 'Ana Mora' }, { id: 'u2', nombre: 'Diego Ruiz' }];

const reporte = (r: Partial<Reporte>): Reporte => ({
  id: 'r1', project_id: 'p1', periodo_desde: '2026-09-21', periodo_hasta: '2026-09-27', entregar_en: '2026-09-28T13:00:00Z',
  estado: 'borrador', error: null, indicaciones: null, generado_en: '2026-09-28T10:40:00Z', aprobado_por_nombre: null, aprobado_en: null,
  contenido: { resumen_ejecutivo: 'Semana tranquila.' } as Reporte['contenido'], envios: [], ...r,
});

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:reporte');
  URL.revokeObjectURL = vi.fn();
});
beforeEach(() => {
  vi.clearAllMocks();
  m.pdfReporte.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
});

function abrir(onCambio = vi.fn(), onOpenChange = vi.fn()) {
  render(<VisorReporte reporteId="r1" abierto onOpenChange={onOpenChange} personas={PERSONAS} onCambio={onCambio} />);
  return onCambio;
}

describe('VisorReporte', () => {
  it('mientras se genera avisa que tarda un minuto y al terminar muestra el PDF', async () => {
    m.leerReporte.mockResolvedValue(reporte({ estado: 'generando', contenido: null }));
    let terminar: (r: Reporte) => void = () => {};
    m.esperarReporte.mockReturnValue(new Promise((r) => { terminar = r; }));
    abrir();
    expect(await screen.findByText(/Dame un minuto, estoy generando el reporte/)).toBeInTheDocument();
    terminar(reporte({}));
    expect(await screen.findByTitle('Reporte en PDF')).toHaveAttribute('src', 'blob:reporte');
    expect(m.esperarReporte).toHaveBeenCalledWith('r1');
  });

  it('en borrador regenera con la indicación del líder y luego aprueba', async () => {
    m.leerReporte.mockResolvedValue(reporte({}));
    m.regenerarReporte.mockResolvedValue({ id: 'r1' });
    m.esperarReporte.mockResolvedValue(reporte({ indicaciones: 'Resalta los atrasos' }));
    m.aprobarReporte.mockResolvedValue(reporte({ estado: 'aprobado', aprobado_por_nombre: 'Even Fierro' }));
    const onCambio = abrir();
    await screen.findByTitle('Reporte en PDF');
    fireEvent.change(screen.getByLabelText('Indicaciones para la IA (opcional)'), { target: { value: 'Resalta los atrasos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Regenerar' }));
    await waitFor(() => expect(m.regenerarReporte).toHaveBeenCalledWith('r1', 'Resalta los atrasos'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Reporte regenerado'));
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    await waitFor(() => expect(m.aprobarReporte).toHaveBeenCalledWith('r1'));
    expect(await screen.findByText('Aprobado por Even Fierro')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerar' })).not.toBeInTheDocument();
    expect(onCambio).toHaveBeenCalled();
  });

  it('si regenerar falla, lo dice y deja el borrador como estaba', async () => {
    m.leerReporte.mockResolvedValue(reporte({}));
    m.regenerarReporte.mockResolvedValue({ id: 'r1' });
    m.esperarReporte.mockResolvedValue(reporte({ error: 'Codex no pudo completar el trabajo.' }));
    abrir();
    await screen.findByTitle('Reporte en PDF');
    fireEvent.click(screen.getByRole('button', { name: 'Regenerar' }));
    expect(await screen.findByText('Codex no pudo completar el trabajo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeEnabled();
  });

  it('aprobado se envía a las personas elegidas, con copia, y muestra los envíos', async () => {
    m.leerReporte.mockResolvedValue(reporte({ estado: 'aprobado', aprobado_por_nombre: 'Even Fierro' }));
    m.enviarReporte.mockResolvedValue({ ok: true, envios: [{ id: 'e1', para: ['u1'], cc: ['u2'], enviado_en: '2026-09-28T14:00:00Z', enviado_por: 'Even Fierro' }] });
    abrir();
    await screen.findByTitle('Reporte en PDF');
    const enviar = screen.getByRole('button', { name: 'Enviar reporte' });
    expect(enviar).toBeDisabled();
    const para = screen.getByLabelText('Buscar persona (Para)').closest('.space-y-2') as HTMLElement;
    const copia = screen.getByLabelText('Buscar persona (Con copia)').closest('.space-y-2') as HTMLElement;
    fireEvent.click(within(para).getByRole('checkbox', { name: /Ana Mora/ }));
    fireEvent.click(within(copia).getByRole('checkbox', { name: /Diego Ruiz/ }));
    fireEvent.click(enviar);
    await waitFor(() => expect(m.enviarReporte).toHaveBeenCalledWith('r1', ['u1'], ['u2']));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Reporte enviado'));
    expect(await screen.findByText(/Para Ana Mora · copia Diego Ruiz/)).toBeInTheDocument();
  });

  it('un reporte que falló sin contenido ofrece volver a generarlo', async () => {
    m.leerReporte.mockResolvedValue(reporte({ estado: 'fallido', contenido: null, error: 'Codex no responde.' }));
    abrir();
    expect(await screen.findByText('Codex no responde.')).toBeInTheDocument();
    expect(screen.queryByTitle('Reporte en PDF')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver a generar' })).toBeInTheDocument();
  });

  it('elimina el reporte después de confirmar, avisa y cierra el visor', async () => {
    m.leerReporte.mockResolvedValue(reporte({ estado: 'aprobado', aprobado_por_nombre: 'Even Fierro' }));
    m.eliminarReporte.mockResolvedValue(undefined);
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const onCambio = vi.fn();
    const onOpenChange = vi.fn();
    abrir(onCambio, onOpenChange);
    await screen.findByTitle('Reporte en PDF');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar reporte' }));
    expect(m.eliminarReporte).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar reporte' }));
    await waitFor(() => expect(m.eliminarReporte).toHaveBeenCalledWith('r1'));
    expect(confirmar).toHaveBeenLastCalledWith('¿Eliminar el reporte 21 sep – 27 sep 2026? No se puede deshacer.');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Reporte eliminado'));
    expect(onCambio).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    confirmar.mockRestore();
  });

  it('mientras se genera no se puede eliminar', async () => {
    m.leerReporte.mockResolvedValue(reporte({ estado: 'generando', contenido: null }));
    m.esperarReporte.mockReturnValue(new Promise(() => {}));
    abrir();
    await screen.findByText(/Dame un minuto/);
    expect(screen.queryByRole('button', { name: 'Eliminar reporte' })).not.toBeInTheDocument();
  });
});
