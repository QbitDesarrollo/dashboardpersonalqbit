import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import * as api from '@/lib/minutaEnlaceApi';
import type { EstadoEnlace } from '@/lib/minutaEnlaceApi';
import { EnlaceCliente } from './EnlaceCliente';

vi.mock('@/lib/minutaEnlaceApi', () => ({ leerEnlace: vi.fn(), accionEnlace: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const m = vi.mocked(api);
const estado = (e: Partial<EstadoEnlace>): EstadoEnlace => ({
  activo: true, url: 'https://tiusdei.qbit.ec/m/abc', codigo: 'K7P2QX', bloqueado_hasta: null, accesos: [], envios: [], ...e,
});
const portapapeles = vi.fn(async () => {});

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText: portapapeles } });
});

describe('EnlaceCliente', () => {
  it('si nunca se compartió, lo dice e invita a enviarla', async () => {
    m.leerEnlace.mockResolvedValue(estado({ activo: false, url: null, codigo: null }));
    const onEnviar = vi.fn();
    render(<EnlaceCliente minutaId="m1" version={0} onEnviar={onEnviar} />);
    expect(await screen.findByText('Todavía no se ha compartido con el cliente.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar al cliente' }));
    expect(onEnviar).toHaveBeenCalled();
  });

  it('muestra el enlace y el código para copiarlos', async () => {
    m.leerEnlace.mockResolvedValue(estado({}));
    render(<EnlaceCliente minutaId="m1" version={0} onEnviar={() => {}} />);
    expect(await screen.findByText('K7P2QX')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }));
    await waitFor(() => expect(portapapeles).toHaveBeenCalledWith('https://tiusdei.qbit.ec/m/abc'));
    fireEvent.click(screen.getByRole('button', { name: 'Copiar código' }));
    await waitFor(() => expect(portapapeles).toHaveBeenCalledWith('K7P2QX'));
    expect(toast.success).toHaveBeenCalledWith('Copiado');
  });

  it('se apaga y se vuelve a prender', async () => {
    m.leerEnlace.mockResolvedValue(estado({}));
    m.accionEnlace.mockResolvedValueOnce(estado({ activo: false })).mockResolvedValueOnce(estado({}));
    render(<EnlaceCliente minutaId="m1" version={0} onEnviar={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Apagar enlace' }));
    await waitFor(() => expect(m.accionEnlace).toHaveBeenCalledWith('m1', 'apagar'));
    expect(await screen.findByText('Apagado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Prender enlace' }));
    await waitFor(() => expect(m.accionEnlace).toHaveBeenLastCalledWith('m1', 'activar'));
  });

  it('cambiar el código pide confirmación porque saca a quienes ya entraron', async () => {
    m.leerEnlace.mockResolvedValue(estado({}));
    m.accionEnlace.mockResolvedValue(estado({ codigo: 'ZZZZZZ' }));
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<EnlaceCliente minutaId="m1" version={0} onEnviar={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar código' }));
    expect(m.accionEnlace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar código' }));
    expect(await screen.findByText('ZZZZZZ')).toBeInTheDocument();
    expect(confirmar).toHaveBeenLastCalledWith('¿Cambiar el código? Quienes ya entraron tendrán que usar el nuevo.');
    confirmar.mockRestore();
  });

  it('muestra quién entró y a quién se mandó', async () => {
    m.leerEnlace.mockResolvedValue(estado({
      accesos: [{ nombre: 'Antonio Pérez', entro_en: '2026-09-28T15:32:00Z' }],
      envios: [
        { id: 'e1', medio: 'correo', para: [{ nombre: 'Antonio Pérez', email: 'a@x.ec' }, { nombre: 'María León', email: 'm@x.ec' }], enviado_por: 'Even Fierro', enviado_en: '2026-09-28T14:00:00Z' },
        { id: 'e2', medio: 'copiado', para: [], enviado_por: 'Even Fierro', enviado_en: '2026-09-28T14:10:00Z' },
      ],
    }));
    render(<EnlaceCliente minutaId="m1" version={0} onEnviar={() => {}} />);
    expect(await screen.findByText(/Antonio Pérez entró/)).toBeInTheDocument();
    expect(screen.getByText(/Por correo a Antonio Pérez y María León · Even Fierro/)).toBeInTheDocument();
    expect(screen.getByText(/Mensaje copiado por Even Fierro/)).toBeInTheDocument();
  });

  it('avisa si el enlace quedó bloqueado por intentos', async () => {
    m.leerEnlace.mockResolvedValue(estado({ bloqueado_hasta: '2026-09-28T15:45:00Z' }));
    render(<EnlaceCliente minutaId="m1" version={0} onEnviar={() => {}} />);
    expect(await screen.findByText(/Bloqueado por intentos hasta las/)).toBeInTheDocument();
  });
});
