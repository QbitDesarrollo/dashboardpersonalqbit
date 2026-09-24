import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as ia from '@/lib/minutasIaApi';
import type { EstadoIa } from '@/lib/minutasIaApi';
import { GenerarConIa } from './GenerarConIa';

vi.mock('@/lib/minutasIaApi', () => ({ pedirBorrador: vi.fn(), esperarBorrador: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const BORRADOR = { titulo: 'Revisión de avance', resumen: 'Lanzamiento el 26.', puntos: [] };
const LISTO: EstadoIa = { permitido: true, disponible: true, detalle: 'Logged in using ChatGPT', usados: 2, limite: 10 };

function montar(estado: EstadoIa = LISTO) {
  const onBorrador = vi.fn();
  const onOpenChange = vi.fn();
  render(<GenerarConIa abierto onOpenChange={onOpenChange} fecha="2026-09-24" estado={estado} onBorrador={onBorrador} />);
  return { onBorrador, onOpenChange };
}

describe('GenerarConIa', () => {
  beforeEach(() => {
    vi.mocked(ia.pedirBorrador).mockReset().mockResolvedValue({ id: 'job1' });
    vi.mocked(ia.esperarBorrador).mockReset().mockResolvedValue(BORRADOR);
  });

  it('genera el borrador con la transcripción pegada y lo entrega', async () => {
    const { onBorrador, onOpenChange } = montar();
    expect(screen.getByRole('button', { name: 'Crear borrador' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Transcripción de la reunión'), { target: { value: '  Even: revisamos el home.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear borrador' }));
    await waitFor(() => expect(onBorrador).toHaveBeenCalledWith(BORRADOR));
    expect(ia.pedirBorrador).toHaveBeenCalledWith({ transcripcion: 'Even: revisamos el home.', notas_cliente: '', indicaciones: '', fecha: '2026-09-24' });
    expect(ia.esperarBorrador).toHaveBeenCalledWith('job1');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('genera solo con lo que mandó el cliente y las indicaciones del equipo', async () => {
    const { onBorrador } = montar();
    fireEvent.change(screen.getByLabelText('Notas del cliente (opcional)'), { target: { value: 'Even,\n- Agregar incidencias\nGracias' } });
    fireEvent.change(screen.getByLabelText('¿Algo que la IA deba tener en cuenta? (opcional)'), { target: { value: ' Solo lo del portal ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear borrador' }));
    await waitFor(() => expect(onBorrador).toHaveBeenCalledWith(BORRADOR));
    expect(ia.pedirBorrador).toHaveBeenCalledWith({
      transcripcion: '', notas_cliente: 'Even,\n- Agregar incidencias\nGracias', indicaciones: 'Solo lo del portal', fecha: '2026-09-24',
    });
  });

  it('mientras genera avisa cuánto suele tardar', async () => {
    vi.mocked(ia.esperarBorrador).mockReturnValue(new Promise(() => {}));
    montar();
    fireEvent.change(screen.getByLabelText('Transcripción de la reunión'), { target: { value: 'Hola' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear borrador' }));
    expect(await screen.findByText('Armando la minuta… suele tomar entre 10 segundos y un minuto.')).toBeInTheDocument();
  });

  it('carga la transcripción desde un archivo de texto', async () => {
    montar();
    const archivo = new File(['Cliente: queremos el video sin sonido.'], 'reunion.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('Subir archivo'), { target: { files: [archivo] } });
    await waitFor(() => expect(screen.getByLabelText('Transcripción de la reunión')).toHaveValue('Cliente: queremos el video sin sonido.'));
  });

  it('si no puede leer el archivo, lo dice', async () => {
    montar();
    const archivo = new File(['x'], 'reunion.txt', { type: 'text/plain' });
    archivo.text = () => Promise.reject(new Error('dañado'));
    fireEvent.change(screen.getByLabelText('Subir archivo'), { target: { files: [archivo] } });
    expect(await screen.findByText('No pudimos leer el archivo. Copia el texto y pégalo aquí.')).toBeInTheDocument();
  });

  it('si falla muestra el motivo y deja intentar de nuevo', async () => {
    vi.mocked(ia.pedirBorrador).mockRejectedValue(new Error('Llegaste al límite de 10 minutas con IA por hoy.'));
    const { onBorrador } = montar();
    fireEvent.change(screen.getByLabelText('Transcripción de la reunión'), { target: { value: 'Hola' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear borrador' }));
    expect(await screen.findByText('Llegaste al límite de 10 minutas con IA por hoy.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear borrador' })).toBeEnabled();
    expect(onBorrador).not.toHaveBeenCalled();
  });

  it('muestra cuántas le quedan hoy', () => {
    montar();
    expect(screen.getByText('Te quedan 8 de 10 hoy. No guardamos lo que pegues aquí.')).toBeInTheDocument();
  });

  it('si Codex no está disponible, lo dice y no deja generar', () => {
    montar({ ...LISTO, disponible: false, detalle: 'Not logged in' });
    expect(screen.getByText('La IA no está disponible en este momento. Si sigue así, avísale a un administrador.')).toBeInTheDocument();
    expect(screen.queryByText(/Not logged in/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Transcripción de la reunión'), { target: { value: 'Hola' } });
    expect(screen.getByRole('button', { name: 'Crear borrador' })).toBeDisabled();
  });
});
